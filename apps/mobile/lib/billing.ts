import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import type {
  default as PurchasesSdk,
  LOG_LEVEL as LogLevel,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import { BUNDLES, PLANS, type BundleId, type CreditMeter, type PlanName } from '@ct/shared';
import { AppError } from '@/lib/errors';

/**
 * The store, from the phone's side.
 *
 * `services/billing.ts` on the API is the other half: RevenueCat tells the
 * server what was bought and the server writes `users.plan`. Nothing in this
 * file grants an entitlement — it starts a purchase and then waits for the
 * server to agree, which is the only order that is safe. A client that unlocked
 * on its own word would unlock for anyone who could make `purchasePackage`
 * return, and it would disagree with the server the moment a subscription
 * lapsed.
 *
 * So the shape of a successful purchase here is: the store takes the money,
 * RevenueCat posts the webhook, the app re-reads `/entitlements`. The wait in the
 * middle is real — usually a second or two, occasionally longer — which is why
 * `purchase()` polls rather than resolving the instant the sheet closes. See
 * `awaitPlan`.
 */

/**
 * The public SDK key, per platform.
 *
 * Public by design — it identifies the app to RevenueCat and grants nothing on
 * its own — which is what makes `EXPO_PUBLIC_` the right prefix rather than a
 * leak. The webhook secret, which does grant something, lives only on the
 * server.
 *
 * `process.env.EXPO_PUBLIC_*` is substituted at build time by the Metro
 * transform, so these must be written out as literal member expressions. A
 * computed lookup — `process.env[name]` — reads an empty object at runtime and
 * silently disables billing on a build that was configured correctly.
 */
const API_KEY =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/**
 * Whether this build can take money at all.
 *
 * False on a build with no key, and that is an ordinary state rather than a
 * misconfiguration: the app runs against a local API constantly, and a
 * simulator has no store to buy from. Every surface that would offer to sell
 * something reads this and offers to explain instead — see `app/upgrade.tsx`.
 * The alternative is a checkout button that throws, which is a worse first
 * impression than an honest "not here yet".
 */
export const billingAvailable = Boolean(API_KEY);

/**
 * The SDK, loaded on first use rather than imported at the top of the file.
 *
 * `react-native-purchases` is a native module, and a top-level import of it is
 * evaluated the moment anything in this app's provider tree is loaded — which
 * in a runtime that does not carry the native side throws during module
 * evaluation, before a single screen is registered. Expo Go is exactly that
 * runtime, and the failure is not local: expo-router reports every route in the
 * app as missing its default export and renders nothing at all. A store binding
 * took down the food diary.
 *
 * So it is required where it is used, and a runtime without it reports the same
 * "no billing here" state as a build with no API key. That is the honest answer
 * in both cases and it keeps the rest of the app running in a simulator, which
 * is where most of it is looked at.
 */
type Sdk = typeof PurchasesSdk & { LOG_LEVEL?: typeof LogLevel };
let sdk: Sdk | null | undefined;

function purchases(): Sdk | null {
  if (sdk !== undefined) return sdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = (require('react-native-purchases') as { default: Sdk }).default;
  } catch {
    sdk = null;
  }
  return sdk;
}

let configuredFor: string | null = null;

/**
 * Bind the store to this account, once per signed-in user.
 *
 * `appUserID` is our own `users.id`, and it is the entire binding between a
 * purchase and an account — the webhook arrives carrying it as `app_user_id`
 * and the server writes the plan onto that row. Getting it wrong does not fail
 * loudly: the purchase succeeds, the money is taken, and the entitlement lands
 * on an anonymous RevenueCat id nobody can find.
 *
 * Idempotent, because it is called from an effect that re-runs on every auth
 * change. `configure` more than once is documented as harmless but resets SDK
 * state; `logIn` on the id already signed in is a network call for nothing.
 */
export async function configureBilling(userId: string): Promise<void> {
  const Purchases = purchases();
  if (!API_KEY || !Purchases || configuredFor === userId) return;
  try {
    if (configuredFor === null) {
      // Errors only. The SDK is chatty at `INFO` and the journal's own logging
      // is what this app's console is for.
      if (Purchases.LOG_LEVEL) await Purchases.setLogLevel(Purchases.LOG_LEVEL.ERROR);
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    } else {
      await Purchases.logIn(userId);
    }
    configuredFor = userId;
  } catch {
    // A store that will not start is not a reason to fail the launch. Every
    // caller below re-checks, and the app is fully usable without any of this.
  }
}

/**
 * Let go of the account when they sign out.
 *
 * Without this the next person to sign in on this phone inherits the previous
 * one's RevenueCat identity, and a purchase they make lands on somebody else's
 * `users.id`. `logOut` moves the SDK to a fresh anonymous id, which is the
 * correct resting state between sessions.
 */
