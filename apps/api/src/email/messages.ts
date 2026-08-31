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

  /**
   * The average's comparison line, which used to be three English sentences
   * built in `templates.ts` with a `+`/`-` in front of a number.
   *
   * Three keys rather than one taking a signed delta, because "up" and "down"
   * are not a word each in every language — German puts the comparison at the
   * end and Bulgarian changes the adjective — and a sentence assembled from a
   * sign is a sentence no translator can rewrite.
   */
  'review.averageLevel': 'level with the week before',
  'review.averageUp': (kcal: string) => `up ${kcal} on the week before`,
  'review.averageDown': (kcal: string) => `down ${kcal} on the week before`,
  /** The boxed-off line when the adaptive target moved. */
  'review.targetMoved': (kcal: string) => `Your target moved to ${kcal} kcal`,
  /**
   * A day or a span of days, and the month they are in — "10–16 August".
   *
   * A key rather than a template literal in `formatRange`, because Spanish puts
   * a "de" between the two and nothing else in the five does. It takes the
   * whole day part so that both halves of a range that crosses a month get the
   * same treatment: "28 de julio – 3 de agosto".
   */
  'review.dayMonth': (days: string, month: string) => `${days} ${month}`,

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

  // ---- The chrome the layout draws round every message ---------------------
  //
  // Here rather than in `layout.ts` because that module owns the markup and
  // nothing else. The moment it also owned a sentence there would be two places
  // to look for the words in an email, and one of them would go stale.
  //
  // The brand name stays English in every catalogue — it is what the App Store
  // listing and the sender address say, and a footer that renames the product
  // is a support ticket. The clause after the dash is the translated half.
  'layout.tagline': 'Day So Far — the calorie journal you talk to.',
  /** Under every button, for the gateways that rewrite anchors. */
  'layout.pasteLink': 'Or paste this into your browser:',
  'layout.unsubscribePrompt': 'Don’t want these?',
  'layout.unsubscribeAction': 'Turn off weekly emails',
  /**
   * The week strip's plain-text alternative, which has no colour to read.
   * Marks the days that landed inside the target band.
   */
  'layout.onTarget': 'on target',

  // ---- The transactional mail ---------------------------------------------
  //
  // Confirm, reset, password-changed, new-sign-in, deleted, suspended,
  // restored. None of it passes a model, so all of it is here.
  //
  // Two house rules the translations keep as well as the words: say what
  // happened before saying what to do about it, and end a security email with
  // what to do if it was not them. And a third the English original never had
  // to think about — **nothing addressed to the reader may be gendered.** The
  // server knows a display name and nothing else, so "Welcome" and "you have
  // been signed out" have to be written in the languages that inflect them as
  // sentences that do not.
  //
  // Where a heading and a subject say the same thing, the template reads the
  // subject key twice rather than the catalogue carrying the string twice —
  // two entries a translator has to keep in sync is how they stop being in
  // sync. `verify` and `signin` have headings of their own because theirs
  // genuinely differ from the subject.

  /** Every security email ends on this line. */
  'common.ifNotYou':
    'If this was not you, change your password now — and if you cannot get in, reply to this email.',

  // The code is in the subject as well as the body, because a subject is the
  // part you can read from a notification without unlocking anything.
  'verify.subject': (code: string) => `${code} is your Day So Far confirmation code`,
  'verify.preheader': (code: string) => `Enter ${code} to finish setting up your account.`,
  'verify.heading': 'Confirm your email',
  'verify.intro': 'Welcome to Day So Far. Enter this code to finish setting up your account:',
  'verify.codeNote':
    'The code lasts 24 hours and works five times at most. Asking for a new one replaces it.',
  'verify.buttonHint':
    'Reading this on the same device you signed up on? The button does the same job without the typing.',
  'verify.button': 'Confirm email',
  'verify.notYou':
    'If you did not create an account, nothing has been set up in your name; ignore this and the address will be released.',

  'reset.subject': 'Reset your password',
  'reset.preheader': (minutes: number) =>
    `Choose a new password. The link is good for ${p.en(minutes, { one: 'minute', other: 'minutes' })}.`,
  'reset.intro':
    'Someone asked to reset the password on this account. If it was you, pick a new one here.',
  'reset.button': 'Choose a new password',
  'reset.expiry': (minutes: number) =>
    `The link expires in ${p.en(minutes, { one: 'minute', other: 'minutes' })} and can only be used once.`,
  'reset.notYou':
    'If it was not you, you can ignore this — your password has not changed and nobody can get in without this link.',

  'changed.subject': 'Your password was changed',
  'changed.preheader': 'Every other device has been signed out.',
  'changed.body':
    'The password on your account has just been changed, and every device that was signed in has been signed out.',
  'changed.whenLabel': 'Changed',

  'signin.subject': 'New sign-in to Day So Far',
  'signin.preheader': (device: string) => `A device we have not seen before signed in — ${device}.`,
  'signin.heading': 'New sign-in',
  'signin.body': 'Your account was signed into from a device we have not seen before.',
  'signin.whenLabel': 'When',
  'signin.deviceLabel': 'Device',
  'signin.ipLabel': 'IP address',
  'signin.wasYou':
    'If that was you, there is nothing to do — you will not get this again from the same browser.',

  'deleted.subject': 'Your account has been deleted',
  'deleted.preheader': 'Everything on it is gone. This is the last email you will get from us.',
  // Named rather than summarised: "your data has been removed" is what every
  // company says and nobody believes. Counts are checkable.
  'deleted.intro':
    'Your account and everything in it has been permanently deleted. For your records, that was:',
  'deleted.mealsLabel': 'Meals logged',
  'deleted.mealsValue': (n: number) => p.en(n, { one: 'entry', other: 'entries' }),
  'deleted.messagesLabel': 'Messages',
  'deleted.messagesValue': (n: number) => p.en(n, { one: 'message', other: 'messages' }),
  'deleted.photosLabel': 'Photos',
  'deleted.photosValue': (n: number) => p.en(n, { one: 'photo', other: 'photos' }),
  'deleted.nothingKept':
    'Nothing was kept and nothing can be restored, including by us. This is the last email you will receive.',
  'deleted.thanks': 'Thanks for having given it a go.',

  'suspended.subject': 'Your account has been suspended',
  'suspended.preheader': 'You have been signed out on every device. Your data is untouched.',
  'suspended.body':
    'An administrator has suspended your account, so you have been signed out everywhere and cannot sign back in for now.',
  'suspended.dataSafe':
    'Nothing has been deleted — every meal, photo and conversation is exactly where you left it, and comes back with the account.',
  'suspended.mistake': 'Reply to this email if you think this is a mistake.',

  'restored.subject': 'Your account is active again',
  'restored.preheader': 'You can sign back in, and everything is where you left it.',
  'restored.body':
    'The suspension on your account has been lifted. You can sign back in, and nothing was lost while it was off.',
  'restored.button': 'Sign in',

  // The nudge's subject is its own first sentence — see `subjectFrom` — so the
  // only chrome it has is these two.
  'nudge.heading': 'A quick note',
  'nudge.button': 'Open the journal',
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

  'review.averageLevel': 'наравно с предната седмица',
  'review.averageUp': (kcal) => `${kcal} повече от предната седмица`,
  'review.averageDown': (kcal) => `${kcal} по-малко от предната седмица`,
  'review.targetMoved': (kcal) => `Целта ти стана ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} ${month}`,

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

  'layout.tagline': 'Day So Far — дневникът за калории, с който си говориш.',
  'layout.pasteLink': 'Или пусни този адрес в браузъра си:',
  'layout.unsubscribePrompt': 'Не ги искаш?',
  'layout.unsubscribeAction': 'Спри седмичните имейли',
  'layout.onTarget': 'в целта',

  'common.ifNotYou':
    'Ако това не си ти, смени паролата си сега — а ако вече не можеш да влезеш, отговори на този имейл.',

  'verify.subject': (code) => `${code} е кодът ти за потвърждение в Day So Far`,
  'verify.preheader': (code) => `Въведи ${code}, за да завършиш регистрацията си.`,
  'verify.heading': 'Потвърди имейла си',
  // «Добре дошъл» иска род, който сървърът не знае — оттам и по-топлото
  // изречение, което го няма.
  'verify.intro': 'Радваме се, че си тук. Въведи този код, за да завършиш регистрацията си:',
  'verify.codeNote': 'Кодът важи 24 часа и работи най-много пет пъти. Нов код заменя стария.',
  'verify.buttonHint':
    'Четеш това на устройството, от което се регистрира? Бутонът върши същото, без да пишеш нищо.',
  'verify.button': 'Потвърди имейла',
  'verify.notYou':
    'Ако акаунтът не е твой, нищо не е направено на твое име; подмини този имейл и адресът се освобождава.',

  'reset.subject': 'Смени паролата си',
  'reset.preheader': (minutes) =>
    `Избери нова парола. Връзката важи ${p.bg(minutes, { one: 'минута', other: 'минути' })}.`,
  'reset.intro':
    'Някой поиска паролата на този акаунт да бъде сменена. Ако това си ти, избери нова тук.',
  'reset.button': 'Избери нова парола',
  'reset.expiry': (minutes) =>
    `Връзката изтича след ${p.bg(minutes, { one: 'минута', other: 'минути' })} и може да се използва само веднъж.`,
  'reset.notYou':
    'Ако не си ти, просто подмини този имейл — паролата ти не е променена и никой не може да влезе без тази връзка.',

  'changed.subject': 'Паролата ти беше сменена',
  'changed.preheader': 'Всички други устройства са отписани.',
  'changed.body':
    'Паролата на акаунта ти току-що беше сменена и всяко устройство, което беше влязло, е отписано.',
  'changed.whenLabel': 'Сменена',

  'signin.subject': 'Ново влизане в Day So Far',
  'signin.preheader': (device) => `Влезе устройство, което не сме виждали досега — ${device}.`,
  'signin.heading': 'Ново влизане',
  'signin.body': 'В акаунта ти беше влязло от устройство, което не сме виждали досега.',
  'signin.whenLabel': 'Кога',
  'signin.deviceLabel': 'Устройство',
  'signin.ipLabel': 'IP адрес',
  'signin.wasYou':
    'Ако това си ти, няма какво да правиш — от същия браузър няма да получиш това пак.',

  'deleted.subject': 'Акаунтът ти е изтрит',
  'deleted.preheader': 'Всичко в него го няма. Това е последният имейл от нас.',
  'deleted.intro':
    'Акаунтът ти и всичко в него са изтрити завинаги. За твоя информация, това беше:',
  'deleted.mealsLabel': 'Записани храни',
  'deleted.mealsValue': (n) => p.bg(n, { one: 'запис', other: 'записа' }),
  'deleted.messagesLabel': 'Съобщения',
  'deleted.messagesValue': (n) => p.bg(n, { one: 'съобщение', other: 'съобщения' }),
  'deleted.photosLabel': 'Снимки',
  'deleted.photosValue': (n) => p.bg(n, { one: 'снимка', other: 'снимки' }),
  'deleted.nothingKept':
    'Нищо не е запазено и нищо не може да бъде върнато, включително от нас. Това е последният имейл, който ще получиш.',
  'deleted.thanks': 'Благодарим ти, че опита.',

  'suspended.subject': 'Акаунтът ти е спрян',
  'suspended.preheader': 'Достъпът е прекратен на всички устройства. Данните ти са непокътнати.',
  'suspended.body':
    'Администратор спря акаунта ти, така че достъпът е прекратен навсякъде и засега не можеш да влезеш отново.',
  'suspended.dataSafe':
    'Нищо не е изтрито — всяко хранене, всяка снимка и всеки разговор са точно там, където ги остави, и се връщат заедно с акаунта.',
  'suspended.mistake': 'Отговори на този имейл, ако смяташ, че е станала грешка.',

  'restored.subject': 'Акаунтът ти отново работи',
  'restored.preheader': 'Можеш да влезеш пак и всичко е там, където го остави.',
  'restored.body':
    'Спирането на акаунта ти е отменено. Можеш да влезеш пак и нищо не е загубено, докато беше спрян.',
  'restored.button': 'Влез',

  'nudge.heading': 'Кратка бележка',
  'nudge.button': 'Отвори дневника',
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

  'review.averageLevel': 'gleichauf mit der Vorwoche',
  'review.averageUp': (kcal) => `${kcal} mehr als in der Vorwoche`,
  'review.averageDown': (kcal) => `${kcal} weniger als in der Vorwoche`,
  'review.targetMoved': (kcal) => `Dein Ziel liegt jetzt bei ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} ${month}`,

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

  'layout.tagline': 'Day So Far — das Kalorientagebuch zum Reden.',
  'layout.pasteLink': 'Oder kopiere das hier in deinen Browser:',
  'layout.unsubscribePrompt': 'Magst du die nicht?',
  'layout.unsubscribeAction': 'Wochenmails abbestellen',
  'layout.onTarget': 'im Ziel',

  'common.ifNotYou':
    'Warst du das nicht, ändere jetzt dein Passwort — und wenn du nicht mehr hineinkommst, antworte einfach auf diese Mail.',

  'verify.subject': (code) => `${code} ist dein Bestätigungscode für Day So Far`,
  'verify.preheader': (code) => `Gib ${code} ein, um dein Konto fertig einzurichten.`,
  'verify.heading': 'Bestätige deine E-Mail',
  'verify.intro':
    'Willkommen bei Day So Far. Gib diesen Code ein, um dein Konto fertig einzurichten:',
  'verify.codeNote':
    'Der Code gilt 24 Stunden und funktioniert höchstens fünfmal. Ein neuer ersetzt ihn.',
  'verify.buttonHint':
    'Liest du das auf dem Gerät, mit dem du dich angemeldet hast? Der Knopf macht dasselbe, ganz ohne Tippen.',
  'verify.button': 'E-Mail bestätigen',
  'verify.notYou':
    'Hast du kein Konto angelegt, wurde auch keines auf deinen Namen eingerichtet; ignoriere das hier, dann wird die Adresse wieder frei.',

  'reset.subject': 'Passwort zurücksetzen',
  'reset.preheader': (minutes) =>
    `Wähle ein neues Passwort. Der Link gilt ${p.de(minutes, { one: 'Minute', other: 'Minuten' })}.`,
  'reset.intro':
    'Jemand hat darum gebeten, das Passwort dieses Kontos zurückzusetzen. Warst du das, wähle hier ein neues.',
  'reset.button': 'Neues Passwort wählen',
  'reset.expiry': (minutes) =>
    `Der Link läuft in ${p.de(minutes, { one: 'Minute', other: 'Minuten' })} ab und lässt sich nur einmal verwenden.`,
  'reset.notYou':
    'Warst du das nicht, kannst du das hier ignorieren — dein Passwort ist unverändert, und ohne diesen Link kommt niemand hinein.',

  'changed.subject': 'Dein Passwort wurde geändert',
  'changed.preheader': 'Alle anderen Geräte wurden abgemeldet.',
  'changed.body':
    'Das Passwort deines Kontos wurde gerade geändert, und jedes angemeldete Gerät wurde abgemeldet.',
  'changed.whenLabel': 'Geändert',

  'signin.subject': 'Neue Anmeldung bei Day So Far',
  'signin.preheader': (device) =>
    `Ein Gerät, das wir noch nie gesehen haben, hat sich angemeldet — ${device}.`,
  'signin.heading': 'Neue Anmeldung',
  'signin.body': 'Bei deinem Konto hat sich ein Gerät angemeldet, das wir noch nie gesehen haben.',
  'signin.whenLabel': 'Wann',
  'signin.deviceLabel': 'Gerät',
  'signin.ipLabel': 'IP-Adresse',
  'signin.wasYou':
    'Warst du das, ist nichts zu tun — aus demselben Browser bekommst du das kein zweites Mal.',

  'deleted.subject': 'Dein Konto wurde gelöscht',
  'deleted.preheader': 'Alles darauf ist weg. Das ist die letzte Mail von uns.',
  'deleted.intro':
    'Dein Konto und alles darin wurde endgültig gelöscht. Fürs Protokoll war das:',
  'deleted.mealsLabel': 'Erfasste Mahlzeiten',
  'deleted.mealsValue': (n) => p.de(n, { one: 'Eintrag', other: 'Einträge' }),
  'deleted.messagesLabel': 'Nachrichten',
  'deleted.messagesValue': (n) => p.de(n, { one: 'Nachricht', other: 'Nachrichten' }),
  'deleted.photosLabel': 'Fotos',
  'deleted.photosValue': (n) => p.de(n, { one: 'Foto', other: 'Fotos' }),
  'deleted.nothingKept':
    'Nichts wurde behalten und nichts lässt sich wiederherstellen, auch von uns nicht. Das ist die letzte Mail, die du bekommst.',
  'deleted.thanks': 'Danke, dass du es ausprobiert hast.',

  'suspended.subject': 'Dein Konto wurde gesperrt',
  'suspended.preheader': 'Auf allen Geräten wurde die Anmeldung beendet. Deine Daten sind unberührt.',
  'suspended.body':
    'Ein Administrator hat dein Konto gesperrt, die Anmeldung wurde überall beendet und du kannst dich vorerst nicht wieder anmelden.',
  'suspended.dataSafe':
    'Gelöscht wurde nichts — jede Mahlzeit, jedes Foto und jedes Gespräch liegt genau da, wo du es gelassen hast, und kommt mit dem Konto zurück.',
  'suspended.mistake': 'Antworte auf diese Mail, wenn du glaubst, dass das ein Fehler ist.',

  'restored.subject': 'Dein Konto ist wieder aktiv',
  'restored.preheader': 'Du kannst dich wieder anmelden, und alles ist da, wo du es gelassen hast.',
  'restored.body':
    'Die Sperre deines Kontos ist aufgehoben. Du kannst dich wieder anmelden, und in der Zwischenzeit ist nichts verloren gegangen.',
  'restored.button': 'Anmelden',

  'nudge.heading': 'Kurz notiert',
  'nudge.button': 'Journal öffnen',
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

  'review.averageLevel': 'al mismo nivel que la semana anterior',
  'review.averageUp': (kcal) => `${kcal} más que la semana anterior`,
  'review.averageDown': (kcal) => `${kcal} menos que la semana anterior`,
  'review.targetMoved': (kcal) => `Tu objetivo pasa a ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} de ${month}`,

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

  'layout.tagline': 'Day So Far — el diario de calorías con el que hablas.',
  'layout.pasteLink': 'O pega esto en tu navegador:',
  'layout.unsubscribePrompt': '¿No los quieres?',
  'layout.unsubscribeAction': 'Desactivar los correos semanales',
  'layout.onTarget': 'en el objetivo',

  'common.ifNotYou':
    'Si no has sido tú, cambia la contraseña ahora — y si ya no puedes entrar, responde a este correo.',

  'verify.subject': (code) => `${code} es tu código de confirmación de Day So Far`,
  'verify.preheader': (code) => `Introduce ${code} para terminar de crear tu cuenta.`,
  'verify.heading': 'Confirma tu correo',
  // «Bienvenido» pide un género que el servidor no conoce; la fórmula sin él
  // dice lo mismo.
  'verify.intro':
    'Te damos la bienvenida a Day So Far. Introduce este código para terminar de crear tu cuenta:',
  'verify.codeNote':
    'El código dura 24 horas y funciona cinco veces como mucho. Pedir uno nuevo sustituye al anterior.',
  'verify.buttonHint':
    '¿Lees esto en el mismo dispositivo desde el que te registraste? El botón hace lo mismo sin teclear nada.',
  'verify.button': 'Confirmar correo',
  'verify.notYou':
    'Si no has creado ninguna cuenta, no se ha configurado nada a tu nombre; ignora este correo y la dirección quedará libre.',

  'reset.subject': 'Restablece tu contraseña',
  'reset.preheader': (minutes) =>
    `Elige una contraseña nueva. El enlace vale ${p.es(minutes, { one: 'minuto', other: 'minutos' })}.`,
  'reset.intro':
    'Alguien ha pedido restablecer la contraseña de esta cuenta. Si has sido tú, elige una nueva aquí.',
  'reset.button': 'Elegir una contraseña nueva',
  'reset.expiry': (minutes) =>
    `El enlace caduca en ${p.es(minutes, { one: 'minuto', other: 'minutos' })} y solo se puede usar una vez.`,
  'reset.notYou':
    'Si no has sido tú, puedes ignorarlo — tu contraseña no ha cambiado y nadie puede entrar sin este enlace.',

  'changed.subject': 'Tu contraseña ha cambiado',
  'changed.preheader': 'Se ha cerrado la sesión en todos los demás dispositivos.',
  'changed.body':
    'La contraseña de tu cuenta acaba de cambiar, y se ha cerrado la sesión en todos los dispositivos que la tenían abierta.',
  'changed.whenLabel': 'Cambiada',

  'signin.subject': 'Nuevo inicio de sesión en Day So Far',
  'signin.preheader': (device) =>
    `Ha entrado un dispositivo que no habíamos visto antes — ${device}.`,
  'signin.heading': 'Nuevo inicio de sesión',
  'signin.body': 'Alguien ha entrado en tu cuenta desde un dispositivo que no habíamos visto antes.',
  'signin.whenLabel': 'Cuándo',
  'signin.deviceLabel': 'Dispositivo',
  'signin.ipLabel': 'Dirección IP',
  'signin.wasYou':
    'Si has sido tú, no hay nada que hacer: no volverás a recibir esto desde el mismo navegador.',

  'deleted.subject': 'Tu cuenta ha sido eliminada',
  'deleted.preheader':
    'Todo lo que había en ella ha desaparecido. Este es el último correo que recibirás de nosotros.',
  'deleted.intro':
    'Tu cuenta y todo lo que contenía se han eliminado de forma permanente. Para que te conste, eso fue:',
  'deleted.mealsLabel': 'Comidas registradas',
  'deleted.mealsValue': (n) => p.es(n, { one: 'entrada', other: 'entradas' }),
  'deleted.messagesLabel': 'Mensajes',
  'deleted.messagesValue': (n) => p.es(n, { one: 'mensaje', other: 'mensajes' }),
  'deleted.photosLabel': 'Fotos',
  'deleted.photosValue': (n) => p.es(n, { one: 'foto', other: 'fotos' }),
  'deleted.nothingKept':
    'No se ha guardado nada y no se puede recuperar nada, tampoco nosotros. Este es el último correo que recibirás.',
  'deleted.thanks': 'Gracias por haberlo probado.',

  'suspended.subject': 'Tu cuenta ha sido suspendida',
  'suspended.preheader': 'Se ha cerrado tu sesión en todos los dispositivos. Tus datos están intactos.',
  'suspended.body':
    'Un administrador ha suspendido tu cuenta, así que se ha cerrado tu sesión en todas partes y de momento no puedes volver a entrar.',
  'suspended.dataSafe':
    'No se ha borrado nada — cada comida, cada foto y cada conversación está exactamente donde la dejaste, y vuelve con la cuenta.',
  'suspended.mistake': 'Responde a este correo si crees que es un error.',

  'restored.subject': 'Tu cuenta vuelve a estar activa',
  'restored.preheader': 'Puedes volver a entrar, y todo está donde lo dejaste.',
  'restored.body':
    'Se ha levantado la suspensión de tu cuenta. Puedes volver a entrar, y no se perdió nada mientras estuvo desactivada.',
  'restored.button': 'Iniciar sesión',

  'nudge.heading': 'Una nota rápida',
  'nudge.button': 'Abrir el diario',
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

  'review.averageLevel': 'au même niveau que la semaine précédente',
  'review.averageUp': (kcal) => `${kcal} de plus que la semaine précédente`,
  'review.averageDown': (kcal) => `${kcal} de moins que la semaine précédente`,
  'review.targetMoved': (kcal) => `Ton objectif passe à ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} ${month}`,

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

  'layout.tagline': 'Day So Far — le journal de calories à qui tu parles.',
  'layout.pasteLink': 'Ou colle ceci dans ton navigateur :',
  'layout.unsubscribePrompt': 'Tu n’en veux pas ?',
  'layout.unsubscribeAction': 'Désactiver les e-mails hebdomadaires',
  'layout.onTarget': 'dans l’objectif',

  'common.ifNotYou':
    'Si ce n’était pas toi, change ton mot de passe maintenant — et si tu ne peux plus entrer, réponds à cet e-mail.',

  'verify.subject': (code) => `${code} est ton code de confirmation Day So Far`,
  'verify.preheader': (code) => `Saisis ${code} pour finir de créer ton compte.`,
  'verify.heading': 'Confirme ton adresse',
  'verify.intro': 'Bienvenue sur Day So Far. Saisis ce code pour finir de créer ton compte :',
  'verify.codeNote':
    'Le code est valable 24 heures et fonctionne cinq fois au maximum. En demander un nouveau remplace l’ancien.',
  // « inscrit » demanderait un genre que le serveur ne connaît pas.
  'verify.buttonHint':
    'Tu lis ceci sur l’appareil qui a servi à l’inscription ? Le bouton fait la même chose, sans rien taper.',
  'verify.button': 'Confirmer l’adresse',
  'verify.notYou':
    'Si ce compte n’est pas le tien, rien n’a été créé à ton nom ; ignore cet e-mail et l’adresse sera libérée.',

  'reset.subject': 'Réinitialise ton mot de passe',
  'reset.preheader': (minutes) =>
    `Choisis un nouveau mot de passe. Le lien est valable ${p.fr(minutes, { one: 'minute', other: 'minutes' })}.`,
  'reset.intro':
    'Quelqu’un a demandé à réinitialiser le mot de passe de ce compte. Si c’était toi, choisis-en un nouveau ici.',
  'reset.button': 'Choisir un nouveau mot de passe',
  'reset.expiry': (minutes) =>
    `Le lien expire dans ${p.fr(minutes, { one: 'minute', other: 'minutes' })} et ne peut servir qu’une fois.`,
  'reset.notYou':
    'Si ce n’était pas toi, tu peux ignorer cet e-mail — ton mot de passe n’a pas changé et personne ne peut entrer sans ce lien.',

  'changed.subject': 'Ton mot de passe a été changé',
  'changed.preheader': 'Tous les autres appareils ont été déconnectés.',
  'changed.body':
    'Le mot de passe de ton compte vient d’être changé, et tous les appareils connectés ont été déconnectés.',
  'changed.whenLabel': 'Changé',

  'signin.subject': 'Nouvelle connexion à Day So Far',
  'signin.preheader': (device) =>
    `Un appareil que nous n’avions jamais vu s’est connecté — ${device}.`,
  'signin.heading': 'Nouvelle connexion',
  'signin.body': 'Ton compte a été utilisé depuis un appareil que nous n’avions jamais vu.',
  'signin.whenLabel': 'Quand',
  'signin.deviceLabel': 'Appareil',
  'signin.ipLabel': 'Adresse IP',
  'signin.wasYou':
    'Si c’était toi, il n’y a rien à faire — tu ne recevras plus ceci depuis le même navigateur.',

  'deleted.subject': 'Ton compte a été supprimé',
  'deleted.preheader':
    'Tout ce qu’il contenait a disparu. C’est le dernier e-mail que tu recevras de nous.',
  'deleted.intro':
    'Ton compte et tout ce qu’il contenait ont été définitivement supprimés. Pour mémoire, c’était :',
  'deleted.mealsLabel': 'Repas enregistrés',
  'deleted.mealsValue': (n) => p.fr(n, { one: 'entrée', other: 'entrées' }),
  'deleted.messagesLabel': 'Messages',
  'deleted.messagesValue': (n) => p.fr(n, { one: 'message', other: 'messages' }),
  'deleted.photosLabel': 'Photos',
  'deleted.photosValue': (n) => p.fr(n, { one: 'photo', other: 'photos' }),
  'deleted.nothingKept':
    'Rien n’a été conservé et rien ne peut être restauré, pas même par nous. C’est le dernier e-mail que tu recevras.',
  'deleted.thanks': 'Merci d’avoir essayé.',

  'suspended.subject': 'Ton compte a été suspendu',
  'suspended.preheader':
    'La session a été fermée sur tous tes appareils. Tes données sont intactes.',
  'suspended.body':
    'Un administrateur a suspendu ton compte : la session a été fermée partout et tu ne peux pas te reconnecter pour l’instant.',
  'suspended.dataSafe':
    'Rien n’a été supprimé — chaque repas, chaque photo et chaque conversation est exactement là où tu l’as laissé, et revient avec le compte.',
  'suspended.mistake': 'Réponds à cet e-mail si tu penses que c’est une erreur.',

  'restored.subject': 'Ton compte est de nouveau actif',
  'restored.preheader': 'Tu peux te reconnecter, et tout est là où tu l’as laissé.',
  'restored.body':
    'La suspension de ton compte a été levée. Tu peux te reconnecter, et rien n’a été perdu pendant ce temps.',
  'restored.button': 'Se connecter',

  'nudge.heading': 'Un petit mot',
  'nudge.button': 'Ouvrir le journal',
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
