import { describe, expect, it } from 'vitest';
import { LOCALES, LOCALE_ENGLISH_NAMES } from '@ct/shared';
import { replyLanguage } from '../src/ai/language.ts';
import { MODELS, TEXT_LOG_UNSUPPORTED_LANGUAGE } from '../src/ai/client.ts';

/**
 * What language a reply is written in, and which model may write it.
 *
 * The samples are meal logs and the kind of short question that follows one,
 * rather than tidy paragraphs, because that is what the detector actually gets
 * handed and it is where trigram detection is weakest.
 *
 * The two failure directions are not symmetric, and the tests are written to
 * say so: a language that escalates when it did not need to costs about two and
 * a half cents, and a language that fails to escalate is the bug — so the
 * "stays on Haiku" cases are the ones worth being strict about.
 *
 * Every case here passes `'en'` as the locale, which is the fallback and is
 * deliberately not what these assertions turn on. The whole point of the
 * resolver is that an English interface says nothing about the language of the
 * conversation in front of it.
 */

/** Written cleanly by Haiku 4.5 when it was measured. See `ai/language.ts`. */
const STAYS_ON_HAIKU: Array<[string, string[]]> = [
  ['English', ['two eggs and a slice of toast with butter', 'how am I doing on protein today?']],
  ['Spanish', ['dos huevos y una tostada con mantequilla', '¿cómo voy de proteína hoy?']],
  ['French', ['deux œufs et une tranche de pain avec du beurre', 'il me reste combien de calories ?']],
  ['German', ['zwei Eier und eine Scheibe Brot mit Butter', 'wie viele Kalorien habe ich noch?']],
  ['Italian', ['due uova e una fetta di pane con burro', 'quante calorie mi restano oggi?']],
  ['Portuguese', ['dois ovos e uma fatia de pão com manteiga', 'quantas calorias faltam hoje?']],
  ['Dutch', ['twee eieren en een boterham met boter', 'hoeveel calorieën heb ik nog over?']],
  ['Polish', ['dwa jajka i kromka chleba z masłem', 'ile kalorii mi jeszcze zostało?']],
  ['Turkish', ['iki yumurta ve tereyağlı bir dilim ekmek', 'bugün kaç kalorim kaldı?']],
  ['Romanian', ['două ouă și o felie de pâine cu unt', 'câte calorii mai am azi?']],
  ['Swedish', ['två ägg och en skiva bröd med smör', 'hur många kalorier har jag kvar?']],
  ['Russian', ['два яйца и кусок хлеба с маслом', 'сколько калорий у меня осталось сегодня?']],
  ['Greek', ['δύο αυγά και μια φέτα ψωμί με βούτυρο', 'πόσες θερμίδες μου μένουν σήμερα;']],
  ['Japanese', ['卵二個とバターを塗ったパン一枚', '今日はあと何キロカロリー残ってる？']],
  ['Chinese', ['两个鸡蛋和一片涂黄油的面包', '我今天还剩多少卡路里？']],
  ['Korean', ['계란 두 개랑 버터 바른 빵 한 조각', '오늘 칼로리 얼마나 남았어?']],
  ['Vietnamese', ['hai quả trứng và một lát bánh mì bơ', 'hôm nay tôi còn bao nhiêu calo?']],
  ['Indonesian', ['dua telur dan sepotong roti dengan mentega', 'berapa kalori saya hari ini?']],
];

/** Measured as broken on Haiku 4.5 — invented words, wrong cases, mixed scripts. */
const ESCALATES: Array<[string, string[]]> = [
  ['Bulgarian', ['две яйца и филия хляб с масло', 'колко калории ми остават днес?']],
  ['Serbian', ['два јаја и парче хлеба са маслацем', 'колико калорија ми је остало данас?']],
  ['Croatian', ['dva jaja i kriška kruha s maslacem', 'koliko mi je kalorija ostalo danas?']],
  ['Ukrainian', ['два яйця і скибка хліба з маслом', 'скільки калорій у мене залишилось?']],
  ['Slovak', ['dve vajcia a krajec chleba s maslom', 'koľko kalórií mi dnes ostalo?']],
  ['Slovene', ['dve jajci in rezina kruha z maslom', 'koliko kalorij mi je še ostalo danes?']],
  ['Lithuanian', ['du kiaušiniai ir riekė duonos su sviestu', 'kiek kalorijų man dar liko?']],
  ['Finnish', ['kaksi kananmunaa ja voileipä', 'kuinka monta kaloria minulla on jäljellä?']],
  ['Hungarian', ['két tojás és egy szelet vajas kenyér', 'hány kalóriám maradt mára?']],
  ['Estonian', ['kaks muna ja viil leiba võiga', 'mitu kalorit mul täna veel alles on?']],
];

