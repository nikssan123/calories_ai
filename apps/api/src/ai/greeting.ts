import { LOCALES, LOCALE_NAMES, type Locale } from '@ct/shared';

/**
 * The opening message, written without a model.
 *
 * Every new account used to buy one of these from Opus: 25,685 tokens of
 * prompt written to cache to produce about 160 tokens of hello, at **$0.17 a
 * signup**, charged six seconds after the row was created and before the person
 * had typed anything. On 2026-08-25 half the accounts that received one never
 * answered it — the cache write is only ever amortised by somebody who replies,
 * so a bounce paid full price for a sentence nobody read.
 *
 * Nothing in that first message is a model's judgement. `onboardingPrompt`
 * specifies it down to the word count: hello, one sentence on what this is, the
 * language clause, one question — forty words, sixty at the outside. That is a
 * template, and the app already carries five languages to render it in. So the
 * model now joins the conversation at the *second* turn, where there is
 * something to reason about: the answer.
 *
 * The greeting is persisted as an ordinary assistant message, so the model sees
 * it in the replayed transcript on that second turn and continues setup from it
 * rather than greeting again. See `openingTurn` in `run.ts`.
 */

/**
 * What each client sends, as the user, to ask for an opening message.
 *
 * Matching on the copy is uglier than a flag on the request would be, and it is
 * what lets this work for builds already on people's phones — a closed test is
 * running, and a saving that needs a store release is a saving that arrives in
 * a fortnight. The strings are `journal.kickoff` in both `apps/web/messages/`
 * and `apps/mobile/messages/`, which hold identical values for this key.
 *
 * When the clients stop sending it — rendering the greeting locally instead,
 * which is the tidier end state — this set stops matching anything and can go.
 */
const KICKOFFS = [
  'Hi — I’m new here. Let’s get set up.',
  'Здравей — нов съм тук. Хайде да се настроим.',
  'Hi — ich bin neu hier. Lass uns einrichten.',
  'Hola — soy nuevo aquí. Vamos a configurarlo.',
  'Salut — je suis nouveau ici. On configure ça ?',
];

/**
 * Compared loosely, because the alternative is a $0.17 charge every time a
 * curly apostrophe or a trailing space drifts between a catalogue and this
 * file. Case, punctuation and spacing carry no meaning in a sentinel; the words
 * do.
 */
function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim();
}

const SENTINELS = new Set(KICKOFFS.map(normalise));

export function isKickoff(text: string): boolean {
  return SENTINELS.has(normalise(text));
}

/**
 * The greeting itself, one per language, each doing the four jobs
 * `onboardingPrompt` asks the opening message for.
 *
 * The question is height and weight rather than anything else on the list
 * because it is the pair that carries the units clause naturally — somebody who
 * answers "5'10", about 180 lb" has settled imperial without being asked, which
 * is the behaviour the brief spells out and the reason units are never a
 * question of their own.
 *
 * `others` is the language clause, and it names only the languages this message
 * is *not* written in — offering somebody the language they are already reading
 * is noise. In their own names, for the reason `LOCALE_NAMES` exists: Български
 * is the word a Bulgarian speaker recognises in a sentence otherwise made of
 * words they do not.
 */
const GREETINGS: Record<Locale, (others: string) => string> = {
  en: (others) =>
    `Hi — I'm your food journal. Tell me what you ate and I'll track it; I can also help with recipes, what's in your kitchen and your training. I write in ${others} too. To start: how tall are you, and roughly what do you weigh? Kilos or pounds — whichever you think in.`,
  bg: (others) =>
    `Здравей — аз съм твоят хранителен дневник. Кажи ми какво си ял и ще го запиша; мога да помогна и с рецепти, с това, което имаш в кухнята, и с тренировките. Пиша и на ${others}. За начало: колко си висок и колко тежиш горе-долу? В килограми или в паунди — както ти е удобно.`,
  de: (others) =>
    `Hallo — ich bin dein Ernährungstagebuch. Sag mir, was du gegessen hast, und ich trage es ein; ich helfe auch bei Rezepten, bei dem, was in deiner Küche steht, und beim Training. Ich schreibe auch auf ${others}. Zum Anfang: Wie groß bist du, und was wiegst du ungefähr? In Kilo oder in Pfund — wie du magst.`,
  es: (others) =>
    `Hola — soy tu diario de comidas. Dime qué has comido y lo apunto; también puedo ayudarte con recetas, con lo que tienes en la cocina y con tu entrenamiento. También escribo en ${others}. Para empezar: ¿cuánto mides y cuánto pesas más o menos? En kilos o en libras — como lo pienses tú.`,
  fr: (others) =>
    `Salut — je suis ton journal alimentaire. Dis-moi ce que tu as mangé et je le note ; je peux aussi t'aider avec les recettes, ce qu'il y a dans ta cuisine et ton entraînement. J'écris aussi en ${others}. Pour commencer : combien mesures-tu, et combien pèses-tu à peu près ? En kilos ou en livres — comme tu préfères.`,
};

export function openingMessage(locale: Locale): string {
  const others = LOCALES.filter((other) => other !== locale)
    .map((other) => LOCALE_NAMES[other])
    .join(', ');
  return GREETINGS[locale](others);
}
