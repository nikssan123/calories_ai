import { describe, expect, it } from 'vitest';
import { needsCapableModel, writingNeedsCapableModel } from '../src/ai/language.ts';
import { MODELS, TEXT_LOG_UNSUPPORTED_LANGUAGE } from '../src/ai/client.ts';

/**
 * Which languages route to which model.
 *
 * The samples are meal logs and the kind of short question that follows one,
 * rather than tidy paragraphs, because that is what the detector actually gets
 * handed and it is where trigram detection is weakest.
 *
 * The two failure directions are not symmetric, and the tests are written to
 * say so: a language that escalates when it did not need to costs about two and
 * a half cents, and a language that fails to escalate is the bug — so the
 * "stays on Haiku" cases are the ones worth being strict about.
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
    expect(needsCapableModel(samples)).toBe(false);
  });

  it.each(ESCALATES)('escalates %s', (_name, samples) => {
    expect(needsCapableModel(samples)).toBe(true);
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
    expect(needsCapableModel(['малко повече'])).toBe(true);
    expect(
      needsCapableModel(['ок', 'две яйца и филия хляб с масло', 'колко калории ми остават?']),
    ).toBe(true);
  });

  it('reads a short English acknowledgement as English', () => {
    expect(needsCapableModel(['ok'])).toBe(false);
    expect(needsCapableModel(['yes please'])).toBe(false);
  });

  /*
   * A journal is mostly digits. Stripping them is what leaves the detector
   * enough letters to work with, and this is the case that catches a regression
   * in the stripping expression — a `\W` filter would take the Cyrillic too.
   */
  it('is not confused by the numbers a food log is full of', () => {
    expect(needsCapableModel(['200 гр. пилешко и 150 гр. ориз, 06:30'])).toBe(true);
    expect(needsCapableModel(['200g chicken and 150g rice at 06:30'])).toBe(false);
  });

  it('escalates nothing when there is nothing to read', () => {
    expect(needsCapableModel([])).toBe(false);
    expect(needsCapableModel(['', '   '])).toBe(false);
    expect(needsCapableModel(['2 x 150g', '~650'])).toBe(false);
  });
});

/*
 * The other direction: what the reply has to be *written* in, which is not
 * always what the turn in front of it is written in. "ok" and a captionless
 * photo say nothing to the detector and are still owed an answer in the
 * language the app is drawn in.
 */
describe('the language being written', () => {
  it('escalates Bulgarian, the one shipped language Haiku writes badly', () => {
    expect(writingNeedsCapableModel('bg')).toBe(true);
  });

  it('leaves the other four on the cheap model', () => {
    for (const locale of ['en', 'de', 'es', 'fr'] as const) {
      expect(writingNeedsCapableModel(locale)).toBe(false);
    }
  });

  /*
   * The two lists have to agree, or a language would escalate when somebody
   * writes it and not when we write it — the same reply, two models, decided by
   * who happened to type last.
   */
  it('agrees with what the detector says about the same language', () => {
    expect(needsCapableModel(['две яйца и филия хляб с масло'])).toBe(
      writingNeedsCapableModel('bg'),
    );
    expect(needsCapableModel(['zwei Eier und eine Scheibe Brot mit Butter'])).toBe(
      writingNeedsCapableModel('de'),
    );
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