describe('language routing', () => {
  it.each(STAYS_ON_HAIKU)('keeps %s on the cheap model', (_name, samples) => {
    expect(replyLanguage(samples, 'en').haiku).toBe(true);
  });

  it.each(ESCALATES)('escalates %s', (_name, samples) => {
    expect(replyLanguage(samples, 'en').haiku).toBe(false);
  });

  /*
   * The fragment case, and the reason the decision is made over a window.
   *
   * "малко повече" identifies as nothing on its own. What must not happen is
   * that it lands back on Haiku halfway through a Bulgarian conversation — the
   * reply would arrive in the wrong quality mid-thread, and the model would
   * change under a warm prompt cache for the sake of one word.
   */
  it('carries the decision across a fragment that says nothing on its own', () => {
    expect(replyLanguage(['малко повече'], 'en').haiku).toBe(false);
    expect(
      replyLanguage(['ок', 'две яйца и филия хляб с масло', 'колко калории ми остават?'], 'en')
        .haiku,
    ).toBe(false);
  });

  it('reads a short English acknowledgement as English', () => {
    expect(replyLanguage(['ok'], 'en').haiku).toBe(true);
    expect(replyLanguage(['yes please'], 'en').haiku).toBe(true);
  });

  /*
   * A journal is mostly digits. Stripping them is what leaves the detector
   * enough letters to work with, and this is the case that catches a regression
   * in the stripping expression — a `\W` filter would take the Cyrillic too.
   */
  it('is not confused by the numbers a food log is full of', () => {
    expect(replyLanguage(['200 гр. пилешко и 150 гр. ориз, 06:30'], 'en').haiku).toBe(false);
    expect(replyLanguage(['200g chicken and 150g rice at 06:30'], 'en').haiku).toBe(true);
  });

  it('escalates nothing when there is nothing to read', () => {
    expect(replyLanguage([], 'en').haiku).toBe(true);
    expect(replyLanguage(['', '   '], 'en').haiku).toBe(true);
    expect(replyLanguage(['2 x 150g', '~650'], 'en').haiku).toBe(true);
  });
});

/*
 * The feature this file exists for: the language somebody writes in is not the
 * language their app is set to, and the reply follows the writing.
 *
 * `038_locale.sql` backfilled every account older than it to `'en'`, so for a
 * large share of rows the column is the migration's default rather than
 * anybody's answer. Reading the reply language off it told a Bulgarian
 * speaker's journal to write English, and what came back was an English draft
 * translated word for word.
 */
describe('writing in a different language from the app', () => {
  const bulgarian = ['две яйца и филия хляб с масло', 'колко калории ми остават днес?'];
  const english = ['two eggs and a slice of toast', 'how much protein have I had?'];

  it('answers an English-drawn app in the language of the conversation', () => {
    expect(replyLanguage(bulgarian, 'en')).toEqual({ name: 'Bulgarian', haiku: false });
  });

  it('answers a Bulgarian-drawn app in English when that is what they write', () => {
    // The other direction, and the one the old code got wrong the other way
    // round: a `bg` locale used to force a Bulgarian brief over an English
    // conversation, and pay for the capable model to write it.
    expect(replyLanguage(english, 'bg')).toEqual({ name: null, haiku: true });
  });

  it('stops naming the old language when somebody switches mid-conversation', () => {
    // Newest-first, so the switch is at the front. It disagrees with the five
    // Bulgarian turns behind it, and a disagreement names nothing: the stable
    // prompt promises to follow a switch, and a brief still saying "Bulgarian"
    // over an English sentence would be the app arguing with itself. Nothing
    // named and the capable model is the safe pair — the model reads what they
    // actually wrote.
    expect(replyLanguage([...english, ...bulgarian], 'bg')).toEqual({
      name: null,
      haiku: false,
    });
  });

  it('keeps naming the language when the newest message agrees with the thread', () => {
    expect(replyLanguage([...bulgarian, ...english], 'en').name).toBe('Bulgarian');
  });

  it('does not switch on a fragment that happens to be in the other language', () => {
    // The other half of the same rule. A two-word log is not a change of
    // language, and treating it as one would flip the brief — and the model
    // under it — every few turns of a perfectly ordinary conversation.
    expect(replyLanguage(['protein bar', ...bulgarian], 'en').name).toBe('Bulgarian');
  });

  it('speaks a language the interface does not ship in', () => {
    // Italian is not one of the five the app is drawn in. Somebody writing it
    // is owed it anyway, which is why the name table is wider than the locale
    // table.
    expect(replyLanguage(['due uova e una fetta di pane con burro'], 'en').name).toBe('Italian');
  });
});

