import { Platform } from 'react-native';
import type {
  default as PurchasesSdk,
  LOG_LEVEL as LogLevel,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { PLANS, type PlanName } from '@ct/shared';

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

/** One buyable tier, as the wall draws it. */
export interface Buyable {
  plan: Exclude<PlanName, 'free'>;
  /** What to hand back to `purchase()`. */
  pkg: PurchasesPackage;
  /** Localised and tax-inclusive where the store says so: "£69.99". */
  price: string;
  /**
   * The same price expressed monthly, for an annual package. Null when the
   * store does not compute one — never derived here, because dividing an
   * annual price by twelve gets the rounding and the currency wrong in most of
   * the world.
   */
  perMonth: string | null;
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
 * The RevenueCat *package* identifier is checked first only because a dashboard
 * is free to name packages `$rc_annual`, which says nothing about the tier; the
 * product id is the reliable half and is what decides it.
 */
function planOf(pkg: PurchasesPackage): Exclude<PlanName, 'free'> | null {
  const candidates = [pkg.product.identifier, pkg.identifier];
  for (const candidate of candidates) {
    const head = candidate.split(':')[0]?.toLowerCase() ?? '';
    if ((PLANS as readonly string[]).includes(head) && head !== 'free') {
      return head as Exclude<PlanName, 'free'>;
    }
  }
  return null;
}

/**
 * What is on sale, one package per tier.
 *
 * Annual is preferred where an offering carries both, which is the pricing
 * decision in `SUBSCRIPTIONS.md` — the tiers are sized against an annual net,
 * and a monthly plan at a twelfth of the annual price does not cover its own
 * COGS at these ceilings. If a dashboard only configures monthly, that is what
 * is shown; this picks, it does not filter.
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

  const best = new Map<Exclude<PlanName, 'free'>, PurchasesPackage>();
  for (const pkg of offering.availablePackages) {
    const plan = planOf(pkg);
    if (!plan) continue;
    const held = best.get(plan);
    // `pricePerYearString` is only non-null on a subscription the store knows
    // the period of, and an annual package is the one whose price *is* its
    // yearly price — so the longest period wins by comparing them.
    if (!held || (pkg.product.pricePerYear ?? 0) > (held.product.pricePerYear ?? 0)) {
      best.set(plan, pkg);
    }
  }

  return PLANS.filter((plan): plan is Exclude<PlanName, 'free'> => plan !== 'free')
    .map((plan) => {
      const pkg = best.get(plan);
      if (!pkg) return null;
      return {
        plan,
        pkg,
        price: pkg.product.priceString,
        perMonth: pkg.product.pricePerMonthString,
      } satisfies Buyable;
    })
    .filter((entry): entry is Buyable => entry !== null);
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
  if (!Purchases) throw new Error('The store is not available in this build.');
  try {
    await Purchases.purchasePackage(buyable.pkg);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) throw new PurchaseCancelled();
    throw new Error(
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
