import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P, Row, Rows, Sub } from '@/components/legal/LegalPage';

const DESCRIPTION =
  'How Day So Far turns a sentence into a calorie count: what reads your words, where the nutrition figures come from, and how the daily target learns what you actually burn.';

export const metadata: Metadata = {
  title: 'How it works — Day So Far',
  description: DESCRIPTION,
  alternates: { canonical: '/how-it-works' },
  openGraph: { title: 'How it works — Day So Far', description: DESCRIPTION, url: '/how-it-works' },
};

/**
 * The methodology page.
 *
 * All of this was true before the page existed and none of it was written down
 * anywhere a person could read it — the closest thing was clause 3 of the
 * terms, which explains the mechanism as a liability disclaimer. An estimate
 * you cannot interrogate is one you have to take on faith, and this product
 * asks for rather a lot of them.
 */
export default function HowItWorksPage() {
  return (
    <LegalPage
      title="How it works"
      summary="You write a sentence; a language model decides what you meant and looks the nutrition up; the day adds itself up. The target you are adding up towards then corrects itself against the scale. This page says exactly how each of those happens."
      updated="2026-09-12"
    >
      <Clause n={1} title="From a sentence to a number">
        <P>
          When you write <em>&ldquo;two eggs, toast and a flat white&rdquo;</em>, the app does not
          search for those words. A language model reads the sentence, splits it into separate
          items, decides what each one probably was and how much of it there probably was, and
          attaches calories and macronutrients to each.
        </P>
        <P>
          Splitting it into items rather than one lump is the part that matters later. It is what
          lets you say <em>&ldquo;actually it was three eggs&rdquo;</em> and have one line change
          instead of re-logging the plate, and it is what the day&rsquo;s totals are built from.
        </P>
        <Sub>Which model reads what</Sub>
        <P>
          Different jobs run on different models, chosen by measurement rather than by preference.
          Text logging &mdash; the great majority of what the app does &mdash; is structured
          extraction rather than reasoning, and runs on a small fast model. Reading a photograph is
          the hardest thing the app attempts and runs on a larger one. The weekly review, the only
          long-form writing in the product, runs on the largest.
        </P>
      </Clause>

      <Clause n={2} title="Where the nutrition figures come from">
        <P>Three sources, depending on how you logged it:</P>
        <Rows>
          <Row label="Described in words">
            The model&rsquo;s own nutritional knowledge, which is drawn from published composition
            data. This is an estimate and is the least precise of the three.
          </Row>
          <Row label="Scanned barcode">
            <Out href="https://world.openfoodfacts.org/">Open Food Facts</Out>, an open database of
            packaged products. Where a packet is in there, the figures are the manufacturer&rsquo;s
            own declared values rather than anybody&rsquo;s guess.
          </Row>
          <Row label="Recipes in the library">
            <Out href="https://www.myplate.gov/myplate-kitchen/recipes">USDA MyPlate Kitchen</Out>,
            public-domain recipes whose per-serving nutrition is the source&rsquo;s measurement of
            the finished dish. Reproduced, not recalculated.
          </Row>
        </Rows>
        <P>
          Underlying much of the composition data in the first row is{' '}
          <Out href="https://fdc.nal.usda.gov/">USDA FoodData Central</Out>, the reference most
          nutrition figures in the English-speaking world eventually trace back to.
        </P>
      </Clause>

      <Clause n={3} title="How the daily target learns">
        <P>
          Most apps compute a calorie target once, from a formula that takes your height, weight,
          age and a dropdown about how active you are, and then never mention it again. The formula
          is a population average. You are not a population.
        </P>
        <P>
          So the target here starts from a formula and then corrects itself against what actually
          happened. Over a rolling fourteen-day window, the app compares what you logged with what
          the scale did, and solves for the only unknown:
        </P>
        <P className="font-mono text-[13px]">
          maintenance = mean daily intake &minus; (weight change &times; 7,700 kcal per kg)
        </P>
        <P>
          7,700 kcal per kilogram is the conventional energy content of body-fat tissue. If you ate
          an average of 2,100 a day and lost 0.3 kg over the fortnight, you were burning roughly
          2,265 &mdash; whatever the formula predicted.
        </P>
        <Sub>The guardrails, and why each exists</Sub>
        <P>
          That equation is only as good as what goes into it, so it is fenced in on four sides.
          These are the actual thresholds in the code, not illustrations:
        </P>
        <Rows>
          <Row label="10 logged days">
            Within the 14-day window. Fewer than that and the &ldquo;mean daily intake&rdquo; term
            is an average of the days you remembered to log, which skews low.
          </Row>
          <Row label="4 weigh-ins">
            The scale is half the equation. One reading at each end cannot separate a trend from a
            glass of water.
          </Row>
          <Row label="10 days between first and last weigh-in">
            Four weigh-ins bunched into one weekend describe that weekend, not a fortnight.
          </Row>
          <Row label="±35% of the formula's prediction">
            A sanity band. Something has gone wrong with the inputs rather than with your
            metabolism if the answer lands outside it, and the app declines to believe itself.
          </Row>
        </Rows>
        <P>
          It also moves in steps of at most 200 kcal, and does not move at all for a change under
          40 &mdash; a target that jitters by 15 kcal a week is noise wearing the costume of
          precision.
        </P>
      </Clause>

      <Clause n={4} title="What the app watches besides calories">
        <P>
          Four things, on ordinary population guidance rather than anything invented here. They are
          derived from your calorie target, so they move with it:
        </P>
        <Rows>
          <Row label="Fibre — a floor">
            14 g per 1,000 kcal, which is where dietary guidelines consistently land.
          </Row>
          <Row label="Sodium — a ceiling">
            2,300 mg, flat rather than scaled. Salt intake does not rise with appetite, and scaling
            it would hand the largest allowance to whoever is eating the most processed food.
          </Row>
          <Row label="Saturated fat — a ceiling">Under 10% of energy.</Row>
          <Row label="Sugar — a ceiling">
            Under 10% of energy. This is the softest of the four: the guidance is about{' '}
            <em>added</em> sugar, and nothing in the pipeline can reliably tell added sugar from
            the sugar in a pear.
          </Row>
        </Rows>
        <P>
          These are population figures. They are not a prescription, and if a clinician has given
          you different numbers, theirs are the ones that apply to you.
        </P>
      </Clause>

      <Clause n={5} title="Steps and exercise">
        <P>
          Steps are shown next to the day and are never converted into calories, and never added to
          what you may eat. Consumer step-to-calorie conversions are wrong by enough to erase a
          deficit, and an app that quietly gives you back 400 kcal for a walk is not helping you.
        </P>
      </Clause>

      <Clause n={6} title="How wrong is it">
        <P>
          Measurably, and the measurements are published rather than summarised. See the{' '}
          <Link href="/accuracy">accuracy page</Link>, which gives the error rates by logging
          method, including the ones that do not look good.
        </P>
      </Clause>
    </LegalPage>
  );
}
