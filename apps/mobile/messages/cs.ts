import { pluralFor, pluralWordFor } from '@ct/shared';

import type { Messages } from '@/lib/i18n';

/**
 * Czech, for the native app. Informal "ty" throughout, never "vy". Buttons and
 * menu actions take the infinitive ("Uložit"), as Czech software does; sentences
 * addressed to the reader take the imperative ("Zapiš").
 *
 * The Czech past tense and predicate adjectives are gendered ("zapsal jsi",
 * "jsi připraven"), and the reader could be anyone, so those are rephrased into
 * the present, a neuter passive ("Zapsáno") or a noun — never "zapsal(a)". An
 * interpolated food, workout or coach name cannot be declined from here, so it
 * stays in the nominative: after a colon, or as the subject of its sentence.
 *
 * Plural categories: one (1), few (2–4), many (decimals, "1,5 dne"), other
 * (0, 5+). Quotes „…“; the English em dash becomes a spaced en dash.
 */
/** This language's plural categories, bound once. See the web twin. */
const n = pluralFor('cs');
/** The agreeing noun without its number, for the paywall's sentences. */
const w = pluralWordFor('cs');

export const cs: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  'nav.journal': 'Deník',
  'nav.today': 'Dnes',
  'nav.progress': 'Pokrok',
  // "Cvičení" is the literal word but reads as one session; "Pohyb" names the
  // whole tab (steps, sessions, saved workouts) and is shorter.
  'nav.exercise': 'Pohyb',
  'nav.cook': 'Kuchyně',
  // "Ty" is the literal answer and reads oddly as a label, as in bg/de.
  'nav.you': 'Profil',
  'nav.history': 'Historie',
  'nav.admin': 'Admin',
  'nav.signOut': 'Odhlásit se',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Dnes',
  'today.toGo': 'zbývá',
  'today.over': 'nad cílem',
  'today.burned': (kcal: string) => `+${kcal} spáleno`,
  'today.viewCalendar': 'Zobrazit kalendář',
  'today.previousDay': 'Předchozí den',
  'today.nextDay': 'Další den',
  'today.nothingLogged': 'Zatím nic zapsáno.',
  // "co jsi jedl" would gender the reader; "co bylo k jídlu" is what a Czech
  // speaker says anyway.
  'today.nothingLoggedHint': 'Napiš do deníku, co bylo k jídlu.',
  'today.logAgain': 'Zapsat znovu',
  'today.weighed': 'Zváženo',
  'today.weight': 'Váha',
  'today.exercise': 'Pohyb',
  'today.roughEstimate': 'hrubý odhad',
  'today.exerciseFooter': 'Zobrazeno zvlášť od tvého cíle – kalorie spálené pohybem jsou jen hrubý odhad.',
  'today.exerciseTitle': '🏃  Pohyb',
  'today.stepsTitle': '👟  Kroky',
  'today.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'kroků' }),
  'today.stepsFooter': 'Počítá je tvůj telefon. Kroky zpřesňují tvůj cíl – nikdy se k němu nepřičítají.',
  'today.stepsEnable': 'Počítat moje kroky',
  'today.stepsStarting': 'Počítání začalo',
  'today.stepsStartingHint':
    'Telefon počítá až od chvíle, kdy dostal povolení, takže tu zatím nic není. Projdi se a začne se to plnit.',
  'today.stepsNoSource': 'Na tomhle telefonu zatím kroky nic nepočítá',
  'today.stepsNoSourceHint':
    'Health Connect zatím nemá žádná data. Na některých telefonech kroky počítá jiná aplikace – klepni, otevři seznam aplikací a povol Samsung Health nebo Fitbit.',
  'today.stepsUsual': (average: string) => `obvykle ${average}`,
  'today.stepsEnableHint': 'Načítat kroky z telefonu, aby se tvůj cíl řídil tím, kolik se opravdu hýbeš.',
  'today.thatChange': 'Změna',
  // `what` is a meal description in the nominative; it cannot be the object of
  // "uložit", so it heads the sentence instead.
  'today.couldNotSave': (what: string, reason: string) => `${what} – nepodařilo se uložit. ${reason}`,
  'today.waitingToSync': (count: number) =>
    n(count, {
      one: 'změna čeká na synchronizaci',
      few: 'změny čekají na synchronizaci',
      many: 'změny čeká na synchronizaci',
      other: 'změn čeká na synchronizaci',
    }),
  'today.lastSavedDay': ' · poslední uložený den',
  'today.offlineDay': 'Offline – zobrazen poslední uložený den.',
  'today.unsent': ' · čeká na synchronizaci',
  'today.macroLine': (protein: string, carbs: string, fat: string) =>
    `${protein}B · ${carbs}S · ${fat}T`,
  'today.changeHint': 'Pokud to chceš změnit, napiš to do deníku – „rýže bylo víc“.',
  'today.logItYourself': '+ Zapsat ručně',
  'today.ofTargetKcal': (target: string) => `z ${target} kcal`,
  'rail.netAfterExercise': (kcal: string) => `čistě ${kcal} kcal po započtení pohybu`,

  'meal.breakfast': 'Snídaně',
  'meal.lunch': 'Oběd',
  'meal.dinner': 'Večeře',
  'meal.snack': 'Svačiny',
  'meal.snackOne': 'Svačina',

  'macro.protein': 'Bílkoviny',
  'macro.carbs': 'Sacharidy',
  'macro.fat': 'Tuky',
  'macro.fiber': 'Vláknina',
  // Bílkoviny, Sacharidy, Tuky.
  'macro.proteinInitial': 'B',
  'macro.carbsInitial': 'S',
  'macro.fatInitial': 'T',

  // ---- History ------------------------------------------------------------
  'history.title': 'Historie',
  'history.thisMonth': 'Tento měsíc',
  'history.previousMonth': 'Předchozí měsíc',
  'history.nextMonth': 'Další měsíc',
  'history.avgIntake': 'Průměrný příjem',
  'history.logged': 'Zapsáno',
  'history.exercise': 'Pohyb',
  'history.onTarget': 'V cíli',
  'history.under': 'Pod',
  'history.over': 'Nad',
  'history.noTarget': 'Bez cíle',
  'history.openInToday': 'Otevřít v kartě Dnes →',
  'history.day': 'Den',
  'history.nothingThatDay': 'Ten den není nic zapsáno.',
  'history.nothingYet': 'Zatím nic zapsáno.',
  'history.days': 'dní',
  'history.back': 'Zpět',
  'history.proteinGrams': (grams: string) => `${grams}g bílkovin`,

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Dvě vajíčka a rohlík…',
  'composer.send': 'Odeslat',
  'composer.logPackets': 'Zapsat tato balení',
  'composer.packetsStraightIn': 'Rovnou do deníku, nic se nepočítá do limitu',
  'composer.packetsWithMessage': 'Pošlou se s tvou zprávou',
  'composer.addPhoto': 'Přidat fotku nebo naskenovat balení',
  'composer.takePhoto': 'Vyfotit',
  'composer.choosePhoto': 'Vybrat fotku',
  'composer.scanBarcode': 'Naskenovat čárový kód',
  'composer.removePhoto': 'Odebrat fotku',
  'composer.setAmountFor': (name: string) => `Nastavit množství: ${name}`,
  'composer.removeScan': (name: string) => `Odebrat: ${name}`,
  'composer.cameraBlockedTitle': 'Day So Far nemůže otevřít fotoaparát',
  'composer.cameraBlockedBody':
    'Přístup k fotoaparátu je pro tuto aplikaci vypnutý, takže ho iOS neotevře. Zapni ho v Nastavení, nebo vyber fotku z knihovny.',
  'composer.openSettings': 'Otevřít Nastavení',
  'composer.notNow': 'Teď ne',
  'composer.photoUnreadable': 'Tu fotku se nepodařilo přečíst. Zkus jinou.',
  'composer.selectedMeal': 'Vybrané jídlo',
  // Sent as the reader's own words, so "co jsem snědl" would gender them.
  'composer.labelHint': 'Tohle je etiketa – zapiš podle ní moje jídlo.',
  'composer.photoTip':
    'Tip: nech v záběru vidličku, lžíci nebo ruku – podle nich poznáme, jak velký je talíř, a to se odhaduje nejhůř.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Profil',
  'setup.about': 'O tobě',
  'setup.account': 'Účet',
  'setup.appearance': 'Vzhled',
  'setup.dangerZone': 'Nebezpečná zóna',
  'setup.displayName': 'Jméno',
  'setup.sex': 'Pohlaví',
  'setup.birthDate': 'Datum narození',
  'setup.height': 'Výška',
  'setup.targetWeight': 'Cílová váha',
  'setup.activity': 'Aktivita',
  'setup.goal': 'Cíl',
  'setup.units': 'Jednotky',
  'setup.language': 'Jazyk',
  'setup.languageSuggested': 'Doporučené',
  'setup.languageAll': 'Všechny jazyky',
  'setup.dayStartsAt': 'Den začíná v',
  'setup.timezone': 'Časové pásmo',
  'setup.email': 'E-mail',
  'setup.addressConfirmed': 'Adresa ověřena',
  'setup.addressNotConfirmed': 'Adresa neověřena',
  'setup.deleteTypeEmail': 'Pro potvrzení napiš adresu výše. Tento účet se přihlašuje přes Google, takže tu není heslo k ověření.',
  'setup.deleteAccount': 'Smazat účet',
  'setup.deleteFailed': 'Účet se nepodařilo smazat.',
  'setup.contactSupport': 'Kontaktovat podporu',
  'setup.save': 'Uložit',
  'setup.saving': 'Ukládám…',
  'setup.saved': 'Uloženo',
  'setup.savedTargetMoved': (from: string, to: string) => `Uloženo – denní cíl ${from} → ${to} kcal`,
  'setup.savedTargetSame': (kcal: string) => `Uloženo – denní cíl zůstává ${kcal} kcal`,
  'setup.activitySedentary': 'Sedavá práce, málo pohybu',
  'setup.activityLight': 'Lehký pohyb 1–3 dny v týdnu',
  'setup.activityModerate': 'Střední pohyb 3–5 dní v týdnu',
  'setup.activityActive': 'Náročný pohyb 6–7 dní v týdnu',
  'setup.activityVeryActive': 'Fyzická práce nebo trénink dvakrát denně',
  'setup.dailyTarget': 'Tvůj denní cíl',
  'setup.optional': 'Nepovinné',
  'setup.dayTitle': 'Den',
  'setup.dayFooter':
    'Jídlo před začátkem dne se počítá do předchozího – svačina v jednu v noci tak patří k večeru, ke kterému opravdu patří.',
  'setup.appearanceFooter': 'Možnost Systém se řídí zařízením, včetně jeho plánu světlého a tmavého režimu.',
  // "Přihlášen jako" is masculine; the account itself is not.
  'setup.signedInAs': 'Přihlášený účet',
  'setup.subtitle': 'Dost na výpočet výchozího cíle. Upravuje se, jak přibývají skutečná data.',
  // "Pokud jsi těhotná" would be the only feminine sentence in the file; the
  // noun phrase covers pregnancy and the conditions in one clause.
  'setup.targetDisclaimer':
    'Populační průměr pro člověka tvé postavy, ne lékařská rada. Po dvou týdnech se opraví podle tvých vlastních zápisů. V těhotenství, při kojení nebo s onemocněním, jako je cukrovka či nemoc ledvin, si nech číslo určit lékařem a zadej ho tady ručně.',

  // ---- Coach ----------------------------------------------------------------
  // The person is "trenér", the natural Czech word for someone who coaches you
  // on food and training; the tier keeps its name, Coach.
  'coach.title': 'Trenér',
  'coach.footerNone': 'Trenér vidí jen to, co zapneš, a může psát do tvého deníku. Dokud nepřijmeš kód, nic se nesdílí.',
  'coach.enterCode': 'Zadat kód od trenéra',
  'coach.codePlaceholder': 'XXXX-XXXX',
  'coach.continue': 'Pokračovat',
  'coach.sharedWith': (name: string) => `Sdíleno: ${name}`,
  'coach.since': (date: string) => `od ${date}`,
  'coach.scopeMeals': 'Jídla a fotky',
  'coach.scopeMealsHint': 'Co a kdy jíš',
  'coach.scopeWeight': 'Váha',
  'coach.scopeWeightHint': 'Tvoje vážení a trend',
  'coach.scopeMetrics': 'Kroky, spánek, tep',
  'coach.scopeMetricsHint': 'Z telefonu nebo hodinek',
  'coach.footerLinked': (name: string) => `${name} může nastavovat tvoje cíle pro kalorie a makra. Vždycky je můžeš vrátit zpátky a sdílení kdykoli ukončit.`,
  'coach.stopSharing': 'Ukončit sdílení',
  'coach.stopConfirm': (name: string) => `Ukončit sdílení? ${name} od teď neuvidí nic nového. Komentáře, které už máš v deníku, zůstanou.`,
  'coach.stop': 'Ukončit',
  'coach.keep': 'Dál sdílet',
  'coach.stopped': 'Sdílení je ukončené.',
  'coach.inviteTitle': (name: string) => `${name} tě chce trénovat`,
  'coach.willSee': 'Uvidí',
  'coach.wontSee': 'Neuvidí',
  'coach.seeMeals': 'Tvoje jídla a jejich fotky',
  'coach.seeTotals': 'Denní kalorie a makra',
  'coach.seeWeight': 'Tvoji váhu a cíle',
  'coach.seeDays': 'Ve které dny zapisuješ',
  'coach.notChat': 'Tvoji konverzaci s deníkem',
  'coach.notMetrics': 'Kroky, spánek ani tep, dokud je nezapneš',
  'coach.notEmail': 'Tvůj e-mail ani platby',
  'coach.accept': 'Přijmout',
  'coach.notNow': 'Teď ne',
  'coach.close': 'Zavřít',
  'coach.canStop': 'Sdílení můžeš kdykoli ukončit v Nastavení.',
  'coach.accepted': (name: string) => `Hotovo – ${name} teď vidí, co sdílíš.`,
  'coach.alreadyLinked': (name: string) => `${name} už k tvému deníku přístup má. Nejdřív sdílení ukonči.`,
  'coach.invalid': 'Tenhle kód neznáme.',
  'coach.expired': 'Platnost kódu vypršela. Požádej trenéra o nový.',
  'coach.used': 'Tenhle kód už byl použit.',
  'coach.bannerManage': 'Spravovat',
  'coach.yourCoach': 'tvůj trenér',
  'coach.yourCoachCapital': 'Tvůj trenér',
  'coach.setByCoach': 'Nastaveno trenérem',
  'coach.seatPlus': 'díky trenérovi máš Plus',

  'setup.aboutTitle': 'O aplikaci',
  'setup.privacyPolicy': 'Zásady ochrany osobních údajů',
  'setup.termsOfService': 'Podmínky používání',
  'setup.rateApp': 'Ohodnotit aplikaci',
  'setup.unsavedChanges': 'Neuložené změny',
  'setup.saveChanges': 'Uložit změny',

  'setup.requiredMissing':
    'K výpočtu cíle je potřeba pohlaví, datum narození, výška, cíl i aktivita.',

  // ---- The first run ------------------------------------------------------
  'ob.back': 'Zpět',
  'ob.continue': 'Pokračovat',

  'ob.welcomeTitle': 'Pojďme sestavit tvůj plán',
  'ob.welcomeBody':
    'Šest rychlých otázek – asi na půl minuty – a budeš mít cíl pro kalorie a bílkoviny spočítaný pro tvoje tělo, ne pro někoho obecného. Cokoli z toho můžeš později změnit.',
  'ob.welcomeStart': 'Začít',

  'ob.goalTitle': 'Čeho chceš dosáhnout?',
  'ob.goalBody': 'Podle toho budeš jíst méně, stejně, nebo víc, než spálíš.',
  'ob.goalLose': 'Zhubnout',
  'ob.goalLoseHint': 'Mírný deficit, který se dá opravdu vydržet',
  'ob.goalMaintain': 'Udržet si váhu',
  'ob.goalMaintainHint': 'Jíst tolik, kolik spálíš, a mít to pod dohledem',
  'ob.goalGain': 'Přibrat',
  'ob.goalGainHint': 'Malý přebytek a dost bílkovin, aby se využil',

  'ob.sexTitle': 'Pro jaké pohlaví máme počítat?',
  'ob.sexBody':
    'Klidový výdej se liší natolik, že by odhad posunul tvůj cíl o pár set kalorií denně.',

  // "Kdy ses narodil?" is gendered; the date itself is the question.
  'ob.birthTitle': 'Tvoje datum narození',
  'ob.birthBody': 'Věk je poslední údaj, který výpočet potřebuje.',
  'ob.birthAge': (count: number) => n(count, { one: 'rok', few: 'roky', many: 'roku', other: 'let' }),
  'ob.birthTooYoung': 'Aplikace je určená pro lidi od 13 let.',
  'ob.birthImplausible': 'Zkontroluj rok – tohle datum nevypadá správně.',

  'ob.bodyTitle': 'Tvoje výška a váha',
  'ob.bodyBody':
    'Stačí přibližně. Váha se zapíše jako tvoje první vážení, takže graf začíná dnes.',
  'ob.bodyHeight': 'Výška',
  'ob.bodyWeight': 'Váha',
  'ob.bodyHeightOff': 'Tahle výška nevypadá správně – zkontroluj jednotky.',
  'ob.bodyWeightOff': 'Tahle váha nevypadá správně – zkontroluj jednotky.',

  'ob.skip': 'Teď přeskočit',
  // "Nejsem si jistý" is gendered; "Nevím" is what people say.
  'ob.activitySkip': 'Nevím – počítej se střední',

  'ob.targetTitle': 'Kam míříš?',
  'ob.targetBody': 'Cílová váha, aby aplikace mohla ukázat, jak daleko už jsi. Kdykoli ji můžeš posunout.',
  'ob.targetToGo': (amount: string) => `zbývá ${amount}`,
  'ob.targetSame': 'Stejná jako teď',
  'ob.targetMustBeLower': 'Vyber něco pod svou současnou váhou.',
  'ob.targetMustBeHigher': 'Vyber něco nad svou současnou váhou.',

  'ob.activityTitle': 'Kolik se hýbeš?',
  'ob.activityBody': 'Tvůj běžný týden – bez tréninků, které zapisuješ v aplikaci.',

  'ob.buildingTitle': 'Sestavujeme tvůj plán',
  'ob.buildingStep1': 'Počítáme, kolik spálíš',
  'ob.buildingStep2': 'Nastavujeme denní kalorie',
  'ob.buildingStep3': 'Rozdělujeme bílkoviny, sacharidy a tuky',
  'ob.buildingFailed': 'Tvůj plán se nepodařilo uložit.',
  'ob.retry': 'Zkusit znovu',

  'ob.planEyebrow': 'Tvůj denní cíl',
  'ob.planCalories': 'kalorií denně',
  'ob.planFootnote':
    'Výchozí bod, ne verdikt. Každý týden se upraví podle toho, co zapisuješ a co ukazuje váha.',
  'ob.planStart': 'Začít zapisovat',

  'sex.male': 'Muž',
  'sex.female': 'Žena',

  'goal.lose': 'Hubnutí',
  'goal.maintain': 'Udržení',
  'goal.gain': 'Nabírání',

  // Feminine, agreeing with "aktivita" on the row they fill in.
  'activity.sedentary': 'Sedavá',
  'activity.light': 'Lehká',
  'activity.moderate': 'Střední',
  'activity.active': 'Aktivní',
  'activity.veryActive': 'Velmi aktivní',

  'units.metric': 'Metrické',
  'units.imperial': 'Imperiální',

  'theme.label': 'Motiv',
  'theme.system': 'Systém',
  'theme.light': 'Světlý',
  'theme.dark': 'Tmavý',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Přihlásit se',
  'auth.signInSubtitle': 'Přihlas se a navaž tam, kde to máš rozdělané.',
  'auth.createAccount': 'Vytvořit účet',
  'auth.createAccountTitle': 'Vytvoř si účet',
  'auth.email': 'E-mail',
  'auth.password': 'Heslo',
  'auth.passwordHint': 'Aspoň 8 znaků.',
  'auth.showPassword': 'Zobrazit heslo',
  'auth.hidePassword': 'Skrýt heslo',
  'auth.nameOptional': 'Jméno (nepovinné)',
  'auth.continueWithGoogle': 'Pokračovat přes Google',
  'auth.forgotPassword': 'Zapomenuté heslo?',
  'auth.haveAccount': 'Už máš účet?',
  // "Jsi tu nový?" is gendered.
  'auth.newHere': 'Poprvé tady?',
  'auth.signupsClosed': 'Registrace jsou na tomto serveru uzavřené.',
  'auth.googleFailed': 'Přihlášení přes Google se nepovedlo. Zkus to znovu, nebo použij e-mail a heslo.',
  'auth.genericFailure': 'Při přihlašování se něco pokazilo. Zkus to znovu.',
  'auth.oneMoment': 'Moment…',
  'auth.privacyPolicy': 'Zásady ochrany osobních údajů',
  'auth.language': 'Jazyk',
  'auth.or': 'nebo',
  'auth.createAccountSubtitle':
    'Pak řekni deníku něco o sobě a on ti spočítá cíle.',
  'auth.emailFirst': 'Nejdřív zadej e-mail a pošlu ti odkaz.',
  // "přijímáš" takes the accusative, which for both link labels (feminine
  // plurals) is the nominative they already use; "souhlasíš s" would need them
  // declined.
  'auth.agreeBefore': 'Vytvořením účtu přijímáš',
  'auth.terms': 'Podmínky používání',
  'auth.agreeAnd': 'a',
  'auth.agreeAfter': '.',
  'reset.linkSent': 'Pokud k té adrese existuje účet, odkaz na obnovení hesla je na cestě.',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Zkontroluj e-mail',
  'verify.sentTo': (email: string) => `Na ${email} jsme poslali šest číslic. Zadej je a můžeš začít.`,
  'verify.sentBlind': 'Poslali jsme ti šest číslic. Zadej je a můžeš začít.',
  'verify.title': 'Ověř svůj e-mail',
  'verify.checkInbox': 'Podívej se do schránky',
  'verify.enterCode': 'Zadej kód',
  'verify.sixDigitCode': 'Šestimístný kód',
  'verify.confirm': 'Ověřit',
  'verify.confirming': 'Ověřuji…',
  'verify.confirmed': 'E-mail ověřen',
  'verify.alreadyConfirmed': 'Už ověřeno',
  'verify.readyMessage': 'Tahle adresa je nastavená a připravená.',
  'verify.sendNewCode': 'Poslat nový kód',
  'verify.sending': 'Odesílám…',
  'verify.startJournal': 'Začít s deníkem',
  'verify.signInFirst': 'Nejdřív se přihlas, pak zadej kód, který jsme ti poslali e-mailem.',
  'verify.signOutAndRestart': 'Odhlásit se a začít znovu',
  'verify.linkFailed': 'Odkaz nefungoval',
  'verify.codeSent': 'Zkontroluj schránku – čeká tam ověřovací kód.',
  'verify.sendAgain': 'Poslat znovu',

  // ---- Cook ---------------------------------------------------------------
  'cook.title': 'Kuchyně',
  'cook.kitchenEmpty': 'Tvoje kuchyně je prázdná',
  'cook.things': (count: number) => n(count, { one: 'surovina', few: 'suroviny', many: 'suroviny', other: 'surovin' }),
  'cook.toCheck': (count: number) => `· ${count} ke kontrole`,
  'cook.yourKitchen': 'Tvoje kuchyně',
  'cook.yourKitchenDesc': 'Z toho budu vařit. Stačí, když to zhruba sedí.',
  'cook.thinking': 'Přemýšlím…',
  'cook.nothingLeftToday': 'Na dnešek nic nezbývá',
  'cook.findMeSomething': 'Najdi mi něco',
  'cook.anythingSpecific': 'Něco konkrétního?',
  'cook.anythingSpecificDesc':
    'Všechno je nepovinné. I bez toho vyjdu z tvé kuchyně a z tvého dne.',
  'cook.alreadyWriting': 'Už jeden píšu…',
  'cook.noRunsLeft': 'Na dnešek už žádné recepty nezbývají',
  'cook.planTheWeek': 'Naplánovat týden',
  'cook.forYou': 'Pro tebe',
  'cook.library': 'Knihovna',
  'cook.searchLibrary': 'Hledat v knihovně',
  'cook.emptyBefore': 'Zatím nic. Stiskni',
  'cook.emptyAfter':
    'a vymyslím recept z toho, co máš v kuchyni – nebo začni od fotky či receptu, který už máš.',
  'cook.perPortion': 'na porci',
  'cook.per': (unit: string) => `na ${unit}`,
  'cook.nothingMatching': (query: string) => `Nic neodpovídá „${query}“.`,
  'cook.libraryNote':
    'Skutečné recepty z volně dostupné sbírky USDA, seřazené podle toho, kolik surovin na ně už máš.',

  // The ingredient names arrive in the nominative, so they follow a colon
  // rather than a preposition that would need another case.
  'cook.writingAround': (things: string) => `Píšu recept z toho, co je na fotce: ${things}…`,
  'cook.writingFor': (asked: string) =>
    `Píšu recept na „${asked}“ z toho, co máš v kuchyni…`,
  'cook.writingPlain': 'Píšu recept z toho, co máš v kuchyni…',

  'cook.planLocked': 'Psaní receptů je součástí tarifu Coach.',
  'cook.runs': (count: number) => n(count, { one: 'recept', few: 'recepty', many: 'receptu', other: 'receptů' }),
  'cook.planSpent': (runs: string) => `Na dnešek máš vyčerpáno: ${runs}.`,
  'cook.planSpentBack': (when: string) => ` Další budeš mít ${when}.`,
  'cook.planEmptyKitchen':
    'Tvoje kuchyně je prázdná, tak navrhnu jídla, na která stačí jeden malý nákup – a řeknu ti, co koupit.',
  'cook.planFromWants': 'Vyjdu z toho, o co žádáš, a z toho, co máš v kuchyni',
  'cook.planFromKitchen': 'Vymyslím recept z toho, co máš v kuchyni',
  'cook.planAtTarget': (from: string) =>
    `${from} – a dnes už jsi na svém cíli, takže to bude něco lehkého.`,
  'cook.planAiming': (from: string, kcal: string, protein: string) =>
    `${from} – s ohledem na ${kcal} kcal a ${protein}g bílkovin, které ti dnes zbývají.`,

  // ---- The recipe brief ---------------------------------------------------
  'brief.anythingElse': 'Ještě něco?',
  'brief.wantsPlaceholder': '„v jednom hrnci“, „spotřebovat špenát“, „bez koriandru“',
  'brief.time': 'Čas',
  'brief.minutes': (count: number) => `${count} min`,
  'brief.meal': 'Jídlo',
  'brief.cook': 'Vaření',
  'brief.justTonight': 'Jen na dnešní večer',
  'brief.portions': (count: number) => n(count, { one: 'porce', few: 'porce', many: 'porce', other: 'porcí' }),
  'brief.proteinAtLeast': 'Bílkoviny aspoň',
  'brief.caloriesAtMost': 'Kalorie nejvýš',

  // ---- What you don’t eat -------------------------------------------------
  'diet.title': 'Co nejíš',
  'diet.footer':
    'U každého návrhu receptu platí jako pevné omezení, ne jako preference. Nemění to, jak deník zapisuje, co opravdu jíš – řekni mu, co bylo k jídlu, a on to zapíše.',
  'diet.none': 'Bez omezení',
  // Adjectives agreeing with an implied "strava": the nouns (vegetarián…) are
  // gendered people.
  'diet.vegetarian': 'Vegetariánská',
  'diet.vegan': 'Veganská',
  'diet.pescatarian': 'Pescetariánská',
  // "co nemáš rád" is gendered.
  'diet.avoidPlaceholder': 'Ještě něco – alergie, něco, co ti nechutná',
  'diet.stopAvoiding': (item: string) => `Už nevynechávat: ${item}`,

  // ---- The fridge scan ----------------------------------------------------
  'scan.notAnImage': 'Tenhle soubor není obrázek, který umím přečíst.',
  'scan.noFood': 'Na té fotce nevidím žádné jídlo.',
  'scan.added': (count: number) => `Přidáno: ${n(count, { one: 'surovina', few: 'suroviny', many: 'suroviny', other: 'surovin' })}`,
  'scan.reading': 'Čtu fotku…',
  'scan.fromPhoto': 'Z fotky',
  'scan.scanMyFridge': 'Naskenovat lednici',
  'scan.whatICanSee': 'Co vidím',
  'scan.tapWrong': 'Klepni na cokoli, co nesedí.',
  'scan.alreadyListed': '· už v seznamu',
  'scan.adding': 'Přidávám…',
  'scan.addToKitchen': 'Přidat do kuchyně',
  'scan.findingRecipes': 'Hledám recepty…',
  'scan.cookWithThese': 'Uvařit z toho',

  // ---- The kitchen list ---------------------------------------------------
  'pantry.addToList': 'Přidat na seznam',
  'pantry.addPlaceholder': 'kuře, rýže, paprika',
  'pantry.stillThere': (count: number) => `Pořád to máš? · ${count}`,
  'pantry.yes': 'Ano',
  'pantry.removed': (name: string) => `Odebráno: ${name}`,
  'pantry.remove': (name: string) => `Odebrat: ${name}`,
  'pantry.emptyHint': 'Zatím tu nic není. Napiš nahoru pár věcí, nebo vyfoť poličku.',
  'pantry.inTheKitchen': (count: number) => `V kuchyni · ${count}`,
  'pantry.staples': (count: number) => `Základní suroviny · ${count}`,

  // ---- A recipe you already have ------------------------------------------
  'import.chip': 'Vložit recept',
  'import.title': 'Recept, který už máš',
  'import.desc': 'Spočítám kalorie a vaření nechám na tobě.',
  'import.unreadable': 'Tohle jako recept přečíst neumím.',
  'import.saved': (title: string, kcal: string) => `Uloženo: ${title} – ${kcal} kcal na porci`,
  'import.placeholder':
    'Vlož nebo napiš recept – suroviny a postup, jakkoli ho máš zapsaný.',
  'import.working': 'Počítám…',
  'import.workOutMacros': 'Spočítat makra',

  // ---- A recipe -----------------------------------------------------------
  'recipe.save': 'Uložit',
  'recipe.saved': 'Uloženo',
  'recipe.saveThis': 'Uložit recept',
  'recipe.unsaveThis': 'Odebrat z uložených',
  'recipe.usesYour': (things: string) => `Použije z kuchyně: ${things}`,
  'recipe.fitsToday': 'Vejde se do zbytku dne',
  'recipe.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'kroků' }),
  'recipe.saveNamed': (title: string) => `Uložit: ${title}`,
  'recipe.unsaveNamed': (title: string) => `Odebrat z uložených: ${title}`,
  'recipe.forPortions': (portions: string) => `počet porcí: ${portions}`,
  'recipe.portionsCount': (count: number) => n(count, { one: 'porce', few: 'porce', many: 'porce', other: 'porcí' }),
  'recipe.howToMakeIt': (steps: string) => `Postup · ${steps}`,
  'recipe.ingredientsMakes': (portions: string) => `Suroviny · ${portions}`,
  // "Snědl jsem to" is gendered; "Snědeno" is the same receipt as "Zapsáno".
  'recipe.iAteThis': (kcal: string) => `Snědeno · ${kcal} kcal`,
  'recipe.openFull': 'Otevřít celý recept',
  'recipe.backToCook': 'Zpět do Kuchyně',
  'recipe.logged': (what: string, kcal: string) => `Zapsáno: ${what} – ${kcal} kcal`,
  'recipe.forServings': (servings: string, unit: string) => `pro ${servings} × ${unit}`,
  'recipe.publicDomain': 'volné dílo',
  'recipe.iAteThisPlain': (kcal: string) => `Snědeno · ${kcal}`,
  'recipe.youdNeed': (things: string) => `Bude potřeba: ${things}`,
  'recipe.fromLibrary': 'Z knihovny',
  'recipe.madeForYou': 'Na míru pro tebe',
  'recipe.madeForKitchen': 'Na míru tvé kuchyni',
  'recipe.adaptedForYou': 'Upraveno pro tebe',
  'recipe.yourOwn': 'Tvůj vlastní recept',
  'recipe.seeOriginal': 'Zobrazit originál',
  'recipe.writtenAgainst': (kcal: string, date: string) =>
    ` Psáno pro zbytek ${kcal} kcal ze dne ${date}.`,
  'recipe.ingredients': 'Suroviny',
  'recipe.notInKitchen': '· není v kuchyni',
  'recipe.method': 'Postup',
  'recipe.showMethod': 'Zobrazit postup',
  'recipe.hideMethod': 'Skrýt postup',
  'recipe.logging': 'Zapisuji…',
  'recipe.yesTonight': 'ano, dnes večer',
  'recipe.yesNow': 'ano, teď',
  'recipe.howMuch': 'Kolik toho bylo?',
  'recipe.less': 'Méně',
  'recipe.more': 'Víc',
  'recipe.servingsCount': (servings: string) => `počet porcí: ${servings}`,
  'recipe.portion': 'porce',
  'recipe.makeItFit': 'Upravit na míru',
  'recipe.reworking': 'Upravuji…',
  'recipe.notInLibrary': 'Tenhle recept v knihovně není.',
  'recipe.notHere': 'Tenhle recept už tu není.',
  'recipe.nothingCameBack': 'Nic se nevrátilo.',
  'recipe.ingredientsNote':
    'Změřeno pro hotové jídlo, jak bylo publikováno – takže hodnoty pro jednotlivé suroviny nemáme.',
  'recipe.confidenceHigh': 'Přesnější čísla bez vážení v téhle aplikaci nedostaneš.',
  'recipe.confidenceMedium':
    'Čísla jsou odhad – na zápis dost blízko, ale jestli na tom záleží, podívej se na ně ještě jednou.',
  'recipe.confidenceLow': 'Tahle čísla jsou hrubý tip. Když je den napjatý, zvaž, co můžeš.',
  'recipe.tileQualifier': (protein: string, serving: string) =>
    `kcal · ${protein}g bílkovin · ${serving}`,
  'recipe.kcalPer': (serving: string) => `kcal · ${serving}`,
  'recipe.makes': (count: number) => `Vystačí na ${n(count, { one: 'porci', few: 'porce', many: 'porce', other: 'porcí' })}`,

  // ---- Progress -----------------------------------------------------------
  'progress.title': 'Pokrok',
  'progress.daysWindow': (count: number) => n(count, { one: 'den', few: 'dny', many: 'dne', other: 'dní' }),
  'progress.daysShort': (count: number) => `${count} d`,
  'progress.weightTitle': '⚖️  Váha',
  'progress.noWeighIns': 'Zatím žádné vážení. Zapiš ho níže, nebo to prostě řekni deníku.',
  'progress.noWeighIn': 'Bez vážení',
  'progress.trendReadout': (value: string) => `7denní průměr ${value} – čára`,
  'progress.thisWeek': 'tento týden',
  'progress.avg7d': '7denní průměr',
  'progress.sinceStart': 'Od začátku',
  'progress.toTarget': 'Do cíle',
  'progress.logTodaysWeight': (unit: string) => `Zapsat dnešní váhu (${unit})`,
  'progress.caloriesTitle': '🔥  Kalorie',
  'progress.avgDayTarget': (target: string) => `průměr/den · cíl ${target}`,
  'progress.proteinTitle': '💪  Bílkoviny',
  'progress.hitTargetBefore': 'Cíl splněn v',
  'progress.ofDays': (hit: string, logged: string) => `${hit} z ${logged}`,
  'progress.hitTargetAfter': 'zapsaných dní.',
  'progress.qualityTitle': '🥦  Kvalita stravy',
  'progress.days': (count: number) => n(count, { one: 'den', few: 'dny', many: 'dne', other: 'dní' }),
  'progress.qualityFooter': (days: string, percent: string) =>
    `Průměr za ${days} – tyto hodnoty má ${percent} % zapsaných jídel.`,
  'progress.chartNutrient': (label: string) => `Graf: ${label}`,
  'progress.exerciseTitle': '🏃  Pohyb',
  // The reader's own question: "proč jsem nezhubl" would gender them.
  'progress.exerciseFooter':
    'Zeptej se deníku na cokoli o těchto datech – „proč mi tento týden neklesá váha?“',
  // Follows the session count set large. "cvičení" is the one Czech noun for a
  // session that reads the same after 1, 3 and 12.
  'progress.sessionsOver': (kcal: string, days: string) =>
    `cvičení · ~${kcal} kcal za ${days} dní`,
  'progress.qualityLine': (label: string, aim: string, target: string) =>
    `${label} průměr/den · ${aim} ${target}`,
  'progress.aimFor': 'cíl',
  'progress.keepUnder': 'pod',

  // ---- Exercise -----------------------------------------------------------
  'exercise.title': 'Pohyb',
  'exercise.nothingLogged': (days: string) => `Za posledních ${days} dní nic zapsáno.`,
  'exercise.tellTheJournal': (example: string) => `Napiš to do deníku – „běh na ${example}“.`,
  'exercise.consistencyTitle': '🔁  Pravidelnost',
  // Follows the active-day count set large: "12 z 30 dní aktivně".
  'exercise.activeOf': (days: string, sessions: string) => `z ${days} dní aktivně · ${sessions}`,
  'exercise.sessionsCount': (count: number) => n(count, { one: 'cvičení', few: 'cvičení', many: 'cvičení', other: 'cvičení' }),
  'exercise.burnedPerDay': 'Spálené kalorie za den',
  'exercise.burned': 'Spáleno',
  'exercise.distance': 'Vzdálenost',
  'exercise.time': 'Čas',
  'exercise.sessionsTitle': '🏃  Cvičení',
  'exercise.burnNote': (example: string) =>
    `Spálené kalorie jsou odhad a nikdy se neodečítají od tvého cíle. Oprav je v deníku – „ten běh byl spíš ${example}“.`,
  'exercise.minutes': (minutes: string) => `${minutes} min`,
  'exercise.restDay': 'Den volna',
  'exercise.moreSessions': (count: string) => `+${count} další`,

  // ---- Saved workouts -----------------------------------------------------
  // A saved routine is a "trénink"; one logged instance of exercise is a
  // "cvičení"; a movement inside it is a "cvik".
  'workouts.logTitle': '🏋️  Zapsat trénink',
  'workouts.logAction': 'Zapsat trénink',
  'workouts.savedTitle': '🏋️  Uložené tréninky',
  'workouts.buildOne': 'Vytvořit',
  'workouts.reuseHint': 'Jedním klepnutím vyplníš celou kartu, i s vahami z minula.',
  'workouts.whereSessionsGo':
    'Zapsaná cvičení najdeš v historii níže. Tenhle seznam je jen pro tréninky, které chceš opakovat.',
  'workouts.loadFailed': 'Uložené tréninky se nepodařilo načíst.',
  'workouts.noneSavedTitle': 'Zatím žádné uložené tréninky.',
  'workouts.noneSavedHint':
    'Uložený trénink je seznam, který používáš znovu – zapiš cvičení i s cviky a přijmi nabídku ho pojmenovat, nebo si ho vytvoř tady.',
  'workouts.exerciseCount': (count: number) => n(count, { one: 'cvik', few: 'cviky', many: 'cviku', other: 'cviků' }),
  'workouts.doneTimes': (times: string) => ` · odcvičeno ${times}×`,
  'workouts.editNamed': (name: string) => `Upravit: ${name}`,
  'workouts.deleteNamed': (name: string) => `Smazat: ${name}`,
  'workouts.weekTitle': '🗓️  Tvůj týden',
  'workouts.weekFooter':
    'Dny, které nastavíš, jsou pevné. Volné dny se řídí tím, co opravdu děláš.',
  'workouts.workoutFor': (day: string) => `Trénink – ${day}`,
  'workouts.usually': (workout: string) => `${workout} – obvykle`,
  'workouts.youSetThis': 'tvoje volba',
  'workouts.learned': 'podle zvyku',
  'workouts.editTitle': '✏️  Upravit trénink',
  'workouts.buildTitle': '🏋️  Vytvořit trénink',
  'workouts.icon': 'Ikona',
  'workouts.namePlaceholder': 'Tlaky, Hrudník, Nohy A…',
  'workouts.nameLabel': 'Název tréninku',
  'workouts.sets': (count: number) => n(count, { one: 'série', few: 'série', many: 'série', other: 'sérií' }),
  'workouts.oneFewerSet': (exercise: string) => `O sérii méně: ${exercise}`,
  'workouts.oneMoreSet': (exercise: string) => `O sérii víc: ${exercise}`,
  'workouts.removeExercise': (exercise: string) => `Odebrat: ${exercise}`,

  // ---- Resetting a password -----------------------------------------------
  'plan.title': 'Tento týden',
  'plan.subtitle': 'Večeře spočítané podle tvých cílů. Jedním klepnutím zapíšeš večer, kdy se vařilo.',
  'plan.weekTitle': (range: string) => `📅  ${range}`,
  'plan.weekFooter': 'Otevři večer a přečti si postup, nebo ho přeskoč, když nejsi doma.',
  'plan.nothingYet': 'Na tento týden zatím nic naplánováno.',
  'plan.askInBefore': 'Vyplň týden níže, nebo si o něj řekni v',
  'plan.journal': 'deníku',
  'plan.howToTitle': '🍳  Jak naplánovat týden',
  'plan.howToBefore':
    'Tohle je nejnáročnější věc, kterou kuchyně dělá, takže proběhne jednou a pak si plán upravíš. Nebo to řekni v',
  'plan.howToAfter': '– „naplánuj mi večeře na tento týden, jsme dva, nic přes 30 minut“.',
  'plan.anythingHappening': 'Děje se tento týden něco?',
  'plan.wantsPlaceholder': '„ve čtvrtek nejsem doma“, „spotřebovat dýni“',
  'plan.howManyItFeeds': 'Pro kolik osob',
  'plan.howManyItFeedsHint': 'Každá večeře se vaří pro tolik lidí.',
  'plan.people': (count: number) => n(count, { one: 'osoba', few: 'osoby', many: 'osoby', other: 'osob' }),
  'plan.cookOnce': 'Uvař jednou, jez dvakrát',
  'plan.cookOnceHint':
    'Větší vaření pokryje i další večer, takže strávíš v týdnu u plotny méně večerů.',
  'plan.longestCook': 'Nejdelší vaření',
  'plan.longestCookHint': 'Žádná večeře v týdnu nezabere déle.',
  'plan.anyLength': 'Bez omezení',
  'plan.any': 'Cokoli',
  'plan.minutesShort': (minutes: string) => `${minutes} min`,
  'plan.minutesLabel': (minutes: string) => `${minutes} minut`,
  'plan.writing': 'Píšu týden…',
  'plan.again': 'Naplánovat znovu',
  'plan.planTheWeek': 'Naplánovat týden',
  'plan.kcalProtein': (protein: string) => `kcal · ${protein}g bílkovin`,
  'plan.coversNext': 'Vystačí i na další večer',
  'plan.coversMore': (nights: string) => `Vystačí i na další večery (${nights})`,
  'plan.cooked': 'Uvařeno',
  'plan.skipNamed': (day: string) => `Přeskočit: ${day}`,
  'plan.nothingPlanned': 'Nic naplánováno',
  'plan.nightsCount': (count: number) => n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerů' }),

  'shopping.title': '🧺  Nákupní seznam',
  'shopping.haveAlready': (things: string) =>
    `Vynecháno, protože v kuchyni už máš: ${things}.`,
  'shopping.addToList': 'Přidat na seznam',
  'shopping.placeholder': 'kuchyňské utěrky, pytle na odpad',
  'shopping.addHint':
    'Na věci, o které by žádný recept nežádal. Suroviny níže jsou z plánu týdne.',
  'shopping.empty': 'Seznam je zatím prázdný. Naplánuj týden, nebo napiš, co potřebuješ.',
  'shopping.putBack': (name: string) => `Vrátit na seznam: ${name}`,
  'shopping.tickOff': (name: string) => `Odškrtnout: ${name}`,
  'shopping.takeOff': (name: string) => `Odebrat ze seznamu: ${name}`,

  // ---- The barcode scanner ------------------------------------------------
  'barcode.isThisIt': 'Je to ono?',
  'barcode.scanThePacket': 'Naskenuj balení',
  'barcode.sayHowMuch': 'Řekni, kolik toho bylo.',
  'barcode.pointAtIt': 'Namiř na čárový kód – údaje z etikety se načtou.',
  'barcode.noCamera':
    'Tady není fotoaparát – vyfoť čárový kód a přečtu ho z fotky.',
  'barcode.reading': 'Čtu…',
  'barcode.photographInstead': 'Radši vyfotit',
  'barcode.unreadable': 'Čárový kód tu přečíst nejde – zkus ho dostat víc do záběru.',
  'barcode.badFormat': 'Tenhle formát obrázku přečíst neumím – JPEG nebo PNG půjde.',
  'barcode.aServing': (mass: string) => `${mass} na porci`,
  'barcode.weighIt': 'Zvážit',
  'barcode.servings': 'porce',
  'barcode.weighed': 'zváženo',
  'barcode.howMuchIn': (unit: string) => `Kolik toho bylo (${unit})`,
  'barcode.sourceOff': 'Data z Open Food Facts',
  'barcode.sourceUsdaLong': 'Data z USDA FoodData Central',
  'barcode.sourceUsda': 'Data z USDA',
  'barcode.wrongPacket': 'Jiné balení?',
  'barcode.notFound': 'Nenašlo se',
  'barcode.notFoundBody':
    'Tohle zatím nikdo nezaevidoval – u privátních značek se to stává často. Vyfoť tabulku výživových údajů a přečtu je z etikety.',
  'barcode.photographLabel': 'Vyfotit etiketu',
  'barcode.scanDifferent': 'Naskenovat jiné balení',

  'repeat.footer':
    'Zapíše se s dnešním časem. Jestli byla porce jiná, napiš to do deníku a opravím to.',
  'repeat.search': 'Hledat v jídlech',
  'repeat.kcalProtein': (kcal: string, protein: string) => `${kcal} kcal · ${protein}g bílkovin`,
  'repeat.logAgainNamed': (what: string) => `Zapsat znovu: ${what}`,
  'repeat.adding': 'Přidávám…',

  'editor.needsAnItem': 'Jídlo musí mít aspoň jednu položku. Smazat ho?',
  'editor.needsAName': 'Co to bylo? Jídlo potřebuje název.',
  'editor.logItYourself': 'Zapsat ručně',
  'editor.fixWhatsWrong': 'Opravit, co nesedí',
  'editor.whatThisWas': 'Co to bylo',
  'editor.whatWasIt': 'Co to bylo?',
  'editor.itemName': (index: string) => `Název položky ${index}`,
  'editor.itemPlaceholder': 'Položka',
  'editor.removeItem': (what: string) => `Odebrat: ${what}`,
  'editor.itemFallback': (index: string) => `položka ${index}`,
  'editor.itemQuantity': (index: string) => `Množství položky ${index}`,
  'editor.howMuch': 'kolik',
  'editor.itemCalories': (index: string) => `Kalorie položky ${index}`,
  'editor.itemProtein': (index: string) => `Bílkoviny položky ${index}`,
  'editor.itemCarbs': (index: string) => `Sacharidy položky ${index}`,
  'editor.itemFat': (index: string) => `Tuky položky ${index}`,
  'editor.adjustedHeading': 'Uloženo. Některé hodnoty nešlo uložit tak, jak byly zadané:',
  'editor.adjustedMass': (name: string) => `${name} – bílkoviny, sacharidy a tuky by vážily víc než samotné jídlo`,
  'editor.adjustedCeiling': (name: string) => `${name} – takové množství jídla nemůže mít tolik kalorií`,
  'editor.adjustedFloor': (name: string) => `${name} – už samotná makra mají víc kalorií`,
  'editor.anotherItem': 'další položka',
  'editor.log': 'Zapsat',
  'editor.saveTotal': (verb: string, kcal: string) => `${verb} · ${kcal} kcal`,

  // ---- Cards in the conversation ------------------------------------------
  'chat.removed': 'Odebráno',
  'chat.openWeekPlan': 'Otevřít plán týdne',
  'chat.thisWeeksDinners': 'Večeře na tento týden',
  'chat.nights': (count: number) => n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerů' }),
  'chat.nothingPlanned': 'Nic naplánováno',
  'chat.burnEstimate': 'Spálené kalorie jsou odhad',
  'chat.notAddedToBudget': ' · nepřičítá se k tvému rozpočtu',
  'chat.editNamed': (name: string) => `Upravit: ${name}`,
  'chat.notAWeight': 'To není váha.',
  'chat.editWeighIn': 'Upravit toto vážení',
  'chat.notEnoughDays': 'Na trend je zatím málo zapsaných dní.',
  'chat.lastWeek': 'Minulý týden',
  'chat.nothingLogged': 'Nic zapsáno',
  'chat.kcalTitle': (kcal: string) => `${kcal} kcal`,
  'chat.nothingLoggedThisWeek': 'Tento týden nic zapsáno.',
  'chat.weekSummary': (days: string, onTarget: string) =>
    `Zapsáno: ${days}, do 10 % od cíle: ${onTarget}.`,
  'chat.aDayAgainst': (target: string) => `denně, cíl ${target}`,
  'chat.onTheScale': 'na váze',
  'chat.burnedOver': (sessions: string) => `spáleno za ${sessions}`,
  'chat.proteinADayAgainst': (target: string) => `bílkovin denně, cíl ${target}`,
  'chat.showLess': 'Zobrazit méně',
  'chat.readTheRest': (count: string) => `Číst dál (ještě ${count})`,
  'chat.atLoad': (loads: string) => ` s ${loads}`,
  'chat.setsCount': (count: number) => n(count, { one: 'série', few: 'série', many: 'série', other: 'sérií' }),
  'chat.ofTarget': (target: string) => `z ${target}`,
  'chat.avg': 'průměr',
  'chat.onDate': (date: string) => `dne ${date}`,

  // ---- The journal --------------------------------------------------------
  // The prompts are the reader's own words, so none of them is in the past
  // tense ("běžel jsem" would gender them).
  'journal.promptEggs': 'Dvě vajíčka, rohlík a kafe',
  'journal.promptLunch': 'K obědu kuře s rýží',
  'journal.promptRun': (distance: string) => `Běh na ${distance}`,
  'journal.promptProtein': 'Jím dost bílkovin?',
  'journal.emptyTitle': 'Co dnes bylo k jídlu?',
  'journal.emptyBody':
    'Napiš to nebo vyfoť – jak je ti to pohodlnější. Žádné formuláře, nic k hledání. Napiš, jak to bylo, a zbytek spočítám.',
  'journal.over': (kcal: string) => `${kcal} nad cílem`,
  'journal.left': (kcal: string) => `zbývá ${kcal}`,
  'journal.burned': (kcal: string) => `−${kcal} spáleno`,
  'journal.net': (kcal: string) => ` · čistě ${kcal} kcal`,
  'journal.loggedMeal': 'Zapsané jídlo',
  'journal.thinking': 'Přemýšlím',
  'journal.lost':
    'Spojení se přerušilo dřív, než přišla odpověď. Co se stihlo uložit, najdeš tu, až se vrátíš.',

  'tool.log': 'Zapisuji',
  'tool.update': 'Upravuji',
  'tool.delete': 'Odebírám',
  'tool.get': 'Kontroluji',
  'tool.search': 'Procházím historii',
  'tool.find': 'Hledám',
  'tool.set': 'Ukládám',
  'tool.show': 'Kreslím',
  'tool.suggest': 'Vymýšlím',
  'tool.import': 'Importuji',
  'tool.adapt': 'Přizpůsobuji',
  'tool.save': 'Ukládám',
  'tool.plan': 'Plánuji',
  'tool.cook': 'Vařím',
  'tool.repeat': 'Opakuji',
  'tool.remember': 'Zapamatovávám si',
  'tool.forget': 'Zapomínám',
  'tool.lookup': 'Vyhledávám',
  'tool.run': 'Spouštím',
  'tool.define': 'Definuji',
  'tool.ask': 'Ptám se',

  // ---- The workout card ---------------------------------------------------
  'workout.strength': 'Posilování',
  'workout.cardio': 'Kardio',
  'workout.class': 'Lekce',
  'workout.sport': 'Sport',
  'workout.flexibility': 'Mobilita',
  'workout.fallbackName': 'Trénink',
  'workout.savedRoutine': (name: string) => `Uloženo jako „${name}“ – příště stačí klepnout`,
  'workout.routineNotSaved': 'Zapsáno, ale trénink se neuložil',
  'workout.updated': (what: string, kcal: string) => `Upraveno: ${what} – teď ~${kcal} kcal`,
  'workout.logged': (what: string, kcal: string) => `Zapsáno: ${what} – ~${kcal} kcal`,
  'workout.change': 'Změnit',
  'workout.yourWorkouts': 'Tvoje tréninky',
  'workout.today': '· dnes',
  'workout.howLong': 'Jak dlouho?',
  'workout.addWhatYouDid': 'Přidej, co se cvičilo',
  // `when` is "dnes", "včera", a weekday or a date — only the first two survive
  // "jako …" undeclined, so it goes in brackets.
  'workout.sameAs': (when: string) => `Stejné jako minule (${when})`,
  'workout.exerciseCount': (count: number) => `(${n(count, { one: 'cvik', few: 'cviky', many: 'cviku', other: 'cviků' })})`,
  'workout.yours': '· tvůj',
  'workout.saveThisAs': (name: string) => `Uložit jako „${name}“`,
  'workout.nameForThis': 'Název tréninku',
  'workout.dontSave': 'Neukládat jako trénink',
  'workout.saveChanges': 'Uložit změny',
  'workout.logSession': 'Zapsat cvičení',
  'workout.fixWhatsWrong': 'Opravit, co nesedí',
  // "Co jsi dělal?" is gendered.
  'workout.whatDidYouDo': 'Co bylo na programu?',
  'workout.roughlyIsFine': 'Stačí přibližně.',
  'workout.reps': 'opak.',
  'workout.min': 'min',
  'workout.removeSet': (index: string) => `Odebrat sérii ${index}`,
  'workout.anotherSet': 'Další série',
  'workout.removeNamed': (name: string) => `Odebrat: ${name}`,

  // ---- The weekly review --------------------------------------------------
  'review.lastWeek': '📅  Minulý týden',
  'review.title': '📅  Týdenní přehled',
  'review.pitch':
    'Každé pondělí ráno dostaneš krátké shrnutí, jak týden proběhl – co čísla opravdu ukázala a jestli je potřeba posunout cíl. Žádné poučování, jen jasný obrázek.',
  'review.writing': 'Píšu…',
  'review.writeOne': 'Napsat teď',
  'review.currentTarget': (kcal: string) => `Cíl ${kcal} kcal.`,
  'review.willApply': 'Příští přehled to použije. ',
  'review.kcalUnit': (kcal: string) => `${kcal} kcal`,
  'review.partOf': (plan: string) => `Součást tarifu ${plan}`,

  'quality.title': '🥦\u00a0\u00a0Kvalita stravy',
  'quality.partlyMeasured': 'částečně změřeno',
  'quality.notEstimated': 'bez odhadu',

  'nutrient.sodium': 'Sodík',
  'nutrient.satFat': 'Nasycené tuky',
  'nutrient.sugar': 'Cukr',

  'chart.daily': 'Denní graf',
  'chart.arrowHint': (label: string) => `${label}. Šipkami můžeš procházet jednotlivé dny.`,
  'chart.touchHint': 'Graf. Dotykem a tažením si přečteš jednotlivé dny.',

  // ---- What the phone says and the web does not ---------------------------
  'cook.photographFridge': 'vyfoť lednici',
  'cook.kitchenLocked': 'Kuchyně je součástí tarifu Coach',
  'cook.kitchenLockedBody':
    'Vyfoť lednici, nech si napsat recept z toho, co v ní je, a naplánuj podle toho večeře na celý týden. Knihovna receptů níže zůstává zdarma – procházej ji, vař z ní, zapisuj.',
  'cook.emptyLockedBefore': 'Zatím tu nic není. Karta',
  'cook.emptyLockedAfter': 'nahoře je plná receptů, které můžeš uvařit a zapsat zdarma.',
  'cook.emptyAfterShort': 'a vymyslím recept z toho, co máš v kuchyni.',
  'cook.workOutCalories': 'Spočítat kalorie',
  'cook.readingIt': 'Čtu…',

  'scan.photographShelf': 'Vyfotit poličku',
  'scan.looking': 'Dívám se…',
  'scan.scanYourFridge': 'Naskenovat lednici',
  'scan.notSure': 'nejisté',
  'scan.isThisIt': 'Je to tohle?',
  'scan.addToKitchenShort': 'Do kuchyně',
  'scan.cooking': 'Vařím…',
  'scan.cookFromThese': 'Uvařit z toho',
  'pantry.stillHaveIt': 'Pořád mám',
  'pantry.iStillHave': (name: string) => `Pořád mám: ${name}`,

  'barcode.title': 'Naskenovat čárový kód',
  'barcode.lookingUp': 'Hledám…',
  'barcode.pointAtBarcode': 'Namiř na čárový kód',
  'barcode.checkingCamera': 'Kontroluji fotoaparát…',
  'barcode.needsCamera': 'Skener potřebuje fotoaparát.',
  'barcode.iAteThis': 'Snědeno',
  'barcode.howMany': 'Kolik kusů?',
  'barcode.howMuch': 'Kolik?',
  'barcode.scanAnother': 'Naskenovat další',
  'barcode.addToMessage': 'Přidat ke zprávě',
  'barcode.setTheAmount': 'Nastavit množství',
  'barcode.added': (name: string) => `${name} – přidáno`,
  'barcode.addedToMessage': (count: number) =>
    `Ke zprávě: ${n(count, { one: 'balení', few: 'balení', many: 'balení', other: 'balení' })}`,
  'barcode.nothingAddedYet': 'Zatím nic přidáno',
  'barcode.nothingUploaded': 'Nic se nenahrává – kód se čte přímo v telefonu.',
  'barcode.allowCamera': 'Povolit fotoaparát',
  'barcode.perBasis': (kcal: string, protein: string, basis: string) =>
    `${kcal} kcal · ${protein}g bílkovin na ${basis}`,
  'barcode.tapToType': 'Klepni na číslo a přepiš ho',
  'barcode.totalLine': (protein: string, mass: string) => `kcal · ${protein}g bílkovin · ${mass}`,
  'barcode.partialTitle': 'U tohohle jsou jen neúplné údaje.',
  'barcode.partialHint':
    'Na zápis to nestačí. Vyfoť tabulku výživových údajů a deník ji přečte.',
  'barcode.notCatalogued': 'Tohle v databázi není.',
  'barcode.notCataloguedHint':
    'U privátních značek to tak bývá. Vyfoť raději tabulku výživových údajů a deník ji přečte.',

  'composer.listening': 'Poslouchám…',
  'composer.stopListening': 'Přestat poslouchat',
  'composer.sayWhatYouAte': 'Řekni, co bylo k jídlu',
  'composer.addPhotoShort': 'Přidat fotku',

  'workouts.logActionMobile': '+ Zapsat trénink',
  'workouts.oneFewerSetShort': 'O sérii méně',
  'workouts.oneMoreSetShort': 'O sérii víc',
  'workouts.noneSavedMobile':
    'Zatím žádné uložené tréninky. Uložený trénink je seznam, který používáš znovu – zapiš cvičení i s cviky a přijmi nabídku ho pojmenovat, nebo si ho vytvoř tady.',
  'workouts.routineOn': (name: string, day: string) => `${name} · ${day}`,
  'workouts.set': 'nastaveno',
  'workouts.learnedGuess': (name: string) => `${name}?`,
  'workout.classMobile': 'Lekce',
  'workout.flexibilityMobile': 'Protažení',
  'workout.routineNotSavedMobile': 'Zapsáno, ale trénink se neuložil',
  'workout.nameIt': 'Pojmenovat',
  'workout.logIt': 'Zapsat',
  'workout.sameAsShort': (when: string) => `↻ jako minule (${when})`,
  'workout.lastTime': (figure: string) => `minule ${figure}`,
  'workout.adjust': 'Upravit',
  'workout.setsDiffered': 'Série se lišily',
  'workout.sameEverySet': 'Každá série stejně',
  'workout.setsLabel': 'série',
  'workout.searchExercises': 'Hledat – název nebo sval',
  'workout.doneThese': 'Tyhle už máš za sebou',
  'workout.browseMuscle': 'Nebo vyber podle svalu',
  'workout.addNamed': (name: string) => `＋ Přidat „${name}“`,
  'workout.nothingMatches': 'Nic neodpovídá',
  'workout.otherLength': 'Jiná',
  'workout.minutesLabel': 'Minuty',

  'editor.anotherItemLabel': 'další položka',

  'plan.cookTab': 'Kuchyně',
  'plan.theWeek': 'Týden',
  'plan.locked': 'Plánování týdne je součástí tarifu Coach',
  'plan.planItTitle': '🗓  Naplánovat',
  'plan.wantsPlaceholderShort': 'Něco na přání? – „nic s rybou“',
  'plan.peopleUnit': 'os.',
  'plan.minUnit': 'min',
  'plan.batchWhereItHelps': 'Vařit do zásoby, kde se to hodí',
  'plan.batchCooking': 'Vaření do zásoby',
  'plan.planning': 'Plánuji…',
  'plan.dinnersTitle': '🍽  Večeře',
  'plan.lockedBody':
    'Sedm večeří podle tvých cílů a toho, co už máš v kuchyni, s vařením do zásoby, kde se to hodí, a s nákupním seznamem sepsaným za tebe.',
  'plan.planItFooter':
    'Sedm večeří podle tvých cílů a toho, co už je v kuchyni. Vaření do zásoby znamená jedno vaření na dva večery.',
  'plan.cookingFor': 'Vaříš pro',
  'plan.atMost': 'Nejvýš',
  'plan.batchHint': 'Jedno vaření na dva večery.',
  'plan.covers': (count: number) =>
    ` · vystačí na ${n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerů' })}`,
  'plan.cookedNamed': (title: string) => `Uvařeno: ${title}`,
  'plan.clearNamed': (day: string) => `Vymazat: ${day}`,
  'shopping.titleShort': '🧾  Nákup',
  'shopping.addSomethingElse': 'Přidat něco dalšího',
  'shopping.alreadyHave': (things: string) => `Vynecháno, protože už máš: ${things}.`,
  'shopping.nothingToBuy': 'Zatím není co kupovat.',

  'progress.openExerciseTab': 'Otevřít kartu Pohyb',
  'quality.fillThemselvesIn': 'Napiš do deníku, co bylo k jídlu, a hodnoty se doplní samy.',
  'quality.partialCoverage': (percent: string) =>
    `Tyto hodnoty má jen ${percent} % dnešních kalorií, takže součty jsou spodní hranice, ne celý den.`,
  'quality.spentTail': (spent: string, plan: string, allowed: string) =>
    `${spent} – ${plan} jich má ${allowed} měsíčně.`,
  'quality.estimateNote': (tail: string) =>
    `Tyto čtyři hodnoty odhaduje model, takže je mají jen jídla zapsaná přes deník – ručně zadaná, zopakovaná a naskenovaná je nechávají prázdné. ${tail}`,

  // ---- The store ----------------------------------------------------------
  // A paid plan is a "tarif", as Czech phone contracts and streaming services
  // call it; "plán" is kept for the onboarding plan and the week's dinners.
  'plans.spent': 'Tarif je vyčerpaný',
  'plans.upgrade': 'Vyšší tarif',
  'plans.seeWhatAdds': (plan: string) => `Co přidává ${plan}`,
  'plans.remainingHint': (remaining: string) => `${remaining}. Podívej se na tarify.`,
  'plans.hide': 'Skrýt',
  'plans.restored': 'Obnoveno. Vítej zpátky.',
  'plans.restoredShort': 'Obnoveno.',
  'plans.noneFound': 'Na tomhle účtu v obchodě se žádné předplatné nenašlo.',
  'plans.keepItGoing': 'Pokračuj dál.',
  'plans.yearly': 'Ročně',
  'plans.monthly': 'Měsíčně',
  'plans.oneMoment': 'Moment…',
  'plans.bestValue': 'Nejvýhodnější',
  'plans.messagesHeading': 'Další zprávy',
  'plans.messagesBody':
    'Navíc k tomu, co ti tarif dává každý měsíc. Jednorázový nákup, žádné předplatné – vydrží, dokud je nevyužiješ.',
  'plans.messagesCount': (count: number) => n(count, { one: 'zpráva', few: 'zprávy', many: 'zprávy', other: 'zpráv' }),
  'plans.messagesAdded': (count: number) => `Přidáno: ${n(count, { one: 'zpráva', few: 'zprávy', many: 'zprávy', other: 'zpráv' })}.`,
  'plans.messagesOnTheWay': 'Zaplaceno. Zprávy se za chvíli objeví.',
  'plans.messagesBuyHint': (count: number, price: string) => `Koupit ${n(count, { one: 'zprávu', few: 'zprávy', many: 'zprávy', other: 'zpráv' })} za ${price}`,
  'plans.scansHeading': 'Další skeny fotek',
  'plans.scansBody': 'Jednorázový nákup, žádné předplatné. Vydrží, dokud je nevyužiješ.',
  'plans.scansCount': (count: number) => n(count, { one: 'sken fotky', few: 'skeny fotek', many: 'skenu fotky', other: 'skenů fotek' }),
  'plans.scansAdded': (count: number) => `Přidáno: ${n(count, { one: 'sken', few: 'skeny', many: 'skenu', other: 'skenů' })}.`,
  'plans.scansOnTheWay': 'Zaplaceno. Skeny se za chvíli objeví.',
  'plans.scansBuyHint': (count: number, price: string) =>
    `Koupit ${n(count, { one: 'sken fotky', few: 'skeny fotek', many: 'skenu fotky', other: 'skenů fotek' })} za ${price}`,
  'plans.checkingStore': 'Kontroluji obchod…',
  'plans.alreadyPaid': 'Už zaplaceno? Obnovit',
  'plans.restorePrompt': 'Chci obnovit nákup',
  'plans.paidNotShowing': 'Zaplaceno, ale nic se neukazuje? Obnovit',
  'plans.freeOnEvery': 'Zdarma v každém tarifu',
  'plans.billedYearly': 'Účtováno jednou ročně',
  'plans.billedMonthly': 'Účtováno měsíčně',
  'plans.everythingInPlus': 'Vše z tarifu Plus',
  'plans.yourPlan': 'Tvůj tarif',
  'plans.aYear': 'ročně',
  'plans.aMonth': 'měsíčně',
  'plans.worksOutAt': (price: string) => `Vychází na ${price} měsíčně.`,
  // "co zapíšeš sám" is gendered; "ručně" says the same thing.
  'plans.onFree': 'Máš tarif Free. Všechno, co zapíšeš ručně, zůstává zdarma – tohle platí za části, které přemýšlejí.',
  'plans.onPlan': (plan: string) => `Máš tarif ${plan}.`,
  'plans.savePercent': (percent: string) => ` · ušetříš ${percent} %`,
  'plans.get': (plan: string) => `Pořídit ${plan}`,
  'plans.nothingOnSale':
    'Obchod pro tuto aplikaci zatím nic nenabízí. Nic, co dřív šlo, není zamčené – vrať se později a bude to tu.',
  'plans.noStore': 'Tahle verze aplikace se k obchodu nedostane, takže tu zatím není co koupit.',
  'plans.restoreNote':
    'Znovu načte tento účet v obchodě a vrátí všechno, co už máš zaplacené. Nikdy ti nic nestrhne podruhé.',
  'plans.manage': 'Spravovat nebo zrušit předplatné',
  'plans.smallPrint': (billing: string) =>
    `${billing} přes obchod; předplatné se obnovuje, dokud ho nezrušíš. Zrušit ho můžeš kdykoli ve svém účtu v obchodě – co máš zaplacené, ti zůstane do konce období.`,
  'plans.pendingLong':
    'Obchod tvoji platbu má a tarif je na cestě. Odemkne se sám – nic dalšího platit nemusíš.',
  'plans.pendingShort': 'Obchod tvoji platbu má. Tarif se za chvíli odemkne.',
  'plans.whatThatOpens': 'Co tím získáš',
  'plans.startLogging': 'Začít zapisovat',
  'plans.backToJournal': 'Zpět do deníku',
  'plans.youreOnPlan': (plan: string) => `Máš tarif ${plan}.`,
  'plans.paymentReceived': 'Platba přijata.',
  'plans.manageOnStore': 'Spravovat nebo zrušit ho můžeš kdykoli v obchodě v sekci Předplatná.',
  'plans.youreOn': 'Máš tarif',
  'plans.photoScans': 'Skeny fotek',
  'plans.unlimited': 'Neomezeně',
  'plans.seeWhatIncludes': 'Co tvůj tarif obsahuje',
  'plans.seeThePlans': 'Zobrazit tarify',
  'plans.restorePurchase': 'Obnovit nákup',
  'plans.planTitle': 'Tarif',
  'plans.leftThisMonth': (left: string) => `tento měsíc zbývá ${left}`,
  'plans.plusBought': (bought: string) => ` · dokoupeno ${bought}`,
  'plans.leftEver': (left: string) => `zbývá ${left}`,
  'setup.tellingYouThings': 'Upozornění',
  'setup.emailFooterWithReview':
    'Týdenní přehled chodí v pondělí ráno. E-maily o tvém účtu – změna hesla, přihlášení z neznámého zařízení – chodí vždycky.',
  'setup.emailFooter':
    'E-maily o tvém účtu – změna hesla, přihlášení z neznámého zařízení – chodí vždycky.',
  'setup.confirmFirst': (email: string) =>
    `Dokud nepotvrdíš ${email}, zapomenuté heslo nepůjde obnovit – nedalo by se ověřit, že schránka patří tobě.`,
  'setup.sendLinkAgain': 'Poslat odkaz znovu',
  'setup.weeklyReview': 'Týdenní přehled',
  'setup.weeklyReviewHint': 'Shrnutí minulého týdne, v pondělí.',
  'setup.sendMeReview': 'Posílat mi týdenní přehled',
  // "Nudge" as in behavioural economics: a small push, not a reminder.
  'setup.nudges': 'Postrčení',
  'setup.nudgesHintMobile':
    'Nejvýš jedno týdně, když je ve tvých zápisech něco, co stojí za zmínku. V deníku se objeví vždycky; tohle je pošle i do telefonu – nebo e-mailem, když máš upozornění vypnutá.',
  'setup.sendMeNudges': 'Posílat mi postrčení',
  'setup.streaksAndGoals': 'Série a cíle',
  'setup.streaksHint':
    'Série zapsaných dní, která stojí za povšimnutí, a den, kdy váha ukáže číslo, které máš nastavené. Záměrně vzácné a nikdy e-mailem – chodí jen do telefonu, nebo nikam.',
  'setup.tellMeStreaks': 'Dávat mi vědět o sériích a cílech',
  'setup.eveningRecap': 'Večerní souhrn',
  'setup.eveningRecapHint':
    'Dnešní kalorie a bílkoviny proti dnešním cílům, v devět večer. Každý den, kdy máš něco zapsáno – jediné upozornění tady, které nechodí jen občas.',
  'setup.sendMeRecap': 'Posílat mi večerní souhrn',
  'setup.remindersTitle': 'Připomínky na tomto telefonu',
  'setup.remindersFooter':
    'Nastavené tady, uložené tady. Nepotřebují účet ani připojení, chodí bez ohledu na tarif a na nový telefon se nepřenesou.',
  'setup.logYourDay': 'Zapiš svůj den',
  'setup.logYourDayHint':
    'Připomínka přímo z telefonu, v čas, který si vybereš. O tom, co máš zapsané, nic neví – je to budík, ne názor.',
  'setup.remindMeToLog': 'Připomínat mi zápis',
  // Row labels beside a time and a weekday picker; "V" alone would need the
  // weekday in the accusative.
  'setup.at': 'Čas',
  'setup.reminderTime': 'Čas připomínky',
  'setup.weighIn': 'Vážení',
  'setup.weighInHint':
    'Jednou týdně, před snídaní. Denní vážení měří spíš včerejší sůl než tebe, a proto se denně nenabízí.',
  'setup.remindMeToWeigh': 'Připomínat mi vážení',
  'setup.on': 'Den',
  'setup.weighInDay': 'Den vážení',
  'setup.weighInTime': 'Čas vážení',
  'setup.deleting': 'Mažu…',
  'setup.deleteEverything': 'Smazat všechno',
  'setup.deleteWarningBefore': 'Tímto se smažou všechna jídla, fotky, váhy a konverzace účtu',
  'setup.deleteWarningAfter':
    ' na všech zařízeních. Vrátit to nepůjde. Pro potvrzení zadej heslo.',

  // ---- The words the app uses about money ---------------------------------
  //
  // The metered noun cannot be declined from outside, and a possessive or a
  // past participle in front of it would have to agree with its gender, so the
  // headlines put the count and noun after a colon ("Vyčerpáno: 30 zpráv").
  'meter.chat': (count: number) => w(count, { one: 'zpráva', few: 'zprávy', many: 'zprávy', other: 'zpráv' }),
  'meter.photo': (count: number) => w(count, { one: 'sken fotky', few: 'skeny fotek', many: 'skenu fotky', other: 'skenů fotek' }),
  'meter.pantryScan': (count: number) => w(count, { one: 'sken lednice', few: 'skeny lednice', many: 'skenu lednice', other: 'skenů lednice' }),
  'meter.recipe': (count: number) => w(count, { one: 'recept', few: 'recepty', many: 'receptu', other: 'receptů' }),
  'meter.mealPlan': (count: number) => w(count, { one: 'jídelníček', few: 'jídelníčky', many: 'jídelníčku', other: 'jídelníčků' }),

  'tier.pitchFree': 'Kompletní jídelní deník, offline a bez limitů.',
  'tier.pitchPlus': 'Deník každý den a k tomu týdenní ohlédnutí.',
  'tier.pitchCoach': 'A k tomu kuchyně: vař z lednice, plánuj týden.',

  'wall.notOnPlan': (plural: string) => `${plural} nejsou v tvém tarifu`,
  'wall.freeGrant': (count: number, noun: string) => `Vyčerpáno: ${count} ${noun} zdarma`,
  'wall.monthlyGrant': (count: number, noun: string) => `Tento měsíc vyčerpáno: ${count} ${noun}`,
  'wall.comeBack': (when: string) => ` Obnoví se ${when}.`,
  'wall.bodyChat': 'Ruční zápis jídla je neomezený a vždycky zdarma – ukážu ti kde.',
  'wall.bodyPhoto':
    'Pořád můžeš jídlo zapsat ručně, zopakovat něco, co už v deníku máš, nebo naskenovat čárový kód. Nic z toho se do limitu nepočítá.',
  'wall.bodyPantryScan': 'Seznam v kuchyni funguje dál – co v ní máš, můžeš přidávat ručně.',
  'wall.bodyRecipe':
    'Všechny uvařené recepty zůstávají uložené a knihovnu receptů můžeš procházet zdarma.',
  'wall.bodyMealPlan':
    'Naposledy naplánovaný týden tu pořád je a vařit můžeš dál z uložených receptů.',
  // The verb agrees with the count: "Zbývají 3 zprávy", "Zbývá 5 zpráv".
  'wall.remaining': (count: number, noun: string) =>
    `${count >= 2 && count <= 4 ? 'Zbývají' : 'Zbývá'} ${count} ${noun}`,
  // The reader's own words; "Zapíšu si to sám" is gendered, so the button
  // keeps the infinitive.
  'wall.logMyself': 'Zapsat ručně',
  'wall.loggedByHand': 'Zapsáno ručně – tahle cesta je vždycky otevřená a nikdy se nepočítá do žádného limitu.',

  'tier.reviewAndNudge': 'Týdenní přehled a postrčení, když se odmlčíš',
  'tier.review': 'Týdenní přehled toho, jak jíš',
  'tier.nudge': 'Postrčení, když se odmlčíš',
  'tier.countNoun': (count: number, noun: string) => `${count} ${noun}`,
  'tier.toTry': (list: string) => `${list} na vyzkoušení`,
  'tier.aMonth': (list: string) => `${list} měsíčně`,
  'tier.everythingIn': (plan: string) => `Vše z tarifu ${plan}`,

  'free.typing': 'Ruční zápis jídel a jejich opravy',
  'free.repeat': 'Opakování jídel a skenování čárových kódů',
  'free.history': 'Celá tvoje historie, kruh i série',
  'free.offline': 'Zapisování i úplně bez signálu',

  'spent.everGrant': (count: number, noun: string) =>
    `Vyčerpáno: ${count} ${noun} zdarma`,
  'spent.monthly': (count: number, noun: string) =>
    `Vyčerpáno: ${count} ${noun} na tento měsíc`,

  // ---- Words the whole app uses -------------------------------------------
  // ---- Streaks and achievements. See STREAKS.md. ----
  'streak.logging': 'Série zápisů',
  'streak.training': 'Týdny tréninku',
  'streak.days': (count: number) => n(count, { one: 'den', few: 'dny', many: 'dne', other: 'dní' }),
  'streak.weeks': (count: number) => n(count, { one: 'týden', few: 'týdny', many: 'týdne', other: 'týdnů' }),
  'streak.best': (count: number) => `rekord ${count}`,
  'streak.atRisk': 'Zapiš dnes něco, ať sérii udržíš',
  'streak.weekProgress': (done: number, needed: number) => `${done} z ${needed} dní tento týden`,
  'streak.weekMet': 'Tento týden se počítá',
  'streak.weekBar': (needed: number) =>
    `${n(needed, { one: 'den', few: 'dny', many: 'dne', other: 'dní' })} týdně sérii udrží`,
  'streak.startTraining': 'Cvič tento týden tři dny a začne ti série',
  'achievements.title': 'Úspěchy',
  'achievements.count': (done: number, total: number) => `${done} z ${total}`,
  'achievements.earnedOn': (date: string) => `Získáno ${date}`,
  'achievements.group.streaks': 'Série',
  'achievements.group.training': 'Trénink',
  'achievements.group.firsts': 'Poprvé',
  'achievements.group.totals': 'Celkem',
  'badge.streak_7': 'Sedm v řadě',
  'badgeHow.streak_7': 'Zapiš něco sedm dní po sobě.',
  'badge.streak_30': 'Třicet v řadě',
  'badgeHow.streak_30': 'Zapiš něco třicet dní po sobě.',
  'badge.streak_100': 'Sto v řadě',
  'badgeHow.streak_100': 'Zapiš něco sto dní po sobě.',
  'badge.streak_365': 'Rok bez přerušení',
  'badgeHow.streak_365': 'Zapisuj každý den po celý rok.',
  'badge.exercise_weeks_4': 'Čtyři týdny tréninku',
  'badgeHow.exercise_weeks_4': 'Tři cvičení týdně, čtyři týdny po sobě.',
  'badge.exercise_weeks_12': 'Dvanáct týdnů tréninku',
  'badgeHow.exercise_weeks_12': 'Tři cvičení týdně, dvanáct týdnů po sobě.',
  'badge.exercise_weeks_52': 'Rok tréninku',
  'badgeHow.exercise_weeks_52': 'Tři cvičení týdně po celý rok.',
  'badge.first_photo': 'První fotka',
  'badgeHow.first_photo': 'Zapiš jídlo z fotky.',
  'badge.first_barcode': 'První sken',
  'badgeHow.first_barcode': 'Naskenuj čárový kód.',
  'badge.first_workout': 'První cvičení',
  'badgeHow.first_workout': 'Zapiš trénink.',
  'badge.first_weigh_in': 'První vážení',
  'badgeHow.first_weigh_in': 'Zapiš svou váhu.',
  'badge.days_100': 'Sto dní',
  'badgeHow.days_100': 'Sto zapsaných dní, v jakémkoli pořadí.',
  'badge.days_365': 'Rok zápisů',
  'badgeHow.days_365': 'Tři sta šedesát pět zapsaných dní, v jakémkoli pořadí.',
  'badge.workouts_100': 'Sto cvičení',
  'badgeHow.workouts_100': 'Sto dní s tréninkem.',

  'widget.today': (label: string) => `${label} dnes`,
  'widget.of': (consumed: string, target: string) => `${consumed} z ${target} kcal`,
  'widget.tapToStart': 'Klepni a začni dnešek',
  'widget.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'kroků' }),
  'widget.stepsWord': 'kroky',
  'widget.usual': (average: string) => `z obvyklých ${average}`,
  'toast.logged': (description: string, kcal: string) => `Zapsáno: ${description} – ${kcal} kcal`,
  'toast.removed': (description: string) => `Odebráno: ${description}`,
  'toast.tapToDismiss': (text: string) => `${text}. Klepnutím zavřeš.`,
  'a11y.edit': (name: string) => `Upravit: ${name}`,
  'a11y.delete': (name: string) => `Smazat: ${name}`,
  'a11y.remove': (name: string) => `Odebrat: ${name}`,

  'common.save': 'Uložit',
  'common.cancel': 'Zrušit',
  'common.delete': 'Smazat',
  'common.repeat': 'Zopakovat',
  'common.undo': 'Vrátit zpět',
  'common.done': 'Hotovo',
  'common.add': 'Přidat',
  'common.edit': 'Upravit',
  'common.close': 'Zavřít',
  'common.retry': 'Zkusit znovu',
  'common.offline': 'Jsi offline. Až budeš mít signál, bude to zase fungovat.',
  'common.unexpected': 'Něco se pokazilo. Zkus to znovu.',
  'common.loading': 'Načítám…',
  'common.today': 'Dnes',
  'common.yesterday': 'Včera',

  /* The gym card, second pass. See GYM-CARD.md. */
  'common.saving': 'Ukládám…',
  'workout.addExercises': '＋ Přidat cviky',
  'workout.pickExercises': 'Přidat cviky',
  'workout.anyExercise': 'jakýkoli cvik – stačí sval',
  'workout.orNameIt': 'Nebo ho pojmenuj',
  'workout.pointAtIt': 'Nebo ukaž na procvičené partie',
  'workout.front': 'Zepředu',
  'workout.back': 'Zezadu',
  'workout.backToBody': (muscle: string) => `‹ ${muscle}`,
  'workout.addCount': (count: string) => `Přidat ${count}`,
  'workout.aboutLength': (min: string) => `≈ ${min} min`,
  'workout.exactLength': (min: string) => `${min} min`,
  'workout.tapToFix': 'odhad · klepni pro opravu',
  'workout.whatKind': 'Jaký druh cvičení?',
  'workout.lessNamed': (caption: string) => `Méně: ${caption}`,
  'workout.moreNamed': (caption: string) => `Víc: ${caption}`,
};
