import { franc } from 'franc';

/**
 * Which model a journal turn needs, decided by the language it is written in.
 *
 * `text_log` runs on Haiku 4.5 because it is ~70% of turns and the job —
 * turning "two eggs and toast" into items with macros — is structured
 * extraction rather than reasoning. That argument holds in every language.
 * What does not hold is the *writing*: the same reply that reads naturally in
 * English comes back in Bulgarian with invented words in it.
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
const HAIKU_LANGUAGES: ReadonlySet<string> = new Set([
  'eng', // English
  'spa', // Spanish
  'fra', // French
  'deu', // German
  'ita', // Italian
  'por', // Portuguese
  'nld', // Dutch
  'pol', // Polish
  'tur', // Turkish
  'ron', // Romanian
  'ces', // Czech
  'swe', // Swedish
  'dan', // Danish
  'nob', // Norwegian Bokmål
  'nno', // Norwegian Nynorsk
  'rus', // Russian
  'ell', // Greek
  'jpn', // Japanese
  'cmn', // Mandarin Chinese
  'kor', // Korean
  'arb', // Standard Arabic
  'hin', // Hindi
  'ind', // Indonesian
  'zlm', // Malay — franc reports Indonesian as Malay about as often as not
  'tha', // Thai
  'vie', // Vietnamese
]);

/**
 * The languages the detector is allowed to answer with.
 *
 * Left to the whole of its 187-language model, franc picks Scots over English
 * for "200g chicken and 150g rice" and Tamazight over English for "yes please"
 * — both perfectly reasonable trigram matches and both catastrophic here, since
 * neither is on the list above and English is most of the product. Restricting
 * the candidates to languages this app plausibly receives turns those into the
 * near-miss they should have been.
 *
 * So it is the union of the two sets that matter: everything Haiku handles, and
 * the ones known to need escalating. The tail is the plausible rest — they all
 * escalate, and naming them only stops a fifth language being mistaken for one
 * of the first two groups.
 */
const CANDIDATES: string[] = [
  ...HAIKU_LANGUAGES,
  // Measured as broken on Haiku.
  'bul', 'srp', 'hrv', 'bos', 'slk', 'slv', 'ukr', 'mkd',
  'lit', 'lav', 'est', 'fin', 'hun',
  // Not measured, and escalated on that basis rather than on evidence.
  'heb', 'cat', 'sqi', 'isl', 'glg', 'eus', 'mlt', 'ltz', 'afr',
  'ceb', 'tgl', 'fas', 'urd', 'ben', 'tam', 'tel', 'mar', 'swh', 'zul',
];

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
 * Whether this conversation needs the capable model.
 *
 * `samples` is newest-first: the current message, then recent user turns behind
 * it. Only user text belongs here — the assistant's own replies would make the
 * decision self-confirming, since a turn that wrongly answered a Bulgarian
 * message in English would then look like an English conversation forever.
 *
 * The two failure directions are not equally bad, so this leans one way on
 * purpose. Escalating a language Haiku could have handled costs about two and a
 * half cents on that turn; failing to escalate one it cannot handle is the bug
 * this exists to fix, and the user reads the result. So every unresolved case
 * ends up escalating.
 */
export function needsCapableModel(samples: string[]): boolean {
  const sample = buildSample(samples);
  // Nothing to go on. An empty or whitespace-only turn is not a language
  // problem, and a photo sent with no caption arrives here as one.
  if (sample.length === 0) return false;

  // Cyrillic is settled before franc rather than by it — see `readCyrillic`.
  if (CYRILLIC.test(sample)) return !readCyrillic(sample);

  const detected = franc(sample, { only: CANDIDATES });
  if (detected !== 'und') return !HAIKU_LANGUAGES.has(detected);

  // Undetermined: too short for trigrams to mean anything. Plain ASCII is
  // English, or close enough to it that Haiku is safe. Anything else is a
  // language we could not name, and naming it is the whole basis for the list.
  return /[^\x00-\x7F]/.test(sample);
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Whether a Cyrillic sample is the one Cyrillic language Haiku writes well.
 *
 * Cyrillic gets its own pass because it is the script the allowlist splits
 * inside — Russian is on it, Bulgarian, Ukrainian, Serbian and Macedonian are
 * not — and it is exactly there that the trigram model is weakest: on a short
 * Russian meal log franc ranks Bosnian first and Russian fourth. Letters settle
 * it far more reliably than trigrams do, because these alphabets genuinely
 * differ.
 *
 * Ukrainian and Serbian have letters no other Cyrillic language here uses, so
 * they are decided outright. Russian and Bulgarian share an alphabet apart from
 * ы, э and ё, which Bulgarian does not have at all — so those three settle it
 * when they appear, and a handful of function words settle the shorter samples
 * where they happen not to. Anything still unresolved escalates.
 */
function readCyrillic(sample: string): boolean {
  if (UKRAINIAN_LETTERS.test(sample)) return false;
  if (SERBIAN_LETTERS.test(sample)) return false;
  if (RUSSIAN_LETTERS.test(sample)) return true;
  return count(sample, RUSSIAN_WORDS) > count(sample, BULGARIAN_WORDS);
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
/** Serbian and Macedonian each have letters the East Slavic alphabets lack. */
const SERBIAN_LETTERS = /[ђћљњџјѓќѕ]/iu;
/** Russian has these three; Bulgarian has none of them. */
const RUSSIAN_LETTERS = /[ыэё]/iu;

const RUSSIAN_WORDS = word(
  'что|это|как|меня|тебя|или|сколько|который|которая|была|были|есть|очень|' +
    'если|чтобы|потому|уже|все|всё|его|ему|них|нас|вам|вас|сегодня|завтра|' +
    'вчера|осталось|хлеба|молоком',
);

const BULGARIAN_WORDS = word(
  'ще|съм|няма|дали|защото|също|още|нали|където|който|която|което|колко|' +
    'днес|утре|яйца|мляко|хляб|калории|храна|закуска',
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
