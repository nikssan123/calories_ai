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
  ro: pluralFor('ro'),
  uk: pluralFor('uk'),
  sr: pluralFor('sr'),
  hr: pluralFor('hr'),
  cs: pluralFor('cs'),
  hu: pluralFor('hu'),
  el: pluralFor('el'),
  sk: pluralFor('sk'),
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

  // A push has no model in front of it either, so its words live here too: it
  // is the same server speaking, on a lock screen instead. See `push/notify.ts`.
  'push.reviewTitle': 'Your week is ready',
  'push.reviewBody': (name: string) => `${name}, here is how the week went.`,
  'push.reviewBodyNoName': 'Here is how the week went.',
  'push.coachCommented': (name: string) => `${name} commented`,
  'push.coachCommentedNoName': 'Your coach commented',
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

  'push.reviewTitle': 'Седмицата ти е готова',
  'push.reviewBody': (name) => `${name}, ето как мина седмицата.`,
  'push.reviewBodyNoName': 'Ето как мина седмицата.',
  'push.coachCommented': (name) => `${name} написа коментар`,
  'push.coachCommentedNoName': 'Нов коментар от треньора ти',
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

  'push.reviewTitle': 'Deine Woche ist da',
  'push.reviewBody': (name) => `${name}, so lief die Woche.`,
  'push.reviewBodyNoName': 'So lief die Woche.',
  'push.coachCommented': (name) => `${name} hat kommentiert`,
  'push.coachCommentedNoName': 'Neuer Kommentar von deinem Coach',
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

  'push.reviewTitle': 'Tu semana está lista',
  'push.reviewBody': (name) => `${name}, así ha ido la semana.`,
  'push.reviewBodyNoName': 'Así ha ido la semana.',
  'push.coachCommented': (name) => `${name} ha comentado`,
  'push.coachCommentedNoName': 'Nuevo comentario de tu coach',
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

  'push.reviewTitle': 'Ta semaine est prête',
  'push.reviewBody': (name) => `${name}, voici comment s’est passée la semaine.`,
  'push.reviewBodyNoName': 'Voici comment s’est passée la semaine.',
  'push.coachCommented': (name) => `${name} a commenté`,
  'push.coachCommentedNoName': 'Nouveau commentaire de ton coach',
};

const ro: EmailMessages = {
  'review.subject': (range) => `Săptămâna ta: ${range}`,
  'review.heading': 'Bilanțul săptămânii trecute',
  'review.greeting': (name) => `Bună, ${name},`,
  'review.greetingNoName': 'Bună,',
  'review.daysLogged': 'Zile notate',
  'review.sameAsBefore': 'la fel ca săptămâna dinainte',
  'review.weekBefore': (n) => `${n} săptămâna dinainte`,
  'review.averageADay': 'Media pe zi',
  'review.daysOnTarget': 'Zile la țintă',
  'review.withinTarget': (kcal) => `la cel mult 10% de ${kcal} kcal`,
  'review.weight': 'Greutate',
  'review.acrossTheWeek': 'pe parcursul săptămânii',
  'review.burnedOver': (sessions) =>
    `Arse în ${p.ro(sessions, { one: 'sesiune', few: 'sesiuni', other: 'de sesiuni' })}`,
  'review.onTopOfTarget': 'în plus față de țintă',
  'review.proteinADay': 'Proteine pe zi',
  'review.proteinTarget': (grams) => `țintă ${grams} g`,
  'review.howItRead': 'Cum a arătat',
  'review.onRepeat': 'Cel mai des',
  // „de 3 ori”, „o dată”: the "de" comes before the number here, and 1 is a word.
  'review.times': (n) =>
    n === 1 ? 'o dată' : `de ${p.ro(n, { one: 'dată', few: 'ori', other: 'de ori' })}`,
  'review.readWholeReview': 'Citește tot bilanțul',
  'review.nothingThisWeek': 'Nimic notat săptămâna asta.',
  'review.stripCaption': (logged, hits) =>
    `${p.ro(logged, { one: 'zi notată', few: 'zile notate', other: 'de zile notate' })}, dintre care ${hits} la cel mult 10% de țintă.`,
  'review.summaryNoMean': (days) =>
    `${p.ro(days, { one: 'zi notată', few: 'zile notate', other: 'de zile notate' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.ro(days, { one: 'zi notată', few: 'zile notate', other: 'de zile notate' })}, în medie ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, greutate ${delta}`,
  'review.weekdays': ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'],

  'review.averageLevel': 'la fel ca săptămâna dinainte',
  'review.averageUp': (kcal) => `cu ${kcal} mai mult decât săptămâna dinainte`,
  'review.averageDown': (kcal) => `cu ${kcal} mai puțin decât săptămâna dinainte`,
  'review.targetMoved': (kcal) => `Ținta ta s-a mutat la ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} ${month}`,

  'alert.planEnds': (plan, when) => `Planul tău ${plan} se încheie ${when}`,
  'alert.expiryToday': 'azi',
  'alert.expiryTomorrow': 'mâine',
  'alert.expiryInDays': (days) => `peste ${p.ro(days, { one: 'zi', few: 'zile', other: 'de zile' })}`,
  'alert.planBody':
    'Nimic nu l-a reînnoit încă. Tot ce ai notat rămâne exact unde e — doar bilanțurile, antrenorul și bucătăria intră în pauză.',
  'alert.goalTitle': 'Ai ajuns la obiectiv',
  'alert.goalBody': (weight) =>
    `Ultima cântărire a arătat ${weight}, adică exact obiectivul pe care ți l-ai propus. Merită să-l alegi pe următorul — să-ți menții greutatea e un obiectiv în sine, iar aplicația poate ținti spre el.`,
  'alert.streakTitles': [
    'O săptămână, în fiecare zi',
    'Două săptămâni, în fiecare zi',
    'O lună, în fiecare zi',
    'Două luni la rând',
    'O sută de zile',
    'Două sute de zile',
    'Un an, în fiecare zi',
  ],
  'alert.streakBody': (days) =>
    `${p.ro(days, { one: 'zi notată', few: 'zile notate', other: 'de zile notate' })} la rând. N-ai nimic de făcut — constanța e cea care dă sens fiecărei cifre din ecranul de progres.`,
  'alert.recapTitle': (kcal, target) => `${kcal} din ${target} kcal`,
  'alert.recapOnTarget': 'Fix la țintă.',
  'alert.recapUnder': (kcal) => `Îți mai rămân ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal peste țintă.`,
  'alert.recapProtein': (got, target) => `Proteine: ${got}g din ${target}g.`,

  'layout.tagline': 'Day So Far — jurnalul de calorii cu care vorbești.',
  'layout.pasteLink': 'Sau copiază asta în browser:',
  'layout.unsubscribePrompt': 'Nu vrei să le mai primești?',
  'layout.unsubscribeAction': 'Oprește e-mailurile săptămânale',
  'layout.onTarget': 'la țintă',

  'common.ifNotYou':
    'Dacă nu ai fost tu, schimbă-ți parola acum — iar dacă nu mai poți intra, răspunde la acest e-mail.',

  'verify.subject': (code) => `${code} e codul tău de confirmare pentru Day So Far`,
  'verify.preheader': (code) => `Introdu ${code} ca să termini de configurat contul.`,
  'verify.heading': 'Confirmă-ți e-mailul',
  // „Bun venit” does not agree with the reader, unlike „binevenit(ă)”.
  'verify.intro': 'Bun venit în Day So Far. Introdu acest cod ca să termini de configurat contul:',
  'verify.codeNote':
    'Codul e valabil 24 de ore și merge de cel mult cinci ori. Dacă ceri unul nou, îl înlocuiește pe acesta.',
  'verify.buttonHint':
    'Citești asta pe dispozitivul pe care ți-ai făcut contul? Butonul face același lucru, fără să tastezi nimic.',
  'verify.button': 'Confirmă e-mailul',
  'verify.notYou':
    'Dacă nu ți-ai creat un cont, nu s-a configurat nimic pe numele tău; ignoră acest mesaj și adresa va fi eliberată.',

  'reset.subject': 'Resetează-ți parola',
  'reset.preheader': (minutes) =>
    `Alege o parolă nouă. Linkul e valabil ${p.ro(minutes, { one: 'minut', few: 'minute', other: 'de minute' })}.`,
  'reset.intro':
    'Cineva a cerut resetarea parolei pentru acest cont. Dacă ai fost tu, alege una nouă aici.',
  'reset.button': 'Alege o parolă nouă',
  'reset.expiry': (minutes) =>
    `Linkul expiră în ${p.ro(minutes, { one: 'minut', few: 'minute', other: 'de minute' })} și poate fi folosit o singură dată.`,
  'reset.notYou':
    'Dacă nu ai fost tu, poți ignora acest mesaj — parola nu s-a schimbat și nimeni nu poate intra fără acest link.',

  'changed.subject': 'Parola ta a fost schimbată',
  'changed.preheader': 'Toate celelalte dispozitive au fost deconectate.',
  'changed.body':
    'Parola contului tău tocmai a fost schimbată, iar toate dispozitivele care erau conectate au fost deconectate.',
  'changed.whenLabel': 'Data schimbării',

  'signin.subject': 'Conectare nouă la Day So Far',
  'signin.preheader': (device) => `S-a conectat un dispozitiv pe care nu l-am mai văzut — ${device}.`,
  'signin.heading': 'Conectare nouă',
  'signin.body': 'Contul tău a fost accesat de pe un dispozitiv pe care nu l-am mai văzut.',
  'signin.whenLabel': 'Când',
  'signin.deviceLabel': 'Dispozitiv',
  'signin.ipLabel': 'Adresă IP',
  'signin.wasYou':
    'Dacă ai fost tu, nu trebuie să faci nimic — nu vei mai primi acest mesaj pentru același browser.',

  'deleted.subject': 'Contul tău a fost șters',
  'deleted.preheader': 'Tot ce era în el a dispărut. Acesta e ultimul e-mail de la noi.',
  'deleted.intro':
    'Contul tău și tot ce era în el au fost șterse definitiv. Pentru evidența ta, a fost vorba de:',
  'deleted.mealsLabel': 'Mese notate',
  'deleted.mealsValue': (n) => p.ro(n, { one: 'înregistrare', few: 'înregistrări', other: 'de înregistrări' }),
  'deleted.messagesLabel': 'Mesaje',
  'deleted.messagesValue': (n) => p.ro(n, { one: 'mesaj', few: 'mesaje', other: 'de mesaje' }),
  'deleted.photosLabel': 'Poze',
  'deleted.photosValue': (n) => p.ro(n, { one: 'poză', few: 'poze', other: 'de poze' }),
  'deleted.nothingKept':
    'Nu s-a păstrat nimic și nimic nu poate fi recuperat, nici măcar de noi. Acesta e ultimul e-mail pe care îl vei primi.',
  'deleted.thanks': 'Mulțumim că i-ai dat o șansă.',

  // „Ai fost deconectat(ă)” would agree with the reader; the access is what stopped.
  'suspended.subject': 'Contul tău a fost suspendat',
  'suspended.preheader': 'Accesul a fost oprit pe toate dispozitivele. Datele tale sunt neatinse.',
  'suspended.body':
    'Un administrator ți-a suspendat contul, așa că accesul a fost oprit peste tot și deocamdată nu te poți conecta din nou.',
  'suspended.dataSafe':
    'Nu s-a șters nimic — fiecare masă, poză și conversație e exact unde ai lăsat-o și revine odată cu contul.',
  'suspended.mistake': 'Răspunde la acest e-mail dacă crezi că e o greșeală.',

  'restored.subject': 'Contul tău e din nou activ',
  'restored.preheader': 'Te poți conecta din nou și totul e unde l-ai lăsat.',
  'restored.body':
    'Suspendarea contului tău a fost ridicată. Te poți conecta din nou și nu s-a pierdut nimic cât timp a fost oprit.',
  'restored.button': 'Conectează-te',

  'nudge.heading': 'O notă scurtă',
  'nudge.button': 'Deschide jurnalul',

  'push.reviewTitle': 'Bilanțul săptămânii e gata',
  'push.reviewBody': (name) => `${name}, iată cum a fost săptămâna.`,
  'push.reviewBodyNoName': 'Iată cum a fost săptămâna.',
  'push.coachCommented': (name) => `${name} a lăsat un comentariu`,
  'push.coachCommentedNoName': 'Antrenorul tău a lăsat un comentariu',
};

