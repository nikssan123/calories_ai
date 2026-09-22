import { francAll } from 'franc';
import { localeOf, type Locale } from '@ct/shared';

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
 * review generated from a stats blob, a nudge generated from a pattern. It is
 * also the fallback for a conversation too short to read, which is a larger
 * share of a journal than it sounds: see `confidentIn`.
 *
 * ---
 *
 * **A name is only worth having if it reaches the prompt.** It used to be
 * thrown away by the caller whenever the detector had named it off their own
 * text, on the theory that a model reading the sentence beats trigrams reading
 * it — and the theory is right about detection and wrong about what happens
 * next. Measured on 2026-09-20, the day three of this app's four French
 * accounts were answered in English: one meal log, Haiku 4.5, the real prompt,
 * 12 runs each.
 *
 *   - 121 letters of plain French, no brief — **4/12** replies in French.
 *   - The same turn with the language named — **12/12**.
 *   - "Deux œufs, une tartine et un café", no brief — 8/12; named — 12/12.
 *
 * The model does read the sentence. It then writes English anyway, because
 * everything else in front of it — the system prompt, the day context, the
 * examples — is English, and a four-word food log is a thin vote against all
 * of that. So a name we are sure of goes in, and the standing rule in the
 * stable prompt is what carries the turns where we are not sure.
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
 * past the languages the interface itself ships in — somebody writing Italian
 * to an English app is owed Italian back, and the locale table has nothing to
 * say about that.
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

