import { franc } from 'franc';
import type { Locale } from '@ct/shared';

/**
 * What language to answer somebody in, and which model can write it.
 *
 * The two questions are one question, which is why they are resolved together
 * here. A turn is escalated because the reply is due in a language the cheap
 * model writes badly — so the thing being escalated for and the thing being
 * written are the same language, and deciding them apart is how they came to
 * disagree.
 *
 * ---
 *
 * **The language somebody writes in is not the language their app is set to.**
 * That is the whole of what this file resolves. `users.locale` is a rendering
 * preference — the tab bar, the buttons, the labels around an email — and
 * plenty of people read an English interface and write to the journal in their
 * own language. `038_locale.sql` backfilled every account that predates it to
 * `'en'`, so for those rows the column is not even a preference somebody
 * expressed; it is the migration's default. Answering from it told a Bulgarian
 * speaker's journal to reply in English, and what came back was an English
 * draft translated word for word: "Barely a dent" arrived as "барели дупка",
 * which is the English word spelled in Cyrillic.
 *
 * So the conversation decides, and the stored locale is the fallback for when
 * there is no conversation to read — a captionless photo on a fresh session, a
 * review generated from a stats blob, a nudge generated from a pattern.
 *
 * ---
 *
 * **Why the model changes at all.** `text_log` runs on Haiku 4.5 because it is
 * ~70% of turns and the job — turning "two eggs and toast" into items with
 * macros — is structured extraction rather than reasoning. That argument holds
 * in every language. What does not hold is the *writing*: the same reply that
 * reads naturally in English comes back in Bulgarian with invented words in it.
 *
 * Measured on 2026-08-22, one meal log and one four-sentence answer per
 * language, on the two models this file routes between:
 *
 *   - **Clean on Haiku 4.5** — English, Spanish, French, German, Italian,
 *     Portuguese, Dutch, Polish, Turkish, Romanian, Czech, Swedish, Danish,
 *     Norwegian, Russian, Greek, Japanese, Chinese, Korean, Arabic, Hindi,
 *     Indonesian, Thai, Vietnamese.
 *   - **Broken on Haiku 4.5** — Bulgarian ("безхарно", "четирист": not words),
 *     Serbian (answered a Cyrillic prompt in Latin script, with Cyrillic
 *     letters stranded inside Latin words — "danас"), Croatian, Slovak,
 *     Slovene, Lithuanian, Estonian, Finnish ("tasapainoittuu"), Hungarian,
 *     Ukrainian. All eight of the ones re-tested came back clean on Sonnet 5 at
 *     low effort, which is what `TEXT_LOG_UNSUPPORTED_LANGUAGE` spends.
 *
 * The split is corpus size, not script: Russian and Greek are fine and Croatian
 * is not. So this is a list of languages rather than a rule about character
 * ranges, and it is a list of the ones actually checked — a language nobody has
 * looked at gets the capable model until somebody does.
 */