export async function forgetBilling(): Promise<void> {
  const Purchases = purchases();
  if (!API_KEY || !Purchases || configuredFor === null) return;
  configuredFor = null;
  try {
    await Purchases.logOut();
  } catch {
    /* signing out must not depend on the store answering */
  }
}

/** One buyable tier at one billing period, as the wall draws it. */
export interface Buyable {
  plan: Exclude<PlanName, 'free'>;
  /**
   * How often it renews. Both are sold — `plans.ts` prices a month and a year
   * — so this is a dimension the wall has to offer rather than choose. An
   * earlier version of this file kept only the longest package per tier, which
   * silently hid every monthly SKU and left the small print claiming annual
   * billing for a plan somebody was about to be charged for monthly.
   */
  period: 'month' | 'year';
  /** What to hand back to `purchase()`. */
  pkg: PurchasesPackage;
  /** Localised and tax-inclusive where the store says so: "£69.99". */
  price: string;
  /**
   * The same price expressed monthly. The store computes it; it is never
   * derived here, because dividing an annual price by twelve gets the rounding
   * and the currency wrong in most of the world.
   */
  perMonth: string | null;
  /** The raw figure, for comparing a year against twelve months. */
  amount: number;
}

/**
 * Which tier a package sells.
 *
 * The same rule the server uses in `planFor`, and deliberately so: Play Billing
 * 5 splits a subscription into a product and a base plan and RevenueCat reports
 * the pair as `plus:annual`, so the part before the colon is the tier. Keeping
 * the two implementations in step matters — if the phone thinks a package is
 * Coach and the webhook thinks it is Plus, the wall sells one thing and the
 * account gets another.
 *
 * It matches a tier name as a whole *token* anywhere in the identifier rather
 * than only as the prefix, and that is what makes it work on both stores.
 * `planFor` on the server can take the prefix because Play reports
 * `plus:annual` — but Apple product ids cannot contain a colon, so an iOS SKU
 * is something like `com.daysofar.app.plus.monthly`, and a prefix rule finds
 * `com` there and gives up. A tier that fails to match does not fail loudly: it
 * is simply absent from the paywall, which looks like a dashboard that was
 * never configured.
 *
 * Whole tokens, so `plus` matches and nothing matches inside a longer word.
 * `photo_10` splits to `photo`/`10` and is correctly not a tier — the bundles
 * are sold somewhere else.
 *
 * The product id is checked before the package identifier because a dashboard
 * is free to name packages `$rc_annual`, which says nothing about the tier.
 */
function planOf(pkg: PurchasesPackage): Exclude<PlanName, 'free'> | null {
  for (const candidate of [pkg.product.identifier, pkg.identifier]) {
    const tokens = candidate.toLowerCase().split(/[^a-z0-9]+/);
    for (const token of tokens) {
      if ((PLANS as readonly string[]).includes(token) && token !== 'free') {
        return token as Exclude<PlanName, 'free'>;
      }
    }
  }
  return null;
}

/**
 * Everything on sale, one entry per tier *and* period.
 *
 * It filters rather than picks. `plans.ts` prices both a month and a year for
 * each tier, and which of those somebody wants is a decision they get to make —
 * an earlier version of this preferred the longest package and returned one per
 * tier, which is the same as not selling monthly at all.
 *
 * The period is read off the store's own `pricePerYear`/`price` rather than the
 * package identifier, because `PACKAGE_TYPE` is only meaningful when a
 * dashboard used the standard package names and a custom one says nothing. An
 * annual subscription is the one whose price *is* its yearly price; a monthly
 * one's yearly figure is roughly twelve times what it charges.
 *
 * Returns an empty list rather than throwing on every failure path, including
 * "no offering configured yet". The wall handles an empty list as its own
 * state, which is the same state a keyless build is in.
 */
export async function buyables(): Promise<Buyable[]> {
  const Purchases = purchases();
  if (!API_KEY || !Purchases || configuredFor === null) return [];
  let offering: PurchasesOffering | null = null;
  try {
    offering = (await Purchases.getOfferings()).current;
  } catch {
    return [];
  }
  if (!offering) return [];

  const found: Buyable[] = [];
  for (const pkg of offering.availablePackages) {
    const plan = planOf(pkg);
    if (!plan) continue;
    const { price, pricePerYear, priceString, pricePerMonthString } = pkg.product;
    /*
     * Within 1% of its own yearly figure means this charge *is* the year. The
     * tolerance is there because a store may round the derived figure; it does
     * not need to be tighter, since the alternative period is twelve times away.
     */
    const annual = pricePerYear !== null && Math.abs(pricePerYear - price) < price * 0.01;
    found.push({
      plan,
      period: annual ? 'year' : 'month',
      pkg,
      price: priceString,
      perMonth: pricePerMonthString,
      amount: price,
    });
  }

  // Cheapest tier first, so the wall draws them in the order `PLANS` declares.
  const order = (plan: PlanName) => PLANS.indexOf(plan as never);
  return found.sort((a, b) => order(a.plan) - order(b.plan));
}

