import { pluralFor, pluralWordFor } from '@ct/shared';

import type { Messages } from '@/lib/i18n';

/**
 * Serbian, for the native app. Cyrillic only and ekavian (млеко, хлеб) — the
 * script a Serbian phone defaults to, and the one `intlLocale` hands CLDR for
 * bare `sr`. Second person singular and informal («ти») throughout.
 *
 * Plural categories are one / few / other: 1 дан · 2 дана · 5 дана · 21 дан.
 *
 * Two habits worth keeping. The Serbian past tense is gendered (уписао си /
 * уписала си), so nothing addressed to the reader uses it: present tense,
 * imperatives and impersonal forms («уписано», «поједено») instead. And "week"
 * is always «седмица» — «недеља» is also Sunday, which `Intl` prints on the same
 * screens. A subscription plan is a «пакет», so «план» stays free for meals.
 */
const n = pluralFor('sr');
/** The agreeing noun without its number, for the paywall's sentences. */
const w = pluralWordFor('sr');

export const sr: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  'nav.journal': 'Дневник',
  'nav.today': 'Данас',
  'nav.progress': 'Напредак',
  'nav.exercise': 'Вежбање',
  'nav.cook': 'Кухиња',
  // «Ти» reads oddly as a label; the tab holds your own details, so it is named for them (as bg does).
  'nav.you': 'Профил',
  'nav.history': 'Историја',
  'nav.admin': 'Админ',
  'nav.signOut': 'Одјава',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Данас',
  // Under the ring's figure: «преостало» is what the number is, no preposition needed.
  'today.toGo': 'преостало',
  'today.over': 'преко циља',
  'today.burned': (kcal: string) => `+${kcal} сагорело`,
  'today.viewCalendar': 'Прикажи календар',
  'today.previousDay': 'Претходни дан',
  'today.nextDay': 'Следећи дан',
  'today.nothingLogged': 'Још ништа није уписано.',
  // "шта си јео/јела" is gendered; «шта је било за јело» is how people say it anyway.
  'today.nothingLoggedHint': 'Реци дневнику шта је било за јело.',
  'today.logAgain': 'Упиши поново',
  'today.weighed': 'Измерено',
  'today.weight': 'Тежина',
  'today.exercise': 'Вежбање',
  'today.roughEstimate': 'груба процена',
  'today.exerciseFooter': 'Приказано одвојено од циља — калорије сагореле вежбањем су груба процена.',
  'today.exerciseTitle': '🏃  Вежбање',
  'today.stepsTitle': '👟  Кораци',
  'today.steps': (count: number) => n(count, { one: 'корак', few: 'корака', other: 'корака' }),
  'today.stepsFooter': 'Броји их телефон. Кораци прецизирају твој циљ — никад се не додају на њега.',
  'today.stepsEnable': 'Броји моје кораке',
  'today.stepsStarting': 'Бројање је почело',
  'today.stepsStartingHint':
    'Телефон броји од тренутка кад је добио дозволу, па овде још нема ништа. Прошетај и попуниће се.',
  'today.stepsNoSource': 'На овом телефону још ништа не броји кораке',
  'today.stepsNoSourceHint':
    'Health Connect још нема ништа. Неким телефонима треба друга апликација за бројање — додирни да отвориш списак апликација и дозволи приступ за Samsung Health или Fitbit.',
  'today.stepsUsual': (average: string) => `обично ${average}`,
  'today.stepsEnableHint': 'Чита кораке са телефона, да би циљ пратио оно што стварно радиш.',
  'today.thatChange': 'Та промена',
  // `what` is a meal name of unknown gender, so it stands alone before a colon.
  'today.couldNotSave': (what: string, reason: string) => `${what}: чување није успело. ${reason}`,
  'today.waitingToSync': (count: number) =>
    n(count, {
      one: 'промена чека синхронизацију',
      few: 'промене чекају синхронизацију',
      other: 'промена чека синхронизацију',
    }),
  'today.lastSavedDay': ' · приказан је последњи сачувани дан',
  'today.offlineDay': 'Ван мреже — приказан је последњи сачувани дан.',
  'today.unsent': ' · чека синхронизацију',
  'today.macroLine': (protein: string, carbs: string, fat: string) =>
    `${protein}П · ${carbs}У · ${fat}М`,
  'today.changeHint': 'Да ово промениш, реци у дневнику — „пиринча је било више“.',
  'today.logItYourself': '+ Упиши ручно',
  'today.ofTargetKcal': (target: string) => `од ${target} kcal`,
  'rail.netAfterExercise': (kcal: string) => `нето ${kcal} kcal после вежбања`,

  'meal.breakfast': 'Доручак',
  'meal.lunch': 'Ручак',
  'meal.dinner': 'Вечера',
  'meal.snack': 'Ужине',
  'meal.snackOne': 'Ужина',

  'macro.protein': 'Протеини',
  'macro.carbs': 'Угљени хидрати',
  'macro.fat': 'Масти',
  'macro.fiber': 'Влакна',
  'macro.proteinInitial': 'П',
  'macro.carbsInitial': 'У',
  'macro.fatInitial': 'М',

  // ---- History ------------------------------------------------------------
  'history.title': 'Историја',
  'history.thisMonth': 'Овај месец',
  'history.previousMonth': 'Претходни месец',
  'history.nextMonth': 'Следећи месец',
  'history.avgIntake': 'Просечан унос',
  'history.logged': 'Уписано',
  'history.exercise': 'Вежбање',
  'history.onTarget': 'У циљу',
  'history.under': 'Испод',
  'history.over': 'Преко',
  'history.noTarget': 'Без циља',
  'history.openInToday': 'Отвори у Данас →',
  'history.day': 'Дан',
  'history.nothingThatDay': 'Тог дана ништа није уписано.',
  'history.nothingYet': 'Још ништа није уписано.',
  'history.days': 'дана',
  'history.back': 'Назад',
  'history.proteinGrams': (grams: string) => `${grams}g протеина`,

  // ---- The composer -------------------------------------------------------
  // The everyday Serbian breakfast rather than a translated one.
  'composer.placeholder': 'Бурек и јогурт…',
  'composer.send': 'Пошаљи',
  'composer.logPackets': 'Упиши ова паковања',
  'composer.packetsStraightIn': 'Право у дневник, не рачуна се у лимит',
  'composer.packetsWithMessage': 'Иду уз твоју поруку',
  'composer.addPhoto': 'Додај фотографију или скенирај паковање',
  'composer.takePhoto': 'Фотографиши',
  'composer.choosePhoto': 'Изабери фотографију',
  'composer.scanBarcode': 'Скенирај бар-код',
  'composer.removePhoto': 'Уклони фотографију',
  'composer.setAmountFor': (name: string) => `Подеси количину: ${name}`,
  'composer.removeScan': (name: string) => `Уклони: ${name}`,
  'composer.cameraBlockedTitle': 'Day So Far не може да отвори камеру',
  'composer.cameraBlockedBody':
    'Приступ камери је искључен за ову апликацију, па је iOS неће отворити. Укључи га у Подешавањима или изабери фотографију из галерије.',
  'composer.openSettings': 'Отвори Подешавања',
  'composer.notNow': 'Не сада',
  'composer.photoUnreadable': 'Та фотографија не може да се прочита. Пробај другу.',
  'composer.selectedMeal': 'Изабрани оброк',
  // Sent in the reader's own voice; "шта сам појео" would be gendered, so it names the meal instead.
  'composer.labelHint': 'Ово је декларација — упиши оброк по њој.',
  'composer.photoTip':
    'Савет: остави виљушку, кашику или руку у кадру — тако се види колики је тањир, а то је најтеже проценити.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Профил',
  'setup.about': 'О теби',
  'setup.account': 'Налог',
  'setup.appearance': 'Изглед',
  'setup.dangerZone': 'Опасна зона',
  'setup.displayName': 'Име',
  'setup.sex': 'Пол',
  'setup.birthDate': 'Датум рођења',
  'setup.height': 'Висина',
  'setup.targetWeight': 'Циљна тежина',
  'setup.activity': 'Активност',
  'setup.goal': 'Циљ',
  'setup.units': 'Јединице',
  'setup.language': 'Језик',
  'setup.languageSuggested': 'Предложени',
  'setup.languageAll': 'Сви језици',
  'setup.dayStartsAt': 'Дан почиње у',
  'setup.timezone': 'Временска зона',
  'setup.email': 'Имејл',
  'setup.addressConfirmed': 'Адреса је потврђена',
  'setup.addressNotConfirmed': 'Адреса није потврђена',
  'setup.deleteTypeEmail':
    'Упиши адресу изнад да потврдиш. Овај налог се пријављује преко Google налога, па нема лозинке за проверу.',
  'setup.deleteAccount': 'Обриши налог',
  'setup.deleteFailed': 'Налог није могао да се обрише.',
  'setup.contactSupport': 'Пиши подршци',
  'setup.save': 'Сачувај',
  'setup.saving': 'Чување…',
  'setup.saved': 'Сачувано',
  'setup.savedTargetMoved': (from: string, to: string) => `Сачувано — дневни циљ ${from} → ${to} kcal`,
  'setup.savedTargetSame': (kcal: string) => `Сачувано — дневни циљ остаје ${kcal} kcal`,
  'setup.activitySedentary': 'Посао за столом, мало кретања',
  'setup.activityLight': 'Лагано вежбање 1–3 дана седмично',
  'setup.activityModerate': 'Умерено вежбање 3–5 дана седмично',
  'setup.activityActive': 'Напорно вежбање 6–7 дана седмично',
  'setup.activityVeryActive': 'Физички посао или тренинг двапут дневно',
  'setup.dailyTarget': 'Твој дневни циљ',
  'setup.optional': 'Необавезно',
  'setup.dayTitle': 'Дан',
  'setup.dayFooter':
    'Храна поједена пре почетка дана рачуна се у претходни дан — па ужина у један после поноћи иде на вече коме припада.',
  'setup.appearanceFooter': 'Системска тема прати уређај, укључујући његов распоред светлог и тамног режима.',
  // "Пријављен као" is gendered; this names the account instead.
  'setup.signedInAs': 'Пријављени налог',
  'setup.subtitle': 'Довољно да се израчуна почетни циљ. Прилагођава се како стижу стварни подаци.',
  'setup.targetDisclaimer':
    'Просечна вредност за особу твоје висине и тежине, а не медицински савет. После две седмице се коригује према ономе што уписујеш. Ако си трудна или дојиш, или имаш дијабетес, болест бубрега или слично стање, нека ти број одреди лекар, па га овде унеси ручно.',

  // ---- Coach ----------------------------------------------------------------
  'coach.title': 'Тренер',
  'coach.footerNone':
    'Тренер види оно што укључиш и може да пише у твој дневник. Ништа се не дели док не прихватиш код.',
  'coach.enterCode': 'Унеси код тренера',
  'coach.codePlaceholder': 'XXXX-XXXX',
  'coach.continue': 'Настави',
  // Names do not decline reliably, so every sentence about the coach keeps `name` in the nominative, as its subject.
  'coach.sharedWith': (name: string) => `${name} види твој дневник`,
  'coach.since': (date: string) => `повезано: ${date}`,
  'coach.scopeMeals': 'Оброци и фотографије',
  'coach.scopeMealsHint': 'Шта и када једеш',
  'coach.scopeWeight': 'Тежина',
  'coach.scopeWeightHint': 'Твоја мерења и тренд',
  'coach.scopeMetrics': 'Кораци, сан, пулс',
  'coach.scopeMetricsHint': 'Са телефона или сата',
  'coach.footerLinked': (name: string) =>
    `${name} може да подешава твоје циљеве за калорије и макросе. Увек можеш да их вратиш и да прекинеш дељење кад год хоћеш.`,
  'coach.stopSharing': 'Прекини дељење',
  'coach.stopConfirm': (name: string) =>
    `Прекинути дељење? ${name} од сада не види ништа ново. Коментари који су већ у дневнику остају.`,
  'coach.stop': 'Прекини',
  'coach.keep': 'Настави дељење',
  'coach.stopped': 'Дељење је прекинуто.',
  'coach.inviteTitle': (name: string) => `${name} жели да ти буде тренер`,
  'coach.willSee': 'Видеће',
  'coach.wontSee': 'Неће видети',
  'coach.seeMeals': 'Твоје оброке и њихове фотографије',
  'coach.seeTotals': 'Дневне калорије и макросе',
  'coach.seeWeight': 'Твоју тежину и циљеве',
  'coach.seeDays': 'Којим данима има уписа',
  'coach.notChat': 'Твој разговор са дневником',
  'coach.notMetrics': 'Кораке, сан и пулс, осим ако их укључиш',
  'coach.notEmail': 'Твој имејл и плаћања',
  'coach.accept': 'Прихвати',
  'coach.notNow': 'Не сада',
  'coach.close': 'Затвори',
  'coach.canStop': 'Дељење можеш да прекинеш кад год хоћеш у Подешавањима.',
  'coach.accepted': (name: string) => `Повезано: ${name}.`,
  'coach.alreadyLinked': (name: string) => `${name} већ види твој дневник. Прво прекини то дељење.`,
  'coach.invalid': 'Не препознајемо тај код.',
  'coach.expired': 'Тај код је истекао. Затражи нови од тренера.',
  'coach.used': 'Тај код је већ искоришћен.',
  'coach.bannerManage': 'Управљај',
  'coach.yourCoach': 'твој тренер',
  'coach.yourCoachCapital': 'Твој тренер',
  'coach.setByCoach': 'Подешава тренер',
  'coach.seatPlus': 'место код тренера доноси Plus',

  'setup.aboutTitle': 'О апликацији',
  'setup.privacyPolicy': 'Политика приватности',
  'setup.termsOfService': 'Услови коришћења',
  'setup.rateApp': 'Оцени апликацију',
  'setup.unsavedChanges': 'Несачуване измене',
  'setup.saveChanges': 'Сачувај измене',

  'setup.requiredMissing':
    'За израчунавање циља потребни су пол, датум рођења, висина, циљ и активност.',

  // ---- The first run ------------------------------------------------------
  'ob.back': 'Назад',
  'ob.continue': 'Настави',

  'ob.welcomeTitle': 'Хајде да направимо твој план',
  'ob.welcomeBody':
    'Шест кратких питања — око пола минута — и имаћеш циљ за калорије и протеине израчунат за твоје тело, а не за било кога. Све можеш да промениш касније.',
  'ob.welcomeStart': 'Почни',

  'ob.goalTitle': 'Шта желиш да постигнеш?',
  'ob.goalBody': 'Ово одређује да ли ћеш јести мање, колико или више него што сагориш.',
  // Answers in the reader's voice, as first-person present — no gendered past.
  'ob.goalLose': 'Да смршам',
  'ob.goalLoseHint': 'Умерен дефицит који стварно можеш да издржиш',
  'ob.goalMaintain': 'Да задржим тежину',
  'ob.goalMaintainHint': 'Једеш колико сагориш и пазиш на то',
  'ob.goalGain': 'Да добијем на тежини',
  'ob.goalGainHint': 'Мали вишак, уз довољно протеина да се искористи',

  'ob.sexTitle': 'За који пол да рачунамо?',
  'ob.sexBody':
    'Потрошња у мировању се довољно разликује да би нагађање померило циљ за пар стотина калорија дневно.',

  // "Када си рођен?" is gendered; asking for the date needs no participle.
  'ob.birthTitle': 'Који је твој датум рођења?',
  'ob.birthBody': 'Године су последње што је потребно за рачун потрошње.',
  'ob.birthAge': (count: number) => n(count, { one: 'година', few: 'године', other: 'година' }),
  'ob.birthTooYoung': 'Апликација је за узраст од 13 година навише.',
  'ob.birthImplausible': 'Провери годину — тај датум не изгледа добро.',

  'ob.bodyTitle': 'Твоја висина и тежина',
  'ob.bodyBody':
    'Отприлике је довољно. Тежина се уписује као прво мерење, па графикон почиње данас.',
  'ob.bodyHeight': 'Висина',
  'ob.bodyWeight': 'Тежина',
  'ob.bodyHeightOff': 'Та висина не изгледа добро — провери јединице.',
  'ob.bodyWeightOff': 'Та тежина не изгледа добро — провери јединице.',

  'ob.skip': 'Прескочи за сада',
  // The reader's voice; "нисам сигуран/сигурна" is gendered.
  'ob.activitySkip': 'Не знам — узми умерено',

  'ob.targetTitle': 'Која ти је циљна тежина?',
  'ob.targetBody':
    'Циљна тежина, да апликација може да каже колико си близу. Можеш да је помериш кад год хоћеш.',
  'ob.targetToGo': (amount: string) => `још ${amount}`,
  'ob.targetSame': 'Иста као сада',
  'ob.targetMustBeLower': 'Изабери нешто испод тренутне тежине.',
  'ob.targetMustBeHigher': 'Изабери нешто изнад тренутне тежине.',

  'ob.activityTitle': 'Колико се крећеш?',
  'ob.activityBody': 'Твоја обична седмица — без тренинга које уписујеш у апликацији.',

  'ob.buildingTitle': 'Правимо твој план',
  'ob.buildingStep1': 'Рачунамо колико сагориш',
  'ob.buildingStep2': 'Одређујемо дневне калорије',
  'ob.buildingStep3': 'Делимо протеине, угљене хидрате и масти',
  'ob.buildingFailed': 'План није могао да се сачува.',
  'ob.retry': 'Покушај поново',

  'ob.planEyebrow': 'Твој дневни циљ',
  'ob.planCalories': 'калорија дневно',
  'ob.planFootnote':
    'Полазна тачка, не пресуда. Сваке седмице се прилагођава према ономе што уписујеш и ономе што показује вага.',
  'ob.planStart': 'Почни да уписујеш',

  'sex.male': 'Мушки',
  'sex.female': 'Женски',

  'goal.lose': 'Мршављење',
  'goal.maintain': 'Одржавање',
  'goal.gain': 'Добијање тежине',

  // Read as "Активност: Умерена", so they agree with «активност» rather than describe a person.
  'activity.sedentary': 'Мало кретања',
  'activity.light': 'Лагана',
  'activity.moderate': 'Умерена',
  'activity.active': 'Висока',
  'activity.veryActive': 'Веома висока',

  'units.metric': 'Метричке',
  'units.imperial': 'Империјалне',

  'theme.label': 'Тема',
  'theme.system': 'Системска',
  'theme.light': 'Светла',
  'theme.dark': 'Тамна',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Пријави се',
  'auth.signInSubtitle': 'Пријави се и настави тамо где је стало.',
  'auth.createAccount': 'Направи налог',
  'auth.createAccountTitle': 'Направи свој налог',
  'auth.email': 'Имејл',
  'auth.password': 'Лозинка',
  'auth.passwordHint': 'Најмање 8 знакова.',
  'auth.showPassword': 'Прикажи лозинку',
  'auth.hidePassword': 'Сакриј лозинку',
  'auth.nameOptional': 'Име (необавезно)',
  'auth.continueWithGoogle': 'Настави са Google налогом',
  'auth.forgotPassword': 'Заборављена лозинка?',
  'auth.haveAccount': 'Већ имаш налог?',
  // "Нов си овде?" is gendered.
  'auth.newHere': 'Први пут овде?',
  'auth.signupsClosed': 'Регистрација на овом серверу је затворена.',
  'auth.googleFailed': 'Пријава преко Google налога није успела. Покушај поново или користи имејл и лозинку.',
  'auth.genericFailure': 'Нешто није у реду са пријавом. Покушај поново.',
  'auth.oneMoment': 'Само тренутак…',
  'auth.privacyPolicy': 'Политика приватности',
  'auth.language': 'Језик',
  'auth.or': 'или',
  'auth.createAccountSubtitle':
    'Затим реци дневнику нешто о себи и он ће израчунати твоје циљеве.',
  'auth.emailFirst': 'Прво упиши имејл, па ћу послати линк.',
  // The two link names stay in the nominative, so the sentence is «прихваташ да важе Услови… и Политика…».
  'auth.agreeBefore': 'Прављењем налога прихваташ да важе',
  'auth.terms': 'Услови коришћења',
  'auth.agreeAnd': 'и',
  'auth.agreeAfter': '.',
  'reset.linkSent': 'Ако та адреса има налог, линк за нову лозинку је на путу.',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Провери имејл',
  'verify.sentTo': (email: string) => `Послали смо шест цифара на ${email}. Унеси их и то је то.`,
  'verify.sentBlind': 'Послали смо ти шест цифара. Унеси их и то је то.',
  'verify.title': 'Потврди имејл',
  'verify.checkInbox': 'Провери пријемно сандуче',
  'verify.enterCode': 'Унеси код',
  'verify.sixDigitCode': 'Шестоцифрени код',
  'verify.confirm': 'Потврди',
  'verify.confirming': 'Потврђивање…',
  'verify.confirmed': 'Имејл је потврђен',
  'verify.alreadyConfirmed': 'Већ је потврђен',
  'verify.readyMessage': 'Ова адреса је подешена и спремна.',
  'verify.sendNewCode': 'Пошаљи нови код',
  'verify.sending': 'Слање…',
  'verify.startJournal': 'Почни дневник',
  'verify.signInFirst': 'Прво се пријави, па унеси код који смо ти послали.',
  'verify.signOutAndRestart': 'Одјави се и почни испочетка',
  'verify.linkFailed': 'Тај линк не ради',
  'verify.codeSent': 'Код за потврду потражи у пријемном сандучету.',
  'verify.sendAgain': 'Пошаљи поново',

  // ---- Cook ---------------------------------------------------------------
  'cook.title': 'Кухиња',
  'cook.kitchenEmpty': 'Кухиња ти је празна',
  'cook.things': (count: number) => n(count, { one: 'намирница', few: 'намирнице', other: 'намирница' }),
  'cook.toCheck': (count: number) => `· ${count} за проверу`,
  'cook.yourKitchen': 'Твоја кухиња',
  'cook.yourKitchenDesc': 'Од овога кувам. Довољно је да буде отприлике тачно.',
  'cook.thinking': 'Размишљам…',
  'cook.nothingLeftToday': 'За данас нема више',
  'cook.findMeSomething': 'Нађи ми нешто',
  'cook.anythingSpecific': 'Нешто посебно?',
  'cook.anythingSpecificDesc':
    'Све је необавезно. И без тога полазим од твоје кухиње и твог дана.',
  'cook.alreadyWriting': 'Већ пишем један…',
  'cook.noRunsLeft': 'За данас нема више рецепата',
  'cook.planTheWeek': 'Испланирај седмицу',
  'cook.forYou': 'За тебе',
  'cook.library': 'Библиотека',
  'cook.searchLibrary': 'Претражи библиотеку',
  'cook.emptyBefore': 'Још ништа. Притисни',
  'cook.emptyAfter':
    'и смислићу рецепт од онога што имаш у кухињи — или крени од фотографије или рецепта који већ имаш.',
  'cook.perPortion': 'по порцији',
  'cook.per': (unit: string) => `по ${unit}`,
  'cook.nothingMatching': (query: string) => `Ништа не одговара упиту „${query}“.`,
  'cook.libraryNote':
    'Прави рецепти из јавно доступне збирке USDA, поређани према томе колико састојака за сваки већ имаш.',

  // `things` is a list of food names in the nominative, so it follows a colon rather than a preposition.
  'cook.writingAround': (things: string) => `Пишем рецепт по фотографији: ${things}…`,
  'cook.writingFor': (asked: string) =>
    `Пишем рецепт за „${asked}“, од онога што је у кухињи…`,
  'cook.writingPlain': 'Пишем рецепт од онога што је у кухињи…',

  'cook.planLocked': 'Писање рецепата је део пакета Coach.',
  'cook.runs': (count: number) => n(count, { one: 'рецепт', few: 'рецепта', other: 'рецепата' }),
  'cook.planSpent': (runs: string) => `Искоришћено за данас: ${runs}.`,
  'cook.planSpentBack': (when: string) => ` Нови стиже ${when}.`,
  'cook.planEmptyKitchen':
    'Кухиња ти је празна, па ћу предложити нешто за шта је довољна једна мала куповина — и рећи шта да купиш.',
  'cook.planFromWants': 'Полазим од твоје жеље и онога што је у кухињи',
  'cook.planFromKitchen': 'Смислићу рецепт од онога што је у кухињи',
  'cook.planAtTarget': (from: string) =>
    `${from} — а данас си већ на циљу, па ће бити нешто лагано.`,
  'cook.planAiming': (from: string, kcal: string, protein: string) =>
    `${from}, за преосталих ${kcal} kcal и ${protein}g протеина.`,

  // ---- The recipe brief ---------------------------------------------------
  'brief.anythingElse': 'Још нешто?',
  'brief.wantsPlaceholder': '„у једној шерпи“, „да потрошим спанаћ“, „без коријандера“',
  'brief.time': 'Време',
  'brief.minutes': (count: number) => `${count} мин`,
  'brief.meal': 'Оброк',
  'brief.cook': 'Кувај',
  'brief.justTonight': 'Само за вечерас',
  'brief.portions': (count: number) => n(count, { one: 'порција', few: 'порције', other: 'порција' }),
  'brief.proteinAtLeast': 'Протеина бар',
  'brief.caloriesAtMost': 'Калорија највише',

  // ---- What you don’t eat -------------------------------------------------
  'diet.title': 'Шта не једеш',
  'diet.footer':
    'Важи за сваки предлог рецепта као строго ограничење, не као жеља. Не мења начин на који дневник уписује оно што стварно једеш — реци му шта је било и он ће то уписати.',
  'diet.none': 'Без ограничења',
  // Agree with an implied «исхрана»; "вегетаријанац" would gender the reader.
  'diet.vegetarian': 'Вегетаријанска',
  'diet.vegan': 'Веганска',
  'diet.pescatarian': 'Пескетаријанска',
  'diet.avoidPlaceholder': 'Још нешто — алергија, нешто што не волиш',
  'diet.stopAvoiding': (item: string) => `Више не избегавај: ${item}`,

  // ---- The fridge scan ----------------------------------------------------
  'scan.notAnImage': 'Тај фајл није слика коју могу да прочитам.',
  'scan.noFood': 'На тој фотографији не видим храну.',
  'scan.added': (count: number) =>
    `Додато: ${n(count, { one: 'намирница', few: 'намирнице', other: 'намирница' })}`,
  'scan.reading': 'Читам фотографију…',
  'scan.fromPhoto': 'Са фотографије',
  'scan.scanMyFridge': 'Скенирај мој фрижидер',
  'scan.whatICanSee': 'Шта видим',
  'scan.tapWrong': 'Додирни све што не одговара.',
  'scan.alreadyListed': '· већ на списку',
  'scan.adding': 'Додајем…',
  'scan.addToKitchen': 'Додај у моју кухињу',
  'scan.findingRecipes': 'Тражим рецепте…',
  'scan.cookWithThese': 'Кувај са овим',

  // ---- The kitchen list ---------------------------------------------------
  'pantry.addToList': 'Додај на списак',
  'pantry.addPlaceholder': 'пилетина, пиринач, паприке',
  'pantry.stillThere': (count: number) => `Још је ту? · ${count}`,
  'pantry.yes': 'Да',
  'pantry.removed': (name: string) => `Уклоњено: ${name}`,
  'pantry.remove': (name: string) => `Уклони: ${name}`,
  'pantry.emptyHint': 'Овде још нема ништа. Упиши неколико ствари изнад или фотографиши полицу.',
  'pantry.inTheKitchen': (count: number) => `У кухињи · ${count}`,
  'pantry.staples': (count: number) => `Основне намирнице · ${count}`,

  // ---- A recipe you already have ------------------------------------------
  'import.chip': 'Налепи рецепт',
  'import.title': 'Рецепт који већ имаш',
  'import.desc': 'Израчунаћу калорије, а кување остављам теби.',
  'import.unreadable': 'Ово не могу да прочитам као рецепт.',
  'import.saved': (title: string, kcal: string) => `Сачувано: ${title} — ${kcal} kcal по порцији`,
  'import.placeholder':
    'Налепи или упиши рецепт — састојке и припрему, како год да је записано.',
  'import.working': 'Рачунам бројке…',
  'import.workOutMacros': 'Израчунај макросе',

  // ---- A recipe -----------------------------------------------------------
  'recipe.save': 'Сачувај',
  'recipe.saved': 'Сачувано',
  'recipe.saveThis': 'Сачувај овај рецепт',
  'recipe.unsaveThis': 'Уклони из сачуваних',
  'recipe.usesYour': (things: string) => `Из твоје кухиње: ${things}`,
  'recipe.fitsToday': 'Уклапа се у остатак дана',
  'recipe.steps': (count: number) => n(count, { one: 'корак', few: 'корака', other: 'корака' }),
  'recipe.saveNamed': (title: string) => `Сачувај: ${title}`,
  'recipe.unsaveNamed': (title: string) => `Уклони из сачуваних: ${title}`,
  // `portions` arrives formatted ("4", "2½"): whole numbers pick their plural form, a fraction takes «порције».
  'recipe.forPortions': (portions: string) =>
    /^\d+$/.test(portions)
      ? `за ${n(Number(portions), { one: 'порцију', few: 'порције', other: 'порција' })}`
      : `за ${portions} порције`,
  'recipe.portionsCount': (count: number) => n(count, { one: 'порција', few: 'порције', other: 'порција' }),
  'recipe.howToMakeIt': (steps: string) => `Припрема · ${steps}`,
  'recipe.ingredientsMakes': (portions: string) =>
    /^\d+$/.test(portions)
      ? `Састојци · за ${n(Number(portions), { one: 'порцију', few: 'порције', other: 'порција' })}`
      : `Састојци · за ${portions} порције`,
  // "Појео сам" is gendered; the button says what happened to the dish instead.
  'recipe.iAteThis': (kcal: string) => `Поједено · ${kcal} kcal`,
  'recipe.openFull': 'Отвори цео рецепт',
  'recipe.backToCook': 'Назад у Кухињу',
  'recipe.logged': (what: string, kcal: string) => `Уписано: ${what} — ${kcal} kcal`,
  'recipe.forServings': (servings: string, unit: string) => `за ${servings} × ${unit}`,
  'recipe.publicDomain': 'јавно власништво',
  'recipe.iAteThisPlain': (kcal: string) => `Поједено · ${kcal}`,
  'recipe.youdNeed': (things: string) => `Требаће ти: ${things}`,
  'recipe.fromLibrary': 'Из библиотеке',
  'recipe.madeForYou': 'Направљен за тебе',
  'recipe.madeForKitchen': 'Направљен за твоју кухињу',
  'recipe.adaptedForYou': 'Прилагођен теби',
  'recipe.yourOwn': 'Твој рецепт',
  'recipe.seeOriginal': 'Погледај оригинал',
  'recipe.writtenAgainst': (kcal: string, date: string) =>
    ` Написан према преосталих ${kcal} kcal за дан: ${date}.`,
  'recipe.ingredients': 'Састојци',
  'recipe.notInKitchen': '· нема у кухињи',
  'recipe.method': 'Припрема',
  'recipe.showMethod': 'Прикажи припрему',
  'recipe.hideMethod': 'Сакриј припрему',
  'recipe.logging': 'Уписујем…',
  'recipe.yesTonight': 'да, вечерас',
  'recipe.yesNow': 'да, сада',
  'recipe.howMuch': 'Колико је поједено?',
  'recipe.less': 'Мање',
  'recipe.more': 'Више',
  'recipe.servingsCount': (servings: string) =>
    /^\d+$/.test(servings)
      ? n(Number(servings), { one: 'порција', few: 'порције', other: 'порција' })
      : `${servings} порције`,
  'recipe.portion': 'порција',
  'recipe.makeItFit': 'Прилагоди мени',
  'recipe.reworking': 'Прерађујем…',
  'recipe.notInLibrary': 'Тог рецепта нема у библиотеци.',
  'recipe.notHere': 'Тог рецепта више нема.',
  'recipe.nothingCameBack': 'Од тога ништа није стигло.',
  'recipe.ingredientsNote':
    'Мерено за готово јело, како је објављено — зато нема бројки по састојку.',
  'recipe.confidenceHigh': 'Ове бројке су тачне колико год апликација може без мерења.',
  'recipe.confidenceMedium':
    'Бројке су процена — довољно блиске за упис, али вреди још једном погледати ако је битно.',
  'recipe.confidenceLow': 'Ове бројке су грубо нагађање. Измери шта можеш ако је дан тесан.',
  'recipe.tileQualifier': (protein: string, serving: string) =>
    `kcal · ${protein}g протеина · ${serving}`,
  'recipe.kcalPer': (serving: string) => `kcal · ${serving}`,
  'recipe.makes': (count: number) => `За ${n(count, { one: 'порцију', few: 'порције', other: 'порција' })}`,

  // ---- Progress -----------------------------------------------------------
  'progress.title': 'Напредак',
  'progress.daysWindow': (count: number) => n(count, { one: 'дан', few: 'дана', other: 'дана' }),
  'progress.daysShort': (count: number) => `${count}д`,
  'progress.weightTitle': '⚖️  Тежина',
  'progress.noWeighIns': 'Још нема мерења. Упиши једно испод или само реци дневнику.',
  'progress.noWeighIn': 'Без мерења',
  'progress.trendReadout': (value: string) => `Просек 7 дана ${value} — линија`,
  'progress.thisWeek': 'ове седмице',
  'progress.avg7d': 'Просек 7 дана',
  'progress.sinceStart': 'Од почетка',
  'progress.toTarget': 'До циља',
  'progress.logTodaysWeight': (unit: string) => `Упиши данашњу тежину (${unit})`,
  'progress.caloriesTitle': '🔥  Калорије',
  'progress.avgDayTarget': (target: string) => `просек/дан · циљ ${target}`,
  'progress.proteinTitle': '💪  Протеини',
  'progress.hitTargetBefore': 'Циљ погођен у',
  'progress.ofDays': (hit: string, logged: string) => `${hit} од ${logged}`,
  'progress.hitTargetAfter': 'уписаних дана.',
  'progress.qualityTitle': '🥦  Квалитет исхране',
  'progress.days': (count: number) => n(count, { one: 'дан', few: 'дана', other: 'дана' }),
  'progress.qualityFooter': (days: string, percent: string) =>
    `Просек за ${days} — ове податке има ${percent}% уписаног.`,
  'progress.chartNutrient': (label: string) => `Прикажи на графикону: ${label}`,
  'progress.exerciseTitle': '🏃  Вежбање',
  // "зашто нисам смршао" would be gendered; the present tense asks the same thing.
  'progress.exerciseFooter':
    'Питај дневник било шта о овим подацима — „зашто ове седмице не губим тежину?“',
  'progress.sessionsOver': (kcal: string, days: string) =>
    `тренинга · ~${kcal} kcal за ${days} дана`,
  'progress.qualityLine': (label: string, aim: string, target: string) =>
    `${label}, дневни просек · ${aim} ${target}`,
  'progress.aimFor': 'бар',
  'progress.keepUnder': 'највише',

  // ---- Exercise -----------------------------------------------------------
  'exercise.title': 'Вежбање',
  'exercise.nothingLogged': (days: string) => `Ништа није уписано у последњих ${days} дана.`,
  'exercise.tellTheJournal': (example: string) => `Реци дневнику — „трчање, ${example}“.`,
  'exercise.consistencyTitle': '🔁  Доследност',
  'exercise.activeOf': (days: string, sessions: string) => `активних од ${days} дана · ${sessions}`,
  'exercise.sessionsCount': (count: number) => n(count, { one: 'тренинг', few: 'тренинга', other: 'тренинга' }),
  'exercise.burnedPerDay': 'Сагорене калорије по дану',
  'exercise.burned': 'Сагорело',
  'exercise.distance': 'Раздаљина',
  'exercise.time': 'Време',
  'exercise.sessionsTitle': '🏃  Тренинзи',
  'exercise.burnNote': (example: string) =>
    `Сагореле калорије су процена и никад се не одузимају од циља. Исправи у дневнику — „то трчање је било ближе ${example}“.`,
  'exercise.minutes': (minutes: string) => `${minutes} мин`,
  'exercise.restDay': 'Дан одмора',
  'exercise.moreSessions': (count: string) => `+${count} још`,

  // ---- Saved workouts -----------------------------------------------------
  'workouts.logTitle': '🏋️  Упиши тренинг',
  'workouts.logAction': 'Упиши тренинг',
  'workouts.savedTitle': '🏋️  Сачувани тренинзи',
  'workouts.buildOne': 'Направи',
  'workouts.reuseHint': 'Један додир попуњава целу картицу, са тежинама од прошлог пута.',
  'workouts.whereSessionsGo':
    'Тренинзи које упишеш појављују се у историји испод. Овај списак је само за тренинге које желиш да понављаш.',
  'workouts.loadFailed': 'Сачувани тренинзи нису могли да се учитају.',
  'workouts.noneSavedTitle': 'Још нема сачуваних тренинга.',
  'workouts.noneSavedHint':
    'Сачуван тренинг је списак који поново користиш — упиши тренинг са вежбама и прихвати понуду да му даш име, или направи један овде.',
  'workouts.exerciseCount': (count: number) => n(count, { one: 'вежба', few: 'вежбе', other: 'вежби' }),
  'workouts.doneTimes': (times: string) => ` · урађено ${times}×`,
  'workouts.editNamed': (name: string) => `Измени: ${name}`,
  'workouts.deleteNamed': (name: string) => `Обриши: ${name}`,
  'workouts.weekTitle': '🗓️  Твоја седмица',
  'workouts.weekFooter':
    'Дани које подесиш су фиксни. Дани које оставиш отворене прате оно што стварно наставиш да радиш.',
  // `day` is a weekday name in the nominative; «за среду» would need the accusative, so a dash instead.
  'workouts.workoutFor': (day: string) => `Тренинг — ${day}`,
  'workouts.usually': (workout: string) => `${workout} — обично`,
  // "ти си подесио" is gendered.
  'workouts.youSetThis': 'твој избор',
  'workouts.learned': 'научено',
  'workouts.editTitle': '✏️  Измени тренинг',
  'workouts.buildTitle': '🏋️  Направи тренинг',
  'workouts.icon': 'Иконица',
  'workouts.namePlaceholder': 'Груди, Ноге А, Леђа…',
  'workouts.nameLabel': 'Назив тренинга',
  'workouts.sets': (count: number) => n(count, { one: 'серија', few: 'серије', other: 'серија' }),
  'workouts.oneFewerSet': (exercise: string) => `Једна серија мање — ${exercise}`,
  'workouts.oneMoreSet': (exercise: string) => `Једна серија више — ${exercise}`,
  'workouts.removeExercise': (exercise: string) => `Уклони: ${exercise}`,

  // ---- Resetting a password -----------------------------------------------
  'plan.title': 'Ова седмица',
  'plan.subtitle': 'Вечере, одмерене према твојим циљевима. Један додир уписује вечеру кад је скуваш.',
  'plan.weekTitle': (range: string) => `📅  ${range}`,
  'plan.weekFooter': 'Отвори вече да прочиташ припрему или га прескочи ако ниси код куће.',
  'plan.nothingYet': 'За ову седмицу још ништа није испланирано.',
  'plan.askInBefore': 'Попуни седмицу испод или је затражи у',
  'plan.journal': 'дневнику',
  'plan.howToTitle': '🍳  Како се планира седмица',
  'plan.howToBefore':
    'Ово је најскупље што кухиња ради, па се покреће једном, а после мењаш. Или реци у',
  'plan.howToAfter': '— „испланирај ми вечере за ову седмицу, двоје нас, ништа дуже од 30 минута“.',
  'plan.anythingHappening': 'Нешто посебно ове седмице?',
  'plan.wantsPlaceholder': '„у четвртак нисам код куће“, „да потрошим тиквицу“',
  'plan.howManyItFeeds': 'За колико особа',
  'plan.howManyItFeedsHint': 'Свака вечера се кува за толико.',
  'plan.people': (count: number) => n(count, { one: 'особа', few: 'особе', other: 'особа' }),
  'plan.cookOnce': 'Скувај једном, једи двапут',
  'plan.cookOnceHint':
    'Веће кување покрива и следеће вече, па у седмици има мање вечери за шпоретом.',
  'plan.longestCook': 'Најдуже кување',
  'plan.longestCookHint': 'Ниједна вечера у седмици не траје дуже од овога.',
  'plan.anyLength': 'Без ограничења',
  'plan.any': 'Било колико',
  'plan.minutesShort': (minutes: string) => `${minutes} мин`,
  'plan.minutesLabel': (minutes: string) => `${minutes} минута`,
  'plan.writing': 'Пишем седмицу…',
  'plan.again': 'Испланирај поново',
  'plan.planTheWeek': 'Испланирај седмицу',
  'plan.kcalProtein': (protein: string) => `kcal · ${protein}g протеина`,
  'plan.coversNext': 'Довољно и за следеће вече',
  'plan.coversMore': (nights: string) => `Довољно за још ${nights} вечери`,
  'plan.cooked': 'Скувано',
  'plan.skipNamed': (day: string) => `Прескочи: ${day}`,
  'plan.nothingPlanned': 'Ништа није испланирано',
  'plan.nightsCount': (count: number) => n(count, { one: 'вече', few: 'вечери', other: 'вечери' }),

  'shopping.title': '🧺  Списак за куповину',
  'shopping.haveAlready': (things: string) =>
    `Изостављено јер већ има у кухињи: ${things}.`,
  'shopping.addToList': 'Додај на списак',
  'shopping.placeholder': 'убруси, кесе за смеће',
  'shopping.addHint':
    'За све што ниједан рецепт не би тражио. Састојци испод долазе из седмице.',
  'shopping.empty': 'На списку још нема ништа. Испланирај седмицу или упиши шта ти треба.',
  'shopping.putBack': (name: string) => `Врати на списак: ${name}`,
  'shopping.tickOff': (name: string) => `Означи: ${name}`,
  'shopping.takeOff': (name: string) => `Скини са списка: ${name}`,

  // ---- The barcode scanner ------------------------------------------------
  // The pack's label is a «декларација» in Serbia; the nutrition panel on it is the «табела нутритивних вредности».
  'barcode.isThisIt': 'Да ли је ово то?',
  'barcode.scanThePacket': 'Скенирај паковање',
  'barcode.sayHowMuch': 'Реци колико је поједено.',
  'barcode.pointAtIt': 'Усмери камеру на бар-код — стижу подаци са декларације.',
  'barcode.noCamera':
    'Овде нема камере — фотографиши бар-код и прочитаћу га са слике.',
  'barcode.reading': 'Читам…',
  'barcode.photographInstead': 'Фотографиши га',
  'barcode.unreadable': 'Не видим бар-код на овоме — пробај да бар-код заузме већи део кадра.',
  'barcode.badFormat': 'Тај формат слике не могу да прочитам — JPEG или PNG ће радити.',
  'barcode.aServing': (mass: string) => `${mass} по порцији`,
  'barcode.weighIt': 'Измери',
  'barcode.servings': 'порције',
  'barcode.weighed': 'измерено',
  'barcode.howMuchIn': (unit: string) => `Колико је поједено (${unit})`,
  'barcode.sourceOff': 'Подаци: Open Food Facts',
  'barcode.sourceUsdaLong': 'Подаци: USDA FoodData Central',
  'barcode.sourceUsda': 'Подаци: USDA',
  'barcode.wrongPacket': 'Погрешно паковање?',
  'barcode.notFound': 'Није пронађено',
  'barcode.notFoundBody':
    'Ово још нико није унео у базу — многе робне марке продавница никад и не буду. Фотографиши табелу нутритивних вредности и прочитаћу је са декларације.',
  'barcode.photographLabel': 'Фотографиши декларацију',
  'barcode.scanDifferent': 'Скенирај друго паковање',

  'repeat.footer':
    'Уписује се са данашњим временом. Ако је порција била другачија, само реци у дневнику и исправићу.',
  'repeat.search': 'Претражи своје оброке',
  'repeat.kcalProtein': (kcal: string, protein: string) => `${kcal} kcal · ${protein}g протеина`,
  'repeat.logAgainNamed': (what: string) => `Упиши поново: ${what}`,
  'repeat.adding': 'Додајем…',

  'editor.needsAnItem': 'Оброку треба бар једна ставка. Да га обришем?',
  'editor.needsAName': 'Шта је било? Оброку треба назив.',
  // "Упиши сам" is gendered.
  'editor.logItYourself': 'Упиши ручно',
  'editor.fixWhatsWrong': 'Исправи шта не ваља',
  'editor.whatThisWas': 'Шта је ово било',
  'editor.whatWasIt': 'Шта је било?',
  'editor.itemName': (index: string) => `Назив ставке ${index}`,
  'editor.itemPlaceholder': 'Ставка',
  'editor.removeItem': (what: string) => `Уклони: ${what}`,
  'editor.itemFallback': (index: string) => `ставка ${index}`,
  'editor.itemQuantity': (index: string) => `Количина ставке ${index}`,
  'editor.howMuch': 'колико',
  'editor.itemCalories': (index: string) => `Калорије ставке ${index}`,
  'editor.itemProtein': (index: string) => `Протеини ставке ${index}`,
  'editor.itemCarbs': (index: string) => `Угљени хидрати ставке ${index}`,
  'editor.itemFat': (index: string) => `Масти ставке ${index}`,
  'editor.adjustedHeading': 'Сачувано. Неке вредности нису могле да се сачувају како су унете:',
  'editor.adjustedMass': (name: string) => `${name} — протеини, угљени хидрати и масти теже више од саме хране`,
  'editor.adjustedCeiling': (name: string) => `${name} — толико хране не може да има толико калорија`,
  'editor.adjustedFloor': (name: string) => `${name} — макроси носе више калорија од тога`,
  'editor.anotherItem': 'још једна ставка',
  'editor.log': 'Упиши',
  'editor.saveTotal': (verb: string, kcal: string) => `${verb} · ${kcal} kcal`,

  // ---- Cards in the conversation ------------------------------------------
  'chat.removed': 'Уклоњено',
  'chat.openWeekPlan': 'Отвори план за седмицу',
  'chat.thisWeeksDinners': 'Вечере ове седмице',
  'chat.nights': (count: number) => n(count, { one: 'вече', few: 'вечери', other: 'вечери' }),
  'chat.nothingPlanned': 'Ништа није испланирано',
  'chat.burnEstimate': 'Сагореле калорије су процена',
  'chat.notAddedToBudget': ' · не повећава дневни циљ',
  'chat.editNamed': (name: string) => `Измени: ${name}`,
  'chat.notAWeight': 'То није тежина.',
  'chat.editWeighIn': 'Измени ово мерење',
  'chat.notEnoughDays': 'Још нема довољно уписаних дана за тренд.',
  'chat.lastWeek': 'Прошла седмица',
  'chat.nothingLogged': 'Ништа није уписано',
  'chat.kcalTitle': (kcal: string) => `${kcal} kcal`,
  'chat.nothingLoggedThisWeek': 'Ове седмице ништа није уписано.',
  'chat.weekSummary': (days: string, onTarget: string) =>
    `Уписано: ${days}, од тога ${onTarget} у оквиру 10% од циља.`,
  'chat.aDayAgainst': (target: string) => `дневно, циљ ${target}`,
  'chat.onTheScale': 'на ваги',
  'chat.burnedOver': (sessions: string) => `сагорело за ${sessions}`,
  'chat.proteinADayAgainst': (target: string) => `протеина дневно, циљ ${target}`,
  'chat.showLess': 'Прикажи мање',
  'chat.readTheRest': (count: string) => `Прочитај остатак (још ${count})`,
  'chat.atLoad': (loads: string) => ` са ${loads}`,
  'chat.setsCount': (count: number) => n(count, { one: 'серија', few: 'серије', other: 'серија' }),
  'chat.ofTarget': (target: string) => `од ${target}`,
  'chat.avg': 'просек',
  // `date` may carry a weekday, so it follows «за дан» rather than a preposition that would decline it.
  'chat.onDate': (date: string) => `за дан ${date}`,

  // ---- The journal --------------------------------------------------------
  'journal.promptEggs': 'Два јаја, хлеб и кафа',
  'journal.promptLunch': 'Пилетина и пиринач за ручак',
  'journal.promptRun': (distance: string) => `Трчање, ${distance}`,
  'journal.promptProtein': 'Да ли уносим довољно протеина?',
  'journal.emptyTitle': 'Шта је данас било за јело?',
  'journal.emptyBody':
    'Напиши или фотографиши — како ти је лакше. Без формулара, без претраге. Реци шта је било, а ја ћу израчунати остало.',
  'journal.over': (kcal: string) => `${kcal} преко`,
  'journal.left': (kcal: string) => `још ${kcal}`,
  'journal.burned': (kcal: string) => `−${kcal} сагорело`,
  'journal.net': (kcal: string) => ` · нето ${kcal} kcal`,
  'journal.loggedMeal': 'Уписан оброк',
  'journal.thinking': 'Размишљам',
  'journal.lost':
    'Веза је прекинута пре него што је одговор стигао. Шта год да је уписано, биће ту кад се вратиш.',

  // The app's own voice, first person present, like bg's.
  'tool.log': 'Уписујем',
  'tool.update': 'Ажурирам',
  'tool.delete': 'Уклањам',
  'tool.get': 'Проверавам',
  'tool.search': 'Гледам уназад',
  'tool.find': 'Тражим',
  'tool.set': 'Чувам',
  'tool.show': 'Цртам',
  'tool.suggest': 'Смишљам',
  'tool.import': 'Увозим',
  'tool.adapt': 'Прилагођавам',
  'tool.save': 'Чувам',
  'tool.plan': 'Планирам',
  'tool.cook': 'Кувам',
  'tool.repeat': 'Понављам',
  'tool.remember': 'Памтим',
  'tool.forget': 'Заборављам',
  'tool.lookup': 'Тражим податке',
  'tool.run': 'Покрећем',
  'tool.define': 'Дефинишем',
  'tool.ask': 'Питам',

  // ---- The workout card ---------------------------------------------------
  'workout.strength': 'Тегови',
  'workout.cardio': 'Кардио',
  'workout.class': 'Групни час',
  'workout.sport': 'Спорт',
  'workout.flexibility': 'Покретљивост',
  'workout.fallbackName': 'Тренинг',
  'workout.savedRoutine': (name: string) => `Сачувано „${name}“ — следећи пут једним додиром`,
  'workout.routineNotSaved': 'Уписано, али чување тренинга није успело',
  'workout.updated': (what: string, kcal: string) => `Ажурирано: ${what} — сада ~${kcal} kcal`,
  'workout.logged': (what: string, kcal: string) => `Уписано: ${what} — ~${kcal} kcal`,
  'workout.change': 'Промени',
  'workout.yourWorkouts': 'Твоји тренинзи',
  'workout.today': '· данас',
  'workout.howLong': 'Колико дуго?',
  // "шта си радио" is gendered.
  'workout.addWhatYouDid': 'Додај шта је урађено',
  // `when` is «јуче», a weekday or a date, which no preposition takes in one case, hence the colon.
  'workout.sameAs': (when: string) => `Понови: ${when}`,
  'workout.exerciseCount': (count: number) =>
    `(${n(count, { one: 'вежба', few: 'вежбе', other: 'вежби' })})`,
  'workout.yours': '· твој',
  'workout.saveThisAs': (name: string) => `Сачувај као „${name}“`,
  'workout.nameForThis': 'Назив овог тренинга',
  'workout.dontSave': 'Не чувај као тренинг',
  'workout.saveChanges': 'Сачувај измене',
  'workout.logSession': 'Упиши овај тренинг',
  'workout.fixWhatsWrong': 'Исправи шта не ваља',
  'workout.whatDidYouDo': 'Шта је било на тренингу?',
  'workout.roughlyIsFine': 'Отприлике је довољно.',
  'workout.reps': 'понављања',
  'workout.min': 'мин',
  'workout.removeSet': (index: string) => `Уклони серију ${index}`,
  'workout.anotherSet': 'Још једна серија',
  'workout.removeNamed': (name: string) => `Уклони: ${name}`,

  // ---- The weekly review --------------------------------------------------
  'review.lastWeek': '📅  Прошла седмица',
  'review.title': '📅  Седмични преглед',
  'review.pitch':
    'Сваког понедељка ујутру стиже кратак осврт на то како је прошла седмица — шта су бројке стварно показале и да ли циљ треба померити. Без предавања, само слика.',
  'review.writing': 'Пишем…',
  'review.writeOne': 'Напиши један сада',
  'review.currentTarget': (kcal: string) => `Циљ ${kcal} kcal.`,
  'review.willApply': 'Следећи преглед ће ово применити. ',
  'review.kcalUnit': (kcal: string) => `${kcal} kcal`,
  'review.partOf': (plan: string) => `Део пакета ${plan}`,

  'quality.title': '🥦\u00a0\u00a0Квалитет исхране',
  'quality.partlyMeasured': 'делимично измерено',
  'quality.notEstimated': 'без процене',

  'nutrient.sodium': 'Натријум',
  'nutrient.satFat': 'Засић. масти',
  'nutrient.sugar': 'Шећер',

  'chart.daily': 'Дневни графикон',
  'chart.arrowHint': (label: string) => `${label}. Стрелицама читаш дан по дан.`,
  'chart.touchHint': 'Графикон. Додирни и превуци да читаш дан по дан.',

  // ---- What the phone says and the web does not ---------------------------
  'cook.photographFridge': 'фотографиши фрижидер',
  'cook.kitchenLocked': 'Кухиња је део пакета Coach',
  'cook.kitchenLockedBody':
    'Фотографиши фрижидер, добиј рецепт написан по ономе што је унутра и одатле испланирај седмицу вечера. Библиотека рецепата испод остаје бесплатна — прегледај је, кувај по њој, уписуј.',
  'cook.emptyLockedBefore': 'Овде још нема ништа. Картица',
  'cook.emptyLockedAfter': 'изнад је пуна рецепата које можеш да скуваш и упишеш бесплатно.',
  'cook.emptyAfterShort': 'и смислићу рецепт од онога што имаш у кухињи.',
  'cook.workOutCalories': 'Израчунај калорије',
  'cook.readingIt': 'Читам…',

  'scan.photographShelf': 'Фотографиши полицу',
  'scan.looking': 'Гледам…',
  'scan.scanYourFridge': 'Скенирај фрижидер',
  // Marks an item the scan is unsure of; impersonal, so the app has no gender either.
  'scan.notSure': 'није сигурно',
  'scan.isThisIt': 'Да ли је ово оно што видим?',
  'scan.addToKitchenShort': 'Додај у кухињу',
  'scan.cooking': 'Кувам…',
  'scan.cookFromThese': 'Кувај од овога',
  'pantry.stillHaveIt': 'Још имам',
  'pantry.iStillHave': (name: string) => `Још имам: ${name}`,

  'barcode.title': 'Скенирај бар-код',
  'barcode.lookingUp': 'Тражим…',
  'barcode.pointAtBarcode': 'Усмери на бар-код',
  'barcode.checkingCamera': 'Проверавам камеру…',
  'barcode.needsCamera': 'Скенеру треба камера.',
  'barcode.iAteThis': 'Поједено',
  'barcode.howMany': 'Колико комада?',
  'barcode.howMuch': 'Колико?',
  'barcode.scanAnother': 'Скенирај још једно',
  'barcode.addToMessage': 'Додај у поруку',
  'barcode.setTheAmount': 'Подеси количину',
  'barcode.added': (name: string) => `${name} — додато`,
  'barcode.addedToMessage': (count: number) =>
    `У поруку додато: ${n(count, { one: 'паковање', few: 'паковања', other: 'паковања' })}`,
  'barcode.nothingAddedYet': 'Још ништа није додато',
  'barcode.nothingUploaded': 'Ништа се не шаље — код се чита на телефону.',
  'barcode.allowCamera': 'Дозволи приступ камери',
  'barcode.perBasis': (kcal: string, protein: string, basis: string) =>
    `${kcal} kcal · ${protein}g протеина на ${basis}`,
  'barcode.tapToType': 'Додирни број да га укуцаш',
  'barcode.totalLine': (protein: string, mass: string) => `kcal · ${protein}g протеина · ${mass}`,
  'barcode.partialTitle': 'За ово постоје само делимични подаци.',
  'barcode.partialHint':
    'Није довољно за упис. Фотографиши табелу нутритивних вредности и дневник ће је прочитати.',
  'barcode.notCatalogued': 'Овога нема у бази.',
  'barcode.notCataloguedHint':
    'Робне марке продавница често нису у бази. Фотографиши табелу нутритивних вредности и дневник ће је прочитати.',

  'composer.listening': 'Слушам…',
  'composer.stopListening': 'Престани да слушаш',
  'composer.sayWhatYouAte': 'Реци шта је било за јело',
  'composer.addPhotoShort': 'Додај фотографију',

  'workouts.logActionMobile': '+ Упиши тренинг',
  'workouts.oneFewerSetShort': 'Једна серија мање',
  'workouts.oneMoreSetShort': 'Једна серија више',
  'workouts.noneSavedMobile':
    'Још нема сачуваних тренинга. Сачуван тренинг је списак који поново користиш — упиши тренинг са вежбама и прихвати понуду да му даш име, или направи један овде.',
  'workouts.routineOn': (name: string, day: string) => `${name} — ${day}`,
  'workouts.set': 'подешено',
  'workouts.learnedGuess': (name: string) => `${name}?`,
  'workout.classMobile': 'Групни час',
  'workout.flexibilityMobile': 'Истезање',
  'workout.routineNotSavedMobile': 'Уписано, али тренинг није сачуван',
  'workout.nameIt': 'Дај му име',
  'workout.logIt': 'Упиши',
  'workout.sameAsShort': (when: string) => `↻ понови: ${when}`,
  'workout.lastTime': (figure: string) => `прошли пут ${figure}`,
  'workout.adjust': 'Подеси',
  'workout.setsDiffered': 'Серије се разликују',
  'workout.sameEverySet': 'Исто у свакој серији',
  'workout.setsLabel': 'серије',
  'workout.searchExercises': 'Претрага — назив или мишић',
  // "Ове си радио" is gendered; the participle agrees with the exercises instead.
  'workout.doneThese': 'Већ рађене',
  'workout.browseMuscle': 'Или бирај по мишићу',
  'workout.addNamed': (name: string) => `＋ Додај „${name}“`,
  'workout.nothingMatches': 'Ништа не одговара',
  'workout.otherLength': 'Друго',
  'workout.minutesLabel': 'Минути',

  'editor.anotherItemLabel': 'још једна ставка',

  'plan.cookTab': 'Кухиња',
  'plan.theWeek': 'Седмица',
  'plan.locked': 'Планирање седмице је део пакета Coach',
  'plan.planItTitle': '🗓  Испланирај',
  'plan.wantsPlaceholderShort': 'Нешто на уму? — „ништа са рибом“',
  'plan.peopleUnit': 'особе',
  'plan.minUnit': 'мин',
  'plan.batchWhereItHelps': 'Кувај унапред где има смисла',
  'plan.batchCooking': 'Кување унапред',
  'plan.planning': 'Планирам…',
  'plan.dinnersTitle': '🍽  Вечере',
  'plan.lockedBody':
    'Седам вечера према твојим циљевима и ономе што већ имаш у кухињи, са кувањем унапред где има смисла и већ написаним списком за куповину.',
  'plan.planItFooter':
    'Седам вечера према твојим циљевима и ономе што већ има у кухињи. Кување унапред значи да једно кување покрива две вечери.',
  'plan.cookingFor': 'Кување за',
  'plan.atMost': 'Највише',
  'plan.batchHint': 'Једно кување за две вечери.',
  'plan.covers': (count: number) => ` · покрива ${n(count, { one: 'вече', few: 'вечери', other: 'вечери' })}`,
  'plan.cookedNamed': (title: string) => `Скувано: ${title}`,
  'plan.clearNamed': (day: string) => `Испразни: ${day}`,
  'shopping.titleShort': '🧾  Куповина',
  'shopping.addSomethingElse': 'Додај још нешто',
  'shopping.alreadyHave': (things: string) => `Изостављено јер то већ имаш: ${things}.`,
  'shopping.nothingToBuy': 'Још нема шта да се купи.',

  'progress.openExerciseTab': 'Отвори картицу Вежбање',
  'quality.fillThemselvesIn': 'Реци дневнику шта је било за јело и ове вредности ће се попунити саме.',
  'quality.partialCoverage': (percent: string) =>
    `Само ${percent}% данашњих калорија има ове податке, па су збирови доња граница, а не цео дан.`,
  'quality.spentTail': (spent: string, plan: string, allowed: string) =>
    `${spent} — ${plan} укључује ${allowed} месечно.`,
  'quality.estimateNote': (tail: string) =>
    `Ове четири вредности процењује модел, па их имају само оброци које упише дневник — укуцани, поновљени и скенирани остају празни. ${tail}`,

  // ---- The store ----------------------------------------------------------
  'plans.spent': 'Пакет је искоришћен',
  'plans.upgrade': 'Надогради',
  'plans.seeWhatAdds': (plan: string) => `Шта доноси ${plan}`,
  'plans.remainingHint': (remaining: string) => `${remaining}. Погледај пакете.`,
  'plans.hide': 'Сакриј',
  // "Добро дошао назад" is gendered.
  'plans.restored': 'Враћено. Све је опет ту.',
  'plans.restoredShort': 'Враћено.',
  'plans.noneFound': 'На овом налогу продавнице није пронађена претплата.',
  'plans.keepItGoing': 'Настави даље.',
  'plans.yearly': 'Годишње',
  'plans.monthly': 'Месечно',
  'plans.oneMoment': 'Само тренутак…',
  'plans.bestValue': 'Најисплативије',
  'plans.messagesHeading': 'Више порука',
  'plans.messagesBody':
    'Поврх онога што пакет даје сваког месеца. Плаћа се једном, није претплата — трају док их не искористиш.',
  'plans.messagesCount': (count: number) => n(count, { one: 'порука', few: 'поруке', other: 'порука' }),
  'plans.messagesAdded': (count: number) =>
    `Додато: ${n(count, { one: 'порука', few: 'поруке', other: 'порука' })}.`,
  'plans.messagesOnTheWay': 'Плаћено. Поруке стижу за тренутак.',
  'plans.messagesBuyHint': (count: number, price: string) =>
    `Купи ${n(count, { one: 'поруку', few: 'поруке', other: 'порука' })} за ${price}`,
  'plans.scansHeading': 'Више скенирања фотографија',
  'plans.scansBody': 'Плаћа се једном, није претплата. Трају док их не искористиш.',
  'plans.scansCount': (count: number) =>
    n(count, { one: 'скенирање фотографије', few: 'скенирања фотографије', other: 'скенирања фотографија' }),
  'plans.scansAdded': (count: number) =>
    `Додато: ${n(count, { one: 'скенирање', few: 'скенирања', other: 'скенирања' })}.`,
  'plans.scansOnTheWay': 'Плаћено. Скенирања стижу за тренутак.',
  'plans.scansBuyHint': (count: number, price: string) =>
    `Купи ${n(count, { one: 'скенирање фотографије', few: 'скенирања фотографије', other: 'скенирања фотографија' })} за ${price}`,
  'plans.checkingStore': 'Проверавам продавницу…',
  // "Већ си платио?" is gendered.
  'plans.alreadyPaid': 'Већ плаћено? Врати куповину',
  'plans.restorePrompt': 'Желим да вратим куповину',
  'plans.paidNotShowing': 'Плаћено, а не види се? Врати куповину',
  'plans.freeOnEvery': 'Бесплатно у сваком пакету',
  'plans.billedYearly': 'Наплаћује се једном годишње',
  'plans.billedMonthly': 'Наплаћује се месечно',
  'plans.everythingInPlus': 'Све из пакета Plus',
  'plans.yourPlan': 'Твој пакет',
  'plans.aYear': 'годишње',
  'plans.aMonth': 'месечно',
  'plans.worksOutAt': (price: string) => `Излази на ${price} месечно.`,
  'plans.onFree': 'Користиш Free. Све што укуцаш остаје бесплатно — пакети купују делове који размишљају.',
  'plans.onPlan': (plan: string) => `Користиш ${plan}.`,
  'plans.savePercent': (percent: string) => ` · уштеда ${percent}%`,
  'plans.get': (plan: string) => `Узми ${plan}`,
  'plans.nothingOnSale':
    'Продавница за ову апликацију још нема ништа у понуди. Ништа што је радило није закључано — врати се касније и биће ту.',
  'plans.noStore': 'Ова верзија не може да приступи продавници, па овде још нема шта да се купи.',
  'plans.restoreNote':
    'Поново проверава овај налог продавнице и враћа све што је већ купљено. Никад не наплаћује поново.',
  'plans.manage': 'Управљај претплатом или је откажи',
  // "оно што си платио" is gendered; «плаћено важи» says the same.
  'plans.smallPrint': (billing: string) =>
    `${billing} преко продавнице и обнавља се док не откажеш. Откажи кад год хоћеш у налогу продавнице — плаћено важи до краја периода.`,
  'plans.pendingLong':
    'Продавница је примила уплату, а пакет је још на путу. Откључаће се сам — не треба ништа поново плаћати.',
  'plans.pendingShort': 'Продавница је примила уплату. Пакет се откључава за тренутак.',
  'plans.whatThatOpens': 'Шта то отвара',
  'plans.startLogging': 'Почни да уписујеш',
  'plans.backToJournal': 'Назад у дневник',
  'plans.youreOnPlan': (plan: string) => `Користиш ${plan}.`,
  'plans.paymentReceived': 'Уплата је примљена.',
  'plans.manageOnStore': 'Управљај претплатом или је откажи кад год хоћеш, у одељку „Претплате“ у продавници.',
  'plans.youreOn': 'Користиш',
  'plans.photoScans': 'Скенирања фотографија',
  'plans.unlimited': 'Неограничено',
  'plans.seeWhatIncludes': 'Погледај шта пакет укључује',
  'plans.seeThePlans': 'Погледај пакете',
  'plans.restorePurchase': 'Врати куповину',
  'plans.planTitle': 'Пакет',
  'plans.leftThisMonth': (left: string) => `још ${left} овог месеца`,
  'plans.plusBought': (bought: string) => ` · ${bought} купљено`,
  'plans.leftEver': (left: string) => `још ${left}`,
  'setup.tellingYouThings': 'Обавештења',
  'setup.emailFooterWithReview':
    'Седмични преглед стиже понедељком ујутру. Имејлови о налогу — промена лозинке, пријава са уређаја који нисмо видели — шаљу се увек.',
  'setup.emailFooter':
    'Имејлови о налогу — промена лозинке, пријава са уређаја који нисмо видели — шаљу се увек.',
  'setup.confirmFirst': (email: string) =>
    `Док не потврдиш ${email}, заборављена лозинка не може да се ресетује — не бисмо могли да знамо да је сандуче твоје.`,
  'setup.sendLinkAgain': 'Пошаљи линк поново',
  'setup.weeklyReview': 'Седмични преглед',
  'setup.weeklyReviewHint': 'Прошла седмица, укратко, у понедељак.',
  'setup.sendMeReview': 'Шаљи ми седмични преглед',
  'setup.nudges': 'Напомене',
  'setup.nudgesHintMobile':
    'Највише једна седмично, кад у уписима има нешто вредно помена. Увек се појављују у дневнику; ово их шаље и на телефон — или имејлом, ако су обавештења искључена.',
  'setup.sendMeNudges': 'Шаљи ми напомене',
  'setup.streaksAndGoals': 'Низови и циљеви',
  'setup.streaksHint':
    'Низ уписаних дана вредан пажње и дан кад вага покаже циљну тежину. Ретко по самој замисли и никад имејлом — ово стиже на телефон или нигде.',
  'setup.tellMeStreaks': 'Јави ми за низове и циљеве',
  // «резиме», so it is not confused with the weekly «преглед».
  'setup.eveningRecap': 'Вечерњи резиме',
  'setup.eveningRecapHint':
    'Данашње калорије и протеини у односу на данашње циљеве, у девет увече. Сваког дана кад има уписа — једино обавештење овде које није повремено.',
  'setup.sendMeRecap': 'Шаљи ми вечерњи резиме',
  'setup.remindersTitle': 'Подсетници на овом телефону',
  'setup.remindersFooter':
    'Подешени овде, остају овде. Не траже налог ни интернет, стижу без обзира на пакет и не прелазе на нови телефон.',
  'setup.logYourDay': 'Упиши свој дан',
  'setup.logYourDayHint':
    'Подсетник са твог телефона, у сат који изабереш. Не зна ништа о томе шта је уписано — то је аларм, а не мишљење.',
  'setup.remindMeToLog': 'Подсети ме да упишем',
  'setup.at': 'У',
  'setup.reminderTime': 'Време подсетника',
  'setup.weighIn': 'Мерење',
  'setup.weighInHint':
    'Једном седмично, пре доручка. Дневно мерење више мери јучерашњу со него тебе, зато овај подсетник није свакодневни.',
  'setup.remindMeToWeigh': 'Подсети ме да се измерим',
  // A label before the weekday picker; «у» would put the weekday in the accusative.
  'setup.on': 'Дан',
  'setup.weighInDay': 'Дан мерења',
  'setup.weighInTime': 'Време мерења',
  'setup.deleting': 'Брисање…',
  'setup.deleteEverything': 'Обриши све',
  'setup.deleteWarningBefore': 'Ово брише сваки оброк, фотографију, тежину и разговор на налогу',
  'setup.deleteWarningAfter':
    ', на свим уређајима, и не може да се поништи. Унеси лозинку да потврдиш.',

  // ---- The words the app uses about money ---------------------------------
  //
  // Serbian's few-form of a masculine noun is the genitive singular (2 рецепта), and
  // `wallTitle` asks for the form for two — so `wall.notOnPlan` is built on «нема» +
  // genitive, where that form is right for every meter. The sentences that carry a
  // count put it after a colon, so no adjective or verb has to agree with a noun
  // whose gender the sentence cannot know.
  'meter.chat': (count: number) => w(count, { one: 'порука', few: 'поруке', other: 'порука' }),
  'meter.photo': (count: number) =>
    w(count, { one: 'скенирање фотографије', few: 'скенирања фотографије', other: 'скенирања фотографија' }),
  'meter.pantryScan': (count: number) =>
    w(count, { one: 'скенирање фрижидера', few: 'скенирања фрижидера', other: 'скенирања фрижидера' }),
  'meter.recipe': (count: number) => w(count, { one: 'рецепт', few: 'рецепта', other: 'рецепата' }),
  'meter.mealPlan': (count: number) =>
    w(count, { one: 'план оброка', few: 'плана оброка', other: 'планова оброка' }),

  'tier.pitchFree': 'Потпун дневник исхране, ван мреже и без ограничења.',
  'tier.pitchPlus': 'Дневник сваког дана и седмични осврт на њега.',
  'tier.pitchCoach': 'И кухиња: кувај од онога што је у фрижидеру, планирај седмицу.',

  'wall.notOnPlan': (plural: string) => `${plural} нема у твом пакету`,
  'wall.freeGrant': (count: number, noun: string) => `То је била бесплатна проба: ${count} ${noun}`,
  'wall.monthlyGrant': (count: number, noun: string) => `То је све за овај месец: ${count} ${noun}`,
  'wall.comeBack': (when: string) => ` Опет стижу ${when}.`,
  'wall.bodyChat': 'Ручно куцање оброка је неограничено и увек бесплатно — показаћу ти где.',
  'wall.bodyPhoto':
    'И даље можеш да укуцаш оброк, поновиш неки од ранијих или скенираш бар-код. Ништа од тога се не рачуна.',
  'wall.bodyPantryScan': 'Списак у кухињи и даље ради — намирнице можеш да додаш ручно.',
  'wall.bodyRecipe':
    'Сви већ скувани рецепти остају сачувани, а библиотеку рецепата можеш бесплатно да прегледаш.',
  'wall.bodyMealPlan':
    'Последња испланирана седмица је још ту, а и даље можеш да куваш по сачуваном рецепту.',
  'wall.remaining': (count: number, noun: string) => `Још ${count} ${noun}`,
  // The reader's own voice; «сам» would be gendered.
  'wall.logMyself': 'Упиши ово ручно',
  'wall.loggedByHand': 'Уписано ручно — тај пут је увек отворен и никад се не рачуна.',

  'tier.reviewAndNudge': 'Седмични преглед и напомена кад се дуже не јавиш',
  'tier.review': 'Седмични преглед твоје исхране',
  'tier.nudge': 'Напомена кад се дуже не јавиш',
  'tier.countNoun': (count: number, noun: string) => `${count} ${noun}`,
  'tier.toTry': (list: string) => `${list} за пробу`,
  'tier.aMonth': (list: string) => `${list} месечно`,
  'tier.everythingIn': (plan: string) => `Све из пакета ${plan}`,

  'free.typing': 'Ручни упис оброка и исправке',
  'free.repeat': 'Понављање оброка и скенирање бар-кода',
  'free.history': 'Цела историја, прстен и низ',
  'free.offline': 'Уписивање и без сигнала',

  'spent.everGrant': (count: number, noun: string) => `Потрошено из бесплатне пробе: ${count} ${noun}`,
  'spent.monthly': (count: number, noun: string) => `Потрошено овог месеца: ${count} ${noun}`,

  // ---- Words the whole app uses -------------------------------------------
  // ---- Streaks and achievements. See STREAKS.md. ----
  'streak.logging': 'Низ уписа',
  'streak.training': 'Седмице тренинга',
  'streak.days': (count: number) => n(count, { one: 'дан', few: 'дана', other: 'дана' }),
  'streak.weeks': (count: number) => n(count, { one: 'седмица', few: 'седмице', other: 'седмица' }),
  'streak.best': (count: number) => `рекорд ${count}`,
  'streak.atRisk': 'Упиши нешто данас да сачуваш низ',
  'streak.weekProgress': (done: number, needed: number) => `${done} од ${needed} дана ове седмице`,
  'streak.weekMet': 'Ова седмица се рачуна',
  'streak.weekBar': (needed: number) =>
    `Низ траје уз ${n(needed, { one: 'дан', few: 'дана', other: 'дана' })} седмично`,
  'streak.startTraining': 'Тренирај три дана ове седмице да започнеш низ',
  'achievements.title': 'Достигнућа',
  'achievements.count': (done: number, total: number) => `${done} од ${total}`,
  'achievements.earnedOn': (date: string) => `Освојено: ${date}`,
  'achievements.group.streaks': 'Низови',
  'achievements.group.training': 'Тренинг',
  'achievements.group.firsts': 'Први пут',
  'achievements.group.totals': 'Укупно',
  'badge.streak_7': 'Седам заредом',
  'badgeHow.streak_7': 'Упиши нешто седам дана заредом.',
  'badge.streak_30': 'Тридесет заредом',
  'badgeHow.streak_30': 'Упиши нешто тридесет дана заредом.',
  'badge.streak_100': 'Сто заредом',
  'badgeHow.streak_100': 'Упиши нешто сто дана заредом.',
  'badge.streak_365': 'Година без прекида',
  'badgeHow.streak_365': 'Уписуј сваки дан током целе године.',
  'badge.exercise_weeks_4': 'Четири седмице тренинга',
  'badgeHow.exercise_weeks_4': 'Три тренинга седмично, четири седмице заредом.',
  'badge.exercise_weeks_12': 'Дванаест седмица тренинга',
  'badgeHow.exercise_weeks_12': 'Три тренинга седмично, дванаест седмица заредом.',
  'badge.exercise_weeks_52': 'Година тренинга',
  'badgeHow.exercise_weeks_52': 'Три тренинга седмично током целе године.',
  'badge.first_photo': 'Прва фотографија',
  'badgeHow.first_photo': 'Упиши оброк са фотографије.',
  'badge.first_barcode': 'Прво скенирање',
  'badgeHow.first_barcode': 'Скенирај бар-код.',
  'badge.first_workout': 'Први тренинг',
  'badgeHow.first_workout': 'Упиши тренинг.',
  'badge.first_weigh_in': 'Прво мерење',
  'badgeHow.first_weigh_in': 'Упиши своју тежину.',
  'badge.days_100': 'Сто дана',
  'badgeHow.days_100': 'Сто уписаних дана, не мора заредом.',
  'badge.days_365': 'Година уписа',
  'badgeHow.days_365': 'Триста шездесет пет уписаних дана, не мора заредом.',
  'badge.workouts_100': 'Сто тренинга',
  'badgeHow.workouts_100': 'Сто дана са тренингом.',

  'widget.today': (label: string) => `${label} данас`,
  'widget.of': (consumed: string, target: string) => `${consumed} од ${target} kcal`,
  'widget.tapToStart': 'Додирни да почнеш дан',
  'widget.steps': (count: number) => n(count, { one: 'корак', few: 'корака', other: 'корака' }),
  'widget.stepsWord': 'корака',
  'widget.usual': (average: string) => `од уобичајених ${average}`,
  'toast.logged': (description: string, kcal: string) => `Уписано: ${description} — ${kcal} kcal`,
  'toast.removed': (description: string) => `Уклоњено: ${description}`,
  'toast.tapToDismiss': (text: string) => `${text}. Додирни да затвориш.`,
  'a11y.edit': (name: string) => `Измени: ${name}`,
  'a11y.delete': (name: string) => `Обриши: ${name}`,
  'a11y.remove': (name: string) => `Уклони: ${name}`,

  'common.save': 'Сачувај',
  'common.cancel': 'Откажи',
  'common.delete': 'Обриши',
  'common.repeat': 'Понови',
  'common.undo': 'Поништи',
  'common.done': 'Готово',
  'common.add': 'Додај',
  'common.edit': 'Измени',
  'common.close': 'Затвори',
  'common.retry': 'Покушај поново',
  'common.offline': 'Ниси на мрежи. Ово ће поново радити кад буде сигнала.',
  'common.unexpected': 'Нешто није у реду. Покушај поново.',
  'common.loading': 'Учитавање…',
  'common.today': 'Данас',
  'common.yesterday': 'Јуче',

  /* The gym card, second pass. See GYM-CARD.md. */
  'common.saving': 'Чување…',
  'workout.addExercises': '＋ Додај вежбе',
  'workout.pickExercises': 'Додај вежбе',
  'workout.anyExercise': 'било која вежба — само упиши мишић',
  'workout.orNameIt': 'Или упиши назив',
  // "шта си тренирао" is gendered.
  'workout.pointAtIt': 'Или додирни мишиће на слици',
  'workout.front': 'Спреда',
  'workout.back': 'Позади',
  'workout.backToBody': (muscle: string) => `‹ ${muscle}`,
  'workout.addCount': (count: string) => `Додај ${count}`,
  'workout.aboutLength': (min: string) => `≈ ${min} мин`,
  'workout.exactLength': (min: string) => `${min} мин`,
  'workout.tapToFix': 'процена · додирни да исправиш',
  'workout.whatKind': 'Која врста тренинга?',
  'workout.lessNamed': (caption: string) => `Мање: ${caption}`,
  'workout.moreNamed': (caption: string) => `Више: ${caption}`,
};