/*
 * The fallback, and only the fallback: the stored locale answers for the turns
 * with nothing written in front of them — a captionless photo, a barcode
 * scanned into an empty box, Monday's review, a nudge.
 */
describe('the language being written, when nothing has been', () => {
  it('falls back to the language the app is drawn in', () => {
    for (const locale of LOCALES) {
      const resolved = replyLanguage([], locale);
      if (locale === 'en') expect(resolved.name).toBeNull();
      else expect(resolved.name).toBe(LOCALE_ENGLISH_NAMES[locale]);
    }
  });

  it('escalates Bulgarian, the one shipped language Haiku writes badly', () => {
    expect(replyLanguage([], 'bg').haiku).toBe(false);
  });

  it('leaves the other four on the cheap model', () => {
    for (const locale of ['en', 'de', 'es', 'fr'] as const) {
      expect(replyLanguage([], locale).haiku).toBe(true);
    }
  });

  /*
   * The two paths have to agree, or a language would escalate when somebody
   * writes it and not when we write it — the same reply, two models, decided by
   * who happened to type last.
   */
  it('agrees with what the detector says about the same language', () => {
    expect(replyLanguage(['две яйца и филия хляб с масло'], 'en')).toEqual(
      replyLanguage([], 'bg'),
    );
    expect(replyLanguage(['zwei Eier und eine Scheibe Brot mit Butter'], 'en')).toEqual(
      replyLanguage([], 'de'),
    );
  });
});

/*
 * Prose we can see but cannot name. Both halves of the answer are deliberate:
 * say nothing, because the standing rule in the stable prompt is reading the
 * same sentence the model is and is a better instruction than a guess, and
 * spend the capable model, because a language nobody has measured gets the
 * benefit of the doubt.
 */
describe('a language we could not name', () => {
  // Cyrillic that the letter rules leave alone — no ы, э or ё, nothing
  // Ukrainian, Serbian or Macedonian — and that carries none of the function
  // words the shorter samples are settled by. A plate of nouns, which is what a
  // food log often is.
  const undecided = ['пилешко филе с ориз и зеленчуци'];

  it('says nothing and escalates', () => {
    expect(replyLanguage(undecided, 'en')).toEqual({ name: null, haiku: false });
  });

  it('does not let the stored locale answer over the top of it', () => {
    // The fallback is for silence, not for uncertainty. Naming this English
    // because the tab bar is English is the same mistake in a smaller font, and
    // the reply is better served by the standing rule than by a guess.
    expect(replyLanguage(undecided, 'en').name).toBeNull();
  });
});

describe('the escalated model choice', () => {
  it('is a real step up from what text_log normally runs on', () => {
    expect(MODELS.text_log.model).toBe('claude-haiku-4-5');
    expect(TEXT_LOG_UNSUPPORTED_LANGUAGE.model).toBe('claude-sonnet-5');
  });

  /*
   * The escalation buys vocabulary and grammar, not deliberation — the task is
   * the same structured extraction it always was. Low effort was measured clean
   * on the eight languages that failed, and it is what keeps an escalated turn
   * at ~3.2x a Haiku one instead of the ~4.1x high effort costs.
   */
  it('does not pay for reasoning it does not need', () => {
    expect(TEXT_LOG_UNSUPPORTED_LANGUAGE.effort).toBe('low');
  });
});