/** Somebody closed the store sheet. Not a failure, and not worth a message. */
export class PurchaseCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PurchaseCancelled';
  }
}

/**
 * Buy one, and wait for the account to actually carry it.
 *
 * `confirm` is the caller's re-read of `/plan` — it returns the plan the server
 * now believes, and this polls it until it changes or the patience runs out.
 * That wait is the honest part of this function: the store returns the moment
 * the payment sheet closes, but the entitlement travels store → RevenueCat →
 * our webhook → `users.plan`, and unlocking the app before the last hop is a
 * client granting itself something.
 *
 * A timeout resolves rather than throws, reporting `false`. The purchase is
 * real either way — it is on the receipt and the webhook will land — so the
 * only question is what to say, and "it will appear in a moment" is true where
 * "that failed" is not.
 */
export async function purchase(
  buyable: Buyable,
  confirm: () => Promise<PlanName>,
): Promise<boolean> {
  const Purchases = purchases();
  if (!Purchases) throw new AppError('The store is not available in this build.');
  try {
    await Purchases.purchasePackage(buyable.pkg);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) throw new PurchaseCancelled();
    throw new AppError(
      (error as { message?: string }).message ?? 'The store could not complete that purchase.',
    );
  }
  return awaitPlan(confirm, buyable.plan);
}

/**
 * Restore a subscription bought on another device, or before a reinstall.
 *
 * Required by both stores, and the one control on the wall that has to work for
 * somebody who is already paying — which makes it the control most likely to be
 * pressed by an annoyed person. Same wait as a purchase, for the same reason:
 * restoring re-posts the entitlement to RevenueCat, and the plan arrives by
 * webhook.
 */
export async function restore(confirm: () => Promise<PlanName>): Promise<boolean> {
  const Purchases = purchases();
  if (!API_KEY || !Purchases || configuredFor === null) return false;
  await Purchases.restorePurchases();
  return awaitPlan(confirm);
}

/**
 * The store's own subscription page, which is the only place a subscription can
 * actually be cancelled.
 *
 * Neither store lets an app cancel on somebody's behalf, and Apple requires a
 * link to this page from inside any app that sells an auto-renewing
 * subscription (review guideline 3.1.2). Saying "cancel any time in Settings"
 * in prose and leaving them to find it is the version that gets rejected, and
 * more to the point it is the version that makes somebody who wants to leave
 * feel held.
 *
 * `managementURL` first, because RevenueCat knows which store the subscription
 * was actually bought from — which is not always the one this build is running
 * on, for anyone who bought on a phone and later signed in on a tablet or came
 * across from the web. It is null when there is nothing to manage, and the
 * platform's own page is the right answer then too: it is where a lapsed or
 * transferred subscription is visible.
 */
const STORE_SUBSCRIPTIONS =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions' +
      `?package=${Constants.expoConfig?.android?.package ?? ''}`;

export async function manageSubscription(): Promise<void> {
  const Purchases = purchases();
  let url: string | null = null;
  if (Purchases && configuredFor !== null) {
    try {
      url = (await Purchases.getCustomerInfo()).managementURL ?? null;
    } catch {
      // The store being unreachable is not a reason to strand somebody on this
      // control — its own page still opens, and still lists the subscription.
    }
  }
  await Linking.openURL(url ?? STORE_SUBSCRIPTIONS);
}

/**
 * Poll the server until it agrees something was bought.
 *
 * Ten tries a second apart. The webhook is usually there inside two, and the
 * ceiling exists so a dropped notification becomes a ten-second wait and a
 * truthful message rather than a spinner somebody has to kill the app to
 * escape. `expirePlans` on the API is the backstop that catches the rest.
 *
 * `want` is checked when the caller knows which tier was bought; a restore does
 * not, so any paid plan settles it.
 */
async function awaitPlan(confirm: () => Promise<PlanName>, want?: PlanName): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 1000));
    try {
      const plan = await confirm();
      if (want ? plan === want : plan !== 'free') return true;
    } catch {
      // A failed read is a reason to try again, not to conclude anything.
    }
  }
  return false;
}


/**
 * A bundle — photo scans or messages — priced by the store.
 *
 * Separate from `Buyable` because a bundle is not a tier: it grants stock, not
 * access, so nothing about it belongs in the plan comparison and `planOf`
 * correctly refuses to classify one.
 */
