import { pluralFor, type Locale, type PluralForms } from '@ct/shared';

/**
 * The words in an email that no model wrote.
 *
 * A weekly review splits cleanly in two, and only one half is a translation
 * problem. `review.content` is AI prose and is already in the reader's language
 * — `languageBrief` saw to that when the review was generated, which is the
 * whole of phase 1. What is left is the chrome around it: the stat block's
 * labels, the week strip's caption, the button, the greeting. This is that
 * chrome.
 *
 * Deliberately a third catalogue rather than an import from either app. The
 * server cannot reach into `apps/web/messages` — separate package, separate
 * build — and the overlap is smaller than it looks: an email says "Days logged"
 * and never says "Scan a barcode".
 *
 * The same compiler check as the apps: `EmailMessages` is derived from the
 * English table, so a key added there and forgotten in another language fails
 * the build rather than rendering blank.
 *
 * ---
 *
 * **On the plural entries.** They are functions of a count rather than pairs of
 * words, and the language's own forms live in the language's own file. That
 * replaced a `plural(count, 'day', 'days')` helper in `templates.ts` which
 * hardcoded English's answer *and* English's vocabulary — so a Bulgarian review
 * read "5 days logged" in the middle of otherwise Bulgarian prose. Two forms is
 * not a simplification: French uses the singular for zero, and Polish and
 * Russian have four and three categories. See `plural` in `shared/locale.ts`.
 */

const p = {
  en: pluralFor('en'),
  bg: pluralFor('bg'),
  de: pluralFor('de'),
  es: pluralFor('es'),
  fr: pluralFor('fr'),
};

