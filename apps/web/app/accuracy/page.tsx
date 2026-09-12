import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P, Row, Rows, Sub } from '@/components/legal/LegalPage';

const DESCRIPTION =
  'How accurate Day So Far is, measured rather than asserted: error rates by logging method against weighed ground truth, the bias in photo estimates, and what has not been measured yet.';

export const metadata: Metadata = {
  title: 'Accuracy — Day So Far',
  description: DESCRIPTION,
  alternates: { canonical: '/accuracy' },
  openGraph: { title: 'Accuracy — Day So Far', description: DESCRIPTION, url: '/accuracy' },
};

/**
 * The numbers, including the bad ones.
 *
 * Written from the measurements in `apps/api/src/ai/client.ts` rather than from
 * marketing copy, and it is the page most likely to cost a signup. It is here
 * anyway: an app whose entire output is an estimate, in a category where every
 * competitor implies precision it does not have, either publishes its error or
 * asks to be taken on faith. The gaps are marked as gaps for the same reason —
 * a measurement that has not been made is not the same as a good result, and
 * saying so is the only thing that makes the rest of the page worth believing.
 */
export default function AccuracyPage() {
  return (
    <LegalPage
      title="Accuracy"
      summary="Every number this app gives you is an estimate, and the estimates carry real error. Here is how much, measured against food that was weighed on a scale — including the result that is worst, and the parts that have not been measured properly yet."
      updated="2026-09-12"
    >
      <Clause n={1} title="The short version">
        <P>
          Use it for trends, not for single meals. The error on any one estimate is large enough
          that a day&rsquo;s total should be read as &ldquo;about this much&rdquo;; the average
          over a fortnight is worth considerably more than any day inside it, and the app&rsquo;s{' '}
          <Link href="/how-it-works">adaptive target</Link> is built on exactly that assumption.
        </P>
        <P>
          If you need a number you can rely on for a single meal &mdash; because you are counting
          carbohydrate for insulin, or managing a condition where the exact figure matters &mdash;
          weigh the food and use the packet. That is true of every app in this category. This one
          says so.
        </P>
      </Clause>

      <Clause n={2} title="Photographing a plate: measured">
        <P>
          This is the hardest thing the app does and the one with the published measurement. On 24
          August 2026, 30 plates from{' '}
          <Out href="https://github.com/google-research-datasets/Nutrition5k">Nutrition5k</Out>{' '}
          &mdash; a research dataset in which every dish was weighed on a scale, so what follows is
          error against ground truth rather than disagreement between models &mdash; were each
          estimated three times, in four configurations.
        </P>
        <Sub>Mean absolute percentage error</Sub>
        <Rows>
          <Row label="Calories">66% on the configuration now shipping</Row>
          <Row label="Protein">56%</Row>
        </Rows>
        <P>
          That is a large number and it is the honest one. A 600 kcal plate might be read as 400 or
          as 900.
        </P>
        <Sub>The error is not random, which is the useful part</Sub>
        <P>
          Every configuration tested compressed toward a typical meal: small plates were over-read
          by roughly 70&ndash;100%, large plates under-read by around 50%, and the estimates
          correlated with the truth at only about r&nbsp;=&nbsp;0.4. The model has a strong prior
          about what a plate of food contains and the photograph moves it less than it should.
        </P>
        <P>
          Two things follow. Photo logging is at its worst on unusually small and unusually large
          portions, which is worth knowing when you use it. And the fix is a better prompt rather
          than a better model &mdash; switching between the largest and smallest models moved the
          error by a few points and did not touch the compression.
        </P>
      </Clause>

      <Clause n={3} title="Describing a meal in words: not measured the same way">
        <P>
          Text logging is the majority of what the app does, and it has no equivalent
          weighed-ground-truth measurement. That is a real gap and it is stated rather than filled
          with an encouraging guess.
        </P>
        <P>
          What can be said about it: the dominant error is almost certainly portion size rather
          than food identification. &ldquo;Two eggs&rdquo; is unambiguous and the composition data
          behind it is good; &ldquo;some pasta&rdquo; is a range of maybe three to one, and no
          amount of model quality closes that, because the information is not in the sentence. The
          more specific you are &mdash; weights, counts, the brand &mdash; the narrower the error
          gets, and that is entirely within your control in a way it is not for a photograph.
        </P>
      </Clause>

      <Clause n={4} title="Barcodes and library recipes: not estimates at all">
        <Rows>
          <Row label="Scanned packets">
            Where a product is in <Out href="https://world.openfoodfacts.org/">Open Food Facts</Out>
            , the figures are the manufacturer&rsquo;s own declared values. The remaining error is
            whatever legal tolerance applies to nutrition labelling, plus whether you ate the
            serving size on the packet. Nothing is being guessed.
          </Row>
          <Row label="Recipes in the library">
            Per-serving nutrition is{' '}
            <Out href="https://www.myplate.gov/myplate-kitchen/recipes">USDA MyPlate Kitchen</Out>
            &rsquo;s own measurement of the finished dish, reproduced rather than recalculated. The
            error is in whether your serving matched theirs.
          </Row>
        </Rows>
      </Clause>

      <Clause n={5} title="Why an inaccurate number is still worth having">
        <P>
          Because the target moves with it. The app does not trust a formula to tell you what you
          burn &mdash; it works that out from what you logged against what the scale did, over a
          fortnight. A systematic bias in your logging partly cancels: if the app reads your meals
          20% high, it also computes your maintenance 20% high, and the deficit between them is
          closer to right than either figure is.
        </P>
        <P>
          What that does not survive is bias that changes. Logging carefully on weekdays and
          casually at weekends, or photographing the small meals and describing the large ones,
          breaks the cancellation. Consistency is worth more here than care.
        </P>
      </Clause>

      <Clause n={6} title="What this page will say next">
        <P>Known gaps, listed so their absence is not mistaken for a result:</P>
        <List>
          <li>
            No weighed-ground-truth measurement of text logging, which is the highest-volume path
            in the product.
          </li>
          <li>
            The photo figure is 30 plates from one dataset, which is enough to rank models and not
            enough to be a confident population error rate.
          </li>
          <li>
            No measurement of how much a more specific description actually narrows the error,
            which is the single most actionable thing a user could be told.
          </li>
        </List>
        <P>
          This page is updated when the numbers are, in either direction. It is not a medical
          device and none of the above is clinical guidance &mdash; see clause 2 of the{' '}
          <Link href="/terms">terms</Link>.
        </P>
      </Clause>
    </LegalPage>
  );
}