export interface Bundle {
  id: BundleId;
  /** Which meter it tops up. Decides where on the wall it is drawn. */
  meter: CreditMeter;
  /** How many units it adds. From `@ct/shared`, not from the store. */
  units: number;
  /**
   * Whether this pack is only offered to somebody already paying. True on the
   * message packs: Free gets ten messages a month, and a $3.99 refill on top of
   * that is a cheaper product than Plus. See the note in `@ct/shared`.
   */
  subscriberOnly: boolean;
  /** Localised and tax-inclusive where the store says so. */
  price: string;
  /** What to hand back to `purchaseBundle()`. */
  product: PurchasesStoreProduct;
}

/**
 * The bundles the store will actually sell right now, across every meter.
 *
 * Fetched with `getProducts` rather than read off an offering, because a
 * bundle is not part of the paywall's tier comparison and putting it in the
 * offering would make it a package the wall then has to filter back out. The
 * ids are the same on both stores — see `BUNDLES`.
 *
 * One call for both meters rather than one per meter. The store round trip is
 * the expensive part and it takes a list; splitting it would double the wait on
 * a screen whose whole job is to not feel slow, and the caller sorts them by
 * `meter` anyway.
 *
 * Empty on every failure path, exactly like `buyables`: a keyless build, a
 * store that has not approved the products yet, a simulator with no account.
 * Each section that draws them is hidden on an empty list rather than showing
 * dead buttons — and that is per section, so message packs approved a week
 * after the photo ones do not hold the photo ones back.
 */
export async function bundles(): Promise<Bundle[]> {
  const Purchases = purchases();
  if (!API_KEY || !Purchases || configuredFor === null) return [];
  let products: PurchasesStoreProduct[] = [];
  try {
    /*
     * `NON_SUBSCRIPTION`, explicitly, and this is not a detail.
     *
     * `getProducts` takes an optional category and **defaults to
     * SUBSCRIPTION**. On Play that default is a different query — Billing asks
     * for subscription products named `photo_10`, `chat_30` and so on, finds
     * none because they are one-time products, and answers with an empty list
     * and no error. Both pack sections then hide themselves, exactly as they
     * would on a store that had not approved them yet, so the failure is
     * indistinguishable from the state the hiding exists for.
     *
     * It cannot be caught on iOS. StoreKit has no such split: it resolves the
     * identifiers whatever category is asked for, so the same call returned all
     * five on a simulator while the phone showed nothing. That is why the photo
     * bundles have never once appeared on Android — not since the UI landed in
     * `4fd7f06`, and not since the products went live in August.
     */
    products = await Purchases.getProducts(
      BUNDLES.map((bundle) => bundle.id),
      Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    );
  } catch {
    return [];
  }

  const found: Bundle[] = [];
  // Iterate the declared list rather than the store's answer, so the order is
  // ours (smallest first, within a meter) and an unrecognised product cannot
  // appear.
  for (const bundle of BUNDLES) {
    const product = products.find((candidate) => candidate.identifier === bundle.id);
    if (!product) continue;
    found.push({ ...bundle, price: product.priceString, product });
  }
  return found;
}

/**
 * Buy a bundle, and wait for the stock to actually arrive.
 *
 * The same shape as `purchase()` and for the same reason — the store returns
 * when the sheet closes, and the credit travels store → RevenueCat → webhook →
 * `photo_credits` — but it waits on a different thing. A bundle never changes
 * the plan, so polling the plan would poll something that is correct before the
 * purchase and still correct after it, and report success instantly every time.
 *
 * `confirm` re-reads the bundle's own meter and returns its credit balance;
 * this polls until that number goes up. The caller passes the meter in, because
 * polling the wrong one waits out the full ten seconds on a purchase that
 * landed correctly. A timeout resolves `false`: the receipt is
 * real and the webhook will land, so "it will appear in a moment" is the true
 * thing to say, not "that failed".
 */
export async function purchaseBundle(
  bundle: Bundle,
  confirm: () => Promise<number>,
): Promise<boolean> {
  const Purchases = purchases();
  if (!Purchases) throw new AppError('The store is not available in this build.');

  let before = 0;
  try {
    before = await confirm();
  } catch {
    // Unknown is fine: any increase off zero still reads as an increase.
  }

  try {
    await Purchases.purchaseStoreProduct(bundle.product);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) throw new PurchaseCancelled();
    throw new AppError(
      (error as { message?: string }).message ?? 'The store could not complete that purchase.',
    );
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 1000));
    try {
      if ((await confirm()) > before) return true;
    } catch {
      // A failed read is a reason to try again, not to conclude anything.
    }
  }
  return false;
}
