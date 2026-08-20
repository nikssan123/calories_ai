import { query, queryOne } from '../db.ts';
import { destroyAllSessions } from './auth.ts';
import { clearPassword, createAccount, findUserByEmail, markEmailVerified } from './user.ts';

/**
 * Turning "Google says this is Ada, at ada@example.com" into a row in `users`.
 *
 * Provider-agnostic on purpose: nothing below knows what Google is. It takes a
 * subject, a proved address and a name, which is all any of these providers
 * gives you, and answers the only interesting question — whose account is this.
 */

export interface ProviderIdentity {
  /** The provider's immutable id for the person. */
  subject: string;
  /** Proved by the provider. The caller must not pass an unverified address. */
  email: string;
  name: string | null;
}

/**
 * Which of the four things happened, for the log and for the emails that follow.
 * They are not interchangeable — `created` is a new person, `adopted` took a
 * password away from somebody, and the caller needs to be able to tell.
 */
export type IdentityOutcome = 'signed-in' | 'linked' | 'adopted' | 'created';

export type IdentityResult =
  | { ok: true; userId: string; outcome: IdentityOutcome }
  | { ok: false; reason: 'signups_closed' };

export async function signInWithProvider(
  provider: string,
  identity: ProviderIdentity,
  options: { allowSignup: boolean; timezone: string },
): Promise<IdentityResult> {
  /*
   * The ordinary case, and the only one keyed on something stable. Everything
   * below matches on an email address, which is a thing people change; this
   * matches on the provider's own id, which is a thing they cannot.
   */
  const known = await queryOne<{ user_id: string }>(
    `UPDATE oauth_identities SET last_login_at = now(), email = $3
      WHERE provider = $1 AND subject = $2
      RETURNING user_id`,
    [provider, identity.subject, identity.email],
  );
  if (known) return { ok: true, userId: known.user_id, outcome: 'signed-in' };

  const existing = await findUserByEmail(identity.email);
  if (existing) {
    /*
     * An account already holds this address. Who proved it?
     *
     * If the account confirmed the address itself, then two independent parties
     * agree the same person owns it and linking them is simply true.
     *
     * If it never did, only one party has proved anything — the one standing at
     * the door with Google's word for it. That gap is an actual attack and not
     * a hypothetical one: register with somebody else's address, wait for them
     * to sign in with Google, and the password you chose is now a key to the
     * food diary they went on to write. So the unproved password is destroyed
     * on the way past, along with any session opened with it.
     *
     * Nothing is lost by doing so. An unconfirmed account cannot reach a single
     * route in this product — the verification gate answers 403 for all of them
     * — so there is no data behind that password and no one to apologise to. If
     * it was the same person all along, signing up and then thinking better of
     * it thirty seconds later, they are signed in either way and "forgot your
     * password" will mint them a new one whenever they want it back.
     */
    const adopting = !existing.email_verified;
    if (adopting) {
      await clearPassword(existing.id);
      await destroyAllSessions(existing.id);
    }
    // A no-op when it was already confirmed, which is the common branch.
    await markEmailVerified(existing.id, identity.email);
    await link(provider, identity, existing.id);
    return { ok: true, userId: existing.id, outcome: adopting ? 'adopted' : 'linked' };
  }

  // Nobody here by that name. This is a sign-up, and the same door policy
  // applies to it as to the one with a password form.
  if (!options.allowSignup) return { ok: false, reason: 'signups_closed' };

  const userId = await createAccount(identity.email, null, identity.name, options.timezone);
  // Confirmed at birth: the provider has already done the thing our own
  // six-digit code exists to do, and asking again would be asking someone to
  // prove twice, in the same minute, that they can read their own mail.
  await markEmailVerified(userId, identity.email);
  await link(provider, identity, userId);
  return { ok: true, userId, outcome: 'created' };
}

/**
 * Records the link. `ON CONFLICT` rather than a plain insert because a person
 * who double-clicks the button sends two callbacks with two codes, and the
 * second one arriving must be a sign-in rather than a 500.
 */
async function link(provider: string, identity: ProviderIdentity, userId: string): Promise<void> {
  await query(
    `INSERT INTO oauth_identities (provider, subject, user_id, email)
          VALUES ($1,$2,$3,$4)
     ON CONFLICT (provider, subject)
     DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email, last_login_at = now()`,
    [provider, identity.subject, userId, identity.email],
  );
}