const uk: EmailMessages = {
  'review.subject': (range) => `Твій тиждень: ${range}`,
  'review.heading': 'Огляд минулого тижня',
  // Ukrainian letters open with «!», and a name cannot be put in the vocative for us.
  'review.greeting': (name) => `Привіт, ${name}!`,
  'review.greetingNoName': 'Привіт!',
  'review.daysLogged': 'Днів із записами',
  'review.sameAsBefore': 'як і тижнем раніше',
  'review.weekBefore': (n) => `${n} тижнем раніше`,
  'review.averageADay': 'У середньому на день',
  'review.daysOnTarget': 'Днів у нормі',
  'review.withinTarget': (kcal) => `у межах 10% від ${kcal} kcal`,
  'review.weight': 'Вага',
  'review.acrossTheWeek': 'за тиждень',
  'review.burnedOver': (sessions) =>
    `Спалено за ${p.uk(sessions, { one: 'тренування', few: 'тренування', many: 'тренувань', other: 'тренування' })}`,
  'review.onTopOfTarget': 'понад норму',
  'review.proteinADay': 'Білка на день',
  'review.proteinTarget': (grams) => `норма ${grams} g`,
  'review.howItRead': 'Як усе було',
  'review.onRepeat': 'Найчастіше',
  'review.times': (n) => p.uk(n, { one: 'раз', few: 'рази', many: 'разів', other: 'разу' }),
  'review.readWholeReview': 'Читати весь огляд',
  'review.nothingThisWeek': 'Цього тижня нічого не записано.',
  'review.stripCaption': (logged, hits) =>
    `${p.uk(logged, { one: 'день', few: 'дні', many: 'днів', other: 'дня' })} із записами, з них ${hits} — у межах 10% від норми.`,
  'review.summaryNoMean': (days) =>
    `${p.uk(days, { one: 'день', few: 'дні', many: 'днів', other: 'дня' })} із записами.`,
  'review.summary': (days, kcal, weight) =>
    `${p.uk(days, { one: 'день', few: 'дні', many: 'днів', other: 'дня' })} із записами, у середньому ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, вага ${delta}`,
  'review.weekdays': ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],

  'review.averageLevel': 'так само, як тижнем раніше',
  'review.averageUp': (kcal) => `на ${kcal} більше, ніж тижнем раніше`,
  'review.averageDown': (kcal) => `на ${kcal} менше, ніж тижнем раніше`,
  'review.targetMoved': (kcal) => `Твоя норма тепер ${kcal} kcal`,
  // Intl hands over the standalone nominative («серпень»); a date needs the
  // genitive («10–16 серпня»). Anything not in the table passes through.
  'review.dayMonth': (days, month) =>
    `${days} ${
      (
        {
          січень: 'січня',
          лютий: 'лютого',
          березень: 'березня',
          квітень: 'квітня',
          травень: 'травня',
          червень: 'червня',
          липень: 'липня',
          серпень: 'серпня',
          вересень: 'вересня',
          жовтень: 'жовтня',
          листопад: 'листопада',
          грудень: 'грудня',
        } as Record<string, string>
      )[month] ?? month
    }`,

  'alert.planEnds': (plan, when) => `Твій тариф ${plan} закінчується ${when}`,
  'alert.expiryToday': 'сьогодні',
  'alert.expiryTomorrow': 'завтра',
  'alert.expiryInDays': (days) =>
    `через ${p.uk(days, { one: 'день', few: 'дні', many: 'днів', other: 'дня' })}`,
  'alert.planBody':
    'Його поки ніщо не поновило. Усе записане лишається на своїх місцях — на паузу стануть лише огляди, робота з тренером і кухня.',
  'alert.goalTitle': 'Мету досягнуто',
  'alert.goalBody': (weight) =>
    `Останнє зважування — ${weight}, а це і є твоя мета. Варто обрати наступну: утримувати вагу — теж окрема ціль, і застосунок може на неї орієнтуватися.`,
  'alert.streakTitles': [
    'Тиждень щодня',
    'Два тижні щодня',
    'Місяць щодня',
    'Два місяці поспіль',
    'Сто днів',
    'Двісті днів',
    'Рік щодня',
  ],
  'alert.streakBody': (days) =>
    `${p.uk(days, { one: 'день', few: 'дні', many: 'днів', other: 'дня' })} із записами поспіль. Робити нічого не треба — саме регулярність надає сенсу кожній цифрі на екрані прогресу.`,
  'alert.recapTitle': (kcal, target) => `${kcal} з ${target} kcal`,
  'alert.recapOnTarget': 'Точно в нормі.',
  'alert.recapUnder': (kcal) => `Ще ${kcal} kcal у запасі.`,
  'alert.recapOver': (kcal) => `${kcal} kcal понад норму.`,
  'alert.recapProtein': (got, target) => `Білок: ${got}g з ${target}g.`,

  'layout.tagline': 'Day So Far — щоденник калорій, з яким просто говориш.',
  'layout.pasteLink': 'Або встав це посилання в браузер:',
  'layout.unsubscribePrompt': 'Не хочеш таких листів?',
  'layout.unsubscribeAction': 'Вимкнути щотижневі листи',
  'layout.onTarget': 'у нормі',

  // "If this was not you" needs a gendered past tense; "if you know nothing of it" does not.
  'common.ifNotYou':
    'Якщо ти про це не знаєш, негайно зміни пароль — а якщо не вдається увійти, відповідай на цей лист.',

  'verify.subject': (code) => `${code} — твій код підтвердження для Day So Far`,
  'verify.preheader': (code) => `Введи ${code}, щоб завершити налаштування акаунта.`,
  'verify.heading': 'Підтвердь пошту',
  'verify.intro': 'Вітаємо в Day So Far. Введи цей код, щоб завершити налаштування акаунта:',
  'verify.codeNote':
    'Код діє 24 години, і ввести його можна щонайбільше п’ять разів. Новий код замінює попередній.',
  'verify.buttonHint':
    'Читаєш це на пристрої, з якого створено акаунт? Кнопка зробить те саме — без введення коду.',
  'verify.button': 'Підтвердити пошту',
  'verify.notYou':
    'Якщо акаунт створено не тобою, на твоє ім’я нічого не оформлено — просто проігноруй цей лист, і адреса звільниться.',

  'reset.subject': 'Скидання пароля',
  'reset.preheader': (minutes) =>
    `Обери новий пароль. Посилання діє ${p.uk(minutes, { one: 'хвилину', few: 'хвилини', many: 'хвилин', other: 'хвилини' })}.`,
  'reset.intro':
    'Хтось попросив скинути пароль до цього акаунта. Якщо це ти, обери новий тут.',
  'reset.button': 'Обрати новий пароль',
  'reset.expiry': (minutes) =>
    `Посилання перестане діяти через ${p.uk(minutes, { one: 'хвилину', few: 'хвилини', many: 'хвилин', other: 'хвилини' })}, і скористатися ним можна лише раз.`,
  'reset.notYou':
    'Якщо це не ти, просто проігноруй цей лист — пароль не змінився, і без цього посилання ніхто не ввійде.',

  'changed.subject': 'Пароль змінено',
  'changed.preheader': 'На всіх інших пристроях виконано вихід.',
  'changed.body':
    'Пароль до твого акаунта щойно змінено — і на всіх пристроях, де був виконаний вхід, тепер виконано вихід.',
  'changed.whenLabel': 'Коли змінено',

  'signin.subject': 'Новий вхід у Day So Far',
  'signin.preheader': (device) => `Вхід із пристрою, якого ми ще не бачили, — ${device}.`,
  'signin.heading': 'Новий вхід',
  'signin.body': 'У твій акаунт увійшли з пристрою, якого ми раніше не бачили.',
  'signin.whenLabel': 'Коли',
  'signin.deviceLabel': 'Пристрій',
  'signin.ipLabel': 'IP-адреса',
  'signin.wasYou':
    'Якщо це ти, нічого робити не треба — з цього самого браузера такий лист більше не прийде.',

  'deleted.subject': 'Твій акаунт видалено',
  'deleted.preheader': 'Усе, що в ньому було, стерто. Це останній лист від нас.',
  'deleted.intro':
    'Твій акаунт і все, що в ньому було, остаточно видалено. Для довідки — ось що там було:',
  'deleted.mealsLabel': 'Записані прийоми їжі',
  'deleted.mealsValue': (n) => p.uk(n, { one: 'запис', few: 'записи', many: 'записів', other: 'запису' }),
  'deleted.messagesLabel': 'Повідомлення',
  'deleted.messagesValue': (n) =>
    p.uk(n, { one: 'повідомлення', few: 'повідомлення', many: 'повідомлень', other: 'повідомлення' }),
  'deleted.photosLabel': 'Фото',
  'deleted.photosValue': (n) => p.uk(n, { one: 'фото', few: 'фото', many: 'фото', other: 'фото' }),
  'deleted.nothingKept':
    'Нічого не збережено, і відновити нічого не вийде — навіть нам. Це останній лист, який ти отримаєш.',
  // «Дякуємо, що спробував / спробувала» would gender the reader.
  'deleted.thanks': 'Дякуємо за спробу.',

  'suspended.subject': 'Твій акаунт призупинено',
  'suspended.preheader': 'Вихід виконано на всіх пристроях. Твої дані не зачеплено.',
  'suspended.body':
    'Твій акаунт призупинено адміністратором, тож вихід виконано скрізь, і поки що увійти знову не вийде.',
  'suspended.dataSafe':
    'Нічого не видалено — кожен прийом їжі, фото й розмова лишаються на своїх місцях і повернуться разом з акаунтом.',
  'suspended.mistake': 'Якщо вважаєш, що це помилка, відповідай на цей лист.',

  'restored.subject': 'Твій акаунт знову активний',
  'restored.preheader': 'Можна знову входити — усе на своїх місцях.',
  'restored.body':
    'Призупинення акаунта скасовано. Можна знову входити, і за час паузи нічого не загубилося.',
  'restored.button': 'Увійти',

  'nudge.heading': 'Коротка підказка',
  'nudge.button': 'Відкрити щоденник',

  'push.reviewTitle': 'Огляд тижня готовий',
  'push.reviewBody': (name) => `${name}, ось як минув тиждень.`,
  'push.reviewBodyNoName': 'Ось як минув тиждень.',
  'push.coachCommented': (name) => `${name}: новий коментар`,
  'push.coachCommentedNoName': 'Новий коментар від тренера',
};