const en = {
  'review.subject': (range: string) => `Your week: ${range}`,
  'review.heading': 'Last week, in review',
  'review.greeting': (name: string) => `Hi ${name},`,
  'review.greetingNoName': 'Hi,',
  'review.daysLogged': 'Days logged',
  'review.sameAsBefore': 'same as the week before',
  'review.weekBefore': (n: number) => `${n} the week before`,
  'review.averageADay': 'Average a day',
  'review.daysOnTarget': 'Days on target',
  'review.withinTarget': (kcal: string) => `within 10% of ${kcal} kcal`,
  'review.weight': 'Weight',
  'review.acrossTheWeek': 'across the week',
  'review.burnedOver': (sessions: number) =>
    `Burned over ${p.en(sessions, { one: 'session', other: 'sessions' })}`,
  'review.onTopOfTarget': 'on top of the target',
  'review.proteinADay': 'Protein a day',
  'review.proteinTarget': (grams: string) => `target ${grams} g`,
  'review.howItRead': 'How it read',
  'review.onRepeat': 'On repeat',
  'review.times': (n: number) => p.en(n, { one: 'time', other: 'times' }),
  'review.readWholeReview': 'Read the whole review',
  'review.nothingThisWeek': 'Nothing logged this week.',
  'review.stripCaption': (logged: number, hits: number) =>
    `${p.en(logged, { one: 'day', other: 'days' })} logged, ${hits} of them within 10% of target.`,
  'review.summaryNoMean': (days: number) =>
    `${p.en(days, { one: 'day', other: 'days' })} logged.`,
  'review.summary': (days: number, kcal: number, weight: string) =>
    `${p.en(days, { one: 'day', other: 'days' })} logged, averaging ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta: string) => `, weight ${delta}`,
  /** Sun–Sat, in the week strip. Three letters is the column width. */
  'review.weekdays': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

  // ---- The alerts nobody writes. See NOTIFICATIONS.md. ----
  //
  // Here rather than composed in `alerts.ts` because an alert is written down
  // as prose and sent as prose, so the language has to be chosen at the moment
  // it is worded — and `alerts.ts` has no business knowing five of them.
  'alert.planEnds': (plan: string, when: string) => `Your ${plan} plan ends ${when}`,
  'alert.expiryToday': 'today',
  'alert.expiryTomorrow': 'tomorrow',
  'alert.expiryInDays': (days: number) => `in ${days} days`,
  'alert.planBody':
    'Nothing has renewed it yet. Everything you have logged stays exactly where it is — the reviews, the coaching and the kitchen are what go quiet.',
  'alert.goalTitle': 'You are there',
  'alert.goalBody': (weight: string) =>
    `Your last weigh-in was ${weight}, which is the goal you set. Worth picking the next one — holding a weight is its own target, and the app can aim at it.`,
  /** Parallel to `STREAK_MILESTONES`, which is what indexes it. */
  'alert.streakTitles': [
    'A week, every day',
    'A fortnight, every day',
    'A month, every day',
    'Two months straight',
    'A hundred days',
    'Two hundred days',
    'A year, every day',
  ],
  'alert.streakBody': (days: number) =>
    `${days} days logged in a row. Nothing to do about it — the consistency is what makes every number on the progress screen mean anything.`,
  'alert.recapTitle': (kcal: string, target: string) => `${kcal} of ${target} kcal`,
  'alert.recapOnTarget': 'Right on target.',
  'alert.recapUnder': (kcal: string) => `${kcal} kcal to spare.`,
  'alert.recapOver': (kcal: string) => `${kcal} kcal over.`,
  'alert.recapProtein': (got: string, target: string) => `Protein ${got}g of ${target}g.`,
} as const;

export type EmailMessages = {
  [K in keyof typeof en]: (typeof en)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : (typeof en)[K] extends readonly string[]
      ? readonly string[]
      : string;
};

const bg: EmailMessages = {
  'review.subject': (range) => `Седмицата ти: ${range}`,
  'review.heading': 'Миналата седмица',
  'review.greeting': (name) => `Здравей, ${name},`,
  'review.greetingNoName': 'Здравей,',
  'review.daysLogged': 'Записани дни',
  'review.sameAsBefore': 'колкото и предната седмица',
  'review.weekBefore': (n) => `${n} предната седмица`,
  'review.averageADay': 'Средно на ден',
  'review.daysOnTarget': 'Дни в целта',
  'review.withinTarget': (kcal) => `до 10% от ${kcal} kcal`,
  'review.weight': 'Тегло',
  'review.acrossTheWeek': 'за седмицата',
  'review.burnedOver': (sessions) =>
    `Изгорени за ${p.bg(sessions, { one: 'тренировка', other: 'тренировки' })}`,
  'review.onTopOfTarget': 'над целта',
  'review.proteinADay': 'Белтъчини на ден',
  'review.proteinTarget': (grams) => `цел ${grams} g`,
  'review.howItRead': 'Как мина',
  'review.onRepeat': 'Най-често',
  'review.times': (n) => p.bg(n, { one: 'път', other: 'пъти' }),
  'review.readWholeReview': 'Прочети целия обзор',
  'review.nothingThisWeek': 'Нищо записано тази седмица.',
  'review.stripCaption': (logged, hits) =>
    `${p.bg(logged, { one: 'записан ден', other: 'записани дни' })}, ${hits} от тях до 10% от целта.`,
  'review.summaryNoMean': (days) =>
    `${p.bg(days, { one: 'записан ден', other: 'записани дни' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.bg(days, { one: 'записан ден', other: 'записани дни' })}, средно по ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, тегло ${delta}`,
  'review.weekdays': ['нед', 'пон', 'вто', 'сря', 'чет', 'пет', 'съб'],

  'alert.planEnds': (plan, when) => `Планът ти ${plan} свършва ${when}`,
  'alert.expiryToday': 'днес',
  'alert.expiryTomorrow': 'утре',
  'alert.expiryInDays': (days) => `след ${days} дни`,
  'alert.planBody':
    'Още нищо не го е подновило. Всичко записано си остава точно където е — прегледите, съветите и кухнята са това, което утихва.',
  'alert.goalTitle': 'Стигна дотам',
  'alert.goalBody': (weight) =>
    `Последното ти тегло беше ${weight}, което е целта, която си постави. Струва си да избереш следващата — да задържиш тегло е цел сама по себе си и приложението може да се прицели в нея.`,
  'alert.streakTitles': [
    'Седмица, всеки ден',
    'Две седмици, всеки ден',
    'Месец, всеки ден',
    'Два месеца подред',
    'Сто дни',
    'Двеста дни',
    'Година, всеки ден',
  ],
  'alert.streakBody': (days) =>
    `${days} записани дни подред. Няма какво да се направи по въпроса — постоянството е това, което придава смисъл на всяко число в прогреса.`,
  'alert.recapTitle': (kcal, target) => `${kcal} от ${target} kcal`,
  'alert.recapOnTarget': 'Точно в целта.',
  'alert.recapUnder': (kcal) => `Остават ти ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal над целта.`,
  'alert.recapProtein': (got, target) => `Протеин ${got}g от ${target}g.`,
};

const de: EmailMessages = {
  'review.subject': (range) => `Deine Woche: ${range}`,
  'review.heading': 'Die Woche im Rückblick',
  'review.greeting': (name) => `Hallo ${name},`,
  'review.greetingNoName': 'Hallo,',
  'review.daysLogged': 'Erfasste Tage',
  'review.sameAsBefore': 'genauso wie in der Vorwoche',
  'review.weekBefore': (n) => `${n} in der Vorwoche`,
  'review.averageADay': 'Schnitt pro Tag',
  'review.daysOnTarget': 'Tage im Ziel',
  'review.withinTarget': (kcal) => `höchstens 10% neben ${kcal} kcal`,
  'review.weight': 'Gewicht',
  'review.acrossTheWeek': 'über die Woche',
  'review.burnedOver': (sessions) =>
    `Verbrannt in ${p.de(sessions, { one: 'Einheit', other: 'Einheiten' })}`,
  'review.onTopOfTarget': 'zusätzlich zum Ziel',
  'review.proteinADay': 'Eiweiß pro Tag',
  'review.proteinTarget': (grams) => `Ziel ${grams} g`,
  'review.howItRead': 'Wie es lief',
  'review.onRepeat': 'Immer wieder',
  'review.times': (n) => p.de(n, { one: 'Mal', other: 'Mal' }),
  'review.readWholeReview': 'Ganzen Rückblick lesen',
  'review.nothingThisWeek': 'Diese Woche nichts erfasst.',
  'review.stripCaption': (logged, hits) =>
    `${p.de(logged, { one: 'Tag', other: 'Tage' })} erfasst, davon ${hits} höchstens 10% neben dem Ziel.`,
  'review.summaryNoMean': (days) => `${p.de(days, { one: 'Tag', other: 'Tage' })} erfasst.`,
  'review.summary': (days, kcal, weight) =>
    `${p.de(days, { one: 'Tag', other: 'Tage' })} erfasst, im Schnitt ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, Gewicht ${delta}`,
  'review.weekdays': ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],

  'alert.planEnds': (plan, when) => `Dein ${plan}-Abo endet ${when}`,
  'alert.expiryToday': 'heute',
  'alert.expiryTomorrow': 'morgen',
  'alert.expiryInDays': (days) => `in ${days} Tagen`,
  'alert.planBody':
    'Bisher hat nichts verlängert. Alles Eingetragene bleibt genau, wo es ist — still werden die Wochenrückblicke, das Coaching und die Küche.',
  'alert.goalTitle': 'Du bist da',
  'alert.goalBody': (weight) =>
    `Dein letztes Wiegen ergab ${weight} — genau das Ziel, das du dir gesetzt hast. Jetzt lohnt sich das nächste: ein Gewicht zu halten ist ein Ziel für sich, und die App kann darauf zielen.`,
  'alert.streakTitles': [
    'Eine Woche, jeden Tag',
    'Zwei Wochen, jeden Tag',
    'Ein Monat, jeden Tag',
    'Zwei Monate am Stück',
    'Hundert Tage',
    'Zweihundert Tage',
    'Ein Jahr, jeden Tag',
  ],
  'alert.streakBody': (days) =>
    `${days} Tage in Folge eingetragen. Da ist nichts zu tun — genau diese Beständigkeit gibt jeder Zahl im Verlauf ihre Bedeutung.`,
  'alert.recapTitle': (kcal, target) => `${kcal} von ${target} kcal`,
  'alert.recapOnTarget': 'Genau im Ziel.',
  'alert.recapUnder': (kcal) => `${kcal} kcal übrig.`,
  'alert.recapOver': (kcal) => `${kcal} kcal darüber.`,
  'alert.recapProtein': (got, target) => `Protein ${got}g von ${target}g.`,
};

const es: EmailMessages = {
  'review.subject': (range) => `Tu semana: ${range}`,
  'review.heading': 'La semana pasada, en resumen',
  'review.greeting': (name) => `Hola ${name}:`,
  'review.greetingNoName': 'Hola:',
  'review.daysLogged': 'Días registrados',
  'review.sameAsBefore': 'igual que la semana anterior',
  'review.weekBefore': (n) => `${n} la semana anterior`,
  'review.averageADay': 'Media al día',
  'review.daysOnTarget': 'Días en el objetivo',
  'review.withinTarget': (kcal) => `a menos del 10% de ${kcal} kcal`,
  'review.weight': 'Peso',
  'review.acrossTheWeek': 'durante la semana',
  'review.burnedOver': (sessions) =>
    `Quemadas en ${p.es(sessions, { one: 'sesión', other: 'sesiones' })}`,
  'review.onTopOfTarget': 'además del objetivo',
  'review.proteinADay': 'Proteína al día',
  'review.proteinTarget': (grams) => `objetivo ${grams} g`,
  'review.howItRead': 'Cómo fue',
  'review.onRepeat': 'Lo de siempre',
  'review.times': (n) => p.es(n, { one: 'vez', other: 'veces' }),
  'review.readWholeReview': 'Leer el resumen completo',
  'review.nothingThisWeek': 'Nada registrado esta semana.',
  'review.stripCaption': (logged, hits) =>
    `${p.es(logged, { one: 'día registrado', other: 'días registrados' })}, ${hits} de ellos a menos del 10% del objetivo.`,
  'review.summaryNoMean': (days) =>
    `${p.es(days, { one: 'día registrado', other: 'días registrados' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.es(days, { one: 'día registrado', other: 'días registrados' })}, con una media de ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, peso ${delta}`,
  'review.weekdays': ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],

  'alert.planEnds': (plan, when) => `Tu plan ${plan} termina ${when}`,
  'alert.expiryToday': 'hoy',
  'alert.expiryTomorrow': 'mañana',
  'alert.expiryInDays': (days) => `en ${days} días`,
  'alert.planBody':
    'Todavía no lo ha renovado nada. Todo lo que has registrado se queda exactamente donde está — lo que se apaga son los resúmenes, el coaching y la cocina.',
  'alert.goalTitle': 'Ya estás',
  'alert.goalBody': (weight) =>
    `Tu último pesaje fue ${weight}, que es justo la meta que te pusiste. Vale la pena elegir la siguiente: mantener un peso es una meta en sí misma, y la app puede apuntar a ella.`,
  'alert.streakTitles': [
    'Una semana, todos los días',
    'Dos semanas, todos los días',
    'Un mes, todos los días',
    'Dos meses seguidos',
    'Cien días',
    'Doscientos días',
    'Un año, todos los días',
  ],
  'alert.streakBody': (days) =>
    `${days} días registrados seguidos. No hay nada que hacer al respecto: esa constancia es lo que da sentido a cada número de la pantalla de progreso.`,
  'alert.recapTitle': (kcal, target) => `${kcal} de ${target} kcal`,
  'alert.recapOnTarget': 'Justo en el objetivo.',
  'alert.recapUnder': (kcal) => `Te sobran ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal de más.`,
  'alert.recapProtein': (got, target) => `Proteína ${got}g de ${target}g.`,
};

const fr: EmailMessages = {
  'review.subject': (range) => `Ta semaine : ${range}`,
  'review.heading': 'La semaine passée, en résumé',
  'review.greeting': (name) => `Salut ${name},`,
  'review.greetingNoName': 'Salut,',
  'review.daysLogged': 'Jours enregistrés',
  'review.sameAsBefore': 'comme la semaine précédente',
  'review.weekBefore': (n) => `${n} la semaine précédente`,
  'review.averageADay': 'Moyenne par jour',
  'review.daysOnTarget': 'Jours dans l’objectif',
  'review.withinTarget': (kcal) => `à moins de 10% de ${kcal} kcal`,
  'review.weight': 'Poids',
  'review.acrossTheWeek': 'sur la semaine',
  'review.burnedOver': (sessions) =>
    `Brûlées sur ${p.fr(sessions, { one: 'séance', other: 'séances' })}`,
  'review.onTopOfTarget': 'en plus de l’objectif',
  'review.proteinADay': 'Protéines par jour',
  'review.proteinTarget': (grams) => `objectif ${grams} g`,
  'review.howItRead': 'Comment ça s’est passé',
  'review.onRepeat': 'En boucle',
  'review.times': (n) => p.fr(n, { one: 'fois', other: 'fois' }),
  'review.readWholeReview': 'Lire le résumé complet',
  'review.nothingThisWeek': 'Rien enregistré cette semaine.',
  'review.stripCaption': (logged, hits) =>
    `${p.fr(logged, { one: 'jour enregistré', other: 'jours enregistrés' })}, dont ${hits} à moins de 10% de l’objectif.`,
  'review.summaryNoMean': (days) =>
    `${p.fr(days, { one: 'jour enregistré', other: 'jours enregistrés' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.fr(days, { one: 'jour enregistré', other: 'jours enregistrés' })}, en moyenne ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, poids ${delta}`,
  'review.weekdays': ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],

  'alert.planEnds': (plan, when) => `Ton abonnement ${plan} se termine ${when}`,
  'alert.expiryToday': "aujourd’hui",
  'alert.expiryTomorrow': 'demain',
  'alert.expiryInDays': (days) => `dans ${days} jours`,
  'alert.planBody':
    "Rien ne l’a encore renouvelé. Tout ce que tu as noté reste exactement où il est — ce sont les bilans, le coaching et la cuisine qui s’arrêtent.",
  'alert.goalTitle': 'Tu y es',
  'alert.goalBody': (weight) =>
    `Ta dernière pesée était de ${weight}, exactement l’objectif que tu t’étais fixé. Autant en choisir un nouveau : tenir un poids est un objectif à part entière, et l’app sait le viser.`,
  'alert.streakTitles': [
    'Une semaine, chaque jour',
    'Deux semaines, chaque jour',
    'Un mois, chaque jour',
    'Deux mois d’affilée',
    'Cent jours',
    'Deux cents jours',
    'Une année, chaque jour',
  ],
  'alert.streakBody': (days) =>
    `${days} jours notés d’affilée. Il n’y a rien à en faire : c’est cette régularité qui donne du sens à chaque chiffre de l’écran de progression.`,
  'alert.recapTitle': (kcal, target) => `${kcal} sur ${target} kcal`,
  'alert.recapOnTarget': `Pile dans l’objectif.`,
  'alert.recapUnder': (kcal) => `Il te reste ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal de trop.`,
  'alert.recapProtein': (got, target) => `Protéines ${got}g sur ${target}g.`,
};

const CATALOGUES: Record<Locale, EmailMessages> = { en, bg, de, es, fr };

/**
 * The lookup, bound to one recipient.
 *
 * A function rather than a hook because there is no React here — an email is
 * rendered once, on a schedule, for somebody who is not looking at a screen.
 */
export function emailMessages(locale: Locale): EmailMessages {
  return CATALOGUES[locale] ?? en;
}

export type { PluralForms };
