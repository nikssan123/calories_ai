/**
 * The landing page, in English. Every other language is typed against this
 * file's shape — see ./types.ts.
 *
 * Checked against the code on 2026-09-13, claim by claim: allowances and prices
 * against `apps/api/src/services/plans.ts`, the target's guardrails against
 * `services/adaptive.ts`, offline against OFFLINE.md, the feature grid against
 * the screens that ship. A line added here that the app cannot do today is a
 * refund request with a timestamp on it.
 *
 * British spelling, like the app's own catalogue ("Fibre"), and prices in US
 * dollars because that is what `plans.ts` says; the stores charge each visitor
 * in their own currency, which `pricing.currency` says out loud.
 *
 * Emphasis is `*like this*`, and nothing else is markup.
 */
export const en = {
  meta: {
    title: 'Day So Far — the calorie counter you just talk to',
    description:
      'Say what you ate, in your own words. Calories, protein, carbs and fat add themselves up — no database to search, no forty results for “chicken breast”.',
  },

  nav: {
    how: 'How it works',
    features: 'Features',
    pricing: 'Pricing',
    faq: 'FAQ',
    coaches: 'For coaches',
    language: 'Language',
  },

  /** Shown on a page in another language, to a browser that prefers this one — so it names this language, in this language. */
  switcher: {
    suggest: 'Read this page in English',
    dismiss: 'No thanks',
  },

  cta: {
    get: 'Get the app',
    iphone: 'iPhone app coming soon',
    seeHow: 'See how it works',
    storeSoon: 'soon',
  },

  hero: {
    title: 'Just say what you ate.',
    lede: 'The calorie counter you talk to. Type it, say it or snap it, in your own words — calories, protein, carbs and fat add themselves up.',
    trust: 'Free to start · No ads · No trackers',
  },

  /** The hero's animated conversation. Quantities carry their unit the way this language writes it. */
  demo: {
    logged: 'Chicken salad with avocado, and a flat white',
    loggedReply:
      'Logged as lunch — a palm-sized chicken breast, half an avocado and a small flat white.',
    summary: 'Logged lunch',
    description: 'Chicken salad and a flat white',
    chicken: 'Chicken breast',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avocado',
    avocadoQuantity: 'half',
    coffee: 'Flat white',
    coffeeQuantity: 'small',
    correction: 'make that double chicken',
    correctionReply: 'Done — same entry, 200 g of chicken now, and the day has moved with it.',
    placeholder: 'Two eggs and toast…',
    caption:
      'A conversation with the journal. Breakfast and a snack are already on the day; “chicken salad with avocado, and a flat white” is logged as lunch at about 550 calories — then corrected to double chicken, and the same entry updates in place to 715 while the ring, the macros and the fibre, sodium, saturated fat and sugar tracks move with it.',
  },

  ways: {
    title: 'Four ways to log a meal. None of them is a form.',
    items: [
      {
        title: 'Type it or say it',
        body: '“Two eggs, toast and some cheese.” Write it, or say it out loud. That is the whole interaction.',
      },
      {
        title: 'Photograph it',
        body: 'A plate, a menu, the label on a packet. An estimate comes back marked as an estimate.',
      },
      {
        title: 'Scan the barcode',
        body: 'The label comes back and you say how much you had. Nobody has scanned it before? Snap the label instead.',
      },
      {
        title: 'Ask for your usual',
        body: '“My usual breakfast” reuses what you actually ate last time. Your history, not a stranger’s database.',
      },
    ],
  },

  corrections: {
    title: 'Change your mind. The entry changes with it.',
    body: '“Actually, there were three eggs.” The meal you already logged is corrected in place — not logged twice, and not left for you to fix by hand. Each item is kept on its own, so fixing the eggs leaves the toast alone.',
    cardLabel: 'Breakfast · one entry',
    eggs: 'Eggs',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Toast',
    toastQuantity: '2 slices',
    cheese: 'Cheddar',
    cheeseQuantity: '30 g',
    total: 'Total',
  },

  homeCooking: {
    title: 'Made for food that has no barcode.',
    body: 'Most calorie counters make you search a database, and the database has never heard of the way your family cooks. Here you describe it the way you would to a friend, in any of thirteen languages, and it works out the rest.',
    /** Four dishes somebody in this language would really type, as they would type them. */
    examples: [
      'Shepherd’s pie, a big spoonful',
      'Leftover chicken curry with rice',
      'Beans on toast and a cup of tea',
      'A slice of homemade banana bread',
    ],
  },

  quality: {
    title: 'Two days with the same calories can be very different days.',
    body: '2,100 calories of lentils is not 2,100 calories of crisps and a milkshake. So every meal also gets its fibre, sodium, saturated fat and sugar — read from the same sentence, with nothing extra to type.',
    note: 'Fibre is a floor to reach; the other three are ceilings to stay under.',
  },

  target: {
    badge: 'Plus',
    title: 'A target that learns what you actually burn.',
    body: 'A calculator guesses from your height and weight. After a couple of weeks of logging and weighing in, there is something better to go on: what *you* burn. Every Monday your target follows the evidence, and a short review tells you why.',
    reviewDates: '11 – 17 August',
    reviewIntake:
      'You averaged 2,180 calories against a target of 2,290, and protein stayed above 150 g on six days out of seven. Weight is down 0.4 kg over two weeks.',
    reviewChange:
      'Your target goes up today: you have been losing at the rate you wanted while eating less than it allowed, so the old number was too low.',
    reviewBasis: 'From 14 logged days and 6 weigh-ins. Capped at +200.',
    guardrailsTitle: 'Before it moves anything',
    guardrails: [
      'At least 10 logged days and 4 weigh-ins first.',
      'No more than 200 calories at a time, and less if the logging was patchy.',
      'An estimate far from what the formula predicts is thrown out, not believed.',
      'A target you set yourself is never touched.',
    ],
    more: 'How the maths works',
  },

  features: {
    title: 'And everything else a diary should do.',
    items: [
      {
        title: 'Works offline',
        body: 'Type a meal in on a plane or in a basement gym. It counts straight away and syncs when you are back.',
      },
      {
        title: 'Home-screen widgets',
        body: 'Calories left and today’s steps, without opening the app.',
      },
      {
        title: 'Steps',
        body: 'From Health Connect on Android, or the phone’s own step counter on iPhone.',
      },
      {
        title: 'Workouts',
        body: 'Sets and reps, filled in from last time, across 220 exercises and your own routines.',
      },
      {
        title: 'Recipes',
        body: 'About a hundred, ranked by what is in your kitchen and what is left of your day.',
      },
      {
        title: 'Streaks and achievements',
        body: 'Fourteen badges to earn, on every plan including Free.',
      },
      {
        title: 'A day ends when you go to bed',
        body: 'A 1am snack counts toward the evening it belonged to. Move the cut-off to wherever your day really ends.',
      },
      {
        title: 'Exercise is logged, never spent',
        body: 'A run shows up in your day and your trends. It does not quietly make your calorie budget bigger.',
      },
      {
        title: 'Thirteen languages',
        body: 'The whole app, from Bulgarian to Greek. Describe your meals in whichever language you think in.',
      },
    ],
  },

  pricing: {
    title: 'The diary is free. The thinking costs a little.',
    body: 'Typing a meal in and adding up the day happens on your phone, so it is free for good. Understanding a sentence or a photo takes an AI model, and that is the part with a bill attached.',
    period: 'Billing period',
    monthly: 'Monthly',
    yearly: 'Yearly',
    saving: '−17%',
    recommended: 'Recommended',
    plans: [
      {
        name: 'Free',
        monthly: 'Free',
        annual: 'Free',
        monthlyCadence: 'for as long as you want',
        annualCadence: 'for as long as you want',
        pitch: 'The whole diary, even on a plane.',
        allowance: [
          { figure: '10', unit: 'messages', period: 'a month' },
          { figure: '1', unit: 'photo scan', period: 'to try' },
        ],
        points: [
          'Typing meals in, repeating them and scanning barcodes — unlimited',
          'Your day, your history, your weight and your trends',
          'Widgets, workouts, recipes, streaks and achievements',
        ],
        cta: 'Start free',
      },
      {
        name: 'Plus',
        monthly: '$9.99',
        annual: '$99.99',
        monthlyCadence: 'a month, cancel any time',
        annualCadence: 'a year — $8.33 a month, two months free',
        pitch: 'Talk to it instead of typing.',
        allowance: [
          { figure: '90', unit: 'messages', period: 'a month' },
          { figure: '8', unit: 'photo scans', period: 'a month' },
        ],
        points: [
          'Everything in Free',
          'A weekly review of how your week really went',
          'A target that adjusts to the evidence',
          'Extra messages and photo scans in packs, whenever you need them',
        ],
        cta: 'Get Plus',
      },
      {
        name: 'Coach',
        monthly: '$24.99',
        annual: '$249.99',
        monthlyCadence: 'a month, cancel any time',
        annualCadence: 'a year — $20.83 a month, two months free',
        pitch: 'And it helps decide what is for dinner.',
        allowance: [
          { figure: '180', unit: 'messages', period: 'a month' },
          { figure: '25', unit: 'photo scans', period: 'a month' },
        ],
        points: [
          'Everything in Plus',
          '10 fridge scans a month, turned into recipes',
          '8 recipes a month, written for what is in your kitchen',
          '2 weekly dinner plans a month, with the shopping list',
        ],
        cta: 'Get Coach',
      },
    ],
    notes: [
      'Every account starts on Free. There is no trial to remember to cancel.',
      'Allowances refill a day at a time over a rolling 30 days, so there is no reset date to wait for.',
      'Out of photo scans? Packs start at $3.99 for ten, never expire, and are only used once the month’s are gone.',
      'Stop paying and you are back on Free: your diary and history stay, with 10 messages a month.',
    ],
    currency: 'Prices in US dollars. Google Play charges you in your own currency.',
  },

  faq: {
    title: 'Questions, answered.',
    items: [
      {
        q: 'Do I have to weigh my food?',
        a: 'No. Describe portions the way you would say them — “a big bowl”, “two slices”. Estimates are marked as estimates, and a weighed amount counts for more when your target adjusts.',
      },
      {
        q: 'How accurate is it?',
        a: 'About as accurate as a careful estimate, and it says when it is guessing. How it is tested, and where it goes wrong, is written down in full.',
      },
      {
        q: 'Is it on iPhone?',
        a: 'It is on Android now. The iPhone app is in App Store review, and the link will appear on this page the day it is out.',
      },
      {
        q: 'Does it work without internet?',
        a: 'Typing a meal in, repeating one and checking your day all work offline, and sync when you reconnect. Sentences, photos and barcode lookups need a connection.',
      },
      {
        q: 'Which languages does it speak?',
        a: 'English, Bulgarian, German, Spanish, French, Romanian, Ukrainian, Serbian, Croatian, Czech, Hungarian, Greek and Slovak. It follows your phone’s setting, and you can change it any time.',
      },
      {
        q: 'What happens when I run out of messages?',
        a: 'The diary keeps working: you can still type meals in, repeat them and scan barcodes. Messages refill a day at a time, or you can upgrade.',
      },
      {
        q: 'How do I cancel?',
        a: 'In Google Play, under Subscriptions, whenever you like. You keep what you paid for until the end of the period, then drop back to Free.',
      },
      {
        q: 'Do you sell my data?',
        a: 'No. No ads, no analytics, no trackers, and nothing sold on. What is recorded, who it reaches and how long it is kept are all in the privacy policy.',
      },
      {
        q: 'I am a nutrition coach. Is there something for me?',
        a: 'Yes: a web dashboard to follow your clients’ days, set their targets and leave comments, with a 30-day free trial. It is separate from the Coach plan above.',
      },
    ],
    /** Link labels, in the order of the answers they follow. */
    accuracyLink: 'Read about accuracy',
    privacyLink: 'Read the privacy policy',
    coachLink: 'Open the coach dashboard',
  },

  privacy: {
    title: 'Your meals stay yours.',
    body: 'No analytics, no advertising, nothing to sell. Your meals are rows in a database that exists to answer one question — what did you eat today.',
    link: 'Read the privacy policy',
  },

  closing: {
    title: 'Start with breakfast.',
    body: 'Setup takes a minute or two: your goal, your height and weight, and how active you are. Your target is worked out from there.',
  },

  footer: {
    howItWorks: 'How it works',
    accuracy: 'Accuracy',
    blog: 'Blog',
    recipes: 'Recipes',
    about: 'About',
    privacy: 'Privacy',
    terms: 'Terms',
    languages: 'This page in other languages',
  },
} as const;