/** The languages the interface ships in, mapped to the codes the tables above use. */
const FRANC_CODES: Record<Locale, string> = {
  en: 'eng',
  bg: 'bul',
  de: 'deu',
  es: 'spa',
  fr: 'fra',
  ro: 'ron',
  uk: 'ukr',
  sr: 'srp',
  hr: 'hrv',
  cs: 'ces',
  hu: 'hun',
  el: 'ell',
  sk: 'slk',
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

/**
 * What the turn being written will put in front of the model.
 *
 * Only the unnamed case reads this, and it is the difference between the two
 * halves of that case being the same bug or opposite ones.
 *
 * The journal hands the model the sentence the detector just read — it is the
 * user turn, and the transcript behind it is replayed — so when the reading
 * comes back unnamed there is something better than a guess already in the
 * request, and the standing rule in the stable prompt reads it. Five callers
 * hand it nothing of the kind: `photo.ts` sends a plate, one tool and an empty
 * history; `review.ts` a stats blob; `nudge.ts` a pattern; `recipes.ts` a
 * pantry; `pantry.ts` a photograph of a fridge. What the detector read is the
 * *journal*, which those requests do not carry, so a name withheld there is not
 * withheld in favour of anything — every word the model can see is English, and
 * English is what it writes.
 *
 * On 2026-09-22 a Bulgarian account sent a captionless photo through the photo
 * lane and was answered "Logged tomato and feta slices…". The two turns behind
 * it were "Калмари панирани" and "Крем с маскарпоне и захар" — Cyrillic, but
 * nouns only, and `readCyrillic` will not split Bulgarian from Russian on
 * nouns. Unnamed, so no brief; an empty history, so nothing to read it off;
 * `locale = 'bg'` on the row the whole time.
 */
export interface LanguageTurn {
  /**
   * Whether the request carries none of their words — no user sentence and no
   * transcript. False for the journal, true for the five generated lanes.
   */
  wordless: boolean;
}

/**
 * Which locale answers for an account that has not said, for the turns where
 * nothing written can decide it.
 *
 * The column first, always: it is what somebody chose, and a null there means
 * nobody has ever been asked — see `Profile.locale`. While it is null the
 * client has been drawing the whole app in the device's language, and it says
 * so on every request (`SPOKEN_LOCALE_HEADER`), so that is the better answer
 * than English for a turn with no words in it. Both are read for the prompt and
 * neither is written back: a guess must not be able to fill in the column that
 * records their answer.
 *
 * `localeOf` closes it out, resolving a null pair to English exactly as
 * everything else that renders a string does.
 */
export function speakingLocale(
  profile: { locale?: string | null } | null | undefined,
  spoken: Locale | null = null,
): Locale {
  return localeOf({ locale: profile?.locale ?? spoken });
}

export interface ReplyLanguage {
  /**
   * What to tell the model to write in, in English, or null to tell it nothing.
   *
   * Null covers two cases that want the same treatment. English is one: it is
   * what the model does unprompted, and a line confirming it is tokens spent on
   * every turn to buy a behaviour that was already there — the same reason
   * `unitsBrief` says nothing about metric. The other is a language the
   * detector could see but could not name, and that the stored locale could
   * not answer for either, where the stable prompt's standing rule ("reply in
   * the language they wrote to you in") is a better instruction than a guessed
   * one, because it is reading the same words the model is — which is true
   * only of a turn that carries those words. See `LanguageTurn`.
   */
  name: string | null;
  /** Whether the cheap model writes this language well enough to be let near it. */
  haiku: boolean;
  /**
   * Whether the name came from the stored locale rather than from anything they
   * wrote.
   *
   * Every name here is meant for a prompt — the caller no longer picks between
   * the two sources, because this function no longer hands it a name it should
   * not use. What used to be that decision is `confidentIn`: a reading the
   * detector cannot stand behind is not returned as a weaker name, it is not
   * returned at all, and the locale answers in its place.
   *
   * So what is left for this flag to say is where the answer came from, which
   * the caller wants for a different reason than it used to: the locale is a
   * fact about the account and holds for the next turn as much as this one,
   * while a reading off the text is about this conversation. It is what
   * distinguishes "they told us" from "we read it", and the tests assert on it.
   *
   * Set on the fallback whether or not it produced a name, because English
   * produces null for the reason in `name` above and the distinction is about
   * where the answer came from, not whether it was worth saying.
   */
  fromLocale: boolean;
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
 * `locale` is the fallback, and it answers whenever the writing does not. That
 * is the samples saying nothing at all, which is everything generated without
 * a user sentence in front of it — the weekly review, a nudge, a captionless
 * photo, a barcode scanned into an empty box. It is also the sentence too
 * short to read: "3 yaourts" is seven letters once the digits come off and
 * comes back `und`, and "1 café lait sirop d agave" is twenty-three and comes
 * back Tagalog, which is the same amount of evidence wearing a name. See
 * `confidentIn` for where that line is drawn.
 *
 * Which of the two answered is on `fromLocale`.
 *
 * `turn` says what the request being built will put in front of the model, and
 * it only ever changes the unnamed case. See `LanguageTurn`.
 *
 * The two failure directions are not equally bad, so this leans one way on
 * purpose. Escalating a language Haiku could have handled costs about two and a
 * half cents on that turn; failing to escalate one it cannot handle is the bug
 * this exists to fix, and the user reads the result. So every unresolved case
 * ends up escalating.
 */
export function replyLanguage(
  samples: string[],
  locale: Locale,
  turn: LanguageTurn = { wordless: false },
): ReplyLanguage {
  const detected = detect(samples);

  if (detected.kind === 'named' && detected.confident) {
    return {
      name: nameFor(detected.code),
      haiku: HAIKU_LANGUAGES.has(detected.code),
      fromLocale: false,
    };
  }

  /*
   * Something is there and it is not a language we can name. Say nothing and
   * spend the capable model, which is the pair of choices that degrades best:
   * the model reads their sentence and answers it in kind, and it is a model
   * that can.
   *
   * Deliberately not answered from the locale, unlike the shaky reading below.
   * This is the case where the two sources are most likely to be about
   * different things — a sentence in a language nobody has named yet, or
   * somebody switching mid-conversation, which is `detect`'s veto arriving
   * here — and naming the app's language over the top of a sentence in another
   * one is the mistake the whole file exists to undo.
   *
   * All of which rests on there being a sentence, and on a wordless turn there
   * is not: saying nothing there is not deference to what the model can read,
   * it is an English prompt with nothing to argue against it. So the locale
   * answers instead — the same fallback as `none` below, for a case that has
   * the same amount of evidence in front of the model.
   */
  if (detected.kind === 'unnamed') {
    return turn.wordless
      ? { name: nameFor(FRANC_CODES[locale]), haiku: false, fromLocale: true }
      : { name: null, haiku: false, fromLocale: false };
  }

  const fallback = FRANC_CODES[locale];

  /*
   * Nothing was written that carries a language, or too little of it was.
   *
   * The two used to be separate and are one answer: what the column says. A
   * reading the detector cannot stand behind is not evidence of anything, and
   * putting it up against the answer somebody gave in onboarding is how a
   * French account logging "1 café lait sirop d agave" came to be filed as
   * Tagalog on 2026-09-20 — 23 letters, none of them a function word, and
   * every language in the table is a plausible trigram match for a plate of
   * nouns.
   *
   * The model still follows the shaky reading even though the name does not.
   * They are different questions once the two sources disagree: the name is
   * what to write and the column is the better witness to it, while the model
   * is a floor under what *might* have been written, and a language Haiku
   * cannot spell is a reason to escalate whether or not we believe the guess
   * that found it. So both have to be clean for a turn to stay cheap, which
   * costs about two and a half cents when the guess was wrong and keeps the
   * failure this file exists for off the cheap model when it was right.
   */
  return {
    name: nameFor(fallback),
    haiku:
      HAIKU_LANGUAGES.has(fallback) &&
      (detected.kind === 'none' || HAIKU_LANGUAGES.has(detected.code)),
    fromLocale: true,
  };
}

function nameFor(code: string): string | null {
  return code === 'eng' ? null : (LANGUAGE_NAMES[code] ?? null);
}

/**
 * Which of the interface's languages a finished piece of prose is written in, or
 * null if it is none of them.
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
 * outside them: an Italian nudge has no catalogue to be wrapped in, and
 * the caller's stored locale is the best chrome left.
 */
export function proseLocale(text: string): Locale | null {
  if (text.replace(/[^\p{L}]/gu, '').length < PROSE_MIN_LETTERS) return null;
  const detected = detect([text]);
  return detected.kind === 'named' ? (LOCALE_CODES[detected.code] ?? null) : null;
}

/**
 * How much prose `proseLocale` needs before it will name a language.
 *
 * A review is paragraphs and a nudge is a sentence or two, so this is well
 * under anything real and well over what trigrams can be trusted with: on a
 * fragment franc names anything, and "A steady week." reads as Czech. Before
 * the interface shipped in Czech that guess fell through harmlessly — there was
 * no Czech catalogue to wrap the mail in — but with thirteen catalogues a wrong
 * name is a wrongly-dressed email. So a short text names nothing, and the
 * caller's stored locale answers.
 */
const PROSE_MIN_LETTERS = 40;

/**
 * `FRANC_CODES` read the other way, for `proseLocale` — plus Bosnian, read as
 * Croatian.
 *
 * franc ranks Bosnian first on Croatian prose, with Croatian a close second: the
 * Latin-script standards share nearly every trigram, and a weekly review is not
 * long enough to separate them. Bosnian has no catalogue, so left alone a
 * Croatian review would come back null and arrive in whatever chrome the stored
 * locale says. Croatian chrome is what a reader of any of them reads without
 * noticing. Serbian needs no alias: it ships in Cyrillic, which `readCyrillic`
 * settles by its letters before franc is asked.
 */
const LOCALE_CODES: Record<string, Locale> = {
  ...Object.fromEntries(
    Object.entries(FRANC_CODES).map(([locale, code]) => [code, locale as Locale]),
  ),
  bos: 'hr',
};

type Detection =
  /**
   * A language, named.
   *
   * `confident` is whether the name is fit to be put in a prompt as an
   * instruction — see `confidentIn`. A name without it still decides the
   * model, because a language Haiku cannot spell is a reason to escalate
   * however shaky the reading that found it; what it does not decide is the
   * sentence, which `replyLanguage` answers from the stored locale instead.
   */
  | { kind: 'named'; code: string; confident: boolean }
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
  // Confident when it answers at all: these rules are letters and whole words
  // that one language has and the others do not, which is why they run in
  // front of the trigrams rather than behind them. Where they are unsure they
  // say so by returning null.
  if (CYRILLIC.test(sample)) {
    const code = readCyrillic(sample);
    return code === null ? { kind: 'unnamed' } : { kind: 'named', code, confident: true };
  }

  // Latin letters are not evidence of a Latin-script language — see
  // `readLatinBulgarian`. Words again, and before franc for the same reason:
  // the trigrams of Bulgarian spelled this way are a neighbour's trigrams.
  // Confident for the same reason as above, and it already takes two markers
  // no neighbour has before it will answer.
  if (readLatinBulgarian(sample)) return { kind: 'named', code: 'bul', confident: true };

  // francAll ranks every candidate and scores the winner 1, so the runner-up
  // is how close anything else came. It returns a single `und` row when the
  // sample is too short for any of them.
  const [best, runnerUp] = francAll(sample, { only: CANDIDATES });
  if (best !== undefined && best[0] !== 'und') {
    const code = best[0];
    return { kind: 'named', code, confident: confidentIn(sample, code, runnerUp?.[1] ?? 0) };
  }

  // Undetermined: too short for trigrams to mean anything. Plain ASCII is
  // English, or close enough to it that the stored locale is a safe fallback —
  // "ok" and "yes please" land here. Anything else is a language we could not
  // name, and naming it is the whole basis for the tables above.
  return /[^\x00-\x7F]/.test(sample) ? { kind: 'unnamed' } : { kind: 'none' };
}

/**
 * Whether franc's answer is solid enough to be handed to a model as an
 * instruction.
 *
 * Not the same question as whether it is right. What is kept out is a name
 * stated with enough authority to talk over a model that would otherwise have
 * read the sentence for itself: "write to this person in Polish" above a
 * Slovene meal log is the bug at the top of this file again, with the
 * detector's guess standing where the locale column used to.
 *
 * Two things say a reading is thin, and both were measured over the sentences
 * in `test/language.test.ts` — every language's meal log, its follow-up
 * question, and the two together, 80 readings in all.
 *
 * **How much was written.** Below about thirty-five letters franc is a coin
 * toss on a food log: "quante calorie mi restano oggi?" reads as Portuguese,
 * "il me reste combien de calories" as Galician, "dve jajci in rezina kruha z
 * maslom" as Polish. At 36 and up every reading in the corpus is either right
 * or one of the near-neighbours the runner-up rule below catches.
 *
 * **Whether anything else came close.** The 36-letter floor is a Latin-script
 * number and would silently exclude the scripts franc is *best* at — thirty
 * characters of Japanese is a paragraph, and nothing else in the table is
 * written in kana. So an unopposed reading is confident at any length, where
 * unopposed means the second-place language scored at or under half. The same
 * rule read the other way is what rejects the pairs that share nearly every
 * trigram: Croatian against Bosnian at 0.997, Slovene against Serbian at
 * 0.999, Indonesian against Malay at 0.973. Those are not readings, they are
 * ties, and at that distance the loser is as good a guess as the winner.
 *
 * Together they name 43 of the 80 and get one wrong, which is the Finnish
 * clause below.
 */
function confidentIn(sample: string, code: string, runnerUp: number): boolean {
  // Estonian reads as Finnish and is not close enough to anything for the
  // rules above to notice: 65 letters, and the runner-up is Hungarian at 0.88.
  // Letters settle it as they do for Cyrillic — õ is an ordinary Estonian
  // letter and Finnish is not written with it at all, so a Finnish reading of
  // a sample containing one is not a reading to put in a prompt. Left as a
  // refusal rather than a rename: Estonian escalates either way, so what is at
  // stake is the name, and the locale answers it better than this would.
  if (code === 'fin' && ESTONIAN_LETTER.test(sample)) return false;

  if (runnerUp > CONFUSABLE) return false;
  return sample.length >= CONFIDENT_LETTERS || runnerUp <= UNOPPOSED;
}

/** Letters of conversation before a trigram reading is worth naming. */
const CONFIDENT_LETTERS = 36;

/** A runner-up this close is a tie, not a second place. */
const CONFUSABLE = 0.95;

/** A runner-up this far back leaves the reading standing on its own. */
const UNOPPOSED = 0.5;

/** Estonian has õ; Finnish, the language it is read as, does not. */
const ESTONIAN_LETTER = /õ/iu;

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
 * Whether a sample is Bulgarian typed in Latin letters.
 *
 * Bulgarians write Bulgarian on a Latin keyboard constantly — шльокавица — and
 * nothing above can see it. `readCyrillic` never runs, because there is no
 * Cyrillic; franc then reads the trigrams of a Slavic language spelled the way
 * a neighbouring one spells itself, and answers with the neighbour. Measured on
 * the three messages one account sent on 2026-09-16: "Kafe nimidavat da piita"
 * came back Croatian, "hapçta mnogo piya" Swahili, and "Leka veçer çaoo"
 * **Turkish** — which is on the Haiku list, so believing that one would have put
 * the language this file was written to keep off Haiku onto Haiku.
 *
 * Nothing downstream rescues it either. The name reaches a prompt on every turn
 * that carries no sentence of its own — a captionless photo, Monday's review, a
 * nudge, a recipe — so the account above was one photo away from a review
 * written in Croatian, and `proseLocale` reads the same detector, which is what
 * would have drawn the email around it in Serbian.
 *
 * So this is words, like `readCyrillic` and for the same reason: the letters do
 * not separate these languages and the vocabulary does. Every entry is a word
 * Bulgarian has and its neighbours do not — "shte" against "će", "nyama"
 * against "nema", "utre" against "sutra", "hlyab" against "hleb" — plus the
 * definite forms, which settle it outright: "kaloriite" and "hranata" are not
 * spellings of a Serbo-Croatian word, they are a postposed article that
 * language does not have.
 *
 * Deliberately absent: everything the neighbours share. "mnogo", "samo", "ako",
 * "dobre", "beshe" and "imam" are Bulgarian and Serbian both; "kolko" and
 * "kalorii" are Bulgarian and Slovak both, and those two together were enough
 * to name a Slovak meal log Bulgarian while this was being written. A marker
 * that has to be argued for is not a marker.
 *
 * Two distinct markers rather than one, because one is what a transliterated
 * neighbour produces on its own: "zashto" is how some people spell Serbian
 * "zašto", and by itself it is evidence of nothing. Two means the alternative
 * is a sentence in another language that happens to contain two words that
 * language does not have. What the threshold costs is that a short turn — "Leka
 * veçer çaoo" — names nothing alone, which is what the window in `detect` is
 * already for: it is read with the turns behind it, and at fifteen characters
 * it is too short to veto them.
 *
 * Macedonian in Latin letters is the one this cannot separate, since it shares
 * most of what is here. It is rare — Macedonian is written in Cyrillic, where
 * `readCyrillic` settles it by letters of its own — and both languages escalate
 * either way, so what is at stake is the name and not the model.
 */
function readLatinBulgarian(sample: string): boolean {
  const hits = foldTurkishLetters(sample).match(LATIN_BULGARIAN_WORDS);
  if (hits === null) return false;

  // Distinct, so that a sample repeating one word is still the one word it is.
  return new Set(hits.map((hit) => hit.toLowerCase())).size >= LATIN_BULGARIAN_MARKERS;
}

/** How many of the words below it takes to name the language. See above. */
const LATIN_BULGARIAN_MARKERS = 2;

/**
 * Words Bulgarian has that the languages it would otherwise be read as do not,
 * in the spellings people actually type them in.
 *
 * Several appear more than once because шльокавица has no orthography: я is
 * "ya", "ia" or "q" depending on who is typing, and all three are here for the
 * words where all three turn up. The food is not decoration — a journal is
 * mostly food, and "hlyab", "sirene" and "pileshko" are the words that will be
 * in it long before a function word is.
 */
const LATIN_BULGARIAN_WORDS = word(
  // Function words and verbs.
  'shte|nyama|niama|nyamam|niamam|tryabva|triabva|trqbva|iskam|iskash|kakvo|' +
    'zashto|zashtoto|oshte|nishto|neshto|vsichko|poveche|malko|sega|veche|' +
    'nali|kato|moga|sum|byaha|bqha|edin|edna|edno|koyato|koito|koeto|dokato|' +
    'predi|vav|vuv|sas|sus|kude|chuvstvam|zdravey|zdrasti|blagodarya|molya|' +
    'leka|nosht|dneska|utre|vchera|fchera|sutrinta|sutrin|ostavat|piya|' +
    // Food, and the words a log puts around it.
    'yayca|yaytsa|iaica|qyca|hlyab|hliab|hlqb|mlyako|mliako|mlqko|sirene|' +
    'kashkaval|pileshko|svinsko|teleshko|oriz|kartofi|domati|krastavitsi|' +
    'banitsa|banica|zelenchutsi|zelenchuci|obyad|obqd|vecherya|vecheria|' +
    'zakuska|yadene|qdene|yadoh|qdoh|gladen|teglo|otslabvam|trenirovka|' +
    'hapche|hapcheta|tova|tozi|tazi|tezi|' +
    // The postposed article, which no neighbour here has.
    'kaloriite|hranata|sedmicata|sedmitsata|tegloto|denya|denyat|vecherta|' +
    'celta|tselta',
);

/**
 * ç and ş back to the digraphs the list above is written in.
 *
 * A Turkish keyboard is an ordinary way to type Bulgarian in Bulgaria, and it
 * spells ч and ш with the letters Turkish uses for them — the account this was
 * written for sent "veçer" and "çaoo". Only those two letters, and only in this
 * direction: folding Croatian's č and š the same way would spell Croatian words
 * the way this list spells Bulgarian ones, which is the failure it exists to
 * prevent. Romanian's ş passes through and comes out as "shi" and "shase",
 * which are not on the list and were never going to be.
 */
function foldTurkishLetters(sample: string): string {
  return sample.replace(/ç/giu, 'ch').replace(/ş/giu, 'sh');
}

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