const sr: EmailMessages = {
  'review.subject': (range) => `Твоја седмица: ${range}`,
  'review.heading': 'Прошла седмица, укратко',
  'review.greeting': (name) => `Здраво, ${name},`,
  'review.greetingNoName': 'Здраво,',
  'review.daysLogged': 'Уписани дани',
  'review.sameAsBefore': 'исто као претходне седмице',
  'review.weekBefore': (n) => `претходне седмице: ${n}`,
  'review.averageADay': 'Дневни просек',
  'review.daysOnTarget': 'Дани у циљу',
  'review.withinTarget': (kcal) => `у оквиру 10% од ${kcal} kcal`,
  'review.weight': 'Тежина',
  'review.acrossTheWeek': 'током седмице',
  'review.burnedOver': (sessions) =>
    `Сагорело за ${p.sr(sessions, { one: 'тренинг', few: 'тренинга', other: 'тренинга' })}`,
  'review.onTopOfTarget': 'поврх циља',
  'review.proteinADay': 'Протеини дневно',
  'review.proteinTarget': (grams) => `циљ ${grams} g`,
  'review.howItRead': 'Како је прошло',
  'review.onRepeat': 'Најчешће',
  'review.times': (n) => p.sr(n, { one: 'пут', few: 'пута', other: 'пута' }),
  'review.readWholeReview': 'Прочитај цео преглед',
  'review.nothingThisWeek': 'Ове седмице ништа није уписано.',
  'review.stripCaption': (logged, hits) =>
    `${p.sr(logged, { one: 'уписан дан', few: 'уписана дана', other: 'уписаних дана' })}, од тога ${hits} у оквиру 10% од циља.`,
  'review.summaryNoMean': (days) =>
    `${p.sr(days, { one: 'уписан дан', few: 'уписана дана', other: 'уписаних дана' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.sr(days, { one: 'уписан дан', few: 'уписана дана', other: 'уписаних дана' })}, у просеку ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, тежина ${delta}`,
  'review.weekdays': ['нед', 'пон', 'уто', 'сре', 'чет', 'пет', 'суб'],

  'review.averageLevel': 'исто као претходне седмице',
  'review.averageUp': (kcal) => `${kcal} више него претходне седмице`,
  'review.averageDown': (kcal) => `${kcal} мање него претходне седмице`,
  'review.targetMoved': (kcal) => `Циљ ти је сада ${kcal} kcal`,
  // Serbian puts a dot after every day number: "10.–16. август", "16. август – 2. септембар".
  // Only a number that ends at a dash or at the end is a day, so nothing else gets a dot.
  'review.dayMonth': (days, month) => `${String(days).replace(/(\d+)(?=[–-]|$)/g, '$1.')} ${month}`,

  'alert.planEnds': (plan, when) => `Твој пакет ${plan} истиче ${when}`,
  'alert.expiryToday': 'данас',
  'alert.expiryTomorrow': 'сутра',
  'alert.expiryInDays': (days) => `за ${p.sr(days, { one: 'дан', few: 'дана', other: 'дана' })}`,
  'alert.planBody':
    'Још га ништа није обновило. Све што је уписано остаје тачно где јесте — утихну само прегледи, рад са тренером и кухиња.',
  // "Стигао/стигла си" is gendered; the goal is the subject instead.
  'alert.goalTitle': 'Циљ је достигнут',
  'alert.goalBody': (weight) =>
    `Последње мерење показало је ${weight}, а то је твој циљ. Вреди изабрати следећи — задржати тежину је циљ сам по себи, и апликација може да ти помогне у томе.`,
  'alert.streakTitles': [
    'Седмица, сваки дан',
    'Две седмице, сваки дан',
    'Месец, сваки дан',
    'Два месеца заредом',
    'Сто дана',
    'Двеста дана',
    'Година, сваки дан',
  ],
  'alert.streakBody': (days) =>
    `${p.sr(days, { one: 'дан', few: 'дана', other: 'дана' })} уписа заредом. Не треба ништа да радиш — доследност је оно што свакој бројци на екрану напретка даје смисао.`,
  'alert.recapTitle': (kcal, target) => `${kcal} од ${target} kcal`,
  'alert.recapOnTarget': 'Тачно у циљу.',
  'alert.recapUnder': (kcal) => `Преостаје ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal преко циља.`,
  'alert.recapProtein': (got, target) => `Протеини ${got}g од ${target}g.`,

  'layout.tagline': 'Day So Far — дневник калорија са којим разговараш.',
  'layout.pasteLink': 'Или налепи ову адресу у прегледач:',
  'layout.unsubscribePrompt': 'Не желиш ове имејлове?',
  'layout.unsubscribeAction': 'Искључи седмичне имејлове',
  'layout.onTarget': 'у циљу',

  'common.ifNotYou':
    'Ако ово ниси ти, одмах промени лозинку — а ако не можеш да уђеш, одговори на овај имејл.',

  'verify.subject': (code) => `${code} је твој код за потврду за Day So Far`,
  'verify.preheader': (code) => `Унеси ${code} да завршиш подешавање налога.`,
  'verify.heading': 'Потврди имејл',
  // "Добро дошао/дошла" needs a gender the server does not know.
  'verify.intro': 'Драго нам је што си ту. Унеси овај код да завршиш подешавање налога:',
  'verify.codeNote':
    'Код важи 24 сата и може да се употреби највише пет пута. Ако затражиш нови, овај престаје да важи.',
  'verify.buttonHint':
    'Читаш ово на уређају са ког је налог направљен? Дугме ради исто, без куцања.',
  'verify.button': 'Потврди имејл',
  'verify.notYou':
    'Ако овај налог није твој, ништа није отворено на твоје име; занемари ову поруку и адреса ће бити ослобођена.',

  'reset.subject': 'Постави нову лозинку',
  'reset.preheader': (minutes) =>
    `Изабери нову лозинку. Линк важи ${p.sr(minutes, { one: 'минут', few: 'минута', other: 'минута' })}.`,
  'reset.intro':
    'Неко је затражио нову лозинку за овај налог. Ако си то ти, изабери нову овде.',
  'reset.button': 'Изабери нову лозинку',
  'reset.expiry': (minutes) =>
    `Линк истиче за ${p.sr(minutes, { one: 'минут', few: 'минута', other: 'минута' })} и може да се употреби само једном.`,
  'reset.notYou':
    'Ако то ниси ти, само занемари ову поруку — лозинка није промењена и нико не може да уђе без овог линка.',

  'changed.subject': 'Лозинка ти је промењена',
  'changed.preheader': 'Сви остали уређаји су одјављени.',
  'changed.body':
    'Лозинка за твој налог је управо промењена, а сви уређаји који су били пријављени сада су одјављени.',
  'changed.whenLabel': 'Промењено',

  'signin.subject': 'Нова пријава на Day So Far',
  'signin.preheader': (device) => `Пријављен је уређај који раније нисмо видели — ${device}.`,
  'signin.heading': 'Нова пријава',
  'signin.body': 'На твој налог се пријавио уређај који раније нисмо видели.',
  'signin.whenLabel': 'Када',
  'signin.deviceLabel': 'Уређај',
  'signin.ipLabel': 'IP адреса',
  'signin.wasYou':
    'Ако си то ти, не треба ништа да радиш — са истог прегледача ово више нећеш добити.',

  'deleted.subject': 'Твој налог је обрисан',
  'deleted.preheader': 'Све са њега је нестало. Ово је последњи имејл од нас.',
  'deleted.intro':
    'Твој налог и све у њему трајно су обрисани. Ради евиденције, ово је било:',
  'deleted.mealsLabel': 'Уписани оброци',
  'deleted.mealsValue': (n) => p.sr(n, { one: 'унос', few: 'уноса', other: 'уноса' }),
  'deleted.messagesLabel': 'Поруке',
  'deleted.messagesValue': (n) => p.sr(n, { one: 'порука', few: 'поруке', other: 'порука' }),
  'deleted.photosLabel': 'Фотографије',
  'deleted.photosValue': (n) => p.sr(n, { one: 'фотографија', few: 'фотографије', other: 'фотографија' }),
  'deleted.nothingKept':
    'Ништа није задржано и ништа не може да се врати — ни ми то не можемо. Ово је последњи имејл који ћеш добити.',
  // "Хвала што си пробао/пробала" is gendered.
  'deleted.thanks': 'Хвала ти на поверењу.',

  'suspended.subject': 'Твој налог је суспендован',
  // "Одјављен/одјављена си" is gendered; the devices are the subject instead.
  'suspended.preheader': 'Сви уређаји су одјављени. Подаци су ти нетакнути.',
  'suspended.body':
    'Администратор је суспендовао твој налог, па је приступ прекинут на свим уређајима и поновна пријава за сада није могућа.',
  'suspended.dataSafe':
    'Ништа није обрисано — сваки оброк, свака фотографија и сваки разговор су тачно тамо где су били и враћају се заједно са налогом.',
  'suspended.mistake': 'Одговори на овај имејл ако мислиш да је ово грешка.',

  'restored.subject': 'Твој налог је поново активан',
  'restored.preheader': 'Можеш поново да се пријавиш и све је тамо где је било.',
  'restored.body':
    'Суспензија налога је укинута. Можеш поново да се пријавиш, а ништа није изгубљено док је налог био искључен.',
  'restored.button': 'Пријави се',

  'nudge.heading': 'Кратка напомена',
  'nudge.button': 'Отвори дневник',

  'push.reviewTitle': 'Твоја седмица је спремна',
  'push.reviewBody': (name) => `${name}, ево како је прошла седмица.`,
  'push.reviewBodyNoName': 'Ево како је прошла седмица.',
  // The coach's gender is unknown as well, so no «коментарисао/коментарисала».
  'push.coachCommented': (name) => `${name}: нови коментар`,
  'push.coachCommentedNoName': 'Нови коментар од тренера',
};

