import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P, Row, Rows, Sub } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Day So Far',
  description:
    'What Day So Far records about you, who it is sent to, how long it is kept, and how to get rid of it.',
};

/**
 * The privacy policy for the hosted service at daysofar.com.
 *
 * Written against what the code actually does rather than against a template,
 * which is why it names Anthropic and Resend and Cloudflare instead of "our
 * trusted partners" — a policy that cannot be checked against the source is not
 * telling anyone anything. That cuts both ways: change a provider, or start
 * keeping something new, and this file is part of the change.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="You tell this app what you ate. That is health information, and it is treated as such: it is not sold, not used for advertising, not analysed for anyone but you, and it leaves the server only where the feature you asked for cannot work otherwise."
      updated="2026-08-23"
    >
      <Clause n={1} title="Who is responsible">
        <P>
          Day So Far is built and run by Nikolay Lyutov, an individual established in the
          European Union. For the purposes of the GDPR that makes me the data controller for
          everything described here.
        </P>
        <P>
          Write to <Out href="mailto:support@daysofar.com">support@daysofar.com</Out> about
          anything on this page. It is a real inbox, read by one person.
        </P>
        <P>
          This policy covers the hosted service at daysofar.com and the Day So Far apps for
          iOS and Android. Day So Far is also open source and can be run on your own server;
          if you are using somebody else&rsquo;s installation, this policy does not describe
          it and whoever runs that server is responsible for it.
        </P>
      </Clause>

      <Clause n={2} title="What is recorded">
        <Sub>Because you have an account</Sub>
        <List>
          <li>Your email address, and a hash of your password — never the password itself.</li>
          <li>
            If you sign in with Google: Google&rsquo;s permanent id for your account, and the
            address it reports. Nothing else from your Google account is requested or received.
          </li>
          <li>Sign-in sessions, which expire 60 days after they are created.</li>
        </List>

        <Sub>Because you asked for a calorie target</Sub>
        <List>
          <li>Sex, date of birth, height, activity level, goal, target weight.</li>
          <li>Your timezone and the hour your day starts, which is how a 1am snack lands on the right day.</li>
          <li>Any dietary rules you set, and your unit preference.</li>
          <li>
            If you turn notifications on, a push token for that phone &mdash; the address a
            reminder is delivered to, and nothing that describes you. It is deleted when you
            turn them off, sign out, or delete the account.
          </li>
        </List>

        <Sub>Because logging is the product</Sub>
        <List>
          <li>Every meal, with its items, quantities and nutrition estimates.</li>
          <li>Photos of food you upload, and any barcode you scan.</li>
          <li>Exercise, workouts and weight entries.</li>
          <li>
            The conversation itself — what you typed, or dictated, and what the assistant
            answered — kept as a record separate from the meals it produced. A dictated meal is
            stored as the words it became; the recording is never sent here and never kept.
          </li>
          <li>Recipes, meal plans, shopping lists and pantry items you create.</li>
        </List>

        <Sub>Because a server has to defend itself</Sub>
        <List>
          <li>
            For each device that signs in: a fingerprint of it, its browser or app user agent,
            and the IP address it was last seen at. This is what makes the &ldquo;new sign-in&rdquo;
            email able to say <em>where</em> from. It is deleted with your account.
          </li>
          <li>
            IP addresses in the web server&rsquo;s logs and in the rate limiter&rsquo;s counters,
            held briefly and used for nothing but throttling and abuse.
          </li>
          <li>
            The token and time cost of each AI turn. What the app costs to run is the question
            that decides whether it keeps existing.
          </li>
        </List>

        <P>
          There is no analytics package, no advertising network, no third-party tracking script
          and no fingerprinting SDK anywhere in this product. Nobody is paid for a view of your
          data, and it is not sold, rented, or shared for anyone else&rsquo;s marketing.
        </P>
      </Clause>

      <Clause n={3} title="Why, and on what legal basis">
        <Rows>
          <Row label="To run the app">
            Logging meals, working out a target, showing your history, sending the emails the
            service is made of. Necessary to perform the contract you entered into when you
            made an account &mdash; GDPR Article 6(1)(b).
          </Row>
          <Row label="Health data">
            What you eat, what you weigh and how you exercise is special-category data under
            Article 9. It is processed because you have explicitly asked for it to be, by
            typing it in &mdash; Article 9(2)(a). Withdraw that at any time by deleting your
            account, which erases it.
          </Row>
          <Row label="Security">
            Sign-in alerts, rate limits, keeping the service standing up. Legitimate interests
            &mdash; Article 6(1)(f).
          </Row>
          <Row label="Cost accounting">
            Knowing what a turn costs, so the service can be priced or stopped honestly.
            Legitimate interests. Detached from your account when you delete it.
          </Row>
          <Row label="Weekly reviews and nudges">
            Part of the service, and switchable off in Settings or from the link at the foot of
            every message. No marketing email is sent, because none exists.
          </Row>
        </Rows>
      </Clause>

      <Clause n={4} title="Who else sees it">
        <P>
          Six outside services, each doing one job. The first four handle personal data and do
          so as processors — under contract, on instruction, not on their own account. The last
          two never receive anything about you at all.
        </P>
        <Rows>
          <Row label="Anthropic">
            The model that reads &ldquo;two eggs and toast&rdquo; and turns it into numbers.
            It receives the message you sent, the photo if you sent one, your profile and
            today&rsquo;s totals, and — when you ask about your history — the entries it looks
            up. It is used through Anthropic&rsquo;s commercial API, under terms where inputs
            and outputs are not used to train their models.{' '}
            <Out href="https://www.anthropic.com/legal/privacy">Their privacy policy</Out>.
          </Row>
          <Row label="Resend">
            Sends the confirmation codes, password resets, sign-in alerts and weekly reviews,
            and receives replies to support@daysofar.com. Sees your address and the contents of
            those messages. <Out href="https://resend.com/legal/privacy-policy">Privacy policy</Out>.
          </Row>
          <Row label="Cloudflare">
            R2 object storage holds meal photos. Cloudflare stores the bytes and does not look
            at them. <Out href="https://www.cloudflare.com/privacypolicy/">Privacy policy</Out>.
          </Row>
          <Row label="Google">
            Two things, each only if you choose it. <b>Signing in with Google:</b> Google learns
            that you signed in to this app, and this app learns your Google id and address —
            sign in with a password instead and that half never happens. <b>Dictating a meal on
            Android:</b> the phone&rsquo;s own speech recognition turns what you say into text.
            Where the phone has an offline language pack, that happens on the device and no
            audio leaves it; where it does not, Android hands the recording to Google to
            transcribe. Either way the recording is between your phone and Google — it is never
            sent to this app, which receives only the finished sentence, in the box, for you to
            send or delete. <b>Notifications on Android:</b> Firebase Cloud Messaging carries
            them, so Google is handed the push token and the text of the notification, and
            learns that a delivery happened. It is not given your meals; a reminder says only
            what you would read on the lock screen.
          </Row>
          <Row label="Apple">
            Notifications on iPhone go the same way through the Apple Push Notification
            service: Apple is handed the token and the text, and learns a delivery happened.
            Turn notifications off and no token is ever registered with either company.
          </Row>
          <Row label="Open Food Facts">
            Consulted when you scan a barcode. It receives the number on the packet and nothing
            else — no account id, no user agent identifying you, nothing that ties the scan to
            a person.
          </Row>
          <Row label="USDA FoodData Central">
            The same, for American branded products Open Food Facts does not have. The barcode,
            and nothing else.
          </Row>
        </Rows>
        <P>
          Beyond those: the server itself is rented, so the hosting provider has physical
          custody of the disk the database sits on, as every host does.
        </P>
        <P>
          Data is also disclosed where the law actually requires it — a court order, a valid
          request from a competent authority. There has never been one.
        </P>
      </Clause>

      <Clause n={5} title="Where it is, and where it goes">
        <P>
          The server, the database and the photo bucket are in the European Union.
        </P>
        <P>
          Anthropic is in the United States, so the contents of a chat turn cross the Atlantic
          to be answered. That transfer runs on the European Commission&rsquo;s Standard
          Contractual Clauses in Anthropic&rsquo;s data processing addendum. Resend and
          Cloudflare are US companies operating on the same footing.
        </P>
        <P>
          The service is available worldwide, including to people in the United States. Wherever
          you are, your data is stored in the EU and this policy is what applies to it.
        </P>
      </Clause>

      <Clause n={6} title="Cookies and what is on your device">
        <P>
          There is no cookie banner because there is nothing to consent to. The web app sets
          exactly one cookie:
        </P>
        <List>
          <li>
            <code className="font-semibold">ct_session</code> — your sign-in, valid 60 days,
            HttpOnly, SameSite=Lax. Strictly necessary; without it you are signed out.
          </li>
          <li>
            <code className="font-semibold">ct_oauth</code> — a few minutes long, and only
            during a Google sign-in, to tie the round trip back to the browser that started it.
          </li>
        </List>
        <P>
          Your light-or-dark preference is kept in your browser&rsquo;s local storage and never
          sent anywhere. In the mobile apps the sign-in token lives in the iOS keychain or the
          Android keystore rather than in a cookie.
        </P>
        <P>
          No advertising cookies, no analytics cookies, no third-party cookies of any kind.
        </P>
      </Clause>

      <Clause n={7} title="How long it is kept">
        <P>
          Everything you log is kept until you delete it or delete your account. There is no
          automatic expiry, because a food journal whose history evaporates is not a food
          journal.
        </P>
        <P>
          Deleting your account, from Settings, erases the account and everything attached to it
          immediately — meals, photos, weights, workouts, conversations, recipes and plans,
          devices, sessions, the log of every email ever sent to you, and any message you wrote
          to support from that address. Photo files are removed from storage in the same
          operation, not merely dereferenced.
        </P>
        <P>
          One message goes out afterwards: a receipt saying what was deleted, and the last thing
          that address ever hears from here. The line recording that it was sent does not record
          who it was sent to.
        </P>
        <P>
          Exactly one thing survives, and it is worth being precise about it. The record of what
          each AI turn cost stays, with the link to you cut: token counts and a price, owned by
          nobody, which is no longer personal data and cannot be turned back into it. Deleting an
          account must not retroactively change what the service costs to run. Nothing else is
          kept, archived, held in a &ldquo;deleted&rdquo; state, or recoverable — including by me.
        </P>
      </Clause>

      <Clause n={8} title="Your rights">
        <P>Under the GDPR you can ask for any of the following, and it costs nothing:</P>
        <List>
          <li>A copy of everything held about you, in a portable form.</li>
          <li>Correction of anything wrong.</li>
          <li>Erasure — which is the Delete account button, or an email if you prefer.</li>
          <li>Restriction of processing, or objection to it where it rests on legitimate interests.</li>
          <li>Withdrawal of your consent to health data being processed, at any time. It does not undo what was already done, but it stops it.</li>
        </List>
        <P>
          Email <Out href="mailto:support@daysofar.com">support@daysofar.com</Out>. The law
          allows a month to answer; in practice it is one person and a small database, so it
          will be days.
        </P>
        <P>
          If the answer is unsatisfactory you can complain to the data protection authority in
          the EU country where you live, work, or where you think something went wrong. The
          list is at{' '}
          <Out href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en">
            edpb.europa.eu
          </Out>
          .
        </P>
      </Clause>

      <Clause n={9} title="Children">
        <P>
          Day So Far is not for anyone under 16, and accounts are not knowingly created for
          them. A calorie tracker is a poor thing to hand a child. If you believe a child has an
          account here, write and it will be removed.
        </P>
      </Clause>

      <Clause n={10} title="Security">
        <P>
          Passwords are hashed, never stored. Sessions are stored as hashes too, so the token in
          your cookie exists nowhere on the server. Everything travels over HTTPS. The database
          and the API are not reachable from the internet — only the web front end is, and it
          proxies inward over a private network.
        </P>
        <P>
          No system is beyond reach. If something is ever exposed that puts you at risk, you
          will be told, and so will the supervisory authority, within the 72 hours the law
          allows.
        </P>
      </Clause>

      <Clause n={11} title="Changes">
        <P>
          When this policy changes the date at the top changes with it. Anything that materially
          alters what happens to data already collected — a new recipient, a new purpose — will
          be emailed to account holders before it takes effect, not slipped in.
        </P>
        <P>
          See also the <Link href="/terms" className="font-extrabold underline decoration-2 underline-offset-2">Terms of Service</Link>.
        </P>
      </Clause>
    </LegalPage>
  );
}