/**
 * Every language the detector may return, and the English name to call it by.
 *
 * The name is for a prompt, so it is in English however the reply will be
 * written: "Български" in a system prompt is a worse instruction than
 * "Bulgarian". Same reasoning as `LOCALE_ENGLISH_NAMES`, which this extends
 * past the five languages the interface itself ships in — somebody writing
 * Italian to an English app is owed Italian back, and the five-locale table
 * has nothing to say about that.
 *
 * Both Norwegian standards are called "Norwegian". franc distinguishes Bokmål
 * from Nynorsk, but not from 600 characters of meal log, and being told to
 * write the wrong standard is worse than being told to write the language.
 * Indonesian and Malay keep their own names despite confusing the detector as
 * often as they do: the pair is symmetric, both are plausible, and a reader of
 * either can read the other.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  // Measured clean on Haiku.
  eng: 'English',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  nld: 'Dutch',
  pol: 'Polish',
  tur: 'Turkish',
  ron: 'Romanian',
  ces: 'Czech',
  swe: 'Swedish',
  dan: 'Danish',
  nob: 'Norwegian',
  nno: 'Norwegian',
  rus: 'Russian',
  ell: 'Greek',
  jpn: 'Japanese',
  cmn: 'Mandarin Chinese',
  kor: 'Korean',
  arb: 'Arabic',
  hin: 'Hindi',
  ind: 'Indonesian',
  zlm: 'Malay',
  tha: 'Thai',
  vie: 'Vietnamese',
  // Measured as broken on Haiku.
  bul: 'Bulgarian',
  srp: 'Serbian',
  hrv: 'Croatian',
  bos: 'Bosnian',
  slk: 'Slovak',
  slv: 'Slovenian',
  ukr: 'Ukrainian',
  mkd: 'Macedonian',
  lit: 'Lithuanian',
  lav: 'Latvian',
  est: 'Estonian',
  fin: 'Finnish',
  hun: 'Hungarian',
  // Not measured, and escalated on that basis rather than on evidence.
  heb: 'Hebrew',
  cat: 'Catalan',
  sqi: 'Albanian',
  isl: 'Icelandic',
  glg: 'Galician',
  eus: 'Basque',
  mlt: 'Maltese',
  ltz: 'Luxembourgish',
  afr: 'Afrikaans',
  ceb: 'Cebuano',
  tgl: 'Tagalog',
  fas: 'Persian',
  urd: 'Urdu',
  ben: 'Bengali',
  tam: 'Tamil',
  tel: 'Telugu',
  mar: 'Marathi',
  swh: 'Swahili',
  zul: 'Zulu',
};

/**
 * The languages the detector is allowed to answer with.
 *
 * Left to the whole of its 187-language model, franc picks Scots over English
 * for "200g chicken and 150g rice" and Tamazight over English for "yes please"
 * — both perfectly reasonable trigram matches and both catastrophic here, since
 * neither is on the list above and English is most of the product. Restricting
 * the candidates to languages this app plausibly receives turns those into the
 * near-miss they should have been.
 */
const CANDIDATES: string[] = Object.keys(LANGUAGE_NAMES);

/** The subset Haiku 4.5 was measured writing cleanly. See the note above. */
const HAIKU_LANGUAGES: ReadonlySet<string> = new Set([
  'eng', 'spa', 'fra', 'deu', 'ita', 'por', 'nld', 'pol', 'tur', 'ron',
  'ces', 'swe', 'dan', 'nob', 'nno', 'rus', 'ell', 'jpn', 'cmn', 'kor',
  'arb', 'hin', 'ind', 'zlm', 'tha', 'vie',
]);

/** The five the interface ships in, mapped to the codes the tables above use. */
const FRANC_CODES: Record<Locale, string> = {
  en: 'eng',
  bg: 'bul',
  de: 'deu',
  es: 'spa',
  fr: 'fra',
};

/**
 * How many characters of conversation the decision is allowed to see.
 *
 * Trigram detection is unreliable on a fragment — "две яйца" is nine characters
 * and identifies as nothing at all — and a journal is made almost entirely of
 * fragments. So the sample is the last few turns joined together rather than
 * the message on its own, which is what lets "ok" or "малко повече" inherit the
 * language of the conversation they are part of instead of resetting it.
 *
 * Capped because accuracy stops improving long before the cost of scanning
 * does, and a long transcript would be re-scanned on every turn.
 */
const SAMPLE_LIMIT = 600;

/**
 * Turns of conversation the language check may look back over.
 *
 * Small on purpose. For the journal this is a second query on the hot path
 * whenever the transcript was not already loaded for the model, and it buys
 * only what a fragment cannot say on its own — three or four sentences is
 * already more than the detector needs, and a wider window would mostly re-read
 * a conversation the model is not being sent.
 *
 * The same number everywhere it is asked, so that Monday's review and the turn
 * before it cannot reach different conclusions about the same conversation.
 */
export const LANGUAGE_LOOKBACK = 6;