const hr: EmailMessages = {
  'review.subject': (range) => `Tvoj tjedan: ${range}`,
  'review.heading': 'Prošli tjedan ukratko',
  'review.greeting': (name) => `Bok, ${name},`,
  'review.greetingNoName': 'Bok,',
  'review.daysLogged': 'Dani s upisima',
  'review.sameAsBefore': 'isto kao prethodni tjedan',
  'review.weekBefore': (n) => `prethodni tjedan: ${n}`,
  'review.averageADay': 'Prosjek po danu',
  'review.daysOnTarget': 'Dani na cilju',
  'review.withinTarget': (kcal) => `unutar 10% od ${kcal} kcal`,
  'review.weight': 'Težina',
  'review.acrossTheWeek': 'kroz tjedan',
  'review.burnedOver': (sessions) =>
    `Potrošeno kroz ${p.hr(sessions, { one: 'trening', few: 'treninga', other: 'treninga' })}`,
  'review.onTopOfTarget': 'povrh cilja',
  'review.proteinADay': 'Proteini po danu',
  'review.proteinTarget': (grams) => `cilj ${grams} g`,
  'review.howItRead': 'Kako je prošlo',
  'review.onRepeat': 'Najčešće',
  'review.times': (n) => p.hr(n, { one: 'put', few: 'puta', other: 'puta' }),
  'review.readWholeReview': 'Pročitaj cijeli pregled',
  'review.nothingThisWeek': 'Ovaj tjedan ništa nije upisano.',
  'review.stripCaption': (logged, hits) =>
    `${p.hr(logged, { one: 'dan s upisima', few: 'dana s upisima', other: 'dana s upisima' })}, od toga ${hits} unutar 10% cilja.`,
  'review.summaryNoMean': (days) =>
    `${p.hr(days, { one: 'dan s upisima', few: 'dana s upisima', other: 'dana s upisima' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.hr(days, { one: 'dan s upisima', few: 'dana s upisima', other: 'dana s upisima' })}, u prosjeku ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, težina ${delta}`,
  'review.weekdays': ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'],

  'review.averageLevel': 'jednako kao prethodni tjedan',
  'review.averageUp': (kcal) => `${kcal} više nego prethodni tjedan`,
  'review.averageDown': (kcal) => `${kcal} manje nego prethodni tjedan`,
  'review.targetMoved': (kcal) => `Tvoj cilj sada je ${kcal} kcal`,
  // "10. – 16. kolovoza": an ordinal dot after each day, a spaced dash, and the
  // month in the genitive. `formatRange` hands over "10–16" (or "16") and the
  // standalone nominative "kolovoz".
  'review.dayMonth': (days, month) => {
    const genitive: Record<string, string> = {
      siječanj: 'siječnja', veljača: 'veljače', ožujak: 'ožujka', travanj: 'travnja',
      svibanj: 'svibnja', lipanj: 'lipnja', srpanj: 'srpnja', kolovoz: 'kolovoza',
      rujan: 'rujna', listopad: 'listopada', studeni: 'studenoga', prosinac: 'prosinca',
    };
    const name = String(month);
    const dotted = String(days).replace(/(\d+)(?=–|$)/g, '$1.').replace(/\.–/g, '. – ');
    return `${dotted} ${genitive[name.toLowerCase()] ?? name}`;
  },

  'alert.planEnds': (plan, when) => `Tvoj paket ${plan} završava ${when}`,
  'alert.expiryToday': 'danas',
  'alert.expiryTomorrow': 'sutra',
  'alert.expiryInDays': (days) => `za ${p.hr(days, { one: 'dan', few: 'dana', other: 'dana' })}`,
  'alert.planBody':
    'Još ga ništa nije obnovilo. Sve upisano ostaje točno gdje jest — utihnut će samo pregledi, savjeti trenera i kuhinja.',
  // "Stigao/stigla si" is gendered; the goal is not.
  'alert.goalTitle': 'Cilj je dostignut',
  'alert.goalBody': (weight) =>
    `Zadnje vaganje pokazalo je ${weight} — točno tvoj zadani cilj. Vrijedi odabrati sljedeći: održavati težinu cilj je sam po sebi, a aplikacija se može usmjeriti i na to.`,
  'alert.streakTitles': [
    'Tjedan, svaki dan',
    'Dva tjedna, svaki dan',
    'Mjesec, svaki dan',
    'Dva mjeseca zaredom',
    'Sto dana',
    'Dvjesto dana',
    'Godina, svaki dan',
  ],
  'alert.streakBody': (days) =>
    `${p.hr(days, { one: 'dan', few: 'dana', other: 'dana' })} zaredom s upisima. Tu ne treba ništa poduzeti — upravo zbog te redovitosti svaki broj na zaslonu napretka nešto znači.`,
  'alert.recapTitle': (kcal, target) => `${kcal} od ${target} kcal`,
  'alert.recapOnTarget': 'Točno na cilju.',
  'alert.recapUnder': (kcal) => `Preostalo je ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal preko cilja.`,
  'alert.recapProtein': (got, target) => `Proteini ${got} g od ${target} g.`,

  'layout.tagline': 'Day So Far — dnevnik kalorija s kojim razgovaraš.',
  'layout.pasteLink': 'Ili zalijepi ovo u preglednik:',
  'layout.unsubscribePrompt': 'Ne želiš ove poruke?',
  'layout.unsubscribeAction': 'Isključi tjedne e-poruke',
  'layout.onTarget': 'na cilju',

  // "Ako to nisi bio/bila ti" is gendered; not recognising it is not.
  'common.ifNotYou':
    'Ako ovo ne prepoznaješ, odmah promijeni lozinku — a ako ne možeš ući, odgovori na ovu poruku.',

  'verify.subject': (code) => `${code} je tvoj kod za potvrdu računa u Day So Far`,
  'verify.preheader': (code) => `Upiši ${code} i dovrši postavljanje računa.`,
  'verify.heading': 'Potvrdi e-poštu',
  // "Dobro došao/došla" asks for a gender the server does not know; a welcome
  // offered as a noun does not.
  'verify.intro': 'Day So Far ti želi dobrodošlicu. Upiši ovaj kod da dovršiš postavljanje računa:',
  'verify.codeNote':
    'Kod vrijedi 24 sata i radi najviše pet puta. Novi kod zamjenjuje ovaj.',
  // "Na kojem si se registrirao/registrirala" is gendered; the account is not.
  'verify.buttonHint':
    'Čitaš ovo na istom uređaju na kojem je račun otvoren? Gumb radi isto, bez tipkanja.',
  'verify.button': 'Potvrdi e-poštu',
  'verify.notYou':
    'Ako račun nije tvoj, na tvoje ime ništa nije postavljeno; zanemari ovu poruku i adresa će biti oslobođena.',

  'reset.subject': 'Postavi novu lozinku',
  // Accusative of duration: "vrijedi 1 minutu · 3 minute · 30 minuta".
  'reset.preheader': (minutes) =>
    `Odaberi novu lozinku. Poveznica vrijedi ${p.hr(minutes, { one: 'minutu', few: 'minute', other: 'minuta' })}.`,
  'reset.intro':
    'Netko je zatražio promjenu lozinke za ovaj račun. Ako si to ti, ovdje odaberi novu.',
  'reset.button': 'Odaberi novu lozinku',
  'reset.expiry': (minutes) =>
    `Poveznica istječe za ${p.hr(minutes, { one: 'minutu', few: 'minute', other: 'minuta' })} i može se upotrijebiti samo jednom.`,
  'reset.notYou':
    'Ako to nisi ti, slobodno zanemari ovu poruku — lozinka se nije promijenila i nitko ne može ući bez ove poveznice.',

  'changed.subject': 'Lozinka ti je promijenjena',
  'changed.preheader': 'Svi ostali uređaji su odjavljeni.',
  'changed.body':
    'Lozinka tvog računa upravo je promijenjena, a svi uređaji koji su bili prijavljeni sada su odjavljeni.',
  'changed.whenLabel': 'Promijenjeno',

  'signin.subject': 'Nova prijava u Day So Far',
  'signin.preheader': (device) => `Prijavio se uređaj koji dosad nismo vidjeli — ${device}.`,
  'signin.heading': 'Nova prijava',
  'signin.body': 'Na tvoj račun prijavio se uređaj koji dosad nismo vidjeli.',
  'signin.whenLabel': 'Kada',
  'signin.deviceLabel': 'Uređaj',
  'signin.ipLabel': 'IP adresa',
  'signin.wasYou':
    'Ako si to ti, ne treba ništa poduzeti — s istog preglednika ovo više nećeš dobiti.',

  'deleted.subject': 'Tvoj račun je izbrisan',
  'deleted.preheader': 'Sve s njega je nestalo. Ovo je posljednja poruka od nas.',
  'deleted.intro':
    'Tvoj račun i sve u njemu trajno su izbrisani. Za tvoju evidenciju, to je bilo:',
  'deleted.mealsLabel': 'Upisani obroci',
  'deleted.mealsValue': (n) => p.hr(n, { one: 'unos', few: 'unosa', other: 'unosa' }),
  'deleted.messagesLabel': 'Poruke',
  'deleted.messagesValue': (n) => p.hr(n, { one: 'poruka', few: 'poruke', other: 'poruka' }),
  'deleted.photosLabel': 'Fotografije',
  'deleted.photosValue': (n) => p.hr(n, { one: 'fotografija', few: 'fotografije', other: 'fotografija' }),
  'deleted.nothingKept':
    'Ništa nije zadržano i ništa se ne može vratiti, ni s naše strane. Ovo je posljednja poruka koju ćeš primiti.',
  // "Hvala što si isprobao/isprobala" is gendered.
  'deleted.thanks': 'Hvala ti na prilici.',

  'suspended.subject': 'Tvoj račun je suspendiran',
  // "Odjavljen/odjavljena si" is gendered; the sign-in is what ended.
  'suspended.preheader': 'Prijava je prekinuta na svim uređajima. Tvoji podaci su netaknuti.',
  'suspended.body':
    'Administrator je suspendirao tvoj račun, pa je prijava prekinuta posvuda i zasad se ne možeš ponovno prijaviti.',
  'suspended.dataSafe':
    'Ništa nije izbrisano — svaki obrok, fotografija i razgovor točno su ondje gdje su i bili, i vraćaju se zajedno s računom.',
  'suspended.mistake': 'Odgovori na ovu poruku ako misliš da je riječ o pogrešci.',

  'restored.subject': 'Tvoj račun ponovno je aktivan',
  'restored.preheader': 'Možeš se ponovno prijaviti i sve je ondje gdje je i bilo.',
  'restored.body':
    'Suspenzija tvog računa je ukinuta. Možeš se ponovno prijaviti, a dok je račun bio isključen, ništa nije izgubljeno.',
  'restored.button': 'Prijavi se',

  'nudge.heading': 'Kratka napomena',
  'nudge.button': 'Otvori dnevnik',

  'push.reviewTitle': 'Tvoj tjedan je spreman',
  'push.reviewBody': (name) => `${name}, evo kako je prošao tjedan.`,
  'push.reviewBodyNoName': 'Evo kako je prošao tjedan.',
  // "je komentirao/komentirala" would gender the coach, whom the server knows
  // only by name.
  'push.coachCommented': (name) => `${name}: novi komentar`,
  'push.coachCommentedNoName': 'Novi komentar od tvog trenera',
};

