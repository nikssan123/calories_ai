import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P } from '@/components/legal/LegalPage';

const DESCRIPTION =
  'Who builds Day So Far, why it exists, and how a one-person app is run: the person responsible, what is measured, and what is not claimed.';

export const metadata: Metadata = {
  title: 'About — Day So Far',
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: { title: 'About — Day So Far', description: DESCRIPTION, url: '/about' },
};

/**
 * Who is behind this.
 *
 * The name has always been on the site — as the data controller, in clause 1 of
 * the privacy policy, which is where GDPR requires it and where nobody reads
 * it. A product that estimates what you eat and will not say who wrote it is
 * asking for more trust than it offers.
 */
export default function AboutPage() {
  return (
    <LegalPage
      title="About"
      summary="Day So Far is built and run by one person. This page says who, why the app works the way it does, and what is and is not being claimed for it."
      updated="2026-09-12"
    >
      <Clause n={1} title="Who builds it">
        <P>
          Day So Far is built, run and paid for by Nikolay Lyutov, an independent developer
          established in the European Union. There is no company behind it, no investors and no
          team &mdash; the same person writes the code, answers{' '}
          <Out href="mailto:support@daysofar.com">support@daysofar.com</Out>, and is the data
          controller named in clause 1 of the <Link href="/privacy">privacy policy</Link>.
        </P>
        <P>
          That is worth stating plainly rather than hiding behind a &ldquo;we&rdquo;. It sets
          expectations in both directions: replies come from a person and sometimes take a day,
          and there is nobody to escalate to &mdash; but there is also nobody whose job depends on
          keeping you subscribed, and no growth target that a darker design pattern would help
          hit.
        </P>
      </Clause>

      <Clause n={2} title="Why it exists">
        <P>
          Every calorie tracker asks you to search a database. You type &ldquo;chicken
          breast&rdquo;, you get forty rows that differ in ways you cannot see, and you pick one.
          Do that three times a day and the friction is not the arithmetic &mdash; it is the
          picking. Most people stop within a fortnight, and not because they stopped caring what
          they ate.
        </P>
        <P>
          So this one has no search box. You describe the meal the way you would tell someone
          about it, and a language model works out what you probably meant and looks the nutrition
          up. Photograph the plate, scan a barcode, or say &ldquo;my usual&rdquo; instead, if that
          is faster. The point is the same in all four cases: no list to choose from.
        </P>
      </Clause>

      <Clause n={3} title="What is claimed, and what is not">
        <P>
          The app produces <em>estimates</em>. It is not a laboratory, not a dietitian and not a
          medical device, and the numbers it gives you carry real error &mdash; which is measured
          rather than waved away. The figures are on the{' '}
          <Link href="/accuracy">accuracy page</Link>, including the ones that do not flatter it.
        </P>
        <P>
          Two things follow from that, and both are design decisions rather than disclaimers:
        </P>
        <List>
          <li>
            A guess is shown as a guess. Where the app has had to assume a portion, it says so
            rather than presenting an assumption as a measurement.
          </li>
          <li>
            Trends are worth more than any single day. A calorie target that adapts to what your
            weight actually does &mdash; see <Link href="/how-it-works">how it works</Link> &mdash;
            survives individual estimates being wrong in a way that a fixed formula does not.
          </li>
        </List>
      </Clause>

      <Clause n={4} title="How it is paid for">
        <P>
          By subscription, and only by subscription. There is no advertising, nothing is sold to
          anybody, and no analytics product is watching you use it &mdash; the{' '}
          <Link href="/privacy">privacy policy</Link> names every third party that ever receives
          anything and why. The journal itself is free; the parts that cost money to run are what
          the paid tiers pay for.
        </P>
      </Clause>

      <Clause n={5} title="Open source">
        <P>
          The app is open source and can be run on your own server. If you are using somebody
          else&rsquo;s installation, the privacy policy here does not describe it &mdash; theirs
          does, and their operator is the controller, not me.
        </P>
      </Clause>
    </LegalPage>
  );
}