export interface ReplyLanguage {
  /**
   * What to tell the model to write in, in English, or null to tell it nothing.
   *
   * Null covers two cases that want the same treatment. English is one: it is
   * what the model does unprompted, and a line confirming it is tokens spent on
   * every turn to buy a behaviour that was already there — the same reason
   * `unitsBrief` says nothing about metric. The other is a language the
   * detector could see but could not name, where the stable prompt's standing
   * rule ("reply in the language they wrote to you in") is a better instruction
   * than a guessed one, because it is reading the same words the model is.
   */
  name: string | null;
  /** Whether the cheap model writes this language well enough to be let near it. */
  haiku: boolean;
}

/**
 * The language this reply is due in, and whether Haiku may write it.
 *
 * `samples` is newest-first: the newest message, then recent user turns behind
 * it. The two are read against each other — see `detect`. Only user text
 * belongs here: the assistant's own replies would make the decision
 * self-confirming, since a turn that wrongly answered a Bulgarian message in
 * English would then look like an English conversation forever.
 *
 * `locale` is the fallback and only the fallback. It is read when the samples
 * say nothing at all, which is the common case for everything generated without
 * a user sentence in front of it: the weekly review, a nudge, a captionless
 * photo, a barcode scanned into an empty box.
 *
 * The two failure directions are not equally bad, so this leans one way on
 * purpose. Escalating a language Haiku could have handled costs about two and a
 * half cents on that turn; failing to escalate one it cannot handle is the bug
 * this exists to fix, and the user reads the result. So every unresolved case
 * ends up escalating.
 */
export function replyLanguage(samples: string[], locale: Locale): ReplyLanguage {
  const detected = detect(samples);

  if (detected.kind === 'named') {
    return { name: nameFor(detected.code), haiku: HAIKU_LANGUAGES.has(detected.code) };
  }

  // Something is there and it is not a language we can name. Say nothing and
  // spend the capable model, which is the pair of choices that degrades best:
  // the model reads their sentence and answers it in kind, and it is a model
  // that can.
  if (detected.kind === 'unnamed') return { name: null, haiku: false };

  return { name: nameFor(FRANC_CODES[locale]), haiku: HAIKU_LANGUAGES.has(FRANC_CODES[locale]) };
}

function nameFor(code: string): string | null {
  return code === 'eng' ? null : (LANGUAGE_NAMES[code] ?? null);
}

/**
 * Which of the five interface languages a finished piece of prose is written in,
 * or null if it is none of them.
 *
 * The mirror of `replyLanguage`, and it exists because that function's answer
 * outlives the request that asked it. A nudge and a weekly review are written
 * in the language the journal was written in, which is deliberately not the
 * stored locale — and then the email carrying them was drawn from the stored
 * locale anyway, so a Bulgarian nudge arrived under an English heading with an
 * English greeting over it and an English button under it. One message, two
 * languages, which is worse than either of them alone.
 *
 * Read off the prose rather than plumbed through from generation because the
 * prose is the thing being wrapped: whatever wrote it and whenever, the chrome
 * should be in the language of the words next to it. It also answers for rows
 * written before this existed, which a stored column would not.
 *
 * A single sample, so `detect` returns what the text says with nothing to
 * check it against — safe here in a way it is not on a meal log, because this
 * is paragraphs of finished writing rather than "две яйца". Null for anything
 * outside the five: an Italian nudge has no catalogue to be wrapped in, and
 * the caller's stored locale is the best chrome left.
 */
export function proseLocale(text: string): Locale | null {
  const detected = detect([text]);
  return detected.kind === 'named' ? (LOCALE_CODES[detected.code] ?? null) : null;
}

/** `FRANC_CODES` read the other way, for `proseLocale`. */
const LOCALE_CODES: Record<string, Locale> = Object.fromEntries(
  Object.entries(FRANC_CODES).map(([locale, code]) => [code, locale as Locale]),
);

type Detection =
  /** A language, named. */
  | { kind: 'named'; code: string }
  /** Prose we could not put a name to — see `ReplyLanguage.name`. */
  | { kind: 'unnamed' }
  /** Nothing to go on, so nothing was decided. The caller's fallback applies. */
  | { kind: 'none' };