const cs: EmailMessages = {
  'review.subject': (range) => `Tvůj týden: ${range}`,
  'review.heading': 'Minulý týden v kostce',
  // The vocative cannot be formed from a display name; automated Czech mail
  // greets in the nominative.
  'review.greeting': (name) => `Ahoj ${name},`,
  'review.greetingNoName': 'Ahoj,',
  'review.daysLogged': 'Zapsané dny',
  'review.sameAsBefore': 'stejně jako týden předtím',
  'review.weekBefore': (n) => `předchozí týden ${n}`,
  'review.averageADay': 'Průměr za den',
  'review.daysOnTarget': 'Dny v cíli',
  'review.withinTarget': (kcal) => `do 10 % od ${kcal} kcal`,
  'review.weight': 'Váha',
  'review.acrossTheWeek': 'za týden',
  'review.burnedOver': (sessions) =>
    `Spáleno za ${p.cs(sessions, { one: 'cvičení', few: 'cvičení', many: 'cvičení', other: 'cvičení' })}`,
  'review.onTopOfTarget': 'nad rámec cíle',
  'review.proteinADay': 'Bílkoviny za den',
  'review.proteinTarget': (grams) => `cíl ${grams} g`,
  'review.howItRead': 'Jak to vypadalo',
  'review.onRepeat': 'Nejčastěji',
  'review.times': (n) => `${n}×`,
  'review.readWholeReview': 'Přečíst celý přehled',
  'review.nothingThisWeek': 'Tento týden nic zapsáno.',
  'review.stripCaption': (logged, hits) =>
    `${p.cs(logged, { one: 'zapsaný den', few: 'zapsané dny', many: 'zapsaného dne', other: 'zapsaných dní' })}, z toho ${hits} do 10 % od cíle.`,
  'review.summaryNoMean': (days) =>
    `${p.cs(days, { one: 'zapsaný den', few: 'zapsané dny', many: 'zapsaného dne', other: 'zapsaných dní' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.cs(days, { one: 'zapsaný den', few: 'zapsané dny', many: 'zapsaného dne', other: 'zapsaných dní' })}, v průměru ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, váha ${delta}`,
  'review.weekdays': ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'],

  'review.averageLevel': 'na stejné úrovni jako týden předtím',
  'review.averageUp': (kcal) => `o ${kcal} víc než týden předtím`,
  'review.averageDown': (kcal) => `o ${kcal} méně než týden předtím`,
  'review.targetMoved': (kcal) => `Tvůj cíl se posunul na ${kcal} kcal`,
  // Czech dates are ordinal and put the month in the genitive: "10.–16. srpna".
  // `month` arrives from Intl in the nominative ("srpen"), so it is mapped here;
  // anything unrecognised passes through unchanged.
  'review.dayMonth': (days, month) =>
    `${String(days).replace(/(\d)(?=–|$)/g, '$1.')} ${
      ({
        leden: 'ledna',
        únor: 'února',
        březen: 'března',
        duben: 'dubna',
        květen: 'května',
        červen: 'června',
        červenec: 'července',
        srpen: 'srpna',
        září: 'září',
        říjen: 'října',
        listopad: 'listopadu',
        prosinec: 'prosince',
      } as Record<string, string>)[month] ?? month
    }`,

  'alert.planEnds': (plan, when) => `Tvůj tarif ${plan} končí ${when}`,
  'alert.expiryToday': 'dnes',
  'alert.expiryTomorrow': 'zítra',
  'alert.expiryInDays': (days) => `za ${p.cs(days, { one: 'den', few: 'dny', many: 'dne', other: 'dní' })}`,
  'alert.planBody':
    'Zatím ho nic neobnovilo. Všechno, co máš zapsané, zůstává přesně tam, kde je – utichnou jen přehledy, trenér a kuchyně.',
  'alert.goalTitle': 'Jsi v cíli',
  // "cíl, který sis nastavil" would gender the reader.
  'alert.goalBody': (weight) =>
    `Poslední vážení ukázalo ${weight}, a to je tvůj cíl. Stojí za to zvolit další – udržet váhu je cíl sám o sobě a aplikace na něj umí mířit.`,
  'alert.streakTitles': [
    'Týden, každý den',
    'Dva týdny, každý den',
    'Měsíc, každý den',
    'Dva měsíce v kuse',
    'Sto dní',
    'Dvě stě dní',
    'Rok, každý den',
  ],
  'alert.streakBody': (days) =>
    `${p.cs(days, { one: 'den', few: 'dny', many: 'dne', other: 'dní' })} zápisů v řadě. Nic s tím dělat nemusíš – právě díky pravidelnosti má každé číslo na obrazovce pokroku nějaký smysl.`,
  'alert.recapTitle': (kcal, target) => `${kcal} z ${target} kcal`,
  'alert.recapOnTarget': 'Přesně v cíli.',
  'alert.recapUnder': (kcal) => `V rezervě ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal nad cílem.`,
  'alert.recapProtein': (got, target) => `Bílkoviny ${got}g z ${target}g.`,

  'layout.tagline': 'Day So Far – kalorický deník, se kterým si povídáš.',
  'layout.pasteLink': 'Nebo tohle vlož do prohlížeče:',
  'layout.unsubscribePrompt': 'Nechceš je dostávat?',
  'layout.unsubscribeAction': 'Vypnout týdenní e-maily',
  'layout.onTarget': 'v cíli',

  // "Pokud jsi to nebyl ty" is gendered; "if you know nothing about it" is not.
  'common.ifNotYou':
    'Pokud o tom nevíš, hned si změň heslo – a pokud se nemůžeš přihlásit, odpověz na tento e-mail.',

  'verify.subject': (code) => `${code} je tvůj ověřovací kód pro Day So Far`,
  'verify.preheader': (code) => `Zadej ${code} a dokonči nastavení účtu.`,
  'verify.heading': 'Ověř svůj e-mail',
  // "Vítej" is an imperative and carries no gender, unlike "vítán".
  'verify.intro': 'Vítej v Day So Far. Zadej tento kód a dokonči nastavení účtu:',
  'verify.codeNote':
    'Kód platí 24 hodin a dá se použít nejvýš pětkrát. Když si řekneš o nový, tento přestane platit.',
  'verify.buttonHint':
    'Čteš to na stejném zařízení, na kterém proběhla registrace? Tlačítko udělá totéž bez opisování.',
  'verify.button': 'Ověřit e-mail',
  'verify.notYou':
    'Pokud o žádném účtu nevíš, nic se na tvé jméno nezaložilo; tenhle e-mail ignoruj a adresa se uvolní.',

  'reset.subject': 'Obnovení hesla',
  'reset.preheader': (minutes) =>
    `Zvol si nové heslo. Odkaz platí ${p.cs(minutes, { one: 'minutu', few: 'minuty', many: 'minuty', other: 'minut' })}.`,
  'reset.intro':
    'Někdo požádal o obnovení hesla k tomuto účtu. Pokud to byla tvoje žádost, zvol si tady nové.',
  'reset.button': 'Zvolit nové heslo',
  'reset.expiry': (minutes) =>
    `Odkaz vyprší za ${p.cs(minutes, { one: 'minutu', few: 'minuty', many: 'minuty', other: 'minut' })} a použít se dá jen jednou.`,
  'reset.notYou':
    'Pokud o tom nevíš, klidně to ignoruj – heslo se nezměnilo a bez tohoto odkazu se nikdo nepřihlásí.',

  'changed.subject': 'Heslo bylo změněno',
  'changed.preheader': 'Všechna ostatní zařízení byla odhlášena.',
  'changed.body':
    'Heslo k tvému účtu bylo právě změněno a všechna přihlášená zařízení byla odhlášena.',
  'changed.whenLabel': 'Změněno',

  'signin.subject': 'Nové přihlášení do Day So Far',
  'signin.preheader': (device) => `Přihlásilo se zařízení, které jsme ještě neviděli – ${device}.`,
  'signin.heading': 'Nové přihlášení',
  'signin.body': 'K tvému účtu se přihlásilo zařízení, které jsme ještě neviděli.',
  'signin.whenLabel': 'Kdy',
  'signin.deviceLabel': 'Zařízení',
  'signin.ipLabel': 'IP adresa',
  'signin.wasYou':
    'Pokud to bylo tvoje přihlášení, nemusíš nic dělat – ze stejného prohlížeče už tenhle e-mail nepřijde.',

  'deleted.subject': 'Tvůj účet byl smazán',
  'deleted.preheader': 'Všechno v něm je pryč. Tohle je poslední e-mail, který od nás dostaneš.',
  'deleted.intro':
    'Tvůj účet a všechno v něm bylo trvale smazáno. Pro pořádek, šlo o:',
  'deleted.mealsLabel': 'Zapsaná jídla',
  'deleted.mealsValue': (n) => p.cs(n, { one: 'záznam', few: 'záznamy', many: 'záznamu', other: 'záznamů' }),
  'deleted.messagesLabel': 'Zprávy',
  'deleted.messagesValue': (n) => p.cs(n, { one: 'zpráva', few: 'zprávy', many: 'zprávy', other: 'zpráv' }),
  'deleted.photosLabel': 'Fotky',
  'deleted.photosValue': (n) => p.cs(n, { one: 'fotka', few: 'fotky', many: 'fotky', other: 'fotek' }),
  'deleted.nothingKept':
    'Nic se neuchovalo a nic nejde obnovit, ani z naší strany. Tohle je poslední e-mail, který dostaneš.',
  // "Díky, že jsi to zkusil" is gendered.
  'deleted.thanks': 'Díky za vyzkoušení.',

  'suspended.subject': 'Tvůj účet byl pozastaven',
  'suspended.preheader': 'Všechna zařízení jsou odhlášená. Tvoje data zůstala nedotčená.',
  'suspended.body':
    'Tvůj účet byl pozastaven správcem, takže proběhlo odhlášení na všech zařízeních a zatím se znovu přihlásit nejde.',
  'suspended.dataSafe':
    'Nic se nesmazalo – každé jídlo, fotka i konverzace jsou přesně tam, kde byly, a vrátí se spolu s účtem.',
  'suspended.mistake': 'Pokud si myslíš, že jde o omyl, odpověz na tento e-mail.',

  'restored.subject': 'Tvůj účet je znovu aktivní',
  'restored.preheader': 'Můžeš se znovu přihlásit a všechno je na svém místě.',
  'restored.body':
    'Pozastavení účtu bylo zrušeno. Můžeš se znovu přihlásit a mezitím se nic neztratilo.',
  'restored.button': 'Přihlásit se',

  'nudge.heading': 'Krátká poznámka',
  'nudge.button': 'Otevřít deník',

  'push.reviewTitle': 'Přehled týdne je hotový',
  'push.reviewBody': (name) => `${name}, tady je, jak šel týden.`,
  'push.reviewBodyNoName': 'Tady je, jak šel týden.',
  // "okomentoval/a" would guess the coach's gender.
  'push.coachCommented': (name) => `${name}: nový komentář`,
  'push.coachCommentedNoName': 'Nový komentář od trenéra',
};

