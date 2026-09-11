import { pluralFor, pluralWordFor } from '@ct/shared';

import type { Messages } from '@/lib/i18n';

/**
 * Slovak, for the native app. Second person singular and informal throughout —
 * "ty", never "vy". Four plural categories, and every count supplies all four:
 * one (1 deň), few (2–4 dni), many (decimals, 1,5 dňa) and other (0 and 5+ dní).
 * The Slovak past tense and predicate adjectives carry gender, so nothing here
 * says "zapísal si": sentences about the reader use the present, an imperative,
 * an impersonal "sa" form or a neuter participle ("zapísané", "zjedené").
 * Buttons take the infinitive, as Slovak system UI does; quotes are „…“ and the
 * English em dash becomes the Slovak spaced en dash.
 */
/** This language's plural categories, bound once. See the web twin. */
const n = pluralFor('sk');
/** The agreeing noun without its number, for the paywall's sentences. */
const w = pluralWordFor('sk');

export const sk: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  'nav.journal': 'Denník',
  'nav.today': 'Dnes',
  'nav.progress': 'Pokrok',
  // "Cvičenie" is narrower than the tab (steps, walks); "Pohyb" is shorter and
  // covers both, as Bulgarian's "Движение" does.
  'nav.exercise': 'Pohyb',
  'nav.cook': 'Kuchyňa',
  // "Ty" reads oddly as a label; the tab holds your own details.
  'nav.you': 'Profil',
  'nav.history': 'História',
  'nav.admin': 'Admin',
  'nav.signOut': 'Odhlásiť sa',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Dnes',
  'today.toGo': 'zostáva',
  'today.over': 'navyše',
  'today.burned': (kcal: string) => `+${kcal} spálených`,
  'today.viewCalendar': 'Zobraziť kalendár',
  'today.previousDay': 'Predchádzajúci deň',
  'today.nextDay': 'Nasledujúci deň',
  'today.nothingLogged': 'Zatiaľ nič zapísané.',
  // "Čo si jedol" would gender the reader; what was on the plate does not.
  'today.nothingLoggedHint': 'Napíš do denníka, čo bolo na tanieri.',
  'today.logAgain': 'Zapísať znova',
  'today.weighed': 'Váženie',
  'today.weight': 'Váha',
  'today.exercise': 'Pohyb',
  'today.roughEstimate': 'hrubý odhad',
  'today.exerciseFooter': 'Zobrazené oddelene od tvojho cieľa – kalórie spálené pohybom sú len hrubý odhad.',
  'today.exerciseTitle': '🏃  Pohyb',
  'today.stepsTitle': '👟  Kroky',
  'today.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'krokov' }),
  'today.stepsFooter': 'Počíta ich tvoj telefón. Kroky spresňujú tvoj cieľ – nikdy sa k nemu nepripočítavajú.',
  'today.stepsEnable': 'Počítať moje kroky',
  'today.stepsStarting': 'Počítanie sa začalo',
  'today.stepsStartingHint':
    'Telefón počíta až od chvíle povolenia, takže tu zatiaľ nič nie je. Choď sa prejsť a čísla pribudnú.',
  'today.stepsNoSource': 'V tomto telefóne zatiaľ nič nepočíta kroky',
  'today.stepsNoSourceHint':
    'Health Connect zatiaľ nič nemá. Na niektorých telefónoch musí kroky počítať iná aplikácia – ťukni sem, otvorí sa zoznam aplikácií, a povoľ Samsung Health alebo Fitbit.',
  'today.stepsUsual': (average: string) => `zvyčajne ${average}`,
  'today.stepsEnableHint': 'Čítať počet krokov z telefónu, aby sa tvoj cieľ riadil tým, koľko sa naozaj hýbeš.',
  'today.thatChange': 'Táto zmena',
  // `what` can be a meal's own name, so it stands alone rather than taking a case.
  'today.couldNotSave': (what: string, reason: string) => `${what} – nepodarilo sa uložiť. ${reason}`,
  'today.waitingToSync': (count: number) =>
    n(count, {
      one: 'zmena čaká na synchronizáciu',
      few: 'zmeny čakajú na synchronizáciu',
      many: 'zmeny čaká na synchronizáciu',
      other: 'zmien čaká na synchronizáciu',
    }),
  'today.lastSavedDay': ' · zobrazuje sa posledný uložený deň',
  'today.offlineDay': 'Offline – zobrazuje sa posledný uložený deň.',
  'today.unsent': ' · čaká na synchronizáciu',
  'today.macroLine': (protein: string, carbs: string, fat: string) =>
    `${protein}B · ${carbs}S · ${fat}T`,
  'today.changeHint': 'Ak to chceš zmeniť, povedz to v denníku – „ryže bolo viac“.',
  'today.logItYourself': '+ Zapísať ručne',
  'today.ofTargetKcal': (target: string) => `z ${target} kcal`,
  'rail.netAfterExercise': (kcal: string) => `netto ${kcal} kcal po započítaní pohybu`,

  'meal.breakfast': 'Raňajky',
  'meal.lunch': 'Obed',
  'meal.dinner': 'Večera',
  'meal.snack': 'Medzijedlá',
  'meal.snackOne': 'Medzijedlo',

  'macro.protein': 'Bielkoviny',
  'macro.carbs': 'Sacharidy',
  'macro.fat': 'Tuky',
  'macro.fiber': 'Vláknina',
  // Bielkoviny, sacharidy, tuky.
  'macro.proteinInitial': 'B',
  'macro.carbsInitial': 'S',
  'macro.fatInitial': 'T',

  // ---- History ------------------------------------------------------------
  'history.title': 'História',
  'history.thisMonth': 'Tento mesiac',
  'history.previousMonth': 'Predchádzajúci mesiac',
  'history.nextMonth': 'Nasledujúci mesiac',
  'history.avgIntake': 'Priemerný príjem',
  'history.logged': 'Zapísané',
  'history.exercise': 'Pohyb',
  'history.onTarget': 'V cieli',
  'history.under': 'Pod',
  'history.over': 'Nad',
  'history.noTarget': 'Bez cieľa',
  'history.openInToday': 'Otvoriť v Dnes →',
  'history.day': 'Deň',
  'history.nothingThatDay': 'V ten deň nie je nič zapísané.',
  'history.nothingYet': 'Zatiaľ nič zapísané.',
  'history.days': 'dni',
  'history.back': 'Späť',
  'history.proteinGrams': (grams: string) => `${grams} g bielkovín`,

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Dve vajcia a hrianka…',
  'composer.send': 'Odoslať',
  'composer.logPackets': 'Zapísať tieto balenia',
  'composer.packetsStraightIn': 'Rovno do denníka, nič sa neráta',
  'composer.packetsWithMessage': 'Pôjdu spolu so správou',
  'composer.addPhoto': 'Pridať fotku alebo naskenovať balenie',
  'composer.takePhoto': 'Odfotiť',
  'composer.choosePhoto': 'Vybrať fotku',
  'composer.scanBarcode': 'Naskenovať čiarový kód',
  'composer.removePhoto': 'Odstrániť fotku',
  'composer.setAmountFor': (name: string) => `Nastaviť množstvo: ${name}`,
  'composer.removeScan': (name: string) => `Odstrániť: ${name}`,
  'composer.cameraBlockedTitle': 'Day So Far nemôže otvoriť fotoaparát',
  'composer.cameraBlockedBody':
    'Prístup k fotoaparátu je pre túto aplikáciu vypnutý, takže ho iOS neotvorí. Zapni ho v Nastaveniach alebo vyber fotku z knižnice.',
  'composer.openSettings': 'Otvoriť Nastavenia',
  'composer.notNow': 'Teraz nie',
  'composer.photoUnreadable': 'Túto fotku sa nepodarilo prečítať. Skús inú.',
  'composer.selectedMeal': 'Vybrané jedlo',
  // Sent as the reader's own words, so present tense: "zjedol som" would gender them.
  'composer.labelHint': 'Toto je etiketa – zapíš mi podľa nej, čo jem.',
  'composer.photoTip':
    'Tip: nechaj v zábere vidličku, lyžicu alebo ruku – podľa toho odhadneme, aký veľký je tanier, a to sa háda najťažšie.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Profil',
  'setup.about': 'O tebe',
  'setup.account': 'Účet',
  'setup.appearance': 'Vzhľad',
  'setup.dangerZone': 'Nebezpečná zóna',
  'setup.displayName': 'Meno',
  'setup.sex': 'Pohlavie',
  'setup.birthDate': 'Dátum narodenia',
  'setup.height': 'Výška',
  'setup.targetWeight': 'Cieľová váha',
  'setup.activity': 'Aktivita',
  'setup.goal': 'Cieľ',
  'setup.units': 'Jednotky',
  'setup.language': 'Jazyk',
  'setup.languageSuggested': 'Navrhované',
  'setup.languageAll': 'Všetky jazyky',
  'setup.dayStartsAt': 'Deň začína o',
  'setup.timezone': 'Časové pásmo',
  'setup.email': 'E-mail',
  'setup.addressConfirmed': 'Adresa je overená',
  'setup.addressNotConfirmed': 'Adresa nie je overená',
  'setup.deleteTypeEmail': 'Na potvrdenie zadaj adresu uvedenú vyššie. Tento účet sa prihlasuje cez Google, takže tu nie je heslo na overenie.',
  'setup.deleteAccount': 'Vymazať účet',
  'setup.deleteFailed': 'Účet sa nepodarilo vymazať.',
  'setup.contactSupport': 'Kontaktovať podporu',
  'setup.save': 'Uložiť',
  'setup.saving': 'Ukladá sa…',
  'setup.saved': 'Uložené',
  'setup.savedTargetMoved': (from: string, to: string) => `Uložené – denný cieľ ${from} → ${to} kcal`,
  'setup.savedTargetSame': (kcal: string) => `Uložené – denný cieľ zostáva ${kcal} kcal`,
  'setup.activitySedentary': 'Sedavá práca, málo pohybu',
  'setup.activityLight': 'Ľahký pohyb 1–3 dni v týždni',
  'setup.activityModerate': 'Stredne náročný pohyb 3–5 dní v týždni',
  'setup.activityActive': 'Náročný tréning 6–7 dní v týždni',
  'setup.activityVeryActive': 'Fyzická práca alebo tréning dvakrát denne',
  'setup.dailyTarget': 'Tvoj denný cieľ',
  'setup.optional': 'Nepovinné',
  'setup.dayTitle': 'Deň',
  'setup.dayFooter':
    'Jedlo pred začiatkom dňa sa počíta do predchádzajúceho dňa – takže nočné maškrtenie o jednej sa započíta k večeru, ku ktorému patrí.',
  'setup.appearanceFooter': 'Možnosť Podľa systému sa riadi zariadením vrátane jeho časovania svetlého a tmavého režimu.',
  // "Prihlásený ako" would gender the reader; here the adjective agrees with "účet".
  'setup.signedInAs': 'Prihlásený účet',
  'setup.subtitle': 'Dosť na výpočet východiskového cieľa. Upravuje sa, ako pribúdajú skutočné údaje.',
  'setup.targetDisclaimer':
    'Priemer populácie pre človeka tvojej postavy, nie lekárska rada. Po dvoch týždňoch sa spresní podľa tvojich vlastných záznamov. Počas tehotenstva a dojčenia alebo pri ochorení, ako je cukrovka či ochorenie obličiek, si nechaj hodnotu určiť lekárom a nastav ju tu ručne.',

  // ---- Coach ----------------------------------------------------------------
  // The person is "tréner", the word a Slovak fitness app uses; the tier keeps
  // its name, Coach.
  'coach.title': 'Tréner',
  'coach.footerNone': 'Tréner vidí to, čo zapneš, a môže písať do tvojho denníka. Kým neprijmeš kód, nič sa nezdieľa.',
  'coach.enterCode': 'Zadať kód od trénera',
  'coach.codePlaceholder': 'XXXX-XXXX',
  'coach.continue': 'Pokračovať',
  'coach.sharedWith': (name: string) => `Zdieľané s ${name}`,
  // `date` arrives with its weekday, which "od" would need in the genitive.
  'coach.since': (date: string) => `prepojené: ${date}`,
  'coach.scopeMeals': 'Jedlá a fotky',
  'coach.scopeMealsHint': 'Čo a kedy sa jedlo',
  'coach.scopeWeight': 'Váha',
  'coach.scopeWeightHint': 'Tvoje váženia a trend',
  'coach.scopeMetrics': 'Kroky, spánok, srdce',
  'coach.scopeMetricsHint': 'Z telefónu alebo hodiniek',
  'coach.footerLinked': (name: string) => `${name} môže nastavovať tvoje ciele pre kalórie a makroživiny. Vždy ich môžeš zmeniť späť a zdieľanie môžeš kedykoľvek zastaviť.`,
  'coach.stopSharing': 'Zastaviť zdieľanie',
  'coach.stopConfirm': (name: string) => `Zastaviť zdieľanie s ${name}? Odteraz neuvidí nič nové. Komentáre, ktoré už sú v tvojom denníku, zostanú.`,
  'coach.stop': 'Zastaviť',
  'coach.keep': 'Ďalej zdieľať',
  'coach.stopped': 'Zdieľanie je zastavené.',
  'coach.inviteTitle': (name: string) => `${name} ťa chce trénovať`,
  'coach.willSee': 'Uvidí',
  'coach.wontSee': 'Neuvidí',
  'coach.seeMeals': 'Tvoje jedlá a ich fotky',
  'coach.seeTotals': 'Denné kalórie a makroživiny',
  'coach.seeWeight': 'Tvoju váhu a ciele',
  'coach.seeDays': 'Dni so záznamami',
  'coach.notChat': 'Tvoj rozhovor s denníkom',
  'coach.notMetrics': 'Kroky, spánok ani srdcový tep, kým ich nezapneš',
  'coach.notEmail': 'Tvoj e-mail ani platby',
  'coach.accept': 'Prijať',
  'coach.notNow': 'Teraz nie',
  'coach.close': 'Zavrieť',
  'coach.canStop': 'Zdieľanie môžeš kedykoľvek zastaviť v Nastaveniach.',
  'coach.accepted': (name: string) => `Zdieľaš s ${name}.`,
  'coach.alreadyLinked': (name: string) => `Svoje záznamy už zdieľaš s ${name}. Najprv zastav zdieľanie.`,
  'coach.invalid': 'Tento kód nepoznáme.',
  'coach.expired': 'Platnosť kódu vypršala. Požiadaj trénera o nový.',
  'coach.used': 'Tento kód už bol použitý.',
  'coach.bannerManage': 'Spravovať',
  'coach.yourCoach': 'tvoj tréner',
  'coach.yourCoachCapital': 'Tvoj tréner',
  'coach.setByCoach': 'Nastavené trénerom',
  'coach.seatPlus': 'miesto od trénera ti dáva Plus',

  'setup.aboutTitle': 'O aplikácii',
  'setup.privacyPolicy': 'Zásady ochrany súkromia',
  'setup.termsOfService': 'Podmienky používania',
  'setup.rateApp': 'Ohodnotiť aplikáciu',
  'setup.unsavedChanges': 'Neuložené zmeny',
  'setup.saveChanges': 'Uložiť zmeny',

  'setup.requiredMissing':
    'Na výpočet tvojho cieľa treba pohlavie, dátum narodenia, výšku, cieľ a aktivitu.',

  // ---- The first run ------------------------------------------------------
  'ob.back': 'Späť',
  'ob.continue': 'Pokračovať',

  'ob.welcomeTitle': 'Poďme zostaviť tvoj plán',
  'ob.welcomeBody':
    'Šesť rýchlych otázok – asi pol minúty – a budeš mať cieľ pre kalórie a bielkoviny vypočítaný pre tvoje telo, nie pre hocikoho. Všetko sa dá neskôr zmeniť.',
  'ob.welcomeStart': 'Začať',

  'ob.goalTitle': 'Čo chceš dosiahnuť?',
  'ob.goalBody': 'Podľa toho bude tvoj deň pod tým, čo spáliš, na tej istej úrovni, alebo nad tým.',
  'ob.goalLose': 'Schudnúť',
  'ob.goalLoseHint': 'Mierny deficit, ktorý sa dá naozaj dodržať',
  'ob.goalMaintain': 'Udržať si váhu',
  'ob.goalMaintainHint': 'Jesť toľko, koľko spáliš, a mať to pod dohľadom',
  'ob.goalGain': 'Pribrať',
  'ob.goalGainHint': 'Malý prebytok a dosť bielkovín, aby sa využil',

  'ob.sexTitle': 'Pre koho máme počítať?',
  'ob.sexBody':
    'Výdaj energie v pokoji sa líši natoľko, že hádanie by tvoj cieľ posunulo o pár stoviek kalórií denne.',

  // "Kedy si sa narodil?" genders the reader; naming the date does not.
  'ob.birthTitle': 'Tvoj dátum narodenia',
  'ob.birthBody': 'Vek je posledné, čo výpočet potrebuje.',
  'ob.birthAge': (count: number) => n(count, { one: 'rok', few: 'roky', many: 'roka', other: 'rokov' }),
  'ob.birthTooYoung': 'Aplikácia je pre ľudí od 13 rokov.',
  'ob.birthImplausible': 'Skontroluj rok – ten dátum nevyzerá správne.',

  'ob.bodyTitle': 'Tvoja výška a váha',
  'ob.bodyBody':
    'Stačí približne. Váha sa zapíše ako tvoje prvé váženie, takže graf začína dnes.',
  'ob.bodyHeight': 'Výška',
  'ob.bodyWeight': 'Váha',
  'ob.bodyHeightOff': 'Táto výška nevyzerá správne – skontroluj jednotky.',
  'ob.bodyWeightOff': 'Táto váha nevyzerá správne – skontroluj jednotky.',

  'ob.skip': 'Zatiaľ preskočiť',
  // Agrees with "aktivita": the answer it writes is `activity.moderate`, "Stredná".
  'ob.activitySkip': 'Neviem – počítaj so strednou',

  'ob.targetTitle': 'Kam mieriš?',
  'ob.targetBody': 'Cieľová váha, aby aplikácia vedela ukázať, koľko ešte zostáva. Posunúť ju môžeš kedykoľvek.',
  'ob.targetToGo': (amount: string) => `ešte ${amount}`,
  'ob.targetSame': 'Rovnaká ako teraz',
  'ob.targetMustBeLower': 'Vyber hodnotu pod tvojou súčasnou váhou.',
  'ob.targetMustBeHigher': 'Vyber hodnotu nad tvojou súčasnou váhou.',

  'ob.activityTitle': 'Koľko sa hýbeš?',
  'ob.activityBody': 'Tvoj bežný týždeň – bez tréningov, ktoré zapisuješ v aplikácii.',

  'ob.buildingTitle': 'Zostavujeme tvoj plán',
  'ob.buildingStep1': 'Počítame, koľko spáliš',
  'ob.buildingStep2': 'Nastavujeme denné kalórie',
  'ob.buildingStep3': 'Delíme bielkoviny, sacharidy a tuky',
  'ob.buildingFailed': 'Tvoj plán sa nepodarilo uložiť.',
  'ob.retry': 'Skúsiť znova',

  'ob.planEyebrow': 'Tvoj denný cieľ',
  'ob.planCalories': 'kalórií denne',
  'ob.planFootnote':
    'Východiskový bod, nie rozsudok. Každý týždeň sa upraví podľa tvojich záznamov a toho, čo ukáže váha.',
  'ob.planStart': 'Začať zapisovať',

  'sex.male': 'Muž',
  'sex.female': 'Žena',

  'goal.lose': 'Chudnutie',
  'goal.maintain': 'Udržanie',
  'goal.gain': 'Priberanie',

  // Adjectives agreeing with "aktivita"; "Aktívna aktivita" would say it twice.
  'activity.sedentary': 'Sedavá',
  'activity.light': 'Ľahká',
  'activity.moderate': 'Stredná',
  'activity.active': 'Vysoká',
  'activity.veryActive': 'Veľmi vysoká',

  'units.metric': 'Metrické',
  'units.imperial': 'Imperiálne',

  'theme.label': 'Motív',
  'theme.system': 'Podľa systému',
  'theme.light': 'Svetlý',
  'theme.dark': 'Tmavý',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Prihlásiť sa',
  'auth.signInSubtitle': 'Prihlás sa a pokračuj tam, kde to máš rozrobené.',
  'auth.createAccount': 'Vytvoriť účet',
  'auth.createAccountTitle': 'Vytvor si účet',
  'auth.email': 'E-mail',
  'auth.password': 'Heslo',
  'auth.passwordHint': 'Aspoň 8 znakov.',
  'auth.showPassword': 'Zobraziť heslo',
  'auth.hidePassword': 'Skryť heslo',
  'auth.nameOptional': 'Meno (nepovinné)',
  'auth.continueWithGoogle': 'Pokračovať cez Google',
  // "Zabudol si heslo?" and "Si tu nový?" gender the reader; these do not.
  'auth.forgotPassword': 'Zabudnuté heslo?',
  'auth.haveAccount': 'Už máš účet?',
  'auth.newHere': 'Prvýkrát tu?',
  'auth.signupsClosed': 'Registrácie sú na tomto serveri uzavreté.',
  'auth.googleFailed': 'Prihlásenie cez Google sa nepodarilo. Skús to znova alebo použi e-mail a heslo.',
  'auth.genericFailure': 'Pri prihlasovaní sa niečo pokazilo. Skús to znova.',
  'auth.oneMoment': 'Moment…',
  'auth.privacyPolicy': 'Zásady ochrany súkromia',
  'auth.language': 'Jazyk',
  'auth.or': 'alebo',
  'auth.createAccountSubtitle':
    'Potom povedz denníku niečo o sebe a on vypočíta tvoje ciele.',
  'auth.emailFirst': 'Najprv zadaj e-mail a pošlem ti odkaz.',
  // Accusative after „prijímaš“, so both links keep the form they already have:
  // „Vytvorením účtu prijímaš Podmienky používania a Zásady ochrany súkromia.“
  'auth.agreeBefore': 'Vytvorením účtu prijímaš',
  'auth.terms': 'Podmienky používania',
  'auth.agreeAnd': 'a',
  'auth.agreeAfter': '.',
  'reset.linkSent': 'Ak k tejto adrese existuje účet, odkaz na obnovenie hesla je na ceste.',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Pozri si e-mail',
  'verify.sentTo': (email: string) => `Na ${email} sme poslali šesť číslic. Zadaj ich a si dnu.`,
  'verify.sentBlind': 'Poslali sme ti šesť číslic. Zadaj ich a si dnu.',
  'verify.title': 'Over svoj e-mail',
  'verify.checkInbox': 'Pozri sa do schránky',
  'verify.enterCode': 'Zadaj kód',
  'verify.sixDigitCode': 'Šesťmiestny kód',
  'verify.confirm': 'Overiť',
  'verify.confirming': 'Overuje sa…',
  'verify.confirmed': 'E-mail je overený',
  'verify.alreadyConfirmed': 'Už je overený',
  'verify.readyMessage': 'Táto adresa je nastavená a pripravená.',
  'verify.sendNewCode': 'Poslať nový kód',
  'verify.sending': 'Odosiela sa…',
  'verify.startJournal': 'Začať denník',
  'verify.signInFirst': 'Najprv sa prihlás a potom zadaj kód, ktorý sme ti poslali e-mailom.',
  'verify.signOutAndRestart': 'Odhlásiť sa a začať znova',
  'verify.linkFailed': 'Odkaz nefungoval',
  'verify.codeSent': 'Overovací kód nájdeš v schránke.',
  'verify.sendAgain': 'Poslať znova',

  // ---- Cook ---------------------------------------------------------------
  'cook.title': 'Kuchyňa',
  'cook.kitchenEmpty': 'Tvoja kuchyňa je prázdna',
  'cook.things': (count: number) => n(count, { one: 'položka', few: 'položky', many: 'položky', other: 'položiek' }),
  'cook.toCheck': (count: number) => `· ${count} na kontrolu`,
  'cook.yourKitchen': 'Tvoja kuchyňa',
  'cook.yourKitchenDesc': 'Z toho budem variť. Stačí, keď to zhruba sedí.',
  'cook.thinking': 'Premýšľam…',
  'cook.nothingLeftToday': 'Na dnes už nič nezostáva',
  'cook.findMeSomething': 'Nájdi mi niečo',
  'cook.anythingSpecific': 'Niečo konkrétne?',
  'cook.anythingSpecificDesc':
    'Všetko je nepovinné. Aj bez toho vychádzam z tvojej kuchyne a z tvojho dňa.',
  'cook.alreadyWriting': 'Už jeden píšem…',
  'cook.noRunsLeft': 'Na dnes už žiadne ďalšie recepty',
  'cook.planTheWeek': 'Naplánovať týždeň',
  'cook.forYou': 'Pre teba',
  'cook.library': 'Knižnica',
  'cook.searchLibrary': 'Hľadať v knižnici',
  'cook.emptyBefore': 'Zatiaľ nič. Stlač',
  'cook.emptyAfter':
    'a vymyslím recept z toho, čo máš v kuchyni – alebo začni fotkou či receptom, ktorý už máš.',
  'cook.perPortion': 'na porciu',
  'cook.per': (unit: string) => `na ${unit}`,
  'cook.nothingMatching': (query: string) => `Nič nezodpovedá „${query}“.`,
  'cook.libraryNote':
    'Skutočné recepty z voľne dostupnej zbierky USDA, zoradené podľa toho, koľko surovín z nich už máš.',

  'cook.writingAround': (things: string) => `Píšem recept z toho, čo je na tvojej fotke: ${things}…`,
  'cook.writingFor': (asked: string) =>
    `Píšem recept na „${asked}“ z toho, čo máš v kuchyni…`,
  'cook.writingPlain': 'Píšem recept z toho, čo máš v kuchyni…',

  'cook.planLocked': 'Písanie receptov je súčasťou plánu Coach.',
  'cook.runs': (count: number) => n(count, { one: 'recept', few: 'recepty', many: 'receptu', other: 'receptov' }),
  // After a colon the count keeps its nominative, whatever the number.
  'cook.planSpent': (runs: string) => `Na dnes je to všetko: ${runs}.`,
  'cook.planSpentBack': (when: string) => ` Ďalší budeš mať ${when}.`,
  'cook.planEmptyKitchen':
    'Kuchyňa je prázdna, tak navrhnem jedlá, na ktoré stačí jeden malý nákup – a poviem, čo kúpiť.',
  'cook.planFromWants': 'Vyjdem z tvojho zadania a z toho, čo máš v kuchyni',
  'cook.planFromKitchen': 'Vymyslím recept z toho, čo máš v kuchyni',
  'cook.planAtTarget': (from: string) =>
    `${from} – a dnes už máš cieľ splnený, takže to bude niečo ľahké.`,
  'cook.planAiming': (from: string, kcal: string, protein: string) =>
    `${from}, s cieľom trafiť ${kcal} kcal a ${protein} g bielkovín, ktoré ti ešte zostávajú.`,

  // ---- The recipe brief ---------------------------------------------------
  'brief.anythingElse': 'Ešte niečo?',
  'brief.wantsPlaceholder': '„v jednom hrnci“, „minúť špenát“, „bez koriandra“',
  'brief.time': 'Čas',
  'brief.minutes': (count: number) => `${count} min`,
  'brief.meal': 'Jedlo',
  'brief.cook': 'Uvariť',
  'brief.justTonight': 'Len na dnes večer',
  'brief.portions': (count: number) => n(count, { one: 'porcia', few: 'porcie', many: 'porcie', other: 'porcií' }),
  'brief.proteinAtLeast': 'Bielkoviny aspoň',
  'brief.caloriesAtMost': 'Kalórie najviac',

  // ---- What you don’t eat -------------------------------------------------
  'diet.title': 'Čo nejieš',
  'diet.footer':
    'Platí pre každý navrhnutý recept ako pevné obmedzenie, nie ako preferencia. Nemení to, ako denník zapisuje, čo naozaj ješ – povedz mu, čo bolo na tanieri, a zapíše to.',
  'diet.none': 'Bez obmedzení',
  'diet.vegetarian': 'Vegetariánska',
  'diet.vegan': 'Vegánska',
  'diet.pescatarian': 'Pescetariánska',
  // "Čo nemáš rád" genders the reader; "čo ti nechutí" does not.
  'diet.avoidPlaceholder': 'Niečo iné – alergia, niečo, čo ti nechutí',
  'diet.stopAvoiding': (item: string) => `Už sa nevyhýbať: ${item}`,

  // ---- The fridge scan ----------------------------------------------------
  'scan.notAnImage': 'Tento súbor nie je obrázok, ktorý viem prečítať.',
  'scan.noFood': 'Na tejto fotke sa mi nepodarilo rozoznať žiadne jedlo.',
  'scan.added': (count: number) =>
    `Pridané: ${n(count, { one: 'položka', few: 'položky', many: 'položky', other: 'položiek' })}`,
  'scan.reading': 'Čítam fotku…',
  'scan.fromPhoto': 'Z fotky',
  'scan.scanMyFridge': 'Naskenovať chladničku',
  'scan.whatICanSee': 'Čo vidím',
  'scan.tapWrong': 'Ťukni na všetko, čo nesedí.',
  'scan.alreadyListed': '· už v zozname',
  'scan.adding': 'Pridávam…',
  'scan.addToKitchen': 'Pridať do kuchyne',
  'scan.findingRecipes': 'Hľadám recepty…',
  'scan.cookWithThese': 'Variť z týchto',

  // ---- The kitchen list ---------------------------------------------------
  'pantry.addToList': 'Pridať do zoznamu',
  'pantry.addPlaceholder': 'kuracie mäso, ryža, paprika',
  'pantry.stillThere': (count: number) => `Ešte to máš? · ${count}`,
  'pantry.yes': 'Áno',
  'pantry.removed': (name: string) => `Odstránené: ${name}`,
  'pantry.remove': (name: string) => `Odstrániť: ${name}`,
  'pantry.emptyHint': 'Zatiaľ tu nič nie je. Napíš hore pár vecí alebo odfoť poličku.',
  'pantry.inTheKitchen': (count: number) => `V kuchyni · ${count}`,
  'pantry.staples': (count: number) => `Základné suroviny · ${count}`,

  // ---- A recipe you already have ------------------------------------------
  'import.chip': 'Vložiť recept',
  'import.title': 'Recept, ktorý už máš',
  'import.desc': 'Vypočítam kalórie a varenie nechám tak.',
  'import.unreadable': 'Toto sa mi nepodarilo prečítať ako recept.',
  'import.saved': (title: string, kcal: string) => `Uložené: ${title} – ${kcal} kcal na porciu`,
  'import.placeholder':
    'Vlož alebo napíš recept – suroviny a postup, tak ako ho máš zapísaný.',
  'import.working': 'Počítam čísla…',
  'import.workOutMacros': 'Vypočítať makroživiny',

  // ---- A recipe -----------------------------------------------------------
  'recipe.save': 'Uložiť',
  'recipe.saved': 'Uložené',
  'recipe.saveThis': 'Uložiť tento recept',
  'recipe.unsaveThis': 'Odobrať z uložených',
  'recipe.usesYour': (things: string) => `Z tvojej kuchyne: ${things}`,
  'recipe.fitsToday': 'Zmestí sa do zvyšku dňa',
  'recipe.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'krokov' }),
  'recipe.saveNamed': (title: string) => `Uložiť: ${title}`,
  'recipe.unsaveNamed': (title: string) => `Odobrať z uložených: ${title}`,
  // `portions` is a bare figure, so it sits after a colon rather than before a noun.
  'recipe.forPortions': (portions: string) => `počet porcií: ${portions}`,
  'recipe.portionsCount': (count: number) => n(count, { one: 'porcia', few: 'porcie', many: 'porcie', other: 'porcií' }),
  'recipe.howToMakeIt': (steps: string) => `Postup · ${steps}`,
  'recipe.ingredientsMakes': (portions: string) => `Suroviny · ${portions}`,
  // A neuter participle: "Zjedol som to" would say it in one gender.
  'recipe.iAteThis': (kcal: string) => `Zjedené · ${kcal} kcal`,
  'recipe.openFull': 'Otvoriť celý recept',
  'recipe.backToCook': 'Späť do Kuchyne',
  'recipe.logged': (what: string, kcal: string) => `Zapísané: ${what} – ${kcal} kcal`,
  'recipe.forServings': (servings: string, unit: string) => `na ${servings} × ${unit}`,
  'recipe.publicDomain': 'voľné dielo',
  'recipe.iAteThisPlain': (kcal: string) => `Zjedené · ${kcal}`,
  'recipe.youdNeed': (things: string) => `Treba dokúpiť: ${things}`,
  'recipe.fromLibrary': 'Z knižnice',
  'recipe.madeForYou': 'Na mieru pre teba',
  'recipe.madeForKitchen': 'Na mieru tvojej kuchyni',
  'recipe.adaptedForYou': 'Upravený pre teba',
  'recipe.yourOwn': 'Tvoj vlastný recept',
  'recipe.seeOriginal': 'Zobraziť originál',
  // `date` carries its weekday, so it goes in brackets rather than after "v".
  'recipe.writtenAgainst': (kcal: string, date: string) =>
    ` Napísaný pre ${kcal} kcal, ktoré ti zostávali (${date}).`,
  'recipe.ingredients': 'Suroviny',
  'recipe.notInKitchen': '· nie je v tvojej kuchyni',
  'recipe.method': 'Postup',
  'recipe.showMethod': 'Zobraziť postup',
  'recipe.hideMethod': 'Skryť postup',
  'recipe.logging': 'Zapisujem…',
  'recipe.yesTonight': 'áno, dnes večer',
  'recipe.yesNow': 'áno, teraz',
  'recipe.howMuch': 'Koľko toho bolo?',
  'recipe.less': 'Menej',
  'recipe.more': 'Viac',
  'recipe.servingsCount': (servings: string) => `Porcie: ${servings}`,
  'recipe.portion': 'porcia',
  'recipe.makeItFit': 'Prispôsobiť mne',
  'recipe.reworking': 'Upravujem…',
  'recipe.notInLibrary': 'Tento recept v knižnici nie je.',
  'recipe.notHere': 'Tento recept tu už nie je.',
  'recipe.nothingCameBack': 'Nič sa nevrátilo.',
  'recipe.ingredientsNote':
    'Hodnoty sú pre hotové jedlo, tak ako boli zverejnené – preto tu nie sú čísla pre jednotlivé suroviny.',
  'recipe.confidenceHigh': 'Tieto čísla sú také presné, aké len aplikácia vie byť bez váženia.',
  'recipe.confidenceMedium':
    'Čísla sú odhad – na zápis stačia, ale ak na tom záleží, oplatí sa pozrieť druhýkrát.',
  'recipe.confidenceLow': 'Tieto čísla sú hrubý odhad. Ak je deň tesný, odváž, čo sa dá.',
  'recipe.tileQualifier': (protein: string, serving: string) =>
    `kcal · ${protein} g bielkovín · ${serving}`,
  'recipe.kcalPer': (serving: string) => `kcal · ${serving}`,
  'recipe.makes': (count: number) =>
    `Vystačí na ${n(count, { one: 'porciu', few: 'porcie', many: 'porcie', other: 'porcií' })}`,

  // ---- Progress -----------------------------------------------------------
  'progress.title': 'Pokrok',
  'progress.daysWindow': (count: number) => n(count, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' }),
  'progress.daysShort': (count: number) => `${count} d`,
  'progress.weightTitle': '⚖️  Váha',
  'progress.noWeighIns': 'Zatiaľ žiadne váženia. Zapíš jedno nižšie alebo to jednoducho povedz denníku.',
  'progress.noWeighIn': 'Bez váženia',
  'progress.trendReadout': (value: string) => `7-dňový priemer ${value} – čiara`,
  'progress.thisWeek': 'tento týždeň',
  'progress.avg7d': '7-dňový priemer',
  'progress.sinceStart': 'Od začiatku',
  'progress.toTarget': 'Do cieľa',
  'progress.logTodaysWeight': (unit: string) => `Zapísať dnešnú váhu (${unit})`,
  'progress.caloriesTitle': '🔥  Kalórie',
  'progress.avgDayTarget': (target: string) => `priemer/deň · cieľ ${target}`,
  'progress.proteinTitle': '💪  Bielkoviny',
  'progress.hitTargetBefore': 'Cieľ splnený v',
  'progress.ofDays': (hit: string, logged: string) => `${hit} z ${logged}`,
  'progress.hitTargetAfter': 'zapísaných dní.',
  'progress.qualityTitle': '🥦  Kvalita stravy',
  'progress.days': (count: number) => n(count, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' }),
  'progress.qualityFooter': (days: string, percent: string) =>
    `Priemer za ${days} – tieto hodnoty má ${percent} % zapísaného.`,
  'progress.chartNutrient': (label: string) => `Zobraziť v grafe: ${label}`,
  'progress.exerciseTitle': '🏃  Pohyb',
  // "Prečo som neschudol" genders the reader; the scale can be the subject instead.
  'progress.exerciseFooter':
    'Opýtaj sa denníka čokoľvek o týchto údajoch – „prečo mi tento týždeň neklesá váha?“',
  // A caption under the session count, so a label rather than an agreeing noun.
  'progress.sessionsOver': (kcal: string, days: string) =>
    `tréningy · ~${kcal} kcal za ${days} dní`,
  'progress.qualityLine': (label: string, aim: string, target: string) =>
    `${label} priemer/deň · ${aim} ${target}`,
  'progress.aimFor': 'cieľ',
  'progress.keepUnder': 'najviac',

  // ---- Exercise -----------------------------------------------------------
  'exercise.title': 'Pohyb',
  'exercise.nothingLogged': (days: string) => `Za posledných ${days} dní nič zapísané.`,
  // No "bol som behať": the example is a note, not a gendered past tense.
  'exercise.tellTheJournal': (example: string) => `Povedz to denníku – „dnes beh na ${example}“.`,
  'exercise.consistencyTitle': '🔁  Pravidelnosť',
  'exercise.activeOf': (days: string, sessions: string) => `z ${days} dní aktívnych · ${sessions}`,
  'exercise.sessionsCount': (count: number) =>
    n(count, { one: 'tréning', few: 'tréningy', many: 'tréningu', other: 'tréningov' }),
  'exercise.burnedPerDay': 'Spálené kalórie za deň',
  'exercise.burned': 'Spálené',
  'exercise.distance': 'Vzdialenosť',
  'exercise.time': 'Čas',
  'exercise.sessionsTitle': '🏃  Tréningy',
  'exercise.burnNote': (example: string) =>
    `Spálené kalórie sú len odhad a nikdy sa neodpočítavajú od tvojho cieľa. Oprav ho v denníku – „ten beh bol skôr ${example}“.`,
  'exercise.minutes': (minutes: string) => `${minutes} min`,
  'exercise.restDay': 'Deň oddychu',
  'exercise.moreSessions': (count: string) => `ďalšie: +${count}`,

  // ---- Saved workouts -----------------------------------------------------
  'workouts.logTitle': '🏋️  Zapísať tréning',
  'workouts.logAction': 'Zapísať tréning',
  'workouts.savedTitle': '🏋️  Uložené tréningy',
  'workouts.buildOne': 'Vytvoriť',
  'workouts.reuseHint': 'Jedno ťuknutie vyplní celú kartu aj s váhami z minula.',
  'workouts.whereSessionsGo':
    'Zapísané tréningy nájdeš v histórii nižšie. Tento zoznam je len pre tréningy, ktoré chceš opakovať.',
  'workouts.loadFailed': 'Uložené tréningy sa nepodarilo načítať.',
  'workouts.noneSavedTitle': 'Zatiaľ žiadne uložené tréningy.',
  'workouts.noneSavedHint':
    'Uložený tréning je zoznam, ktorý používaš opakovane – zapíš tréning aj s cvikmi a prijmi ponuku pomenovať ho, alebo ho vytvor tu.',
  'workouts.exerciseCount': (count: number) => n(count, { one: 'cvik', few: 'cviky', many: 'cviku', other: 'cvikov' }),
  'workouts.doneTimes': (times: string) => ` · odcvičené ${times}×`,
  'workouts.editNamed': (name: string) => `Upraviť: ${name}`,
  'workouts.deleteNamed': (name: string) => `Vymazať: ${name}`,
  'workouts.weekTitle': '🗓️  Tvoj týždeň',
  'workouts.weekFooter':
    'Nastavené dni sú pevné. Voľné dni sa riadia tým, čo naozaj pravidelne robíš.',
  // Weekday names arrive in the nominative, which "na"/"v" would have to change.
  'workouts.workoutFor': (day: string) => `Tréning – ${day}`,
  'workouts.usually': (workout: string) => `${workout} – zvyčajne`,
  // "Nastavil si" genders the reader.
  'workouts.youSetThis': 'tvoje nastavenie',
  'workouts.learned': 'naučené',
  'workouts.editTitle': '✏️  Upraviť tréning',
  'workouts.buildTitle': '🏋️  Vytvoriť tréning',
  'workouts.icon': 'Ikona',
  'workouts.namePlaceholder': 'Tlaky, Hrudník, Nohy A…',
  'workouts.nameLabel': 'Názov tréningu',
  'workouts.sets': (count: number) => n(count, { one: 'séria', few: 'série', many: 'série', other: 'sérií' }),
  'workouts.oneFewerSet': (exercise: string) => `O sériu menej: ${exercise}`,
  'workouts.oneMoreSet': (exercise: string) => `O sériu viac: ${exercise}`,
  'workouts.removeExercise': (exercise: string) => `Odstrániť: ${exercise}`,

  // ---- Resetting a password -----------------------------------------------
  'plan.title': 'Tento týždeň',
  'plan.subtitle': 'Večere prepočítané podľa tvojich cieľov. Jedným ťuknutím zapíšeš uvarený večer.',
  'plan.weekTitle': (range: string) => `📅  ${range}`,
  'plan.weekFooter': 'Otvor večer a prečítaj si postup, alebo ho preskoč, ak nie si doma.',
  'plan.nothingYet': 'Na tento týždeň zatiaľ nič naplánované.',
  'plan.askInBefore': 'Vyplň týždeň nižšie alebo oň požiadaj v',
  // The link word inside the sentence, in the locative "v denníku".
  'plan.journal': 'denníku',
  'plan.howToTitle': '🍳  Ako naplánovať týždeň',
  'plan.howToBefore':
    'Toto je najnáročnejšia vec, akú kuchyňa robí, preto beží len raz a potom sa už iba upravuje. Alebo to povedz v',
  'plan.howToAfter': '– „naplánuj mi večere na tento týždeň, sme dvaja, nič nad 30 minút“.',
  'plan.anythingHappening': 'Deje sa tento týždeň niečo?',
  'plan.wantsPlaceholder': '„vo štvrtok nie som doma“, „minúť tekvicu“',
  'plan.howManyItFeeds': 'Pre koľkých',
  'plan.howManyItFeedsHint': 'Každá večera sa varí pre toľko ľudí.',
  'plan.people': (count: number) => n(count, { one: 'osoba', few: 'osoby', many: 'osoby', other: 'osôb' }),
  'plan.cookOnce': 'Uvariť raz, jesť dvakrát',
  'plan.cookOnceHint':
    'Väčšie varenie pokryje aj nasledujúci večer, takže v týždni bude menej večerov pri sporáku.',
  'plan.longestCook': 'Najdlhšie varenie',
  'plan.longestCookHint': 'Žiadna večera v týždni netrvá dlhšie.',
  'plan.anyLength': 'Ľubovoľne dlho',
  'plan.any': 'Bez limitu',
  'plan.minutesShort': (minutes: string) => `${minutes} min`,
  'plan.minutesLabel': (minutes: string) => `${minutes} minút`,
  'plan.writing': 'Píšem týždeň…',
  'plan.again': 'Naplánovať znova',
  'plan.planTheWeek': 'Naplánovať týždeň',
  'plan.kcalProtein': (protein: string) => `kcal · ${protein} g bielkovín`,
  'plan.coversNext': 'Vystačí aj na ďalší večer',
  'plan.coversMore': (nights: string) => `Vystačí na ďalšie večery: ${nights}`,
  'plan.cooked': 'Uvarené',
  'plan.skipNamed': (day: string) => `Preskočiť: ${day}`,
  'plan.nothingPlanned': 'Nič naplánované',
  'plan.nightsCount': (count: number) => n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerov' }),

  'shopping.title': '🧺  Nákupný zoznam',
  'shopping.haveAlready': (things: string) =>
    `Vynechané, lebo v kuchyni už je: ${things}.`,
  'shopping.addToList': 'Pridať do zoznamu',
  'shopping.placeholder': 'kuchynské utierky, vrecia na smeti',
  'shopping.addHint':
    'Na všetko, čo by žiadny recept nepotreboval. Suroviny nižšie sú z plánu na týždeň.',
  'shopping.empty': 'Zoznam je zatiaľ prázdny. Naplánuj týždeň alebo napíš, čo potrebuješ.',
  'shopping.putBack': (name: string) => `Vrátiť do zoznamu: ${name}`,
  'shopping.tickOff': (name: string) => `Odškrtnúť: ${name}`,
  'shopping.takeOff': (name: string) => `Odstrániť zo zoznamu: ${name}`,

  // ---- The barcode scanner ------------------------------------------------
  'barcode.isThisIt': 'Je to ono?',
  'barcode.scanThePacket': 'Naskenuj balenie',
  // "Koľko si zjedol" genders the reader; "koľko toho bolo" does not.
  'barcode.sayHowMuch': 'Povedz, koľko toho bolo.',
  'barcode.pointAtIt': 'Namier na čiarový kód – nutričné údaje sa načítajú.',
  'barcode.noCamera':
    'Fotoaparát tu nie je – odfoť čiarový kód a prečítam ho z obrázka.',
  'barcode.reading': 'Čítam…',
  'barcode.photographInstead': 'Radšej odfotiť',
  'barcode.unreadable': 'Nepodarilo sa mi tu prečítať čiarový kód – skús ho odfotiť zblízka, nech vyplní viac záberu.',
  'barcode.badFormat': 'Tento formát obrázka neviem prečítať – JPEG alebo PNG pôjde.',
  'barcode.aServing': (mass: string) => `${mass} v porcii`,
  'barcode.weighIt': 'Odvážiť',
  'barcode.servings': 'porcie',
  'barcode.weighed': 'odvážené',
  'barcode.howMuchIn': (unit: string) => `Koľko toho bolo (${unit})`,
  'barcode.sourceOff': 'Údaje z Open Food Facts',
  'barcode.sourceUsdaLong': 'Údaje z USDA FoodData Central',
  'barcode.sourceUsda': 'Údaje z USDA',
  'barcode.wrongPacket': 'Iné balenie?',
  'barcode.notFound': 'Nenašlo sa',
  'barcode.notFoundBody':
    'Toto balenie ešte nikto nezaevidoval – pri privátnych značkách je to bežné. Odfoť radšej nutričnú tabuľku a prečítam to z etikety.',
  'barcode.photographLabel': 'Odfotiť etiketu',
  'barcode.scanDifferent': 'Naskenovať iné balenie',

  'repeat.footer':
    'Zapíše sa s dnešným časom. Ak bola porcia iná, povedz to v denníku a opravím to.',
  'repeat.search': 'Hľadať v jedlách',
  'repeat.kcalProtein': (kcal: string, protein: string) => `${kcal} kcal · ${protein} g bielkovín`,
  'repeat.logAgainNamed': (what: string) => `Zapísať znova: ${what}`,
  'repeat.adding': 'Pridávam…',

  'editor.needsAnItem': 'Jedlo potrebuje aspoň jednu položku. Radšej ho vymazať?',
  'editor.needsAName': 'Čo to bolo? Jedlo potrebuje názov.',
  // "Zapíš to sám" genders the reader.
  'editor.logItYourself': 'Zapísať ručne',
  'editor.fixWhatsWrong': 'Opraviť, čo nesedí',
  'editor.whatThisWas': 'Čo to bolo',
  'editor.whatWasIt': 'Čo to bolo?',
  'editor.itemName': (index: string) => `Názov položky ${index}`,
  'editor.itemPlaceholder': 'Položka',
  'editor.removeItem': (what: string) => `Odstrániť: ${what}`,
  'editor.itemFallback': (index: string) => `položka ${index}`,
  'editor.itemQuantity': (index: string) => `Množstvo položky ${index}`,
  'editor.howMuch': 'koľko',
  'editor.itemCalories': (index: string) => `Kalórie položky ${index}`,
  'editor.itemProtein': (index: string) => `Bielkoviny položky ${index}`,
  'editor.itemCarbs': (index: string) => `Sacharidy položky ${index}`,
  'editor.itemFat': (index: string) => `Tuky položky ${index}`,
  'editor.adjustedHeading': 'Uložené. Niektoré hodnoty sa nedali uložiť tak, ako boli zadané:',
  'editor.adjustedMass': (name: string) => `${name} – bielkoviny, sacharidy a tuky vážili viac než samotné jedlo`,
  'editor.adjustedCeiling': (name: string) => `${name} – také množstvo jedla nemôže mať toľko kalórií`,
  'editor.adjustedFloor': (name: string) => `${name} – makroživiny tu dávajú viac kalórií`,
  'editor.anotherItem': 'ďalšia položka',
  'editor.log': 'Zapísať',
  'editor.saveTotal': (verb: string, kcal: string) => `${verb} · ${kcal} kcal`,

  // ---- Cards in the conversation ------------------------------------------
  'chat.removed': 'Odstránené',
  'chat.openWeekPlan': 'Otvoriť plán na týždeň',
  'chat.thisWeeksDinners': 'Večere na tento týždeň',
  'chat.nights': (count: number) => n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerov' }),
  'chat.nothingPlanned': 'Nič naplánované',
  'chat.burnEstimate': 'Spálené kalórie sú odhad',
  'chat.notAddedToBudget': ' · nepripočítava sa k rozpočtu',
  'chat.editNamed': (name: string) => `Upraviť: ${name}`,
  'chat.notAWeight': 'Toto nie je váha.',
  'chat.editWeighIn': 'Upraviť toto váženie',
  'chat.notEnoughDays': 'Na trend zatiaľ nie je dosť zapísaných dní.',
  'chat.lastWeek': 'Minulý týždeň',
  'chat.nothingLogged': 'Nič zapísané',
  'chat.kcalTitle': (kcal: string) => `${kcal} kcal`,
  'chat.nothingLoggedThisWeek': 'Tento týždeň nič zapísané.',
  'chat.weekSummary': (days: string, onTarget: string) =>
    `Zapísané dni: ${days}, z toho ${onTarget} do 10 % od cieľa.`,
  'chat.aDayAgainst': (target: string) => `denne, cieľ ${target}`,
  'chat.onTheScale': 'na váhe',
  'chat.burnedOver': (sessions: string) => `spálených za ${sessions}`,
  'chat.proteinADayAgainst': (target: string) => `bielkovín denne, cieľ ${target}`,
  'chat.showLess': 'Zobraziť menej',
  'chat.readTheRest': (count: string) => `Čítať ďalej (ešte ${count})`,
  'chat.atLoad': (loads: string) => ` s ${loads}`,
  'chat.setsCount': (count: number) => n(count, { one: 'séria', few: 'série', many: 'série', other: 'sérií' }),
  'chat.ofTarget': (target: string) => `z ${target}`,
  'chat.avg': 'priemer',
  'chat.onDate': (date: string) => `dňa ${date}`,

  // ---- The journal --------------------------------------------------------
  'journal.promptEggs': 'Dve vajcia, hrianka a káva',
  'journal.promptLunch': 'Kuracie mäso s ryžou na obed',
  // "Bol som si zabehať" genders the reader; a note of the run does not.
  'journal.promptRun': (distance: string) => `Ráno beh na ${distance}`,
  'journal.promptProtein': 'Jem dosť bielkovín?',
  'journal.emptyTitle': 'Čo bolo dnes na tanieri?',
  'journal.emptyBody':
    'Napíš to alebo odfoť – ako je to pre teba jednoduchšie. Žiadne formuláre, nič na vyhľadávanie. Povedz, čo sa stalo, a zvyšok dopočítam.',
  'journal.over': (kcal: string) => `${kcal} navyše`,
  'journal.left': (kcal: string) => `zostáva ${kcal}`,
  'journal.burned': (kcal: string) => `−${kcal} spálených`,
  'journal.net': (kcal: string) => ` · netto ${kcal} kcal`,
  'journal.loggedMeal': 'Zapísané jedlo',
  'journal.thinking': 'Premýšľam',
  'journal.lost':
    'Spojenie sa prerušilo skôr, než prišla odpoveď. Čo sa stihlo zapísať, tu bude, keď sa vrátiš.',

  // First person present: ungendered, and what a Slovak status line says.
  'tool.log': 'Zapisujem',
  'tool.update': 'Upravujem',
  'tool.delete': 'Odstraňujem',
  'tool.get': 'Kontrolujem',
  'tool.search': 'Hľadám v histórii',
  'tool.find': 'Hľadám',
  'tool.set': 'Ukladám',
  'tool.show': 'Kreslím',
  'tool.suggest': 'Vymýšľam',
  'tool.import': 'Importujem',
  'tool.adapt': 'Prispôsobujem',
  'tool.save': 'Ukladám',
  'tool.plan': 'Plánujem',
  'tool.cook': 'Varím',
  'tool.repeat': 'Opakujem',
  'tool.remember': 'Zapamätávam si',
  'tool.forget': 'Zabúdam',
  'tool.lookup': 'Vyhľadávam',
  'tool.run': 'Spúšťam',
  'tool.define': 'Definujem',
  'tool.ask': 'Pýtam sa na',

  // ---- The workout card ---------------------------------------------------
  'workout.strength': 'Posilňovanie',
  'workout.cardio': 'Kardio',
  'workout.class': 'Lekcia',
  'workout.sport': 'Šport',
  'workout.flexibility': 'Mobilita',
  'workout.fallbackName': 'Tréning',
  'workout.savedRoutine': (name: string) => `Uložené ako „${name}“ – nabudúce stačí ťuknúť`,
  'workout.routineNotSaved': 'Zapísané, ale zostavu sa nepodarilo uložiť',
  'workout.updated': (what: string, kcal: string) => `Upravené: ${what} – teraz ~${kcal} kcal`,
  'workout.logged': (what: string, kcal: string) => `Zapísané: ${what} – ~${kcal} kcal`,
  'workout.change': 'Zmeniť',
  'workout.yourWorkouts': 'Tvoje tréningy',
  'workout.today': '· dnes',
  'workout.howLong': 'Ako dlho?',
  'workout.addWhatYouDid': 'Pridať aktivitu',
  'workout.sameAs': (when: string) => `Ako naposledy (${when})`,
  'workout.exerciseCount': (count: number) =>
    `(${n(count, { one: 'cvik', few: 'cviky', many: 'cviku', other: 'cvikov' })})`,
  'workout.yours': '· tvoje',
  'workout.saveThisAs': (name: string) => `Uložiť ako „${name}“`,
  'workout.nameForThis': 'Názov tohto tréningu',
  'workout.dontSave': 'Neukladať ako tréning',
  'workout.saveChanges': 'Uložiť zmeny',
  'workout.logSession': 'Zapísať tento tréning',
  'workout.fixWhatsWrong': 'Opraviť, čo nesedí',
  // "Čo si robil?" genders the reader.
  'workout.whatDidYouDo': 'Čo bolo na programe?',
  'workout.roughlyIsFine': 'Stačí približne.',
  'workout.reps': 'opak.',
  'workout.min': 'min',
  'workout.removeSet': (index: string) => `Odstrániť sériu ${index}`,
  'workout.anotherSet': 'Ďalšia séria',
  'workout.removeNamed': (name: string) => `Odstrániť: ${name}`,

  // ---- The weekly review --------------------------------------------------
  'review.lastWeek': '📅  Minulý týždeň',
  'review.title': '📅  Týždenný prehľad',
  'review.pitch':
    'Každý pondelok ráno dostaneš krátke zhodnotenie týždňa – čo čísla naozaj ukázali a či treba posunúť tvoj cieľ. Žiadne kázanie, len jasný obraz.',
  'review.writing': 'Píšem…',
  'review.writeOne': 'Napísať teraz',
  'review.currentTarget': (kcal: string) => `Cieľ ${kcal} kcal.`,
  'review.willApply': 'Ďalší prehľad to uplatní. ',
  'review.kcalUnit': (kcal: string) => `${kcal} kcal`,
  'review.partOf': (plan: string) => `Súčasť plánu ${plan}`,

  'quality.title': '🥦\u00a0\u00a0Kvalita stravy',
  'quality.partlyMeasured': 'čiastočne zmerané',
  'quality.notEstimated': 'bez odhadu',

  'nutrient.sodium': 'Sodík',
  'nutrient.satFat': 'Nasýtené tuky',
  'nutrient.sugar': 'Cukor',

  'chart.daily': 'Denný graf',
  'chart.arrowHint': (label: string) => `${label}. Šípkami prechádzaš deň po dni.`,
  'chart.touchHint': 'Graf. Dotykom a potiahnutím si prečítaš jednotlivé dni.',

  // ---- What the phone says and the web does not ---------------------------
  'cook.photographFridge': 'odfoť chladničku',
  'cook.kitchenLocked': 'Kuchyňa je súčasťou plánu Coach',
  'cook.kitchenLockedBody':
    'Odfoť chladničku, nechaj si napísať recept z toho, čo v nej je, a naplánuj z toho večere na celý týždeň. Knižnica receptov nižšie zostáva zadarmo – prezeraj ju, var z nej, zapisuj.',
  'cook.emptyLockedBefore': 'Zatiaľ tu nič nie je. Karta',
  'cook.emptyLockedAfter': 'vyššie je plná receptov, ktoré môžeš uvariť a zapísať zadarmo.',
  'cook.emptyAfterShort': 'a vymyslím recept z toho, čo máš v kuchyni.',
  'cook.workOutCalories': 'Vypočítať kalórie',
  'cook.readingIt': 'Čítam…',

  'scan.photographShelf': 'Odfotiť poličku',
  'scan.looking': 'Pozerám…',
  'scan.scanYourFridge': 'Naskenovať chladničku',
  // "Nie som si istý" genders the speaker; the adjective agrees with the item.
  'scan.notSure': 'neisté',
  'scan.isThisIt': 'Pozerám sa na toto?',
  'scan.addToKitchenShort': 'Do kuchyne',
  'scan.cooking': 'Varím…',
  'scan.cookFromThese': 'Variť z týchto',
  'pantry.stillHaveIt': 'Ešte mám',
  'pantry.iStillHave': (name: string) => `Ešte mám: ${name}`,

  'barcode.title': 'Naskenovať čiarový kód',
  'barcode.lookingUp': 'Vyhľadávam…',
  'barcode.pointAtBarcode': 'Namier na čiarový kód',
  'barcode.checkingCamera': 'Kontrolujem fotoaparát…',
  'barcode.needsCamera': 'Skener potrebuje fotoaparát.',
  'barcode.iAteThis': 'Zjedené',
  'barcode.howMany': 'Koľko kusov?',
  'barcode.howMuch': 'Koľko?',
  'barcode.scanAnother': 'Naskenovať ďalšie',
  'barcode.addToMessage': 'Pridať do správy',
  'barcode.setTheAmount': 'Nastaviť množstvo',
  'barcode.added': (name: string) => `${name} – pridané`,
  'barcode.addedToMessage': (count: number) =>
    `${n(count, { one: 'balenie', few: 'balenia', many: 'balenia', other: 'balení' })} v tvojej správe`,
  'barcode.nothingAddedYet': 'Zatiaľ nič pridané',
  'barcode.nothingUploaded': 'Nič sa neodosiela – kód sa číta priamo v telefóne.',
  'barcode.allowCamera': 'Povoliť fotoaparát',
  'barcode.perBasis': (kcal: string, protein: string, basis: string) =>
    `${kcal} kcal · ${protein} g bielkovín na ${basis}`,
  'barcode.tapToType': 'Ťukni na číslo a prepíš ho',
  'barcode.totalLine': (protein: string, mass: string) => `kcal · ${protein} g bielkovín · ${mass}`,
  'barcode.partialTitle': 'K tomuto sú len čiastočné údaje.',
  'barcode.partialHint':
    'Na zápis to nestačí. Odfoť nutričnú tabuľku a denník ju prečíta.',
  'barcode.notCatalogued': 'Toto balenie nie je v databáze.',
  'barcode.notCataloguedHint':
    'Pri privátnych značkách je to bežné. Odfoť radšej nutričnú tabuľku a denník ju prečíta.',

  'composer.listening': 'Počúvam…',
  'composer.stopListening': 'Prestať počúvať',
  'composer.sayWhatYouAte': 'Povedz, čo bolo na tanieri',
  'composer.addPhotoShort': 'Pridať fotku',

  'workouts.logActionMobile': '+ Zapísať tréning',
  'workouts.oneFewerSetShort': 'O sériu menej',
  'workouts.oneMoreSetShort': 'O sériu viac',
  'workouts.noneSavedMobile':
    'Zatiaľ žiadne uložené tréningy. Uložený tréning je zoznam, ktorý používaš opakovane – zapíš tréning aj s cvikmi a prijmi ponuku pomenovať ho, alebo ho vytvor tu.',
  'workouts.routineOn': (name: string, day: string) => `${day}: ${name}`,
  'workouts.set': 'nastavené',
  'workouts.learnedGuess': (name: string) => `${name}?`,
  'workout.classMobile': 'Skupinová lekcia',
  'workout.flexibilityMobile': 'Strečing',
  'workout.routineNotSavedMobile': 'Zapísané, ale tréning sa nepodarilo uložiť',
  'workout.nameIt': 'Pomenovať',
  'workout.logIt': 'Zapísať',
  // `when` is "včera", a weekday or a date — none of which "ako" takes cleanly.
  'workout.sameAsShort': (when: string) => `↻ ako naposledy · ${when}`,
  'workout.lastTime': (figure: string) => `naposledy ${figure}`,
  'workout.adjust': 'Upraviť',
  'workout.setsDiffered': 'Série boli rôzne',
  'workout.sameEverySet': 'Každá séria rovnaká',
  'workout.setsLabel': 'série',
  'workout.searchExercises': 'Hľadať – názov alebo sval',
  // "Tieto si už cvičil" genders the reader.
  'workout.doneThese': 'Už cvičené',
  'workout.browseMuscle': 'Alebo vyber podľa svalu',
  'workout.addNamed': (name: string) => `＋ Pridať „${name}“`,
  'workout.nothingMatches': 'Nič nezodpovedá',
  'workout.otherLength': 'Iné',
  'workout.minutesLabel': 'Minúty',

  'editor.anotherItemLabel': 'ďalšia položka',

  'plan.cookTab': 'Kuchyňa',
  'plan.theWeek': 'Týždeň',
  'plan.locked': 'Plánovanie týždňa je súčasťou plánu Coach',
  'plan.planItTitle': '🗓  Naplánovať',
  'plan.wantsPlaceholderShort': 'Niečo konkrétne? – „nič s rybou“',
  // Abbreviated, so it reads after any count without agreeing with it.
  'plan.peopleUnit': 'os.',
  'plan.minUnit': 'min',
  'plan.batchWhereItHelps': 'Variť do zásoby, kde to pomôže',
  'plan.batchCooking': 'Varenie do zásoby',
  'plan.planning': 'Plánujem…',
  'plan.dinnersTitle': '🍽  Večere',
  'plan.lockedBody':
    'Sedem večerí podľa tvojich cieľov a toho, čo už máš v kuchyni – do zásoby, kde to pomôže, a s hotovým nákupným zoznamom.',
  'plan.planItFooter':
    'Sedem večerí podľa tvojich cieľov a toho, čo už je v kuchyni. Varenie do zásoby znamená jedno varenie na dva večery.',
  // A label over the number field, so a noun rather than „Varíš pre“ + a case.
  'plan.cookingFor': 'Počet osôb',
  'plan.atMost': 'Najviac',
  'plan.batchHint': 'Jedno varenie na dva večery.',
  'plan.covers': (count: number) =>
    ` · vystačí na ${n(count, { one: 'večer', few: 'večery', many: 'večera', other: 'večerov' })}`,
  'plan.cookedNamed': (title: string) => `Uvarené: ${title}`,
  'plan.clearNamed': (day: string) => `Vyprázdniť: ${day}`,
  'shopping.titleShort': '🧾  Nákup',
  'shopping.addSomethingElse': 'Pridať niečo iné',
  'shopping.alreadyHave': (things: string) => `Vynechané, lebo to už máš: ${things}.`,
  'shopping.nothingToBuy': 'Zatiaľ netreba nič kúpiť.',

  'progress.openExerciseTab': 'Otvoriť kartu Pohyb',
  'quality.fillThemselvesIn': 'Povedz denníku, čo bolo na tanieri, a hodnoty sa doplnia samy.',
  'quality.partialCoverage': (percent: string) =>
    `Tieto hodnoty má len ${percent} % dnešných kalórií, takže súčty sú spodná hranica, nie celý deň.`,
  'quality.spentTail': (spent: string, plan: string, allowed: string) =>
    `${spent} – ${plan} obsahuje ${allowed} mesačne.`,
  'quality.estimateNote': (tail: string) =>
    `Tieto štyri hodnoty odhaduje model, takže ich majú len jedlá zapísané cez denník – ručne zadané, zopakované a naskenované ostávajú prázdne. ${tail}`,

  // ---- The store ----------------------------------------------------------
  'plans.spent': 'Tvoj plán je vyčerpaný',
  'plans.upgrade': 'Vyšší plán',
  'plans.seeWhatAdds': (plan: string) => `Čo pridáva ${plan}`,
  'plans.remainingHint': (remaining: string) => `${remaining}. Pozri si plány.`,
  'plans.hide': 'Skryť',
  'plans.restored': 'Obnovené. Vitaj späť.',
  'plans.restoredShort': 'Obnovené.',
  'plans.noneFound': 'V tomto účte obchodu sa nenašlo žiadne predplatné.',
  'plans.keepItGoing': 'Pokračuj ďalej.',
  'plans.yearly': 'Ročne',
  'plans.monthly': 'Mesačne',
  'plans.oneMoment': 'Moment…',
  'plans.bestValue': 'Najvýhodnejšie',
  'plans.messagesHeading': 'Ďalšie správy',
  'plans.messagesBody':
    'Navyše k tomu, čo ti plán dáva každý mesiac. Jednorazový nákup, nie predplatné – vydržia, kým ich nevyužiješ.',
  'plans.messagesCount': (count: number) => n(count, { one: 'správa', few: 'správy', many: 'správy', other: 'správ' }),
  'plans.messagesAdded': (count: number) =>
    `Pridané: ${n(count, { one: 'správa', few: 'správy', many: 'správy', other: 'správ' })}.`,
  'plans.messagesOnTheWay': 'Zaplatené. Správy sa o chvíľu objavia.',
  // Accusative after "kúpiť": 1 správu, 2 správy, 5 správ.
  'plans.messagesBuyHint': (count: number, price: string) =>
    `Kúpiť ${n(count, { one: 'správu', few: 'správy', many: 'správy', other: 'správ' })} za ${price}`,
  'plans.scansHeading': 'Ďalšie skenovania fotiek',
  'plans.scansBody': 'Jednorazový nákup, nie predplatné. Vydržia, kým ich nevyužiješ.',
  'plans.scansCount': (count: number) =>
    n(count, { one: 'skenovanie fotky', few: 'skenovania fotiek', many: 'skenovania fotky', other: 'skenovaní fotiek' }),
  'plans.scansAdded': (count: number) =>
    `Pridané: ${n(count, { one: 'skenovanie', few: 'skenovania', many: 'skenovania', other: 'skenovaní' })}.`,
  'plans.scansOnTheWay': 'Zaplatené. Skenovania sa o chvíľu objavia.',
  'plans.scansBuyHint': (count: number, price: string) =>
    `Kúpiť ${n(count, { one: 'skenovanie fotky', few: 'skenovania fotiek', many: 'skenovania fotky', other: 'skenovaní fotiek' })} za ${price}`,
  'plans.checkingStore': 'Kontrolujem obchod…',
  // "Už si zaplatil?" genders the reader.
  'plans.alreadyPaid': 'Už zaplatené? Obnoviť nákup',
  'plans.restorePrompt': 'Chcem obnoviť nákup',
  'plans.paidNotShowing': 'Zaplatené, ale nezobrazuje sa? Obnoviť nákup',
  'plans.freeOnEvery': 'Zadarmo v každom pláne',
  'plans.billedYearly': 'Účtuje sa raz ročne',
  'plans.billedMonthly': 'Účtuje sa mesačne',
  'plans.everythingInPlus': 'Všetko z plánu Plus',
  'plans.yourPlan': 'Tvoj plán',
  'plans.aYear': 'ročne',
  'plans.aMonth': 'mesačne',
  'plans.worksOutAt': (price: string) => `Vychádza to na ${price} mesačne.`,
  'plans.onFree': 'Máš plán Free. Všetko, čo zapíšeš ručne, zostáva zadarmo – plány platia za časti, ktoré premýšľajú.',
  'plans.onPlan': (plan: string) => `Máš plán ${plan}.`,
  'plans.savePercent': (percent: string) => ` · ušetríš ${percent} %`,
  'plans.get': (plan: string) => `Získať ${plan}`,
  'plans.nothingOnSale':
    'Obchod pre túto aplikáciu zatiaľ nič nepredáva. Nič, čo predtým fungovalo, sa nezamklo – vráť sa neskôr a bude to tu.',
  'plans.noStore': 'Táto zostava sa nevie spojiť s obchodom, takže sa tu zatiaľ nedá nič kúpiť.',
  'plans.restoreNote':
    'Znova načíta tento účet v obchode a vráti všetko, čo je na ňom už zakúpené. Nikdy ti nič nestiahne druhýkrát.',
  'plans.manage': 'Spravovať alebo zrušiť predplatné',
  'plans.smallPrint': (billing: string) =>
    `${billing} cez obchod a predplatné sa obnovuje, kým ho nezrušíš. Zrušiť ho môžeš kedykoľvek vo svojom účte v obchode – zaplatené obdobie ti zostane až do konca.`,
  'plans.pendingLong':
    'Obchod má tvoju platbu a plán je ešte na ceste. Odomkne sa sám – nič netreba platiť znova.',
  'plans.pendingShort': 'Obchod má tvoju platbu. Plán sa o chvíľu odomkne.',
  'plans.whatThatOpens': 'Čo to odomyká',
  'plans.startLogging': 'Začať zapisovať',
  'plans.backToJournal': 'Späť do denníka',
  'plans.youreOnPlan': (plan: string) => `Máš plán ${plan}.`,
  'plans.paymentReceived': 'Platba prijatá.',
  'plans.manageOnStore': 'Spravovať alebo zrušiť ho môžeš kedykoľvek v časti Predplatné v obchode.',
  // A row label with the plan name beside it.
  'plans.youreOn': 'Tvoj plán',
  'plans.photoScans': 'Skenovania fotiek',
  'plans.unlimited': 'Neobmedzene',
  'plans.seeWhatIncludes': 'Čo obsahuje tvoj plán',
  'plans.seeThePlans': 'Pozrieť plány',
  'plans.restorePurchase': 'Obnoviť nákup',
  'plans.planTitle': 'Plán',
  'plans.leftThisMonth': (left: string) => `tento mesiac ešte ${left}`,
  'plans.plusBought': (bought: string) => ` · dokúpené ${bought}`,
  'plans.leftEver': (left: string) => `ešte ${left}`,
  'setup.tellingYouThings': 'Upozornenia',
  'setup.emailFooterWithReview':
    'Týždenný prehľad chodí v pondelok ráno. E-maily o tvojom účte – zmena hesla, prihlásenie z neznámeho zariadenia – sa posielajú vždy.',
  'setup.emailFooter':
    'E-maily o tvojom účte – zmena hesla, prihlásenie z neznámeho zariadenia – sa posielajú vždy.',
  'setup.confirmFirst': (email: string) =>
    `Kým neoveríš ${email}, zabudnuté heslo sa nedá obnoviť – nedalo by sa zistiť, že schránka patrí tebe.`,
  'setup.sendLinkAgain': 'Poslať odkaz znova',
  'setup.weeklyReview': 'Týždenný prehľad',
  'setup.weeklyReviewHint': 'Zhrnutie minulého týždňa, v pondelok.',
  'setup.sendMeReview': 'Posielať mi týždenný prehľad',
  // "Pripomienka" is taken by the phone's own reminders below.
  'setup.nudges': 'Povzbudenia',
  'setup.nudgesHintMobile':
    'Najviac jedno týždenne, keď je v tvojich záznamoch niečo, čo stojí za zmienku. Vždy sa objavia v denníku; toto ich pošle aj do telefónu – alebo e-mailom, ak máš upozornenia vypnuté.',
  'setup.sendMeNudges': 'Posielať mi povzbudenia',
  'setup.streaksAndGoals': 'Série a ciele',
  'setup.streaksHint':
    'Séria zapísaných dní, ktorá stojí za povšimnutie, a deň, keď váha ukáže číslo, ktoré máš nastavené. Zámerne zriedkavé a nikdy nie e-mailom – tieto chodia do telefónu, alebo nikam.',
  'setup.tellMeStreaks': 'Hlásiť mi série a ciele',
  'setup.eveningRecap': 'Večerné zhrnutie',
  'setup.eveningRecapHint':
    'Dnešné kalórie a bielkoviny oproti dnešným cieľom, o deviatej. Každý deň, keď je niečo zapísané – jediné upozornenie tu, ktoré nechodí len občas.',
  'setup.sendMeRecap': 'Posielať mi večerné zhrnutie',
  'setup.remindersTitle': 'Pripomienky v tomto telefóne',
  'setup.remindersFooter':
    'Nastavené tu, uložené tu. Nepotrebujú účet ani pripojenie, chodia bez ohľadu na tvoj plán a na nový telefón sa nepresunú.',
  'setup.logYourDay': 'Zapíš svoj deň',
  'setup.logYourDayHint':
    'Pripomienka z tvojho vlastného telefónu, v hodinu, ktorú si vyberieš. O tvojich záznamoch nič nevie – je to budík, nie názor.',
  'setup.remindMeToLog': 'Pripomínať mi zápis',
  'setup.at': 'O',
  'setup.reminderTime': 'Čas pripomienky',
  'setup.weighIn': 'Váženie',
  'setup.weighInHint':
    'Raz týždenne, pred raňajkami. Denné váženie meria skôr včerajšiu soľ než teba, preto sa denne neponúka.',
  'setup.remindMeToWeigh': 'Pripomínať mi váženie',
  // A weekday picker's label; "V" would need the weekday in the accusative.
  'setup.on': 'Deň',
  'setup.weighInDay': 'Deň váženia',
  'setup.weighInTime': 'Čas váženia',
  'setup.deleting': 'Maže sa…',
  'setup.deleteEverything': 'Vymazať všetko',
  'setup.deleteWarningBefore': 'Týmto sa vymažú všetky jedlá, fotky, váženia a konverzácie účtu',
  'setup.deleteWarningAfter':
    ', na všetkých zariadeniach, a nedá sa to vrátiť späť. Na potvrdenie zadaj heslo.',

  // ---- The words the app uses about money ---------------------------------
  //
  // Nouns agree through `w`. The meter nouns are neuter or inanimate masculine
  // where possible, and every sentence that takes one sets the count after a
  // colon or in brackets, so the nominative the plural rules pick is always the
  // right case. Only "správa" is feminine, and nothing here puts it in the
  // accusative.
  'meter.chat': (count: number) => w(count, { one: 'správa', few: 'správy', many: 'správy', other: 'správ' }),
  'meter.photo': (count: number) =>
    w(count, { one: 'skenovanie fotky', few: 'skenovania fotiek', many: 'skenovania fotky', other: 'skenovaní fotiek' }),
  'meter.pantryScan': (count: number) =>
    w(count, { one: 'skenovanie chladničky', few: 'skenovania chladničky', many: 'skenovania chladničky', other: 'skenovaní chladničky' }),
  'meter.recipe': (count: number) => w(count, { one: 'recept', few: 'recepty', many: 'receptu', other: 'receptov' }),
  // "Jedálniček" is the everyday Slovak word for a meal plan.
  'meter.mealPlan': (count: number) =>
    w(count, { one: 'jedálniček', few: 'jedálničky', many: 'jedálnička', other: 'jedálničkov' }),

  'tier.pitchFree': 'Kompletný denník stravy, offline a bez limitov.',
  'tier.pitchPlus': 'Denník každý deň a raz týždenne jeho zhodnotenie.',
  'tier.pitchCoach': 'Aj kuchyňa: var z toho, čo máš v chladničke, a plánuj týždeň.',

  'wall.notOnPlan': (plural: string) => `${plural} nie sú súčasťou tvojho plánu`,
  // The subject is the allowance ("balík"), so the verb never has to agree
  // with a count it cannot see.
  'wall.freeGrant': (count: number, noun: string) => `Bezplatný balík sa minul: ${count} ${noun}`,
  'wall.monthlyGrant': (count: number, noun: string) => `Balík na tento mesiac sa minul: ${count} ${noun}`,
  'wall.comeBack': (when: string) => ` Znova ich budeš mať ${when}.`,
  'wall.bodyChat': 'Ručné zapisovanie jedál je neobmedzené a vždy zadarmo – ukážem ti, kde.',
  'wall.bodyPhoto':
    'Jedlo môžeš stále napísať, zopakovať niektoré z predchádzajúcich alebo naskenovať jeho čiarový kód. Nič z toho sa neráta.',
  'wall.bodyPantryScan': 'Zoznam v kuchyni stále funguje – čo v nej máš, môžeš pridať ručne.',
  'wall.bodyRecipe':
    'Všetky uvarené recepty zostávajú uložené a knižnicu receptov môžeš prezerať zadarmo.',
  'wall.bodyMealPlan':
    'Naposledy naplánovaný týždeň tam stále je a variť môžeš aj z uloženého receptu.',
  'wall.remaining': (count: number, noun: string) =>
    `${w(count, { one: 'Zostáva', few: 'Zostávajú', many: 'Zostáva', other: 'Zostáva' })} ${count} ${noun}`,
  // The reader speaking, in the first-person future, which carries no gender.
  'wall.logMyself': 'Zapíšem to ručne',
  'wall.loggedByHand': 'Zapísané ručne – táto cesta je vždy otvorená a nikdy sa do ničoho neráta.',

  'tier.reviewAndNudge': 'Týždenný prehľad a povzbudenie, keď sa odmlčíš',
  // "Ako si jedol" genders the reader.
  'tier.review': 'Týždenný prehľad tvojho stravovania',
  'tier.nudge': 'Povzbudenie, keď sa odmlčíš',
  'tier.countNoun': (count: number, noun: string) => `${count} ${noun}`,
  'tier.toTry': (list: string) => `${list} na vyskúšanie`,
  'tier.aMonth': (list: string) => `${list} mesačne`,
  'tier.everythingIn': (plan: string) => `Všetko z plánu ${plan}`,

  'free.typing': 'Ručné zapisovanie jedál a ich opravy',
  'free.repeat': 'Opakovanie jedál a skenovanie čiarových kódov',
  'free.history': 'Celá tvoja história, kruh aj séria',
  'free.offline': 'Zapisovanie aj úplne bez signálu',

  'spent.everGrant': (count: number, noun: string) =>
    `Bezplatný balík (${count} ${noun}) je minutý`,
  'spent.monthly': (count: number, noun: string) =>
    `Balík na tento mesiac (${count} ${noun}) je minutý`,

  // ---- Words the whole app uses -------------------------------------------
  // ---- Streaks and achievements. See STREAKS.md. ----
  'streak.logging': 'Séria zápisov',
  'streak.training': 'Tréningové týždne',
  'streak.days': (count: number) => n(count, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' }),
  'streak.weeks': (count: number) => n(count, { one: 'týždeň', few: 'týždne', many: 'týždňa', other: 'týždňov' }),
  'streak.best': (count: number) => `rekord ${count}`,
  'streak.atRisk': 'Zapíš dnes niečo, nech séria vydrží',
  'streak.weekProgress': (done: number, needed: number) => `${done} z ${needed} dní tento týždeň`,
  'streak.weekMet': 'Tento týždeň sa počíta',
  'streak.weekBar': (needed: number) =>
    `Na sériu treba ${n(needed, { one: 'deň', few: 'dni', many: 'dňa', other: 'dní' })} týždenne`,
  'streak.startTraining': 'Trénuj tento týždeň tri dni a začneš sériu',
  'achievements.title': 'Úspechy',
  'achievements.count': (done: number, total: number) => `${done} z ${total}`,
  'achievements.earnedOn': (date: string) => `Získané ${date}`,
  'achievements.group.streaks': 'Série',
  'achievements.group.training': 'Tréning',
  'achievements.group.firsts': 'Prvé kroky',
  'achievements.group.totals': 'Súhrny',
  'badge.streak_7': 'Sedem v rade',
  'badgeHow.streak_7': 'Zapisuj niečo sedem dní po sebe.',
  'badge.streak_30': 'Tridsať v rade',
  'badgeHow.streak_30': 'Zapisuj niečo tridsať dní po sebe.',
  'badge.streak_100': 'Sto v rade',
  'badgeHow.streak_100': 'Zapisuj niečo sto dní po sebe.',
  'badge.streak_365': 'Rok bez prerušenia',
  'badgeHow.streak_365': 'Zapisuj každý jeden deň celý rok.',
  'badge.exercise_weeks_4': 'Štyri týždne tréningu',
  'badgeHow.exercise_weeks_4': 'Tri tréningy týždenne, štyri týždne po sebe.',
  'badge.exercise_weeks_12': 'Dvanásť týždňov tréningu',
  'badgeHow.exercise_weeks_12': 'Tri tréningy týždenne, dvanásť týždňov po sebe.',
  'badge.exercise_weeks_52': 'Rok tréningu',
  'badgeHow.exercise_weeks_52': 'Tri tréningy týždenne počas celého roka.',
  'badge.first_photo': 'Prvá fotka',
  'badgeHow.first_photo': 'Zapíš jedlo z fotky.',
  'badge.first_barcode': 'Prvý sken',
  'badgeHow.first_barcode': 'Naskenuj čiarový kód.',
  'badge.first_workout': 'Prvý tréning',
  'badgeHow.first_workout': 'Zapíš tréning.',
  'badge.first_weigh_in': 'Prvé váženie',
  'badgeHow.first_weigh_in': 'Zapíš svoju váhu.',
  'badge.days_100': 'Sto dní',
  'badgeHow.days_100': 'Sto zapísaných dní, v akomkoľvek poradí.',
  'badge.days_365': 'Rok zápisov',
  'badgeHow.days_365': 'Tristošesťdesiatpäť zapísaných dní, v akomkoľvek poradí.',
  'badge.workouts_100': 'Sto tréningov',
  'badgeHow.workouts_100': 'Sto dní s tréningom.',

  'widget.today': (label: string) => `${label} dnes`,
  'widget.of': (consumed: string, target: string) => `${consumed} z ${target} kcal`,
  'widget.tapToStart': 'Ťukni a začni dnešok',
  'widget.steps': (count: number) => n(count, { one: 'krok', few: 'kroky', many: 'kroku', other: 'krokov' }),
  'widget.stepsWord': 'kroky',
  'widget.usual': (average: string) => `z bežných ${average}`,
  'toast.logged': (description: string, kcal: string) => `Zapísané: ${description} – ${kcal} kcal`,
  'toast.removed': (description: string) => `Odstránené: ${description}`,
  'toast.tapToDismiss': (text: string) => `${text}. Ťuknutím zavrieš.`,
  'a11y.edit': (name: string) => `Upraviť: ${name}`,
  'a11y.delete': (name: string) => `Vymazať: ${name}`,
  'a11y.remove': (name: string) => `Odstrániť: ${name}`,

  'common.save': 'Uložiť',
  'common.cancel': 'Zrušiť',
  'common.delete': 'Vymazať',
  'common.repeat': 'Zopakovať',
  'common.undo': 'Vrátiť späť',
  'common.done': 'Hotovo',
  'common.add': 'Pridať',
  'common.edit': 'Upraviť',
  'common.close': 'Zavrieť',
  'common.retry': 'Skúsiť znova',
  'common.offline': 'Si offline. Znova to pôjde, keď budeš mať signál.',
  'common.unexpected': 'Niečo sa pokazilo. Skús to znova.',
  'common.loading': 'Načítava sa…',
  'common.today': 'Dnes',
  'common.yesterday': 'Včera',

  /* The gym card, second pass. See GYM-CARD.md. */
  'common.saving': 'Ukladá sa…',
  'workout.addExercises': '＋ Pridať cviky',
  'workout.pickExercises': 'Pridať cviky',
  'workout.anyExercise': 'hocijaký cvik – zapíš len sval',
  'workout.orNameIt': 'Alebo ho pomenuj',
  // "Čo si trénoval" genders the reader.
  'workout.pointAtIt': 'Alebo ukáž na precvičené svaly',
  'workout.front': 'Spredu',
  'workout.back': 'Zozadu',
  'workout.backToBody': (muscle: string) => `‹ ${muscle}`,
  'workout.addCount': (count: string) => `Pridať (${count})`,
  'workout.aboutLength': (min: string) => `≈ ${min} min`,
  'workout.exactLength': (min: string) => `${min} min`,
  'workout.tapToFix': 'odhad · ťukni a oprav',
  'workout.whatKind': 'Aký druh tréningu?',
  'workout.lessNamed': (caption: string) => `Menej: ${caption}`,
  'workout.moreNamed': (caption: string) => `Viac: ${caption}`,
};
