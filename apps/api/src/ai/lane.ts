import { env } from '../env.ts';
import { hasSubscriptionAuth } from './client.ts';
import { PROVIDERS, type ProviderId } from './providers/types.ts';

/**
 * Which lane a person's turns run on, and who pays for them.
 *
 * A leaf on purpose. This is policy — an env var, an address, a credentials
 * file — and it is asked from places that have no business importing a
 * provider: the session hook, the plan meters, the pantry cap. Answering it
 * from `providers/index.ts` would drag the Agent SDK into every one of them and
 * put `tools.ts` and the barrel in a runtime import cycle. So the decision
 * lives here, with nothing under it but `env` and the credentials check, and
 * the barrel re-exports it for the callers that already ask it that way.
 */

export function providerId(source: NodeJS.ProcessEnv = process.env): ProviderId {
  const requested = (source.AI_PROVIDER ?? 'anthropic').trim().toLowerCase();
  if (!(PROVIDERS as readonly string[]).includes(requested)) {
    throw new Error(
      `Unknown AI_PROVIDER "${requested}". Supported: ${PROVIDERS.join(', ')}.`,
    );
  }
  return requested as ProviderId;
}

/**
 * Which lane this person's turns run on.
 *
 * `AI_PROVIDER` sets the deployment's lane and `SUBSCRIPTION_EMAILS` names the
 * exceptions: the addresses belonging to whoever runs the box, whose turns go
 * through the Claude Code subscription instead of being billed to the key.
 *
 * The asymmetry is deliberate. The allowlist can only ever move somebody *onto*
 * the subscription, never off it, so a deployment already running `anthropic`
 * for everyone — a personal install, or development — is unaffected by whatever
 * the list says. There is no configuration in which naming an address makes a
 * turn cost money that would otherwise have been free.
 *
 * Case-insensitive, and a user with no address on file is never on the list:
 * `null` is not an address, and an account without one is exactly the anonymous
 * signup the metered lane is for.
 *
 * The login has to actually exist, which is the second half of the guarantee.
 * Without `.credentials.json` the Agent SDK falls back to `ANTHROPIC_API_KEY`
 * and this lane becomes the metered one plus a subprocess — billed the same and
 * slower, for nobody's benefit. Better to leave the listed address on whatever
 * the deployment already does and let the absent credentials be a thing someone
 * notices, than to quietly hand it the worse of the two lanes.
 */
export function laneFor(email: string | null | undefined): ProviderId {
  const address = email?.trim().toLowerCase();
  if (address && env.subscriptionEmails.includes(address) && hasSubscriptionAuth()) {
    return 'anthropic';
  }
  return providerId();
}

/**
 * Whether this person's turns are paid for by a subscription rather than billed
 * a token at a time — and therefore whether the plan meters mean anything to
 * them.
 *
 * Every ceiling in `plans.ts` is a cost control. The tiers are sized off
 * `ai_usage` in dollars, the free grant is lifetime because a monthly one is a
 * recurring bill, and the wall exists so a turn that costs $0.15 is paid for by
 * somebody. None of that is true of a turn on the subscription: it is already
 * paid for, at a flat rate, by whoever signed the box in. Metering it does not
 * protect a margin, it just refuses work that has no marginal price.
 *
 * So this is the one predicate that lifts the meters, and what makes it safe is
 * `subscriptionEnv` in `providers/anthropic.ts`: the `claude` subprocess is
 * spawned without `ANTHROPIC_API_KEY` whenever there is a login to use, so a
 * turn on this lane cannot quietly be billed to the key instead. The two are
 * one mechanism read from two ends — this asks whether the login pays, that
 * makes it true — and the condition is deliberately the same on both sides.
 * `lanes.test.ts` pins them together, because deleting the `env:` line would
 * turn this from an entitlement into a hole.
 *
 * It used to ask for the *absence* of a key in the environment, which was the
 * right question before that spawn existed and became wrong the moment it did:
 * on a box running both lanes there is always a key, so the meter was never
 * lifted for anybody and `SUBSCRIPTION_EMAILS` moved the lane without moving
 * the wall — the operator's own accounts paywalled on their own deployment.
 *
 * Note what it means on a deployment whose `AI_PROVIDER` is `anthropic` — a
 * personal install, or development: `laneFor` answers `anthropic` for everyone,
 * so everyone is unmetered. That is the honest answer rather than a hole. There
 * is no per-token bill on that box for a meter to be protecting, and the
 * ceilings only start meaning something the day it is configured with a key.
 */
export function unmeteredFor(email: string | null | undefined): boolean {
  return laneFor(email) === 'anthropic' && hasSubscriptionAuth();
}
