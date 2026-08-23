import type { Metadata } from 'next';
import Link from 'next/link';
import { Clause, LegalPage, List, Out, P } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service — Day So Far',
  description:
    'The agreement for using Day So Far: what it is, what it is not, what is expected of an account, and what is not promised.',
};

/**
 * The terms for the hosted service.
 *
 * The clause that matters most is §2, and it is second rather than tenth on
 * purpose. Everything else here is the ordinary furniture of a free service run
 * by one person; the health disclaimer is the one part a reader genuinely needs
 * to have read, and burying it under "Intellectual Property" would be a way of
 * pretending to say it.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="Day So Far is a food journal that estimates. It is not a doctor, not a dietitian, and not a medical device, and the numbers it produces are approximations of what you described — useful for a trend, wrong for a diagnosis."
      updated="2026-08-23"
    >
      <Clause n={1} title="The agreement">
        <P>
          These terms are between you and Nikolay Lyutov, an individual established in the
          European Union, who builds and runs Day So Far. They cover daysofar.com and the Day
          So Far apps for iOS and Android. Making an account means accepting them.
        </P>
        <P>
          The software is also open source. Running your own copy is governed by its licence,
          not by this document — these terms are about the service run at daysofar.com.
        </P>
      </Clause>

      <Clause n={2} title="This is not medical advice">
        <P>
          Day So Far gives you estimates of what you ate and a calorie target worked out from a
          formula. That is general information, not advice about your body. It is not a medical
          device, it has not been assessed by anyone as one, and nothing it says is a diagnosis,
          a treatment or a prescription.
        </P>
        <P>
          Talk to a doctor or a registered dietitian before making a real change to how you eat,
          and especially if you are pregnant or breastfeeding, are under 18, have diabetes,
          kidney or liver disease, a heart condition, or take medication whose dose depends on
          what you eat. If a professional&rsquo;s advice and this app disagree, the professional
          is right.
        </P>
        <P>
          <strong className="font-extrabold">
            If you have or have had an eating disorder, calorie tracking can make it worse.
          </strong>{' '}
          This app counts things, every day, and will keep counting whether or not that is good
          for you. Please talk to someone before using it. In the UK,{' '}
          <Out href="https://www.beateatingdisorders.org.uk/">Beat</Out> takes calls on
          0808 801 0677; elsewhere,{' '}
          <Out href="https://www.eatingdisorderhope.com/treatment-for-eating-disorders/international">
            this list
          </Out>{' '}
          has a line for most countries.
        </P>
      </Clause>

      <Clause n={3} title="The numbers are estimates">
        <P>
          &ldquo;Two eggs and some cheese&rdquo; does not contain a fact about grams. A language
          model reads what you wrote, decides what you probably meant, and looks the nutrition
          up; the app marks a guess as a guess for exactly this reason. Barcode data comes from
          public catalogues written by other people and can be wrong or out of date. Targets
          come from population formulas, and you are one person.
        </P>
        <P>
          Treat a single number as approximate and a trend over weeks as meaningful. Correct
          anything that looks wrong — that is what the conversation is for, and a correction
          rewrites the entry rather than appending to it.
        </P>
      </Clause>

      <Clause n={4} title="Your account">
        <P>
          You must be at least 16 to have an account. One account per person; it is yours and
          not to be shared. Keep the password to yourself, and tell{' '}
          <Out href="mailto:support@daysofar.com">support@daysofar.com</Out> if you think
          somebody else has it. The app emails you when a new device signs in, which is the
          fastest way to find out.
        </P>
        <P>
          The profile details asked for at setup — age, height, weight, activity — decide your
          target. Nonsense in, nonsense out; nobody is checking them but the arithmetic uses them.
        </P>
      </Clause>

      <Clause n={5} title="What not to do with it">
        <List>
          <li>
            Do not use it to break the law, or to build something that hurts people.
          </li>
          <li>
            Do not attack it: no probing for holes, no attempts to reach another account&rsquo;s
            data, no getting round the rate limits, no scripting the chat endpoint. Genuine,
            good-faith security research is welcome — write first.
          </li>
          <li>
            Do not resell it, wrap it, or use it as an unpaid API for something else. Every
            conversation costs real money to answer.
          </li>
          <li>
            Do not scrape it, or feed it into a crawler.
          </li>
          <li>
            Do not upload anything you have no right to upload, or anything illegal.
          </li>
        </List>
        <P>
          There are ceilings on the routes that cost money or guard a password — around forty
          chat turns an hour per account, and tighter limits on signing in and on password
          resets. They are set well above what a person tracking their meals will ever reach.
          Hitting them repeatedly on purpose is a breach of this clause.
        </P>
      </Clause>

      <Clause n={6} title="What is yours">
        <P>
          Your meals, photos, weights and conversations are yours. No ownership of them is
          claimed, and they are not used to train any model or shown to anyone else.
        </P>
        <P>
          The only permission granted here is the narrow one needed to run the service for you:
          storing your data, sending it to the providers named in the{' '}
          <Link href="/privacy" className="font-extrabold underline decoration-2 underline-offset-2">
            Privacy Policy
          </Link>{' '}
          so a turn can be answered, and displaying it back to you. That permission ends when
          you delete the data.
        </P>
        <P>
          The app itself — the name, the mark, the design, the code — stays with its authors,
          under whatever licence the source is published beneath.
        </P>
      </Clause>

      <Clause n={7} title="What is not promised">
        <P>
          Day So Far is provided as it is, free of charge, with no uptime guarantee and no
          warranty of any kind beyond what the law insists on. It is run by one person on one
          server. It will occasionally be down, features will change, and some of them will go
          away.
        </P>
        <P>
          If the service is ever going to shut down, account holders will be emailed with enough
          notice to get their data out.
        </P>
      </Clause>

      <Clause n={8} title="Liability">
        <P>
          To the fullest extent the law allows, there is no liability for indirect or
          consequential loss, for lost data, or for any decision you made about your health on
          the strength of a number in this app. Where liability cannot lawfully be excluded, it
          is limited to what you have paid for the service — which, today, is nothing.
        </P>
        <P>
          Nothing here excludes liability for death or personal injury caused by negligence, for
          fraud, or for anything else that cannot be excluded under the law where you live.
        </P>
      </Clause>

      <Clause n={9} title="It is free, and if that changes">
        <P>
          There is no charge for Day So Far today, and no payment details are collected. If a
          paid tier is ever introduced, existing accounts will be told beforehand, and no
          account will start being charged without agreeing to it first.
        </P>
      </Clause>

      <Clause n={10} title="Ending it">
        <P>
          You can leave whenever you like: Delete account, in Settings, erases everything at
          once and needs no explanation.
        </P>
        <P>
          An account can be suspended or closed from this side for a serious or repeated breach
          of §5, or where the law requires it. Except where that is impossible — a legal order,
          an attack in progress — you will be told why, and given a chance to get your data
          out first.
        </P>
      </Clause>

      <Clause n={11} title="Law, and your consumer rights">
        <P>
          The service is operated from the European Union and EU law applies to it. If you are a
          consumer, nothing in these terms takes away the rights you have under the law of the
          country you live in — that protection travels with you, whatever this document says.
          Consumers in the EU can also use the{' '}
          <Out href="https://consumer-redress.ec.europa.eu/index_en">
            European Commission&rsquo;s consumer redress platform
          </Out>
          .
        </P>
        <P>
          The service is available worldwide, including in the United States. Signing up from
          outside the EU is welcome; your data is stored in the EU either way.
        </P>
        <P>
          If any clause here turns out to be unenforceable, the rest of the document still stands.
        </P>
      </Clause>

      <Clause n={12} title="Changes">
        <P>
          These terms can change. The date at the top says when they last did, and any change
          that materially affects you will be emailed to account holders before it takes effect.
          Carrying on using the app after that is acceptance; if you would rather not, delete
          the account.
        </P>
        <P>
          Questions: <Out href="mailto:support@daysofar.com">support@daysofar.com</Out>.
        </P>
      </Clause>
    </LegalPage>
  );
}