const hu: EmailMessages = {
  'review.subject': (range) => `A heted: ${range}`,
  'review.heading': 'A múlt heted röviden',
  'review.greeting': (name) => `Szia, ${name}!`,
  'review.greetingNoName': 'Szia!',
  'review.daysLogged': 'Rögzített napok',
  'review.sameAsBefore': 'ugyanannyi, mint az előző héten',
  'review.weekBefore': (n) => `előző héten: ${n}`,
  'review.averageADay': 'Napi átlag',
  'review.daysOnTarget': 'Napok a célon belül',
  'review.withinTarget': (kcal) => `${kcal} kcal ±10%-on belül`,
  'review.weight': 'Testsúly',
  'review.acrossTheWeek': 'a hét során',
  'review.burnedOver': (sessions) =>
    `Elégetve ${p.hu(sessions, { one: 'edzés', other: 'edzés' })} alatt`,
  'review.onTopOfTarget': 'a célon kívül',
  'review.proteinADay': 'Napi fehérje',
  'review.proteinTarget': (grams) => `cél: ${grams} g`,
  'review.howItRead': 'Hogyan ment',
  'review.onRepeat': 'Leggyakrabban',
  'review.times': (n) => p.hu(n, { one: 'alkalommal', other: 'alkalommal' }),
  'review.readWholeReview': 'Olvasd el a teljes értékelést',
  'review.nothingThisWeek': 'Ezen a héten nincs semmi rögzítve.',
  'review.stripCaption': (logged, hits) =>
    `${p.hu(logged, { one: 'rögzített nap', other: 'rögzített nap' })}, ebből ${hits} a cél 10%-án belül.`,
  'review.summaryNoMean': (days) =>
    `${p.hu(days, { one: 'rögzített nap', other: 'rögzített nap' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.hu(days, { one: 'rögzített nap', other: 'rögzített nap' })}, átlagosan ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, testsúly: ${delta}`,
  'review.weekdays': ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'],

  // The size arrives as a bare number, and "150-nel" would need an ending
  // chosen for it, so the comparison is said with «plusz» and «mínusz».
  'review.averageLevel': 'ugyanannyi, mint az előző héten',
  'review.averageUp': (kcal) => `plusz ${kcal} az előző héthez képest`,
  'review.averageDown': (kcal) => `mínusz ${kcal} az előző héthez képest`,
  'review.targetMoved': (kcal) => `A célod mostantól: ${kcal} kcal`,
  // Month first, day part closed by a dot: "augusztus 10–16.",
  // "augusztus 16. – szeptember 2.".
  'review.dayMonth': (days, month) => `${month} ${days}.`,

  'alert.planEnds': (plan, when) => `${plan} előfizetésed ${when} lejár`,
  'alert.expiryToday': 'ma',
  'alert.expiryTomorrow': 'holnap',
  'alert.expiryInDays': (days) => `${days} nap múlva`,
  'alert.planBody':
    'Még nem lett megújítva. Minden, amit rögzítettél, pontosan ott marad, ahol van – csak az értékelések, az edzői funkciók és a konyha némulnak el.',
  'alert.goalTitle': 'Célba értél',
  'alert.goalBody': (weight) =>
    `A legutóbbi mérésed: ${weight} – pont a célod. Érdemes kitűzni a következőt: a súly megtartása is önálló cél, és az alkalmazás arra is tud célozni.`,
  'alert.streakTitles': [
    'Egy hét, minden nap',
    'Két hét, minden nap',
    'Egy hónap, minden nap',
    'Két hónap egyhuzamban',
    'Száz nap',
    'Kétszáz nap',
    'Egy év, minden nap',
  ],
  'alert.streakBody': (days) =>
    `${days} nap egymás után rögzítve. Nincs vele teendő – ez a rendszeresség adja értelmét minden számnak a Haladás képernyőn.`,
  'alert.recapTitle': (kcal, target) => `${kcal} / ${target} kcal`,
  'alert.recapOnTarget': 'Pont a célon.',
  'alert.recapUnder': (kcal) => `Még ${kcal} kcal belefér.`,
  'alert.recapOver': (kcal) => `${kcal} kcal a célon felül.`,
  'alert.recapProtein': (got, target) => `Fehérje: ${got}g / ${target}g.`,

  'layout.tagline': 'Day So Far – a kalórianapló, amivel beszélgetsz.',
  'layout.pasteLink': 'Vagy másold be ezt a böngésződbe:',
  'layout.unsubscribePrompt': 'Nem kérsz ilyet?',
  'layout.unsubscribeAction': 'Heti e-mailek kikapcsolása',
  'layout.onTarget': 'célon belül',

  'common.ifNotYou':
    'Ha nem te voltál, változtasd meg most a jelszavad – ha pedig nem tudsz belépni, válaszolj erre az e-mailre.',

  'verify.subject': (code) => `${code} – a Day So Far megerősítő kódod`,
  'verify.preheader': (code) => `A fiókod beállításához írd be ezt a kódot: ${code}.`,
  'verify.heading': 'Erősítsd meg az e-mail-címed',
  'verify.intro': 'Örülünk, hogy itt vagy. A fiókod beállításának befejezéséhez írd be ezt a kódot:',
  'verify.codeNote':
    'A kód 24 óráig érvényes, és legfeljebb ötször használható. Ha újat kérsz, az lecseréli.',
  'verify.buttonHint':
    'Ugyanazon az eszközön olvasod ezt, amelyen regisztráltál? A gomb ugyanezt elvégzi gépelés nélkül.',
  'verify.button': 'E-mail-cím megerősítése',
  'verify.notYou':
    'Ha nem te hoztál létre fiókot, a nevedben semmi nem jött létre; hagyd figyelmen kívül ezt a levelet, és a cím felszabadul.',

  'reset.subject': 'Jelszó visszaállítása',
  'reset.preheader': (minutes) =>
    `Válassz új jelszót. A link ${p.hu(minutes, { one: 'percig', other: 'percig' })} érvényes.`,
  'reset.intro':
    'Valaki új jelszót kért ehhez a fiókhoz. Ha te voltál, itt választhatsz újat.',
  'reset.button': 'Új jelszó választása',
  'reset.expiry': (minutes) =>
    `A link ${p.hu(minutes, { one: 'perc', other: 'perc' })} múlva lejár, és csak egyszer használható.`,
  'reset.notYou':
    'Ha nem te voltál, nyugodtan hagyd figyelmen kívül – a jelszavad nem változott, és e link nélkül senki nem tud belépni.',

  'changed.subject': 'Megváltozott a jelszavad',
  'changed.preheader': 'Minden más eszközön kiléptettünk.',
  'changed.body':
    'A fiókod jelszava az imént megváltozott, és minden bejelentkezett eszközön kiléptettünk.',
  'changed.whenLabel': 'Időpont',

  'signin.subject': 'Új belépés a Day So Far-fiókodba',
  'signin.preheader': (device) => `Egy eddig ismeretlen eszköz lépett be: ${device}.`,
  'signin.heading': 'Új belépés',
  'signin.body': 'Egy eddig nem látott eszközről léptek be a fiókodba.',
  'signin.whenLabel': 'Mikor',
  'signin.deviceLabel': 'Eszköz',
  'signin.ipLabel': 'IP-cím',
  'signin.wasYou':
    'Ha te voltál, nincs teendőd – ugyanabból a böngészőből ezt nem kapod meg újra.',

  'deleted.subject': 'Töröltük a fiókodat',
  'deleted.preheader': 'Minden eltűnt belőle. Ez az utolsó e-mail, amit tőlünk kapsz.',
  'deleted.intro':
    'A fiókodat és mindent, ami benne volt, véglegesen töröltük. A nyilvántartásod kedvéért ez volt benne:',
  'deleted.mealsLabel': 'Rögzített étkezések',
  'deleted.mealsValue': (n) => p.hu(n, { one: 'bejegyzés', other: 'bejegyzés' }),
  'deleted.messagesLabel': 'Üzenetek',
  'deleted.messagesValue': (n) => p.hu(n, { one: 'üzenet', other: 'üzenet' }),
  'deleted.photosLabel': 'Fotók',
  'deleted.photosValue': (n) => p.hu(n, { one: 'fotó', other: 'fotó' }),
  'deleted.nothingKept':
    'Semmit nem őriztünk meg, és semmi nem állítható vissza, még általunk sem. Ez az utolsó e-mail, amit kapsz.',
  'deleted.thanks': 'Köszönjük, hogy kipróbáltad.',

  'suspended.subject': 'A fiókodat felfüggesztettük',
  'suspended.preheader': 'Minden eszközön kiléptettünk. Az adataidhoz nem nyúltunk.',
  'suspended.body':
    'Egy adminisztrátor felfüggesztette a fiókodat, ezért mindenhol kiléptettünk, és egyelőre nem tudsz újra belépni.',
  'suspended.dataSafe':
    'Semmit nem töröltünk – minden étkezés, fotó és beszélgetés pontosan ott van, ahol hagytad, és a fiókkal együtt visszajön.',
  'suspended.mistake': 'Ha szerinted ez tévedés, válaszolj erre az e-mailre.',

  'restored.subject': 'A fiókod újra aktív',
  'restored.preheader': 'Újra beléphetsz, és minden ott van, ahol hagytad.',
  'restored.body':
    'A fiókod felfüggesztését feloldottuk. Újra beléphetsz, és közben semmi nem veszett el.',
  'restored.button': 'Belépés',

  'nudge.heading': 'Egy gyors megjegyzés',
  'nudge.button': 'Napló megnyitása',

  'push.reviewTitle': 'Elkészült a heti értékelésed',
  'push.reviewBody': (name) => `${name}, így ment a heted.`,
  'push.reviewBodyNoName': 'Így ment a heted.',
  'push.coachCommented': (name) => `${name} megjegyzést írt`,
  'push.coachCommentedNoName': 'Az edződ megjegyzést írt',
};