/**
 * A language is named only when the newest message and the conversation behind
 * it agree about what it is.
 *
 * Two different things go wrong without this, and one rule settles both.
 *
 * The window is what lets "ok" and "малко повече" inherit the language of the
 * conversation they belong to, and it is also what would stop somebody leaving
 * it — five Bulgarian turns outvote the English sentence in front of them, so a
 * switch would keep being answered in the language it switched away from.
 *
 * The newest message on its own is the opposite trade: it follows a switch
 * immediately and it is short, which is exactly where trigram detection frays.
 * Measured on the sentences in `test/language.test.ts`, one meal log each:
 * Slovene comes back as Polish, Croatian as Bosnian, Estonian as Finnish. The
 * first of those is the dangerous one — Polish is on the Haiku list and Slovene
 * is not, so believing it would put a language Haiku writes badly on Haiku.
 *
 * Requiring the two to agree keeps what is good about each. A fragment names
 * nothing on its own, so the window decides it unopposed. A real switch
 * disagrees with the window and lands here as unnamed — no brief naming the
 * language they just left, and the capable model, while the standing rule in
 * the stable prompt reads their actual sentence and follows them. And a
 * near-miss like Slovene disagrees with itself and gets the same treatment,
 * which is the safe answer rather than a lucky one.
 */
function detect(samples: string[]): Detection {
  const window = identify(buildSample(samples));
  if (window.kind !== 'named' || samples.length <= 1) return window;

  /*
   * How much of a newest message is enough for it to be worth listening to.
   *
   * It only ever votes against the window, so this is the length at which a
   * disagreement is worth believing rather than the length at which detection
   * is right. A one- or two-word log — "protein bar", "и още една" — is not a
   * change of language and must not read as one, or the brief and the model
   * under it would flip every few turns of a perfectly ordinary conversation.
   * Anything sentence-shaped is past it.
   */
  const current = buildSample(samples.slice(0, 1));
  if (current.length < VETO_LENGTH) return window;

  const newest = identify(current);
  if (newest.kind === 'named' && newest.code !== window.code) return { kind: 'unnamed' };

  return window;
}

const VETO_LENGTH = 20;

function identify(sample: string): Detection {
  // An empty or whitespace-only turn is not a language problem, and a photo
  // sent with no caption arrives here as one.
  if (sample.length === 0) return { kind: 'none' };

  // Cyrillic is settled before franc rather than by it — see `readCyrillic`.
  if (CYRILLIC.test(sample)) {
    const code = readCyrillic(sample);
    return code === null ? { kind: 'unnamed' } : { kind: 'named', code };
  }

  const detected = franc(sample, { only: CANDIDATES });
  if (detected !== 'und') return { kind: 'named', code: detected };

  // Undetermined: too short for trigrams to mean anything. Plain ASCII is
  // English, or close enough to it that the stored locale is a safe fallback —
  // "ok" and "yes please" land here. Anything else is a language we could not
  // name, and naming it is the whole basis for the tables above.
  return /[^\x00-\x7F]/.test(sample) ? { kind: 'unnamed' } : { kind: 'none' };
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Which Cyrillic language a sample is written in.
 *
 * Cyrillic gets its own pass because it is the script the Haiku list splits
 * inside — Russian is on it, Bulgarian, Ukrainian, Serbian and Macedonian are
 * not — and it is exactly there that the trigram model is weakest: on a short
 * Russian meal log franc ranks Bosnian first and Russian fourth. Letters settle
 * it far more reliably than trigrams do, because these alphabets genuinely
 * differ.
 *
 * Ukrainian, Serbian and Macedonian each have letters no other Cyrillic
 * language here uses, so they are decided outright. Russian and Bulgarian share
 * an alphabet apart from ы, э and ё, which Bulgarian does not have at all — so
 * those three settle it when they appear, and a handful of function words
 * settle the shorter samples where they happen not to.
 *
 * Null when the words are silent both ways, which in practice means a sample of
 * nouns and numbers. It escalates either way; the only thing lost is the name,
 * and the standing rule in the stable prompt covers that better than a coin
 * toss between two languages would.
 *
 * Both lists are longer than the meal logs they were first written for, because
 * `proseLocale` asks the same question about finished sentences and cannot
 * shrug: a null there draws a Bulgarian nudge in English chrome. Every word
 * added is one the other language does not have at all — "са", "малко" and
 * "така" are not Russian, "было", "тоже" and "хотя" are not Bulgarian — so a
 * longer list cannot make the two agree, only make the silence rarer. Anything
 * the pair shares ("много", "само", "при") is deliberately in neither.
 */
function readCyrillic(sample: string): string | null {
  if (UKRAINIAN_LETTERS.test(sample)) return 'ukr';
  if (MACEDONIAN_LETTERS.test(sample)) return 'mkd';
  if (SERBIAN_LETTERS.test(sample)) return 'srp';
  if (RUSSIAN_LETTERS.test(sample)) return 'rus';

  const russian = count(sample, RUSSIAN_WORDS);
  const bulgarian = count(sample, BULGARIAN_WORDS);
  if (russian > bulgarian) return 'rus';
  if (bulgarian > russian) return 'bul';
  return null;
}

/**
 * `\b` is useless here: it is defined in terms of `\w`, which is ASCII-only, so
 * a Cyrillic word never has a boundary as far as the engine is concerned and
 * every one of these patterns would silently match nothing.
 */
function word(alternatives: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'giu');
}

