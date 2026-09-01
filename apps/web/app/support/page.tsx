import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P, Row, Rows } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Support — Day So Far',
  description:
    'How to get help with Day So Far: where to write, what to include, and the answers to the things people ask most.',
};

/**
 * The support page for the hosted service at daysofar.com.
 *
 * Apple requires a support URL on every listing and a reviewer opens it, so it
 * has to be a page somebody can actually get help from rather than a link back
 * to the marketing site. It is also the page a person lands on at the worst
 * moment they will have with this app — charged twice, locked out, scans that
 * did not arrive — so the answers come before the form, and every one of them
 * says what to do rather than who to blame.
 *
 * Everything here is checked against the code. Cancelling really is only
 * possible in the store account (`lib/billing.ts` links there and cannot do it
 * for you), scans really do outlast the month they were bought in, and account
 * deletion really is immediate rather than a queue — see `/privacy` §9.
 */
export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Write to support@daysofar.com and a person reads it. Most things people write about are below, with the answer rather than a ticket number."
      updated="2026-09-01"
    >
      <Clause n={1} title="Getting hold of someone">
        <P>
          Email <Out href="mailto:support@daysofar.com">support@daysofar.com</Out>. It reaches
          the person who builds this, not a queue, and it is answered within a couple of days.
        </P>
        <P>
          If something went wrong, the three things that make it fixable in one reply rather
          than four are: the email address on the account, roughly when it happened, and what
          you expected to see instead. A screenshot beats a description of a screenshot.
        </P>
      </Clause>

      <Clause n={2} title="Billing">
        <Rows>
          <Row label="Cancelling">
            A subscription bought in the app is held by Apple or Google, and only your store
            account can end it — no app is allowed to cancel on your behalf, including this
            one. Open <b>Settings → your name → Subscriptions</b> on an iPhone, or{' '}
            <b>Play Store → Subscriptions</b> on Android. The plan you paid for keeps working
            until the period you already paid for runs out.
          </Row>
          <Row label="Paid, but the app has not noticed">
            Open the plan screen and use <b>Restore</b>. That re-reads your store account and
            puts back anything already bought; it never charges you a second time. A purchase
            travels from the store through to this server, and the trip is usually seconds but
            is occasionally slower — if Restore does not do it, write and it will be sorted by
            hand.
          </Row>
          <Row label="Photo scans">
            Scan bundles are bought once and are not a subscription. They are spent only after
            the scans included with your plan are gone, and whatever is left is still there
            next month. They do not expire.
          </Row>
          <Row label="Refunds">
            Purchases are made through Apple and Google, so refunds are theirs to give:{' '}
            <Out href="https://reportaproblem.apple.com">reportaproblem.apple.com</Out> or{' '}
            <Out href="https://support.google.com/googleplay/answer/2479637">Google Play</Out>.
            Write to me too if the reason was something the app did wrong — it is worth knowing
            either way.
          </Row>
        </Rows>
      </Clause>

      <Clause n={3} title="Your account and your data">
        <List>
          <li>
            <b>Deleting the account.</b> In the app, under <b>You</b>. It asks for your
            password, then removes the account and everything in it — meals, photos,
            conversations — immediately rather than after a waiting period. It cannot be
            undone, so export first if you want a copy.
          </li>
          <li>
            <b>Getting a copy of everything.</b> Ask at support@daysofar.com and it is sent as
            a file. This is the GDPR access right and it costs nothing.
          </li>
          <li>
            <b>Forgotten password.</b> Use <b>Forgot password</b> on the sign-in screen and a
            reset link is emailed to you. If it does not arrive, check the spam folder first —
            and then tell me, because an email that does not arrive is a bug on my side more
            often than it is anything you did.
          </li>
        </List>
        <P>
          What is collected and who it goes to is set out in full in the{' '}
          <Link href="/privacy">privacy policy</Link>, and the terms of use are{' '}
          <Link href="/terms">here</Link>.
        </P>
      </Clause>

      <Clause n={4} title="When the app is wrong about food">
        <P>
          It will be, sometimes. Say so in the journal — &ldquo;there was more rice&rdquo;,
          &ldquo;that was a small one&rdquo; — and the entry you already logged changes. That
          is the intended way to fix a number, not deleting and retyping the meal.
        </P>
        <P>
          If it is consistently wrong about a particular dish, that is worth an email. Those
          reports are the main thing that improves it.
        </P>
      </Clause>
    </LegalPage>
  );
}