const el: EmailMessages = {
  'review.subject': (range) => `Η εβδομάδα σου: ${range}`,
  'review.heading': 'Η προηγούμενη εβδομάδα, σε ανασκόπηση',
  'review.greeting': (name) => `Γεια σου, ${name},`,
  'review.greetingNoName': 'Γεια σου,',
  'review.daysLogged': 'Μέρες με καταγραφή',
  'review.sameAsBefore': 'όσες και την προηγούμενη εβδομάδα',
  'review.weekBefore': (n) => `${n} την προηγούμενη εβδομάδα`,
  'review.averageADay': 'Μέσος όρος ανά μέρα',
  'review.daysOnTarget': 'Μέρες στον στόχο',
  'review.withinTarget': (kcal) => `εντός 10% από τις ${kcal} kcal`,
  'review.weight': 'Βάρος',
  'review.acrossTheWeek': 'μέσα στην εβδομάδα',
  'review.burnedOver': (sessions) =>
    `Κάηκαν σε ${p.el(sessions, { one: 'προπόνηση', other: 'προπονήσεις' })}`,
  'review.onTopOfTarget': 'πέρα από τον στόχο',
  'review.proteinADay': 'Πρωτεΐνη ανά μέρα',
  'review.proteinTarget': (grams) => `στόχος ${grams} g`,
  'review.howItRead': 'Πώς πήγε',
  'review.onRepeat': 'Τα πιο συχνά',
  'review.times': (n) => p.el(n, { one: 'φορά', other: 'φορές' }),
  'review.readWholeReview': 'Διάβασε ολόκληρη την ανασκόπηση',
  'review.nothingThisWeek': 'Καμία καταγραφή αυτή την εβδομάδα.',
  'review.stripCaption': (logged, hits) =>
    `${p.el(logged, { one: 'μέρα', other: 'μέρες' })} με καταγραφή, ${hits} από αυτές εντός 10% του στόχου.`,
  'review.summaryNoMean': (days) =>
    `${p.el(days, { one: 'μέρα', other: 'μέρες' })} με καταγραφή.`,
  'review.summary': (days, kcal, weight) =>
    `${p.el(days, { one: 'μέρα', other: 'μέρες' })} με καταγραφή, κατά μέσο όρο ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, βάρος ${delta}`,
  'review.weekdays': ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'],

  // «πάνω/κάτω από» are adverbs, so nothing has to agree with the figure.
  'review.averageLevel': 'ίδιος με την προηγούμενη εβδομάδα',
  'review.averageUp': (kcal) => `${kcal} πάνω από την προηγούμενη εβδομάδα`,
  'review.averageDown': (kcal) => `${kcal} κάτω από την προηγούμενη εβδομάδα`,
  'review.targetMoved': (kcal) => `Ο στόχος σου έγινε ${kcal} kcal`,
  'review.dayMonth': (days, month) => `${days} ${month}`,

  'alert.planEnds': (plan, when) => `Το πακέτο ${plan} λήγει ${when}`,
  'alert.expiryToday': 'σήμερα',
  'alert.expiryTomorrow': 'αύριο',
  'alert.expiryInDays': (days) => `σε ${days} μέρες`,
  'alert.planBody':
    'Δεν έχει ανανεωθεί ακόμα. Ό,τι έχεις καταγράψει μένει ακριβώς εκεί που είναι — αυτά που σταματούν είναι οι ανασκοπήσεις, η καθοδήγηση και η κουζίνα.',
  // A verb: «Τα κατάφερες» needs no gender, where «είσαι εκεί/έτοιμος» would.
  'alert.goalTitle': 'Τα κατάφερες',
  'alert.goalBody': (weight) =>
    `Το τελευταίο σου ζύγισμα ήταν ${weight}, δηλαδή ο στόχος που έβαλες. Αξίζει να διαλέξεις τον επόμενο — η διατήρηση ενός βάρους είναι στόχος από μόνη της, και η εφαρμογή μπορεί να στοχεύσει σε αυτήν.`,
  'alert.streakTitles': [
    'Μια εβδομάδα, κάθε μέρα',
    'Δύο εβδομάδες, κάθε μέρα',
    'Ένας μήνας, κάθε μέρα',
    'Δύο μήνες συνεχόμενα',
    'Εκατό μέρες',
    'Διακόσιες μέρες',
    'Ένας χρόνος, κάθε μέρα',
  ],
  'alert.streakBody': (days) =>
    `${days} μέρες καταγραφής στη σειρά. Δεν χρειάζεται να κάνεις τίποτα — αυτή η συνέπεια είναι που δίνει νόημα σε κάθε νούμερο στην οθόνη της προόδου.`,
  'alert.recapTitle': (kcal, target) => `${kcal} από ${target} kcal`,
  'alert.recapOnTarget': 'Ακριβώς στον στόχο.',
  'alert.recapUnder': (kcal) => `Περισσεύουν ${kcal} kcal.`,
  'alert.recapOver': (kcal) => `${kcal} kcal παραπάνω.`,
  'alert.recapProtein': (got, target) => `Πρωτεΐνη ${got}g από ${target}g.`,

  'layout.tagline': 'Day So Far — το ημερολόγιο θερμίδων που του μιλάς.',
  'layout.pasteLink': 'Ή επικόλλησε αυτό στο πρόγραμμα περιήγησής σου:',
  'layout.unsubscribePrompt': 'Δεν τα θέλεις;',
  'layout.unsubscribeAction': 'Κλείσε τα εβδομαδιαία email',
  'layout.onTarget': 'στον στόχο',

  'common.ifNotYou':
    'Αν δεν ήσουν εσύ, άλλαξε τώρα τον κωδικό πρόσβασής σου — κι αν δεν μπορείς να μπεις, απάντησε σε αυτό το email.',

  'verify.subject': (code) => `${code} είναι ο κωδικός επιβεβαίωσης για το Day So Far`,
  'verify.preheader': (code) => `Γράψε τον κωδικό ${code} για να ολοκληρώσεις τη δημιουργία του λογαριασμού σου.`,
  'verify.heading': 'Επιβεβαίωσε το email σου',
  // «Καλώς ήρθες» is a verb and needs no gender, unlike «Καλωσορισμένος/-η».
  'verify.intro':
    'Καλώς ήρθες στο Day So Far. Γράψε αυτόν τον κωδικό για να ολοκληρώσεις τη δημιουργία του λογαριασμού σου:',
  'verify.codeNote':
    'Ο κωδικός ισχύει 24 ώρες και δουλεύει το πολύ πέντε φορές. Αν ζητήσεις νέο, αντικαθιστά αυτόν.',
  'verify.buttonHint':
    'Διαβάζεις αυτό στη συσκευή όπου έκανες την εγγραφή; Το κουμπί κάνει την ίδια δουλειά χωρίς πληκτρολόγηση.',
  'verify.button': 'Επιβεβαίωση email',
  'verify.notYou':
    'Αν δεν δημιούργησες εσύ λογαριασμό, τίποτα δεν έχει οριστεί στο όνομά σου. Αγνόησε αυτό το email και η διεύθυνση θα αποδεσμευτεί.',

  'reset.subject': 'Επαναφορά κωδικού πρόσβασης',
  'reset.preheader': (minutes) =>
    `Διάλεξε νέο κωδικό πρόσβασης. Ο σύνδεσμος ισχύει για ${p.el(minutes, { one: 'λεπτό', other: 'λεπτά' })}.`,
  'reset.intro':
    'Ζητήθηκε επαναφορά του κωδικού πρόσβασης για αυτόν τον λογαριασμό. Αν ήσουν εσύ, διάλεξε νέο εδώ.',
  'reset.button': 'Διάλεξε νέο κωδικό',
  'reset.expiry': (minutes) =>
    `Ο σύνδεσμος λήγει σε ${p.el(minutes, { one: 'λεπτό', other: 'λεπτά' })} και μπορεί να χρησιμοποιηθεί μόνο μία φορά.`,
  'reset.notYou':
    'Αν δεν ήσουν εσύ, μπορείς να το αγνοήσεις — ο κωδικός σου δεν άλλαξε και κανείς δεν μπορεί να μπει χωρίς αυτόν τον σύνδεσμο.',

  'changed.subject': 'Ο κωδικός πρόσβασής σου άλλαξε',
  // Impersonal «έγινε αποσύνδεση» throughout: it is the devices that were signed out.
  'changed.preheader': 'Έγινε αποσύνδεση από όλες τις άλλες συσκευές.',
  'changed.body':
    'Ο κωδικός πρόσβασης του λογαριασμού σου μόλις άλλαξε, και έγινε αποσύνδεση από κάθε συσκευή που ήταν συνδεδεμένη.',
  'changed.whenLabel': 'Αλλαγή',

  'signin.subject': 'Νέα σύνδεση στο Day So Far',
  'signin.preheader': (device) => `Συνδέθηκε μια συσκευή που δεν έχουμε ξαναδεί — ${device}.`,
  'signin.heading': 'Νέα σύνδεση',
  'signin.body': 'Έγινε σύνδεση στον λογαριασμό σου από συσκευή που δεν έχουμε ξαναδεί.',
  'signin.whenLabel': 'Πότε',
  'signin.deviceLabel': 'Συσκευή',
  'signin.ipLabel': 'Διεύθυνση IP',
  'signin.wasYou':
    'Αν ήσουν εσύ, δεν χρειάζεται να κάνεις τίποτα — δεν θα το ξαναλάβεις από το ίδιο πρόγραμμα περιήγησης.',

  'deleted.subject': 'Ο λογαριασμός σου διαγράφηκε',
  'deleted.preheader': 'Όλα όσα είχε χάθηκαν. Αυτό είναι το τελευταίο email που θα λάβεις από εμάς.',
  'deleted.intro':
    'Ο λογαριασμός σου και όλα όσα περιείχε διαγράφηκαν οριστικά. Για το αρχείο σου, ήταν:',
  'deleted.mealsLabel': 'Καταγεγραμμένα γεύματα',
  'deleted.mealsValue': (n) => p.el(n, { one: 'καταχώριση', other: 'καταχωρίσεις' }),
  'deleted.messagesLabel': 'Μηνύματα',
  'deleted.messagesValue': (n) => p.el(n, { one: 'μήνυμα', other: 'μηνύματα' }),
  'deleted.photosLabel': 'Φωτογραφίες',
  'deleted.photosValue': (n) => p.el(n, { one: 'φωτογραφία', other: 'φωτογραφίες' }),
  'deleted.nothingKept':
    'Δεν κρατήθηκε τίποτα και τίποτα δεν μπορεί να ανακτηθεί, ούτε από εμάς. Αυτό είναι το τελευταίο email που θα λάβεις.',
  'deleted.thanks': 'Ευχαριστούμε που το δοκίμασες.',

  'suspended.subject': 'Ο λογαριασμός σου τέθηκε σε αναστολή',
  'suspended.preheader': 'Έγινε αποσύνδεση από όλες τις συσκευές. Τα δεδομένα σου είναι ανέπαφα.',
  'suspended.body':
    'Ένας διαχειριστής ανέστειλε τον λογαριασμό σου, οπότε έγινε αποσύνδεση παντού και προς το παρόν δεν μπορείς να συνδεθείς ξανά.',
  'suspended.dataSafe':
    'Δεν διαγράφηκε τίποτα — κάθε γεύμα, φωτογραφία και συζήτηση είναι ακριβώς εκεί που τα άφησες, και επιστρέφουν μαζί με τον λογαριασμό.',
  'suspended.mistake': 'Απάντησε σε αυτό το email αν πιστεύεις ότι έγινε λάθος.',

  'restored.subject': 'Ο λογαριασμός σου είναι ξανά ενεργός',
  'restored.preheader': 'Μπορείς να συνδεθείς ξανά, και όλα είναι εκεί που τα άφησες.',
  'restored.body':
    'Η αναστολή του λογαριασμού σου άρθηκε. Μπορείς να συνδεθείς ξανά, και δεν χάθηκε τίποτα όσο ήταν ανενεργός.',
  'restored.button': 'Σύνδεση',

  'nudge.heading': 'Μια σύντομη σημείωση',
  'nudge.button': 'Άνοιξε το ημερολόγιο',

  'push.reviewTitle': 'Η εβδομάδα σου είναι έτοιμη',
  'push.reviewBody': (name) => `${name}, δες πώς πήγε η εβδομάδα.`,
  'push.reviewBodyNoName': 'Δες πώς πήγε η εβδομάδα.',
  'push.coachCommented': (name) => `${name} σχολίασε`,
  'push.coachCommentedNoName': 'Νέο σχόλιο από τον προπονητή σου',
};