function count(sample: string, pattern: RegExp): number {
  return sample.match(pattern)?.length ?? 0;
}

/** і, ї, є and ґ are Ukrainian; none of them are Russian or Bulgarian. */
const UKRAINIAN_LETTERS = /[іїєґ]/iu;
/** ѓ, ќ and ѕ are Macedonian's alone among the Cyrillic languages here. */
const MACEDONIAN_LETTERS = /[ѓќѕ]/iu;
/** ђ, ћ, љ, њ, џ and ј are Serbian's — Macedonian shares them, and is decided above. */
const SERBIAN_LETTERS = /[ђћљњџј]/iu;
/** Russian has these three; Bulgarian has none of them. */
const RUSSIAN_LETTERS = /[ыэё]/iu;

const RUSSIAN_WORDS = word(
  'что|это|как|меня|тебя|или|сколько|который|которая|была|были|есть|очень|' +
    'если|чтобы|потому|уже|все|всё|его|ему|них|нас|вам|вас|сегодня|завтра|' +
    'вчера|осталось|хлеба|молоком|был|было|ещё|еще|тоже|только|можно|нужно|' +
    'надо|хотя|значит|сейчас|неделю|неделе',
);

const BULGARIAN_WORDS = word(
  'ще|съм|няма|дали|защото|също|още|нали|където|който|която|което|колко|' +
    'днес|утре|яйца|мляко|хляб|калории|храна|закуска|са|си|това|тази|този|' +
    'тези|като|може|трябва|беше|бяха|малко|повече|нещо|така|седмица|' +
    'седмицата|целта|дните',
);

/**
 * The recent conversation as one string for the detector.
 *
 * Digits and punctuation are dropped rather than passed through, because a
 * journal is full of them — "2 eggs, ~200g rice, 06:30" is mostly characters
 * that carry no language at all, and they dilute the trigrams that do.
 */
function buildSample(samples: string[]): string {
  const parts: string[] = [];
  let length = 0;

  for (const text of samples) {
    // `\p{L}\p{M}` rather than `\w`, which is ASCII-only — a `\W` filter would
    // strip every Cyrillic and Greek character here and leave the detector
    // looking at an empty string for exactly the languages this is here for.
    const cleaned = text.replace(/[^\p{L}\p{M}]+/gu, ' ').trim();
    if (cleaned.length === 0) continue;
    parts.push(cleaned);
    length += cleaned.length + 1;
    if (length >= SAMPLE_LIMIT) break;
  }

  return parts.join(' ').slice(0, SAMPLE_LIMIT);
}
