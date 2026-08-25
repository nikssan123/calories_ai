import type { Messages } from '@/lib/i18n';

/**
 * Bulgarian, for the native app. See the web twin for the two habits worth
 * keeping: second person singular and informal throughout, and no borrowed
 * English where a Bulgarian word exists.
 */
export const bg: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  //
  // The hard constraint: these sit under an icon in a ~60px target. "Движение"
  // is eight characters and already at the edge; anything longer wraps.
  'nav.journal': 'Дневник',
  'nav.today': 'Днес',
  'nav.progress': 'Напредък',
  'nav.exercise': 'Движение',
  'nav.cook': 'Кухня',
  // "Ти" is the literal answer and reads oddly as a label; this is the tab
  // where your own details live, so it is named for them.
  'nav.you': 'Профил',
  'nav.history': 'История',
  'nav.admin': 'Админ',
  'nav.signOut': 'Изход',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Днес',
  // Under the figure in the ring. «остават» is what the number *is*, and it
  // needs no preposition — the English "to go" has one only because it must.
  'today.toGo': 'остават',
  'today.over': 'над целта',
  'today.burned': (kcal: string) => `+${kcal} изгорени`,
  'today.viewCalendar': 'Виж календара',
  'today.previousDay': 'Предишен ден',
  'today.nextDay': 'Следващ ден',
  'today.nothingLogged': 'Още няма нищо записано.',
  'today.nothingLoggedHint': 'Кажи в дневника какво си ял.',
  'today.logAgain': 'Запиши пак',
  'today.weighed': 'Претеглен',
  'today.weight': 'Тегло',
  'today.exercise': 'Движение',
  'today.roughEstimate': 'груба преценка',
  'today.changeHint': 'За да го промениш, кажи го в дневника — „ориза беше повече“.',

  'meal.breakfast': 'Закуска',
  'meal.lunch': 'Обяд',
  'meal.dinner': 'Вечеря',
  'meal.snack': 'Междинни',

  'macro.protein': 'Белтъчини',
  'macro.carbs': 'Въглехидрати',
  'macro.fat': 'Мазнини',
  'macro.fiber': 'Фибри',

  // ---- History ------------------------------------------------------------
  'history.title': 'История',
  'history.thisMonth': 'Този месец',
  'history.previousMonth': 'Предишен месец',
  'history.nextMonth': 'Следващ месец',
  'history.avgIntake': 'Средно приети',
  'history.logged': 'Записани',
  'history.exercise': 'Движение',
  'history.onTarget': 'В целта',
  'history.under': 'Под',
  'history.over': 'Над',
  'history.noTarget': 'Без цел',
  'history.openInToday': 'Отвори в Днес →',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Две яйца и филия…',
  'composer.send': 'Изпрати',
  'composer.addPhoto': 'Добави снимка или сканирай опаковка',
  'composer.takePhoto': 'Направи снимка',
  'composer.choosePhoto': 'Избери снимка',
  'composer.scanBarcode': 'Сканирай баркод',
  'composer.removePhoto': 'Премахни снимката',
  'composer.selectedMeal': 'Избрано хранене',
  'composer.labelHint': 'Това е етикетът — запиши каквото изядох по него.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Профил',
  'setup.about': 'За теб',
  'setup.account': 'Акаунт',
  'setup.appearance': 'Изглед',
  'setup.dangerZone': 'Внимание',
  'setup.displayName': 'Име',
  'setup.sex': 'Пол',
  'setup.birthDate': 'Дата на раждане',
  'setup.height': 'Височина',
  'setup.targetWeight': 'Целево тегло',
  'setup.activity': 'Активност',
  'setup.goal': 'Цел',
  'setup.units': 'Мерни единици',
  'setup.language': 'Език',
  'setup.dayStartsAt': 'Денят започва в',
  'setup.timezone': 'Часова зона',
  'setup.email': 'Имейл',
  'setup.addressConfirmed': 'Адресът е потвърден',
  'setup.addressNotConfirmed': 'Адресът не е потвърден',
  'setup.deleteAccount': 'Изтрий акаунта',
  'setup.deleteFailed': 'Акаунтът не можа да бъде изтрит.',
  'setup.contactSupport': 'Свържи се с поддръжката',
  'setup.save': 'Запази',
  'setup.saving': 'Запазва се…',
  'setup.saved': 'Запазено',

  // ---- Настройката не е завършена ------------------------------------------
  'setup.placeholder': 'Тези числа са временни.',
  'setup.placeholderAction': 'Довършете настройката в дневника.',
  'setup.inProgress': 'Настройваме — целта е временна, докато не приключим.',

  'sex.male': 'Мъж',
  'sex.female': 'Жена',

  'goal.lose': 'Отслабване',
  'goal.maintain': 'Поддържане',
  'goal.gain': 'Качване',

  'activity.sedentary': 'Заседнал',
  'activity.light': 'Лек',
  'activity.moderate': 'Умерен',
  'activity.active': 'Активен',
  'activity.veryActive': 'Много активен',

  'units.metric': 'Метрични',
  'units.imperial': 'Имперски',

  'theme.system': 'Като системата',
  'theme.light': 'Светла',
  'theme.dark': 'Тъмна',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Вход',
  'auth.signInSubtitle': 'Влез и продължи оттам, докъдето стигна.',
  'auth.createAccount': 'Създай акаунт',
  'auth.createAccountTitle': 'Създай своя акаунт',
  'auth.email': 'Имейл',
  'auth.password': 'Парола',
  'auth.passwordHint': 'Поне 8 знака.',
  'auth.nameOptional': 'Име (по желание)',
  'auth.continueWithGoogle': 'Продължи с Google',
  'auth.forgotPassword': 'Забравена парола?',
  'auth.haveAccount': 'Вече имаш акаунт?',
  'auth.newHere': 'Нов си тук?',
  'auth.signupsClosed': 'Регистрациите на този сървър са затворени.',
  'auth.googleFailed': 'Google не успя да те впише. Опитай пак или влез с имейл и парола.',
  'auth.genericFailure': 'Нещо се обърка при влизането. Опитай пак.',
  'auth.oneMoment': 'Момент…',
  'auth.privacyPolicy': 'Политика за поверителност',
  'auth.language': 'Език',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Провери пощата си',
  'verify.sentTo': (email: string) => `Изпратихме шест цифри на ${email}. Въведи ги и си вътре.`,
  'verify.sentBlind': 'Изпратихме ти шест цифри. Въведи ги и си вътре.',
  'verify.title': 'Потвърди имейла си',
  'verify.checkInbox': 'Провери пощата си',
  'verify.enterCode': 'Въведи кода',
  'verify.sixDigitCode': 'Шестцифрен код',
  'verify.confirm': 'Потвърди',
  'verify.confirming': 'Потвърждава се…',
  'verify.confirmed': 'Имейлът е потвърден',
  'verify.alreadyConfirmed': 'Вече е потвърден',
  'verify.readyMessage': 'Този адрес е готов.',
  'verify.sendNewCode': 'Изпрати нов код',
  'verify.sending': 'Изпраща се…',
  'verify.startJournal': 'Започни дневника',
  'verify.signInFirst': 'Първо влез, после въведи кода, който ти изпратихме.',
  'verify.signOutAndRestart': 'Излез и започни отначало',
  'verify.linkFailed': 'Връзката не сработи',

  // ---- Words the whole app uses -------------------------------------------
  'common.save': 'Запази',
  'common.cancel': 'Откажи',
  'common.delete': 'Изтрий',
  'common.done': 'Готово',
  'common.add': 'Добави',
  'common.edit': 'Промени',
  'common.close': 'Затвори',
  'common.retry': 'Опитай пак',
  'common.loading': 'Зарежда се…',
  'common.today': 'Днес',
  'common.yesterday': 'Вчера',
};