const sk: EmailMessages = {
  'review.subject': (range) => `Tvoj týždeň: ${range}`,
  'review.heading': 'Minulý týždeň v skratke',
  'review.greeting': (name) => `Ahoj ${name},`,
  'review.greetingNoName': 'Ahoj,',
  'review.daysLogged': 'Zapísané dni',
  'review.sameAsBefore': 'rovnako ako týždeň predtým',
  'review.weekBefore': (n) => `${n} v predošlom týždni`,
  'review.averageADay': 'Priemer za deň',
  'review.daysOnTarget': 'Dni v cieli',
  'review.withinTarget': (kcal) => `do 10 % od ${kcal} kcal`,
  'review.weight': 'Váha',
  'review.acrossTheWeek': 'za týždeň',
  'review.burnedOver': (sessions) =>
    `Spálené za ${p.sk(sessions, { one: 'tréning', few: 'tréningy', many: 'tréningu', other: 'tréningov' })}`,
  'review.onTopOfTarget': 'nad rámec cieľa',
  'review.proteinADay': 'Bielkoviny za deň',
  'review.proteinTarget': (grams) => `cieľ ${grams} g`,
  'review.howItRead': 'Ako to vyzeralo',
  'review.onRepeat': 'Stále dookola',
  // "-krát" does not inflect, so the count needs no plural forms.
  'review.times': (n) => `${n}-krát`,
  'review.readWholeReview': 'Prečítať celý prehľad',
  'review.nothingThisWeek': 'Tento týždeň nič zapísané.',
  'review.stripCaption': (logged, hits) =>
    `${p.sk(logged, { one: 'zapísaný deň', few: 'zapísané dni', many: 'zapísaného dňa', other: 'zapísaných dní' })}, z toho ${hits} do 10 % od cieľa.`,
  'review.summaryNoMean': (days) =>
    `${p.sk(days, { one: 'zapísaný deň', few: 'zapísané dni', many: 'zapísaného dňa', other: 'zapísaných dní' })}.`,
  'review.summary': (days, kcal, weight) =>
    `${p.sk(days, { one: 'zapísaný deň', few: 'zapísané dni', many: 'zapísaného dňa', other: 'zapísaných dní' })}, v priemere ${kcal} kcal${weight}.`,
  'review.summaryWeight': (delta) => `, váha ${delta}`,
  'review.weekdays': ['ne', 'po', 'ut', 'st', 'št', 'pi', 'so'],

  'review.averageLevel': 'rovnako ako týždeň predtým',
  'review.averageUp': (kcal) => `o ${kcal} viac ako týždeň predtým`,
  'review.averageDown': (kcal) => `o ${kcal} menej ako týždeň predtým`,
  'review.targetMoved': (kcal) => `Tvoj cieľ sa posunul na ${kcal} kcal`,
  // Slovak writes "10.–16. augusta": a period after each day number, and the
  // month in the genitive — `formatRange` passes Intl's standalone nominative.
  'review.dayMonth': (days, month) => {
    const genitive: Record<string, string> = {
      január: 'januára', február: 'februára', marec: 'marca', apríl: 'apríla',
      máj: 'mája', jún: 'júna', júl: 'júla', august: 'augusta',
      september: 'septembra', október: 'októbra', november: 'novembra', december: 'decembra',
    };
    return `${String(days).replace(/(\d)(?=–|$)/g, '$1.')} ${genitive[String(month)] ?? month}`;
  },

  'alert.planEnds': (plan, when) => `Tvoj plán ${plan} končí ${when}`,
  'alert.expiryToday': 'dnes',
  'alert.expiryTomorrow': 'zajtra',
  'alert.expiryInDays': (days) => `o ${p.sk(days, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' })}`,
  // "Čo si zapísal" would gender the reader; "tvoje záznamy" does not.
  'alert.planBody':
    'Zatiaľ ho nič neobnovilo. Všetky tvoje záznamy zostávajú presne tam, kde sú – stíchnu len prehľady, rady trénera a kuchyňa.',
  'alert.goalTitle': 'Si v cieli',
  'alert.goalBody': (weight) =>
    `Posledné váženie ukázalo ${weight}, a to je presne tvoj cieľ. Oplatí sa zvoliť ďalší – udržať si váhu je cieľ sám osebe a aplikácia sa naň vie zamerať.`,
  'alert.streakTitles': [
    'Týždeň, každý deň',
    'Dva týždne, každý deň',
    'Mesiac, každý deň',
    'Dva mesiace bez prestávky',
    'Sto dní',
    'Dvesto dní',
    'Rok, každý deň',
  ],
  'alert.streakBody': (days) =>
    `${p.sk(days, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' })} zápisov bez prestávky. Netreba s tým nič robiť – práve táto pravidelnosť dáva zmysel každému číslu na obrazovke pokroku.`,
  'alert.recapTitle': (kcal, target) => `${kcal} z ${target} kcal`,
  'alert.recapOnTarget': 'Presne v cieli.',
  'alert.recapUnder': (kcal) => `Ešte ${kcal} kcal v rezerve.`,
  'alert.recapOver': (kcal) => `${kcal} kcal navyše.`,
  'alert.recapProtein': (got, target) => `Bielkoviny ${got} g z ${target} g.`,

  'layout.tagline': 'Day So Far – kalorický denník, s ktorým sa rozprávaš.',
  'layout.pasteLink': 'Alebo toto vlož do prehliadača:',
  'layout.unsubscribePrompt': 'Nechceš ich?',
  'layout.unsubscribeAction': 'Vypnúť týždenné e-maily',
  'layout.onTarget': 'v cieli',

  'common.ifNotYou':
    'Ak to nie si ty, hneď si zmeň heslo – a ak sa nevieš prihlásiť, odpovedz na tento e-mail.',

  'verify.subject': (code) => `${code} je tvoj overovací kód pre Day So Far`,
  'verify.preheader': (code) => `Zadaj ${code} a dokonči nastavenie účtu.`,
  'verify.heading': 'Over svoj e-mail',
  'verify.intro': 'Vitaj v Day So Far. Zadaj tento kód a dokonči nastavenie účtu:',
  'verify.codeNote':
    'Kód platí 24 hodín a funguje najviac päťkrát. Nový kód tento nahradí.',
  // "Na ktorom si sa registroval" would gender the reader.
  'verify.buttonHint':
    'Čítaš to na zariadení, na ktorom prebehla registrácia? Tlačidlo urobí to isté a nemusíš nič písať.',
  'verify.button': 'Overiť e-mail',
  // "Ak si nevytvoril účet" would gender the reader.
  'verify.notYou':
    'Ak tento účet nie je tvoj, na tvoje meno sa nič nezaložilo; tento e-mail ignoruj a adresa sa uvoľní.',

  'reset.subject': 'Obnovenie hesla',
  'reset.preheader': (minutes) =>
    `Zvoľ si nové heslo. Odkaz platí ${p.sk(minutes, { one: 'minútu', few: 'minúty', many: 'minúty', other: 'minút' })}.`,
  // "Ak si to bol ty" would gender the reader; the present tense does not.
  'reset.intro':
    'Niekto požiadal o obnovenie hesla k tomuto účtu. Ak si to ty, nové heslo si vyber tu.',
  'reset.button': 'Zvoliť nové heslo',
  'reset.expiry': (minutes) =>
    `Odkaz vyprší o ${p.sk(minutes, { one: 'minútu', few: 'minúty', many: 'minúty', other: 'minút' })} a dá sa použiť len raz.`,
  'reset.notYou':
    'Ak to nie si ty, tento e-mail môžeš ignorovať – heslo sa nezmenilo a bez tohto odkazu sa nikto neprihlási.',

  'changed.subject': 'Tvoje heslo bolo zmenené',
  'changed.preheader': 'Všetky ostatné zariadenia sa odhlásili.',
  'changed.body':
    'Heslo k tvojmu účtu bolo práve zmenené a všetky zariadenia, ktoré boli prihlásené, sa odhlásili.',
  'changed.whenLabel': 'Zmenené',

  'signin.subject': 'Nové prihlásenie do Day So Far',
  'signin.preheader': (device) => `Prihlásilo sa zariadenie, ktoré sme ešte nevideli – ${device}.`,
  'signin.heading': 'Nové prihlásenie',
  'signin.body': 'Do tvojho účtu sa prihlásilo zariadenie, ktoré sme ešte nevideli.',
  'signin.whenLabel': 'Kedy',
  'signin.deviceLabel': 'Zariadenie',
  'signin.ipLabel': 'IP adresa',
  'signin.wasYou':
    'Ak si to ty, netreba nič robiť – z toho istého prehliadača ti už takýto e-mail nepríde.',

  'deleted.subject': 'Tvoj účet bol vymazaný',
  'deleted.preheader': 'Všetko, čo v ňom bolo, je preč. Toto je posledný e-mail, ktorý ti pošleme.',
  'deleted.intro':
    'Tvoj účet a všetko v ňom boli natrvalo vymazané. Pre tvoju evidenciu, išlo o:',
  'deleted.mealsLabel': 'Zapísané jedlá',
  'deleted.mealsValue': (n) => p.sk(n, { one: 'záznam', few: 'záznamy', many: 'záznamu', other: 'záznamov' }),
  'deleted.messagesLabel': 'Správy',
  'deleted.messagesValue': (n) => p.sk(n, { one: 'správa', few: 'správy', many: 'správy', other: 'správ' }),
  'deleted.photosLabel': 'Fotky',
  'deleted.photosValue': (n) => p.sk(n, { one: 'fotka', few: 'fotky', many: 'fotky', other: 'fotiek' }),
  'deleted.nothingKept':
    'Nič sa neuchovalo a nič sa nedá obnoviť, ani z našej strany. Toto je posledný e-mail, ktorý dostaneš.',
  // "Že si to skúsil" would gender the reader.
  'deleted.thanks': 'Ďakujeme za šancu.',

  // "Bol si odhlásený" would gender the reader, so the sign-out is the subject.
  'suspended.subject': 'Tvoj účet bol pozastavený',
  'suspended.preheader': 'Na všetkých zariadeniach prebehlo odhlásenie. Tvoje údaje sú nedotknuté.',
  'suspended.body':
    'Administrátor pozastavil tvoj účet, takže odhlásenie prebehlo všade a zatiaľ sa nedá znova prihlásiť.',
  'suspended.dataSafe':
    'Nič sa nevymazalo – každé jedlo, fotka aj konverzácia sú presne tam, kde boli, a vrátia sa spolu s účtom.',
  'suspended.mistake': 'Ak si myslíš, že ide o omyl, odpovedz na tento e-mail.',

  'restored.subject': 'Tvoj účet je znova aktívny',
  'restored.preheader': 'Znova sa môžeš prihlásiť a všetko je tam, kde bolo.',
  'restored.body':
    'Pozastavenie tvojho účtu je zrušené. Znova sa môžeš prihlásiť a počas pozastavenia sa nič nestratilo.',
  'restored.button': 'Prihlásiť sa',

  'nudge.heading': 'Krátka poznámka',
  'nudge.button': 'Otvoriť denník',

  'push.reviewTitle': 'Tvoj týždeň je pripravený',
  'push.reviewBody': (name) => `${name}, takto vyzeral tvoj týždeň.`,
  'push.reviewBodyNoName': 'Takto vyzeral tvoj týždeň.',
  // "pridal/pridala" would gender the coach, whom the server also knows only by name.
  'push.coachCommented': (name) => `Nový komentár – ${name}`,
  'push.coachCommentedNoName': 'Nový komentár od trénera',
};

const CATALOGUES: Record<Locale, EmailMessages> = { en, bg, de, es, fr, ro, uk, sr, hr, cs, hu, el, sk };

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
