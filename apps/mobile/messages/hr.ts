import { pluralFor, pluralWordFor } from '@ct/shared';

import type { Messages } from '@/lib/i18n';

/**
 * Croatian, for the native app. Standard Croatian: Latin script, ijekavian
 * (tjedan, mlijeko, vrijeme), „…“ quotes. Second person singular and informal
 * throughout — «ti», never «Vi». Plural categories are one / few / other
 * (1 dan · 2 dana · 5 dana · 21 dan), so every `n()` and `w()` carries all three.
 *
 * The habit that shaped the most sentences: the reader is never gendered. The
 * Croatian past tense inflects for it ("jeo si" / "jela si"), so those lines are
 * in the present, the imperative, or impersonal ("upisano", "pojedeno"). And
 * data never takes a case ending: a name follows a generic noun ("Uredi trening
 * …") or a colon, so it can stay in the nominative it arrives in.
 */
/** This language's plural categories, bound once. See the web twin. */
const n = pluralFor('hr');
/** The agreeing noun without its number, for the paywall's sentences. */
const w = pluralWordFor('hr');

export const hr: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  'nav.journal': 'Dnevnik',
  'nav.today': 'Danas',
  'nav.progress': 'Napredak',
  'nav.exercise': 'Vježbanje',
  'nav.cook': 'Kuhinja',
  // "Ti" is the literal answer and reads oddly as a label; this is the tab
  // where your own details live, so it is named for them (as in bg.ts).
  'nav.you': 'Profil',
  'nav.history': 'Povijest',
  'nav.admin': 'Admin',
  'nav.signOut': 'Odjava',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Danas',
  // Under the figure in the ring: what the number *is*, so no preposition.
  'today.toGo': 'preostalo',
  'today.over': 'preko cilja',
  'today.burned': (kcal: string) => `+${kcal} potrošeno`,
  'today.viewCalendar': 'Otvori kalendar',
  'today.previousDay': 'Prethodni dan',
  'today.nextDay': 'Sljedeći dan',
  'today.nothingLogged': 'Još ništa nije upisano.',
  // "What you ate" is gendered in the past tense; the plate is not.
  'today.nothingLoggedHint': 'Reci dnevniku što je bilo na tanjuru.',
  'today.logAgain': 'Upiši ponovno',
  'today.weighed': 'Vaganje',
  'today.weight': 'Težina',
  'today.exercise': 'Vježbanje',
  'today.roughEstimate': 'gruba procjena',
  'today.exerciseFooter': 'Prikazano odvojeno od cilja — potrošnja na vježbanju samo je gruba procjena.',
  'today.exerciseTitle': '🏃  Vježbanje',
  'today.stepsTitle': '👟  Koraci',
  'today.steps': (count: number) => n(count, { one: 'korak', few: 'koraka', other: 'koraka' }),
  'today.stepsFooter': 'Broji ih tvoj telefon. Koraci pomažu da cilj bude točniji — nikad mu se ne pribrajaju.',
  'today.stepsEnable': 'Broji moje korake',
  'today.stepsStarting': 'Brojenje je počelo',
  'today.stepsStartingHint':
    'Telefon broji od trenutka kad je to dopušteno, pa ovdje još nema ničega. Prošetaj malo i brojka će se pojaviti.',
  'today.stepsNoSource': 'Na ovom telefonu još ništa ne broji korake',
  'today.stepsNoSourceHint':
    'Health Connect još nema ništa. Na nekim telefonima korake broji druga aplikacija — dodirni za popis aplikacija i dopusti pristup za Samsung Health ili Fitbit.',
  'today.stepsUsual': (average: string) => `obično ${average}`,
  'today.stepsEnableHint': 'Čita broj koraka s telefona, da cilj odgovara onome što stvarno radiš.',
  'today.thatChange': 'Ta promjena',
  'today.couldNotSave': (what: string, reason: string) => `${what}: spremanje nije uspjelo. ${reason}`,
  'today.waitingToSync': (count: number) =>
    n(count, {
      one: 'promjena čeka sinkronizaciju',
      few: 'promjene čekaju sinkronizaciju',
      other: 'promjena čeka sinkronizaciju',
    }),
  'today.lastSavedDay': ' · prikazan je zadnji spremljeni dan',
  'today.offlineDay': 'Izvan mreže — prikazan je zadnji spremljeni dan.',
  'today.unsent': ' · čeka sinkronizaciju',
  'today.macroLine': (protein: string, carbs: string, fat: string) =>
    `${protein}P · ${carbs}U · ${fat}M`,
  'today.changeHint': 'Za promjenu samo reci u dnevniku — „bilo je više riže“.',
  'today.logItYourself': '+ Upiši ručno',
  'today.ofTargetKcal': (target: string) => `od ${target} kcal`,
  'rail.netAfterExercise': (kcal: string) => `neto ${kcal} kcal nakon vježbanja`,

  'meal.breakfast': 'Doručak',
  'meal.lunch': 'Ručak',
  'meal.dinner': 'Večera',
  'meal.snack': 'Međuobroci',
  'meal.snackOne': 'Međuobrok',

  'macro.protein': 'Proteini',
  'macro.carbs': 'Ugljikohidrati',
  'macro.fat': 'Masti',
  'macro.fiber': 'Vlakna',
  // Proteini, Ugljikohidrati, Masti.
  'macro.proteinInitial': 'P',
  'macro.carbsInitial': 'U',
  'macro.fatInitial': 'M',

  // ---- History ------------------------------------------------------------
  'history.title': 'Povijest',
  'history.thisMonth': 'Ovaj mjesec',
  'history.previousMonth': 'Prethodni mjesec',
  'history.nextMonth': 'Sljedeći mjesec',
  'history.avgIntake': 'Prosječni unos',
  'history.logged': 'Upisano',
  'history.exercise': 'Vježbanje',
  'history.onTarget': 'Na cilju',
  'history.under': 'Ispod',
  'history.over': 'Iznad',
  'history.noTarget': 'Bez cilja',
  'history.openInToday': 'Otvori u prikazu Danas →',
  'history.day': 'Dan',
  'history.nothingThatDay': 'Taj dan ništa nije upisano.',
  'history.nothingYet': 'Još ništa nije upisano.',
  'history.days': 'dana',
  'history.back': 'Natrag',
  'history.proteinGrams': (grams: string) => `${grams} g proteina`,

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Dva jaja i kriška kruha…',
  'composer.send': 'Pošalji',
  'composer.logPackets': 'Upiši ova pakiranja',
  'composer.packetsStraightIn': 'Ravno u dnevnik, ništa se ne troši',
  'composer.packetsWithMessage': 'Idu uz tvoju poruku',
  'composer.addPhoto': 'Dodaj fotografiju ili skeniraj pakiranje',
  'composer.takePhoto': 'Fotografiraj',
  'composer.choosePhoto': 'Odaberi fotografiju',
  'composer.scanBarcode': 'Skeniraj barkod',
  'composer.removePhoto': 'Ukloni fotografiju',
  'composer.setAmountFor': (name: string) => `Postavi količinu: ${name}`,
  'composer.removeScan': (name: string) => `Ukloni: ${name}`,
  'composer.cameraBlockedTitle': 'Day So Far ne može otvoriti kameru',
  'composer.cameraBlockedBody':
    'Pristup kameri isključen je za ovu aplikaciju, pa je iOS neće otvoriti. Uključi ga u Postavkama ili odaberi fotografiju iz galerije.',
  'composer.openSettings': 'Otvori Postavke',
  'composer.notNow': 'Ne sada',
  'composer.photoUnreadable': 'Ta se fotografija ne može pročitati. Pokušaj s drugom.',
  'composer.selectedMeal': 'Odabrani obrok',
  'composer.labelHint': 'Ovo je deklaracija — upiši pojedeno prema njoj.',
  'composer.photoTip':
    'Savjet: ostavi vilicu, žlicu ili ruku u kadru — tako znamo koliki je tanjur, a to je najteže pogoditi.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Profil',
  'setup.about': 'O tebi',
  'setup.account': 'Račun',
  'setup.appearance': 'Izgled',
  'setup.dangerZone': 'Opasna zona',
  'setup.displayName': 'Ime',
  'setup.sex': 'Spol',
  'setup.birthDate': 'Datum rođenja',
  'setup.height': 'Visina',
  'setup.targetWeight': 'Ciljna težina',
  'setup.activity': 'Aktivnost',
  'setup.goal': 'Cilj',
  'setup.units': 'Mjerne jedinice',
  'setup.language': 'Jezik',
  'setup.languageSuggested': 'Predloženo',
  'setup.languageAll': 'Svi jezici',
  'setup.dayStartsAt': 'Dan počinje u',
  'setup.timezone': 'Vremenska zona',
  'setup.email': 'E-pošta',
  'setup.addressConfirmed': 'Adresa je potvrđena',
  'setup.addressNotConfirmed': 'Adresa nije potvrđena',
  'setup.deleteTypeEmail': 'Za potvrdu upiši adresu iznad. Ovaj se račun prijavljuje Google računom, pa nema lozinke za provjeru.',
  'setup.deleteAccount': 'Izbriši račun',
  'setup.deleteFailed': 'Račun nije moguće izbrisati.',
  'setup.contactSupport': 'Kontaktiraj podršku',
  'setup.save': 'Spremi',
  'setup.saving': 'Spremanje…',
  'setup.saved': 'Spremljeno',
  'setup.savedTargetMoved': (from: string, to: string) => `Spremljeno — dnevni cilj ${from} → ${to} kcal`,
  'setup.savedTargetSame': (kcal: string) => `Spremljeno — dnevni cilj ostaje ${kcal} kcal`,
  'setup.activitySedentary': 'Sjedeći posao, malo kretanja',
  'setup.activityLight': 'Lagano vježbanje 1–3 dana tjedno',
  'setup.activityModerate': 'Umjereno vježbanje 3–5 dana tjedno',
  'setup.activityActive': 'Naporno vježbanje 6–7 dana tjedno',
  'setup.activityVeryActive': 'Fizički posao ili trening dvaput dnevno',
  'setup.dailyTarget': 'Tvoj dnevni cilj',
  'setup.optional': 'Neobavezno',
  'setup.dayTitle': 'Dan',
  'setup.dayFooter':
    'Hrana pojedena prije početka dana računa se u prethodni dan — pa međuobrok u 1 iza ponoći ide na večer kojoj pripada.',
  'setup.appearanceFooter': 'Opcija „Sustav“ prati tvoj uređaj, uključujući raspored svijetle i tamne teme.',
  // "Prijavljen kao" would gender the reader; the account is what is signed in.
  'setup.signedInAs': 'Prijavljeni račun',
  'setup.subtitle': 'Dovoljno za početni cilj. Prilagođava se kako stižu stvarni podaci.',
  'setup.targetDisclaimer':
    'Prosjek za osobe tvoje visine i težine, a ne liječnički savjet. Nakon dva tjedna ispravlja se prema onome što upisuješ. Ako si u trudnoći ili dojiš, ili liječiš stanje poput dijabetesa ili bolesti bubrega, neka ti broj odredi liječnik, a ti ga ovdje upiši ručno.',

  // ---- Coach ----------------------------------------------------------------
  // The person is «trener», the everyday word; the tier stays "Coach".
  'coach.title': 'Trener',
  'coach.footerNone': 'Trener vidi ono što uključiš i može pisati u tvoj dnevnik. Ništa se ne dijeli dok ne prihvatiš kod.',
  'coach.enterCode': 'Upiši kod trenera',
  'coach.codePlaceholder': 'XXXX-XXXX',
  'coach.continue': 'Nastavi',
  'coach.sharedWith': (name: string) => `Dijeliš s: ${name}`,
  'coach.since': (date: string) => `od ${date}`,
  'coach.scopeMeals': 'Obroci i fotografije',
  'coach.scopeMealsHint': 'Što jedeš i kada',
  'coach.scopeWeight': 'Težina',
  'coach.scopeWeightHint': 'Tvoja vaganja i trend',
  'coach.scopeMetrics': 'Koraci, san, puls',
  'coach.scopeMetricsHint': 'S telefona ili sata',
  'coach.footerLinked': (name: string) => `${name} može postavljati tvoje ciljeve kalorija i makronutrijenata. Uvijek ih možeš vratiti, a dijeljenje možeš prekinuti bilo kad.`,
  'coach.stopSharing': 'Prekini dijeljenje',
  'coach.stopConfirm': (name: string) => `Prekinuti dijeljenje? ${name} od sada ne vidi ništa novo. Komentari koji su već u dnevniku ostaju.`,
  'coach.stop': 'Prekini',
  'coach.keep': 'Nastavi dijeliti',
  'coach.stopped': 'Dijeljenje je prekinuto.',
  'coach.inviteTitle': (name: string) => `${name} te želi trenirati`,
  'coach.willSee': 'Vidjet će',
  'coach.wontSee': 'Neće vidjeti',
  'coach.seeMeals': 'Tvoje obroke i njihove fotografije',
  'coach.seeTotals': 'Dnevne kalorije i makronutrijente',
  'coach.seeWeight': 'Tvoju težinu i ciljeve',
  'coach.seeDays': 'Dane s upisima',
  'coach.notChat': 'Tvoj razgovor s dnevnikom',
  'coach.notMetrics': 'Korake, san ni puls, osim ako to ne uključiš',
  'coach.notEmail': 'Tvoju e-poštu i podatke o plaćanju',
  'coach.accept': 'Prihvati',
  'coach.notNow': 'Ne sada',
  'coach.close': 'Zatvori',
  'coach.canStop': 'Dijeljenje možeš prekinuti bilo kad u Postavkama.',
  'coach.accepted': (name: string) => `Dijeljenje uključeno: ${name}.`,
  'coach.alreadyLinked': (name: string) => `Već dijeliš dnevnik: ${name}. Najprije prekini to dijeljenje.`,
  'coach.invalid': 'Taj kod ne prepoznajemo.',
  'coach.expired': 'Taj je kod istekao. Zatraži novi od trenera.',
  'coach.used': 'Taj je kod već iskorišten.',
  'coach.bannerManage': 'Upravljaj',
  'coach.yourCoach': 'tvoj trener',
  'coach.yourCoachCapital': 'Tvoj trener',
  'coach.setByCoach': 'Postavka trenera',
  'coach.seatPlus': 'uz trenera imaš Plus',

  'setup.aboutTitle': 'O aplikaciji',
  'setup.privacyPolicy': 'Pravila privatnosti',
  'setup.termsOfService': 'Uvjeti korištenja',
  'setup.rateApp': 'Ocijeni aplikaciju',
  'setup.unsavedChanges': 'Nespremljene promjene',
  'setup.saveChanges': 'Spremi promjene',

  'setup.requiredMissing':
    'Za izračun cilja potrebni su spol, datum rođenja, visina, cilj i aktivnost.',

  // ---- The first run ------------------------------------------------------
  'ob.back': 'Natrag',
  'ob.continue': 'Nastavi',

  'ob.welcomeTitle': 'Složimo tvoj plan',
  'ob.welcomeBody':
    'Šest brzih pitanja — oko pola minute — i imat ćeš cilj kalorija i proteina izračunat za svoje tijelo, a ne za prosječnu osobu. Sve možeš promijeniti kasnije.',
  'ob.welcomeStart': 'Krenimo',

  'ob.goalTitle': 'Što želiš postići?',
  'ob.goalBody': 'O ovome ovisi hoće li dnevni unos biti ispod potrošnje, jednak njoj ili iznad nje.',
  'ob.goalLose': 'Smršavjeti',
  'ob.goalLoseHint': 'Umjeren manjak koji stvarno možeš održati',
  'ob.goalMaintain': 'Ostati gdje jesam',
  'ob.goalMaintainHint': 'Jedi koliko trošiš i drži to na oku',
  'ob.goalGain': 'Dobiti na težini',
  'ob.goalGainHint': 'Mali višak, uz dovoljno proteina da ga iskoristiš',

  'ob.sexTitle': 'Za koji spol računamo?',
  'ob.sexBody':
    'Potrošnja u mirovanju razlikuje se toliko da bi nagađanje pomaknulo cilj za koju stotinu kalorija dnevno.',

  // "Kad si rođen/rođena?" asks the reader's gender first; the date does not.
  'ob.birthTitle': 'Tvoj datum rođenja',
  'ob.birthBody': 'Dob je posljednje što izračun potrošnje treba.',
  'ob.birthAge': (count: number) => n(count, { one: 'godina', few: 'godine', other: 'godina' }),
  'ob.birthTooYoung': 'Aplikacija je za osobe od 13 godina naviše.',
  'ob.birthImplausible': 'Provjeri godinu — datum ne izgleda točno.',

  'ob.bodyTitle': 'Visina i težina',
  'ob.bodyBody':
    'Otprilike je dovoljno. Težina se upisuje kao prvo vaganje, pa grafikon kreće od danas.',
  'ob.bodyHeight': 'Visina',
  'ob.bodyWeight': 'Težina',
  'ob.bodyHeightOff': 'Ta visina ne izgleda točno — provjeri mjerne jedinice.',
  'ob.bodyWeightOff': 'Ta težina ne izgleda točno — provjeri mjerne jedinice.',

  'ob.skip': 'Preskoči zasad',
  // "Nisam siguran/sigurna" would gender the reader.
  'ob.activitySkip': 'Ne znam — uzmi umjerenu',

  'ob.targetTitle': 'Koji ti je cilj?',
  'ob.targetBody': 'Ciljna težina, da aplikacija može pokazati koliko je još ostalo. Promijeni je bilo kad.',
  'ob.targetToGo': (amount: string) => `još ${amount}`,
  'ob.targetSame': 'Ista kao sada',
  'ob.targetMustBeLower': 'Odaberi nešto ispod trenutačne težine.',
  'ob.targetMustBeHigher': 'Odaberi nešto iznad trenutačne težine.',

  'ob.activityTitle': 'Koliko se krećeš?',
  'ob.activityBody': 'Tvoj uobičajeni tjedan — bez treninga koje upisuješ u aplikaciji.',

  'ob.buildingTitle': 'Slažemo tvoj plan',
  'ob.buildingStep1': 'Računamo koliko trošiš',
  'ob.buildingStep2': 'Postavljamo dnevne kalorije',
  'ob.buildingStep3': 'Raspoređujemo proteine, ugljikohidrate i masti',
  'ob.buildingFailed': 'Tvoj plan nije spremljen.',
  'ob.retry': 'Pokušaj ponovno',

  'ob.planEyebrow': 'Tvoj dnevni cilj',
  'ob.planCalories': 'kalorija dnevno',
  'ob.planFootnote':
    'Polazna točka, ne presuda. Svaki se tjedan prilagođava onome što upisuješ i što pokazuje vaga.',
  'ob.planStart': 'Počni upisivati',

  // Adjectives agreeing with «spol», not with the person.
  'sex.male': 'Muški',
  'sex.female': 'Ženski',

  'goal.lose': 'Mršavljenje',
  'goal.maintain': 'Održavanje',
  'goal.gain': 'Dobivanje težine',

  // Feminine, agreeing with «aktivnost» — "Aktivan/Aktivna" would describe the
  // reader, and in one gender or the other.
  'activity.sedentary': 'Sjedilačka',
  'activity.light': 'Lagana',
  'activity.moderate': 'Umjerena',
  'activity.active': 'Visoka',
  'activity.veryActive': 'Vrlo visoka',

  'units.metric': 'Metrički',
  'units.imperial': 'Imperijalni',

  'theme.label': 'Tema',
  'theme.system': 'Sustav',
  'theme.light': 'Svijetla',
  'theme.dark': 'Tamna',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Prijava',
  'auth.signInSubtitle': 'Prijavi se i nastavi ondje gdje je sve stalo.',
  'auth.createAccount': 'Izradi račun',
  'auth.createAccountTitle': 'Izradi svoj račun',
  'auth.email': 'E-pošta',
  'auth.password': 'Lozinka',
  'auth.passwordHint': 'Najmanje 8 znakova.',
  'auth.showPassword': 'Prikaži lozinku',
  'auth.hidePassword': 'Sakrij lozinku',
  'auth.nameOptional': 'Ime (neobavezno)',
  'auth.continueWithGoogle': 'Nastavi s Googleom',
  'auth.forgotPassword': 'Zaboravljena lozinka?',
  'auth.haveAccount': 'Već imaš račun?',
  'auth.newHere': 'Prvi put ovdje?',
  'auth.signupsClosed': 'Registracije na ovom poslužitelju su zatvorene.',
  'auth.googleFailed': 'Prijava Google računom nije uspjela. Pokušaj ponovno ili se prijavi e-poštom i lozinkom.',
  'auth.genericFailure': 'Nešto je pošlo po zlu pri prijavi. Pokušaj ponovno.',
  'auth.oneMoment': 'Samo trenutak…',
  'auth.privacyPolicy': 'Pravila privatnosti',
  'auth.language': 'Jezik',
  'auth.or': 'ili',
  'auth.createAccountSubtitle':
    'Zatim reci dnevniku nešto o sebi i on će izračunati tvoje ciljeve.',
  'auth.emailFirst': 'Najprije upiši e-poštu, a ja ću poslati poveznicu.',
  // Built so both links stay in the nominative: "… vrijede Uvjeti korištenja i Pravila privatnosti."
  'auth.agreeBefore': 'Izradom računa pristaješ da za tebe vrijede',
  'auth.terms': 'Uvjeti korištenja',
  'auth.agreeAnd': 'i',
  'auth.agreeAfter': '.',
  'reset.linkSent': 'Ako za tu adresu postoji račun, poveznica za novu lozinku je na putu.',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Provjeri e-poštu',
  'verify.sentTo': (email: string) => `Poslali smo šest znamenki na ${email}. Upiši ih i unutra si.`,
  'verify.sentBlind': 'Poslali smo ti šest znamenki. Upiši ih i unutra si.',
  'verify.title': 'Potvrdi e-poštu',
  'verify.checkInbox': 'Provjeri pristiglu poštu',
  'verify.enterCode': 'Upiši kod',
  'verify.sixDigitCode': 'Šesteroznamenkasti kod',
  'verify.confirm': 'Potvrdi',
  'verify.confirming': 'Potvrđivanje…',
  'verify.confirmed': 'E-pošta je potvrđena',
  'verify.alreadyConfirmed': 'Već potvrđeno',
  'verify.readyMessage': 'Ova je adresa postavljena i spremna.',
  'verify.sendNewCode': 'Pošalji novi kod',
  'verify.sending': 'Slanje…',
  'verify.startJournal': 'Započni dnevnik',
  'verify.signInFirst': 'Najprije se prijavi, a zatim upiši kod koji smo ti poslali e-poštom.',
  'verify.signOutAndRestart': 'Odjavi se i počni ispočetka',
  'verify.linkFailed': 'Ta poveznica ne radi',
  'verify.codeSent': 'Provjeri pristiglu poštu — ondje je kod za potvrdu.',
  'verify.sendAgain': 'Pošalji ponovno',

  // ---- Cook ---------------------------------------------------------------
  'cook.title': 'Kuhinja',
  'cook.kitchenEmpty': 'Kuhinja ti je prazna',
  'cook.things': (count: number) => n(count, { one: 'namirnica', few: 'namirnice', other: 'namirnica' }),
  'cook.toCheck': (count: number) => `· ${count} za provjeru`,
  'cook.yourKitchen': 'Tvoja kuhinja',
  'cook.yourKitchenDesc': 'Od ovoga ću kuhati. Dovoljno je otprilike.',
  'cook.thinking': 'Razmišljam…',
  'cook.nothingLeftToday': 'Za danas je sve potrošeno',
  'cook.findMeSomething': 'Nađi mi nešto',
  'cook.anythingSpecific': 'Nešto posebno?',
  'cook.anythingSpecificDesc':
    'Sve je neobavezno. I bez toga polazim od tvoje kuhinje i tvog dana.',
  'cook.alreadyWriting': 'Već pišem jedan…',
  'cook.noRunsLeft': 'Za danas nema više recepata',
  'cook.planTheWeek': 'Isplaniraj tjedan',
  'cook.forYou': 'Za tebe',
  // A shelf of recipes is a «zbirka»; «knjižnica» is a building.
  'cook.library': 'Zbirka',
  'cook.searchLibrary': 'Pretraži zbirku',
  'cook.emptyBefore': 'Još ništa. Pritisni',
  'cook.emptyAfter':
    'i smislit ću recept od onoga što imaš u kuhinji — ili kreni od fotografije ili recepta koji već imaš.',
  'cook.perPortion': 'po porciji',
  'cook.per': (unit: string) => `po ${unit}`,
  'cook.nothingMatching': (query: string) => `Ništa ne odgovara upitu „${query}“.`,
  'cook.libraryNote':
    'Pravi recepti iz javno dostupne zbirke USDA, poredani po tome koliko sastojaka već imaš.',

  'cook.writingAround': (things: string) => `Pišem recept oko namirnica s fotografije: ${things}…`,
  'cook.writingFor': (asked: string) =>
    `Pišem recept za „${asked}“ od onoga što imaš u kuhinji…`,
  'cook.writingPlain': 'Pišem recept od onoga što imaš u kuhinji…',

  'cook.planLocked': 'Pisanje recepata dio je paketa Coach.',
  'cook.runs': (count: number) => n(count, { one: 'recept', few: 'recepta', other: 'recepata' }),
  'cook.planSpent': (runs: string) => `Za danas iskorišteno: ${runs}.`,
  'cook.planSpentBack': (when: string) => ` Novi dobivaš ${when}.`,
  'cook.planEmptyKitchen':
    'Kuhinja ti je prazna, pa ću predložiti nešto za što je dovoljna jedna mala kupnja — i reći što kupiti.',
  'cook.planFromWants': 'Polazim od onoga što tražiš i što je u kuhinji',
  'cook.planFromKitchen': 'Smislit ću recept od onoga što imaš u kuhinji',
  'cook.planAtTarget': (from: string) =>
    `${from} — a danas si već na cilju, pa će recept biti lagan.`,
  'cook.planAiming': (from: string, kcal: string, protein: string) =>
    `${from}, s ciljem od preostalih ${kcal} kcal i ${protein} g proteina.`,

  // ---- The recipe brief ---------------------------------------------------
  'brief.anythingElse': 'Još nešto?',
  'brief.wantsPlaceholder': '„u jednoj tavi“, „potroši špinat“, „bez korijandera“',
  'brief.time': 'Vrijeme',
  'brief.minutes': (count: number) => `${count} min`,
  'brief.meal': 'Obrok',
  'brief.cook': 'Koliko kuhati',
  'brief.justTonight': 'Samo za večeras',
  'brief.portions': (count: number) => n(count, { one: 'porcija', few: 'porcije', other: 'porcija' }),
  'brief.proteinAtLeast': 'Proteina najmanje',
  'brief.caloriesAtMost': 'Kalorija najviše',

  // ---- What you don’t eat -------------------------------------------------
  'diet.title': 'Što ne jedeš',
  'diet.footer':
    'Primjenjuje se na svaki prijedlog recepta kao čvrsto ograničenje, a ne kao želja. Ne mijenja način na koji dnevnik upisuje ono što stvarno jedeš — reci mu što je bilo na tanjuru i on će to upisati.',
  'diet.none': 'Bez ograničenja',
  // Agreeing with «prehrana»: "vegetarijanac/vegetarijanka" would be the reader.
  'diet.vegetarian': 'Vegetarijanska',
  'diet.vegan': 'Veganska',
  'diet.pescatarian': 'Peskatarijanska',
  'diet.avoidPlaceholder': 'Još nešto — alergija, nešto što ne voliš',
  'diet.stopAvoiding': (item: string) => `Više ne izbjegavaj: ${item}`,

  // ---- The fridge scan ----------------------------------------------------
  'scan.notAnImage': 'Ta datoteka nije slika koju mogu pročitati.',
  'scan.noFood': 'Na toj fotografiji ne vidim nikakvu hranu.',
  'scan.added': (count: number) =>
    `Dodano: ${n(count, { one: 'namirnica', few: 'namirnice', other: 'namirnica' })}`,
  'scan.reading': 'Čitam fotografiju…',
  'scan.fromPhoto': 'S fotografije',
  'scan.scanMyFridge': 'Skeniraj moj hladnjak',
  'scan.whatICanSee': 'Što vidim',
  'scan.tapWrong': 'Dodirni sve što nije točno.',
  'scan.alreadyListed': '· već na popisu',
  'scan.adding': 'Dodajem…',
  'scan.addToKitchen': 'Dodaj u moju kuhinju',
  'scan.findingRecipes': 'Tražim recepte…',
  'scan.cookWithThese': 'Kuhaj s ovim',

  // ---- The kitchen list ---------------------------------------------------
  'pantry.addToList': 'Dodaj na popis',
  'pantry.addPlaceholder': 'piletina, riža, paprike',
  'pantry.stillThere': (count: number) => `Još uvijek tu? · ${count}`,
  'pantry.yes': 'Da',
  'pantry.removed': (name: string) => `Uklonjeno: ${name}`,
  'pantry.remove': (name: string) => `Ukloni: ${name}`,
  'pantry.emptyHint': 'Ovdje još nema ničega. Upiši nekoliko namirnica gore ili fotografiraj policu.',
  'pantry.inTheKitchen': (count: number) => `U kuhinji · ${count}`,
  'pantry.staples': (count: number) => `Osnovne namirnice · ${count}`,

  // ---- A recipe you already have ------------------------------------------
  'import.chip': 'Zalijepi recept',
  'import.title': 'Recept koji već imaš',
  'import.desc': 'Izračunat ću kalorije, a kuhanje ne diram.',
  'import.unreadable': 'To se ne može pročitati kao recept.',
  'import.saved': (title: string, kcal: string) => `Spremljeno: ${title} — ${kcal} kcal po porciji`,
  'import.placeholder':
    'Zalijepi ili upiši recept — sastojke i postupak, kako god da je zapisan.',
  'import.working': 'Računam brojke…',
  'import.workOutMacros': 'Izračunaj makronutrijente',

  // ---- A recipe -----------------------------------------------------------
  'recipe.save': 'Spremi',
  'recipe.saved': 'Spremljeno',
  'recipe.saveThis': 'Spremi ovaj recept',
  'recipe.unsaveThis': 'Makni iz spremljenih',
  'recipe.usesYour': (things: string) => `Iz tvoje kuhinje: ${things}`,
  'recipe.fitsToday': 'Stane u ostatak dana',
  'recipe.steps': (count: number) => n(count, { one: 'korak', few: 'koraka', other: 'koraka' }),
  'recipe.saveNamed': (title: string) => `Spremi recept ${title}`,
  'recipe.unsaveNamed': (title: string) => `Makni recept ${title} iz spremljenih`,
  // `portions` is a bare figure ("2", "1,5"); after a colon no case has to follow it.
  'recipe.forPortions': (portions: string) => `broj porcija: ${portions}`,
  'recipe.portionsCount': (count: number) => n(count, { one: 'porcija', few: 'porcije', other: 'porcija' }),
  'recipe.howToMakeIt': (steps: string) => `Priprema · ${steps}`,
  'recipe.ingredientsMakes': (portions: string) => `Sastojci · porcija: ${portions}`,
  // "Pojeo/pojela sam ovo" would gender the reader.
  'recipe.iAteThis': (kcal: string) => `Pojedeno · ${kcal} kcal`,
  'recipe.openFull': 'Otvori cijeli recept',
  'recipe.backToCook': 'Natrag u Kuhinju',
  'recipe.logged': (what: string, kcal: string) => `Upisano: ${what} — ${kcal} kcal`,
  'recipe.forServings': (servings: string, unit: string) => `za ${servings} × ${unit}`,
  'recipe.publicDomain': 'javno dobro',
  'recipe.iAteThisPlain': (kcal: string) => `Pojedeno · ${kcal}`,
  'recipe.youdNeed': (things: string) => `Trebat će ti: ${things}`,
  'recipe.fromLibrary': 'Iz zbirke',
  'recipe.madeForYou': 'Napravljeno za tebe',
  'recipe.madeForKitchen': 'Napravljeno za tvoju kuhinju',
  'recipe.adaptedForYou': 'Prilagođeno tebi',
  'recipe.yourOwn': 'Tvoj recept',
  'recipe.seeOriginal': 'Pogledaj izvornik',
  'recipe.writtenAgainst': (kcal: string, date: string) =>
    ` Napisano prema ${kcal} kcal koliko je preostalo ${date}.`,
  'recipe.ingredients': 'Sastojci',
  'recipe.notInKitchen': '· nije u tvojoj kuhinji',
  'recipe.method': 'Priprema',
  'recipe.showMethod': 'Prikaži pripremu',
  'recipe.hideMethod': 'Sakrij pripremu',
  'recipe.logging': 'Upisujem…',
  'recipe.yesTonight': 'da, večeras',
  'recipe.yesNow': 'da, sada',
  'recipe.howMuch': 'Koliko je pojedeno?',
  'recipe.less': 'Manje',
  'recipe.more': 'Više',
  'recipe.servingsCount': (servings: string) => `broj porcija: ${servings}`,
  'recipe.portion': 'porcija',
  'recipe.makeItFit': 'Prilagodi ga meni',
  'recipe.reworking': 'Prerađujem…',
  'recipe.notInLibrary': 'Tog recepta nema u zbirci.',
  'recipe.notHere': 'Tog recepta ovdje više nema.',
  'recipe.nothingCameBack': 'Ništa nije stiglo natrag.',
  'recipe.ingredientsNote':
    'Izmjereno za gotovo jelo, kako je objavljeno — pa nema brojki po sastojku.',
  'recipe.confidenceHigh': 'Ove su brojke točne koliko god aplikacija može bez vaganja.',
  'recipe.confidenceMedium':
    'Brojke su procjena — dovoljno blizu za upis, ali vrijedi ih provjeriti ako je važno.',
  'recipe.confidenceLow': 'Ove su brojke gruba procjena. Izvaži što možeš ako je danas tijesno.',
  'recipe.tileQualifier': (protein: string, serving: string) =>
    `kcal · ${protein} g proteina · ${serving}`,
  'recipe.kcalPer': (serving: string) => `kcal · ${serving}`,
  // «za» takes the accusative, so the singular is «porciju».
  'recipe.makes': (count: number) => `Za ${n(count, { one: 'porciju', few: 'porcije', other: 'porcija' })}`,

  // ---- Progress -----------------------------------------------------------
  'progress.title': 'Napredak',
  'progress.daysWindow': (count: number) => n(count, { one: 'dan', few: 'dana', other: 'dana' }),
  'progress.daysShort': (count: number) => `${count} d`,
  'progress.weightTitle': '⚖️  Težina',
  'progress.noWeighIns': 'Još nema vaganja. Upiši jedno ispod ili samo reci dnevniku.',
  'progress.noWeighIn': 'Bez vaganja',
  'progress.trendReadout': (value: string) => `Prosjek 7 dana: ${value} — linija`,
  'progress.thisWeek': 'ovaj tjedan',
  'progress.avg7d': 'Prosjek 7 dana',
  'progress.sinceStart': 'Od početka',
  'progress.toTarget': 'Do cilja',
  'progress.logTodaysWeight': (unit: string) => `Upiši današnju težinu (${unit})`,
  'progress.caloriesTitle': '🔥  Kalorije',
  'progress.avgDayTarget': (target: string) => `prosjek/dan · cilj ${target}`,
  'progress.proteinTitle': '💪  Proteini',
  // Reads "Cilj pogođen u 5 od 12 upisanih dana." — «od» takes the genitive
  // plural that `hitTargetAfter` already is.
  'progress.hitTargetBefore': 'Cilj pogođen u',
  'progress.ofDays': (hit: string, logged: string) => `${hit} od ${logged}`,
  'progress.hitTargetAfter': 'upisanih dana.',
  'progress.qualityTitle': '🥦  Kvaliteta prehrane',
  'progress.days': (count: number) => n(count, { one: 'dan', few: 'dana', other: 'dana' }),
  'progress.qualityFooter': (days: string, percent: string) =>
    `Prosjek kroz ${days} — ove brojke ima ${percent}% upisanog.`,
  'progress.chartNutrient': (label: string) => `Grafikon: ${label}`,
  'progress.exerciseTitle': '🏃  Vježbanje',
  // "Zašto nisam smršavio/smršavjela" would gender the reader.
  'progress.exerciseFooter':
    'Pitaj dnevnik bilo što o ovim podacima — „zašto mi težina ovaj tjedan ne pada?“',
  'progress.sessionsOver': (kcal: string, days: string) =>
    `treninga · ~${kcal} kcal u ${days} dana`,
  'progress.qualityLine': (label: string, aim: string, target: string) =>
    `${label} prosjek/dan · ${aim} ${target}`,
  'progress.aimFor': 'cilj',
  'progress.keepUnder': 'ispod',

  // ---- Exercise -----------------------------------------------------------
  'exercise.title': 'Vježbanje',
  'exercise.nothingLogged': (days: string) => `U zadnjih ${days} dana ništa nije upisano.`,
  // "Trčao/trčala sam" is gendered; a distance and a time of day are not.
  'exercise.tellTheJournal': (example: string) => `Reci dnevniku — „jutros ${example} trčanja“.`,
  'exercise.consistencyTitle': '🔁  Redovitost',
  'exercise.activeOf': (days: string, sessions: string) => `od ${days} dana aktivno · ${sessions}`,
  'exercise.sessionsCount': (count: number) => n(count, { one: 'trening', few: 'treninga', other: 'treninga' }),
  'exercise.burnedPerDay': 'Potrošene kalorije po danu',
  'exercise.burned': 'Potrošeno',
  'exercise.distance': 'Udaljenost',
  'exercise.time': 'Vrijeme',
  'exercise.sessionsTitle': '🏃  Treninzi',
  'exercise.burnNote': (example: string) =>
    `Potrošnja je procjena i nikad se ne oduzima od cilja kalorija. Ispravi je u dnevniku — „to je trčanje bilo bliže ${example}“.`,
  'exercise.minutes': (minutes: string) => `${minutes} min`,
  'exercise.restDay': 'Dan odmora',
  'exercise.moreSessions': (count: string) => `+${count} više`,

  // ---- Saved workouts -----------------------------------------------------
  'workouts.logTitle': '🏋️  Upiši trening',
  'workouts.logAction': 'Upiši trening',
  'workouts.savedTitle': '🏋️  Spremljeni treninzi',
  'workouts.buildOne': 'Složi novi',
  'workouts.reuseHint': 'Jedan dodir ispunjava cijelu karticu, s težinama od prošlog puta.',
  'workouts.whereSessionsGo':
    'Upisani treninzi pojavljuju se u povijesti ispod. Ovaj je popis samo za treninge koje želiš ponavljati.',
  'workouts.loadFailed': 'Spremljeni treninzi nisu se učitali.',
  'workouts.noneSavedTitle': 'Još nema spremljenih treninga.',
  'workouts.noneSavedHint':
    'Spremljeni trening je popis koji koristiš iznova — upiši trening s vježbama pa prihvati ponudu da ga imenuješ ili ga složi ovdje.',
  'workouts.exerciseCount': (count: number) => n(count, { one: 'vježba', few: 'vježbe', other: 'vježbi' }),
  'workouts.doneTimes': (times: string) => ` · odrađeno ${times}×`,
  'workouts.editNamed': (name: string) => `Uredi trening ${name}`,
  'workouts.deleteNamed': (name: string) => `Izbriši trening ${name}`,
  'workouts.weekTitle': '🗓️  Tvoj tjedan',
  'workouts.weekFooter':
    'Dani koje postaviš su fiksni. Dani koje ostaviš slobodnima prate ono što stvarno redovito radiš.',
  // `day` is a weekday in the nominative, so it stands apart rather than after «za».
  'workouts.workoutFor': (day: string) => `Trening — ${day}`,
  'workouts.usually': (workout: string) => `${workout} — obično`,
  // "Ti si postavio/postavila" is gendered.
  'workouts.youSetThis': 'tvoj odabir',
  'workouts.learned': 'naučeno',
  'workouts.editTitle': '✏️  Uredi trening',
  'workouts.buildTitle': '🏋️  Složi trening',
  'workouts.icon': 'Ikona',
  'workouts.namePlaceholder': 'Gornji dio, Prsa, Noge A…',
  'workouts.nameLabel': 'Naziv treninga',
  'workouts.sets': (count: number) => n(count, { one: 'serija', few: 'serije', other: 'serija' }),
  'workouts.oneFewerSet': (exercise: string) => `Jedna serija manje: ${exercise}`,
  'workouts.oneMoreSet': (exercise: string) => `Jedna serija više: ${exercise}`,
  'workouts.removeExercise': (exercise: string) => `Ukloni vježbu ${exercise}`,

  // ---- Resetting a password -----------------------------------------------
  'plan.title': 'Ovaj tjedan',
  'plan.subtitle': 'Večere, odmjerene prema tvojim ciljevima. Jedan dodir upisuje skuhanu večeru.',
  'plan.weekTitle': (range: string) => `📅  ${range}`,
  'plan.weekFooter': 'Otvori večer da pročitaš pripremu ili je preskoči ako nisi kod kuće.',
  'plan.nothingYet': 'Za ovaj tjedan još ništa nije isplanirano.',
  'plan.askInBefore': 'Ispuni tjedan ispod ili ga zatraži u',
  'plan.journal': 'dnevniku',
  'plan.howToTitle': '🍳  Kako isplanirati tjedan',
  'plan.howToBefore':
    'Ovo je najskuplje što kuhinja radi, pa se pokreće jednom, a zatim plan uređuješ. Ili to reci u',
  'plan.howToAfter': '— „isplaniraj mi večere za ovaj tjedan, za dvoje, ništa dulje od 30 minuta“.',
  'plan.anythingHappening': 'Nešto se događa ovaj tjedan?',
  'plan.wantsPlaceholder': '„u četvrtak nisam kod kuće“, „potroši tikvu“',
  'plan.howManyItFeeds': 'Za koliko osoba',
  'plan.howManyItFeedsHint': 'Svaka se večera kuha za toliko osoba.',
  'plan.people': (count: number) => n(count, { one: 'osoba', few: 'osobe', other: 'osoba' }),
  'plan.cookOnce': 'Kuhaj jednom, jedi dvaput',
  'plan.cookOnceHint':
    'Veće kuhanje pokriva i sljedeću večer, pa u tjednu ima manje večeri za štednjakom.',
  'plan.longestCook': 'Najdulje kuhanje',
  'plan.longestCookHint': 'Nijedna večera u tjednu ne traje dulje od ovoga.',
  'plan.anyLength': 'Bilo koliko',
  'plan.any': 'Svejedno',
  'plan.minutesShort': (minutes: string) => `${minutes} min`,
  'plan.minutesLabel': (minutes: string) => `${minutes} minuta`,
  'plan.writing': 'Pišem tjedan…',
  'plan.again': 'Isplaniraj ponovno',
  'plan.planTheWeek': 'Isplaniraj tjedan',
  'plan.kcalProtein': (protein: string) => `kcal · ${protein} g proteina`,
  'plan.coversNext': 'Dovoljno i za sljedeću večer',
  'plan.coversMore': (nights: string) => `Dovoljno za još ${nights} večeri`,
  'plan.cooked': 'Skuhano',
  'plan.skipNamed': (day: string) => `Preskoči — ${day}`,
  'plan.nothingPlanned': 'Ništa isplanirano',
  'plan.nightsCount': (count: number) => n(count, { one: 'večer', few: 'večeri', other: 'večeri' }),

  'shopping.title': '🧺  Popis za kupnju',
  'shopping.haveAlready': (things: string) =>
    `Izostavljeno jer već postoji u kuhinji: ${things}.`,
  'shopping.addToList': 'Dodaj na popis',
  'shopping.placeholder': 'papirnati ručnici, vrećice za smeće',
  'shopping.addHint':
    'Za sve što nijedan recept ne bi tražio. Sastojci ispod dolaze iz plana za tjedan.',
  'shopping.empty': 'Popis je još prazan. Isplaniraj tjedan ili upiši što ti treba.',
  'shopping.putBack': (name: string) => `Vrati na popis: ${name}`,
  'shopping.tickOff': (name: string) => `Označi kao kupljeno: ${name}`,
  'shopping.takeOff': (name: string) => `Makni s popisa: ${name}`,

  // ---- The barcode scanner ------------------------------------------------
  'barcode.isThisIt': 'Je li to to?',
  'barcode.scanThePacket': 'Skeniraj pakiranje',
  'barcode.sayHowMuch': 'Reci koliko je pojedeno.',
  'barcode.pointAtIt': 'Usmjeri na barkod — dobit ćeš deklaraciju.',
  'barcode.noCamera':
    'Ovdje nema kamere — fotografiraj barkod i pročitat ću ga sa slike.',
  'barcode.reading': 'Čitam…',
  'barcode.photographInstead': 'Fotografiraj umjesto toga',
  'barcode.unreadable': 'Na toj slici ne mogu pročitati barkod — neka ispuni veći dio kadra.',
  'barcode.badFormat': 'Taj format slike ne mogu pročitati — JPEG ili PNG će poslužiti.',
  'barcode.aServing': (mass: string) => `${mass} po porciji`,
  'barcode.weighIt': 'Izvaži',
  'barcode.servings': 'porcije',
  'barcode.weighed': 'izvagano',
  'barcode.howMuchIn': (unit: string) => `Pojedena količina, u ${unit}`,
  'barcode.sourceOff': 'Podaci: Open Food Facts',
  'barcode.sourceUsdaLong': 'Podaci: USDA FoodData Central',
  'barcode.sourceUsda': 'Podaci: USDA',
  'barcode.wrongPacket': 'Krivo pakiranje?',
  'barcode.notFound': 'Nije pronađeno',
  'barcode.notFoundBody':
    'To pakiranje još nitko nije upisao u bazu — za mnoge marke trgovačkih lanaca to se nikad ni ne dogodi. Fotografiraj tablicu nutritivnih vrijednosti i pročitat ću je s deklaracije.',
  'barcode.photographLabel': 'Fotografiraj deklaraciju',
  'barcode.scanDifferent': 'Skeniraj drugo pakiranje',

  'repeat.footer':
    'Upisuje se s današnjim vremenom. Ako je porcija bila drukčija, samo to reci u dnevniku i ispravit ću.',
  'repeat.search': 'Pretraži svoje obroke',
  'repeat.kcalProtein': (kcal: string, protein: string) => `${kcal} kcal · ${protein} g proteina`,
  'repeat.logAgainNamed': (what: string) => `Upiši ponovno: ${what}`,
  'repeat.adding': 'Dodajem…',

  'editor.needsAnItem': 'Obrok treba barem jednu stavku. Da ga radije izbrišem?',
  'editor.needsAName': 'Što je to bilo? Obrok treba naziv.',
  // "Upiši sam/sama" is gendered; «ručno» says the same thing.
  'editor.logItYourself': 'Upiši ručno',
  'editor.fixWhatsWrong': 'Ispravi što ne valja',
  'editor.whatThisWas': 'Što je ovo bilo',
  'editor.whatWasIt': 'Što je to bilo?',
  'editor.itemName': (index: string) => `Naziv stavke ${index}`,
  'editor.itemPlaceholder': 'Stavka',
  'editor.removeItem': (what: string) => `Ukloni: ${what}`,
  'editor.itemFallback': (index: string) => `stavka ${index}`,
  'editor.itemQuantity': (index: string) => `Količina stavke ${index}`,
  'editor.howMuch': 'koliko',
  'editor.itemCalories': (index: string) => `Kalorije stavke ${index}`,
  'editor.itemProtein': (index: string) => `Proteini stavke ${index}`,
  'editor.itemCarbs': (index: string) => `Ugljikohidrati stavke ${index}`,
  'editor.itemFat': (index: string) => `Masti stavke ${index}`,
  'editor.adjustedHeading': 'Spremljeno. Neke vrijednosti nisu mogle ostati kako su upisane:',
  'editor.adjustedMass': (name: string) => `${name} — proteini, ugljikohidrati i masti bili su teži od same hrane`,
  'editor.adjustedCeiling': (name: string) => `${name} — ta količina hrane ne može imati toliko kalorija`,
  'editor.adjustedFloor': (name: string) => `${name} — makronutrijenti nose više kalorija od toga`,
  'editor.anotherItem': 'još jedna stavka',
  'editor.log': 'Upiši',
  'editor.saveTotal': (verb: string, kcal: string) => `${verb} · ${kcal} kcal`,

  // ---- Cards in the conversation ------------------------------------------
  'chat.removed': 'Uklonjeno',
  'chat.openWeekPlan': 'Otvori plan tjedna',
  'chat.thisWeeksDinners': 'Večere ovog tjedna',
  'chat.nights': (count: number) => n(count, { one: 'večer', few: 'večeri', other: 'večeri' }),
  'chat.nothingPlanned': 'Ništa isplanirano',
  'chat.burnEstimate': 'Potrošnja je procjena',
  'chat.notAddedToBudget': ' · ne dodaje se tvom budžetu',
  'chat.editNamed': (name: string) => `Uredi: ${name}`,
  'chat.notAWeight': 'To nije težina.',
  'chat.editWeighIn': 'Uredi ovo vaganje',
  'chat.notEnoughDays': 'Još nema dovoljno upisanih dana za trend.',
  'chat.lastWeek': 'Prošli tjedan',
  'chat.nothingLogged': 'Ništa upisano',
  'chat.kcalTitle': (kcal: string) => `${kcal} kcal`,
  'chat.nothingLoggedThisWeek': 'Ovaj tjedan ništa nije upisano.',
  // `days` arrives counted ("5 dana"); `onTarget` is a bare figure.
  'chat.weekSummary': (days: string, onTarget: string) =>
    `${days} s upisima, ${onTarget} unutar 10% cilja.`,
  'chat.aDayAgainst': (target: string) => `dnevno, cilj ${target}`,
  'chat.onTheScale': 'na vagi',
  'chat.burnedOver': (sessions: string) => `potrošeno kroz ${sessions}`,
  'chat.proteinADayAgainst': (target: string) => `proteina dnevno, cilj ${target}`,
  'chat.showLess': 'Prikaži manje',
  'chat.readTheRest': (count: string) => `Pročitaj ostatak (još ${count})`,
  'chat.atLoad': (loads: string) => ` s ${loads}`,
  'chat.setsCount': (count: number) => n(count, { one: 'serija', few: 'serije', other: 'serija' }),
  'chat.ofTarget': (target: string) => `od ${target}`,
  'chat.avg': 'prosjek',
  'chat.onDate': (date: string) => `na dan ${date}`,

  // ---- The journal --------------------------------------------------------
  'journal.promptEggs': 'Dva jaja, kriška kruha i kava',
  'journal.promptLunch': 'Piletina s rižom za ručak',
  // "Trčao/trčala sam" is gendered; the distance and the morning are not.
  'journal.promptRun': (distance: string) => `Jutros ${distance} trčanja`,
  'journal.promptProtein': 'Jedem li dovoljno proteina?',
  // "Što si jeo/jela" is gendered; the plate is not.
  'journal.emptyTitle': 'Što je danas bilo na tanjuru?',
  'journal.emptyBody':
    'Utipkaj ili fotografiraj — kako ti je lakše. Bez obrazaca, bez pretraživanja. Reci što je bilo, a ja ću izračunati ostalo.',
  'journal.over': (kcal: string) => `${kcal} preko`,
  'journal.left': (kcal: string) => `još ${kcal}`,
  'journal.burned': (kcal: string) => `−${kcal} potrošeno`,
  'journal.net': (kcal: string) => ` · neto ${kcal} kcal`,
  'journal.loggedMeal': 'Upisani obrok',
  'journal.thinking': 'Razmišljam',
  'journal.lost':
    'Veza se prekinula prije nego što je stigao odgovor. Što god je stiglo, čekat će te ovdje kad se vratiš.',

  'tool.log': 'Upisujem',
  'tool.update': 'Ažuriram',
  'tool.delete': 'Uklanjam',
  'tool.get': 'Provjeravam',
  'tool.search': 'Pretražujem povijest',
  'tool.find': 'Tražim',
  'tool.set': 'Spremam',
  'tool.show': 'Crtam',
  'tool.suggest': 'Smišljam',
  'tool.import': 'Uvozim',
  'tool.adapt': 'Prilagođavam',
  'tool.save': 'Spremam',
  'tool.plan': 'Planiram',
  'tool.cook': 'Kuham',
  'tool.repeat': 'Ponavljam',
  'tool.remember': 'Pamtim',
  'tool.forget': 'Zaboravljam',
  'tool.lookup': 'Provjeravam',
  'tool.run': 'Pokrećem',
  'tool.define': 'Određujem',
  'tool.ask': 'Pitam za',

  // ---- The workout card ---------------------------------------------------
  'workout.strength': 'Utezi',
  'workout.cardio': 'Kardio',
  'workout.class': 'Grupni trening',
  'workout.sport': 'Sport',
  'workout.flexibility': 'Mobilnost',
  'workout.fallbackName': 'Trening',
  'workout.savedRoutine': (name: string) => `Spremljeno kao „${name}“ — sljedeći put jednim dodirom`,
  'workout.routineNotSaved': 'Upisano, ali rutina nije spremljena',
  'workout.updated': (what: string, kcal: string) => `Ažurirano: ${what} — sada ~${kcal} kcal`,
  'workout.logged': (what: string, kcal: string) => `Upisano: ${what} — ~${kcal} kcal`,
  'workout.change': 'Promijeni',
  'workout.yourWorkouts': 'Tvoji treninzi',
  'workout.today': '· danas',
  'workout.howLong': 'Koliko dugo?',
  'workout.addWhatYouDid': 'Dodaj odrađeno',
  'workout.sameAs': (when: string) => `Ponovi · ${when}`,
  'workout.exerciseCount': (count: number) =>
    `(${n(count, { one: 'vježba', few: 'vježbe', other: 'vježbi' })})`,
  'workout.yours': '· tvoj',
  'workout.saveThisAs': (name: string) => `Spremi kao „${name}“`,
  'workout.nameForThis': 'Naziv ovog treninga',
  'workout.dontSave': 'Ne spremaj kao trening',
  'workout.saveChanges': 'Spremi promjene',
  'workout.logSession': 'Upiši ovaj trening',
  'workout.fixWhatsWrong': 'Ispravi što ne valja',
  // "Što si radio/radila?" is gendered.
  'workout.whatDidYouDo': 'Kakav je bio trening?',
  'workout.roughlyIsFine': 'Otprilike je dovoljno.',
  'workout.reps': 'pon.',
  'workout.min': 'min',
  'workout.removeSet': (index: string) => `Ukloni seriju ${index}`,
  'workout.anotherSet': 'Još jedna serija',
  'workout.removeNamed': (name: string) => `Ukloni vježbu ${name}`,

  // ---- The weekly review --------------------------------------------------
  'review.lastWeek': '📅  Prošli tjedan',
  'review.title': '📅  Tjedni pregled',
  'review.pitch':
    'Svakog ponedjeljka ujutro stiže kratak osvrt na tjedan — što su brojke zapravo pokazale i treba li pomaknuti cilj. Bez predavanja, samo slika.',
  'review.writing': 'Pišem…',
  'review.writeOne': 'Napiši ga sada',
  'review.currentTarget': (kcal: string) => `Cilj ${kcal} kcal.`,
  'review.willApply': 'Sljedeći pregled će to primijeniti. ',
  'review.kcalUnit': (kcal: string) => `${kcal} kcal`,
  'review.partOf': (plan: string) => `Dio paketa ${plan}`,

  'quality.title': '🥦\u00a0\u00a0Kvaliteta prehrane',
  'quality.partlyMeasured': 'djelomično izmjereno',
  'quality.notEstimated': 'nije procijenjeno',

  'nutrient.sodium': 'Natrij',
  'nutrient.satFat': 'Zasićene masti',
  'nutrient.sugar': 'Šećer',

  'chart.daily': 'Dnevni grafikon',
  'chart.arrowHint': (label: string) => `${label}. Strelicama čitaj dan po dan.`,
  'chart.touchHint': 'Grafikon. Dodirni i povuci da pročitaš pojedini dan.',

  // ---- What the phone says and the web does not ---------------------------
  'cook.photographFridge': 'fotografiraj hladnjak',
  'cook.kitchenLocked': 'Kuhinja je dio paketa Coach',
  'cook.kitchenLockedBody':
    'Fotografiraj hladnjak, dobij recept složen oko onoga što je unutra i isplaniraj tjedan večera. Zbirka recepata ispod ostaje besplatna — pregledavaj je, kuhaj iz nje, upisuj.',
  'cook.emptyLockedBefore': 'Ovdje još nema ničega. Kartica',
  'cook.emptyLockedAfter': 'iznad puna je recepata koje možeš skuhati i upisati besplatno.',
  'cook.emptyAfterShort': 'i smislit ću recept od onoga što imaš u kuhinji.',
  'cook.workOutCalories': 'Izračunaj kalorije',
  'cook.readingIt': 'Čitam…',

  'scan.photographShelf': 'Fotografiraj policu',
  'scan.looking': 'Gledam…',
  'scan.scanYourFridge': 'Skeniraj hladnjak',
  // "Nisam siguran" would give the app a gender; the guess itself has none.
  'scan.notSure': 'nije sigurno',
  'scan.isThisIt': 'Je li ovo ono što vidim?',
  'scan.addToKitchenShort': 'Dodaj u kuhinju',
  'scan.cooking': 'Kuham…',
  'scan.cookFromThese': 'Kuhaj od ovoga',
  'pantry.stillHaveIt': 'Još imam',
  'pantry.iStillHave': (name: string) => `Još imam: ${name}`,

  'barcode.title': 'Skeniraj barkod',
  'barcode.lookingUp': 'Tražim…',
  'barcode.pointAtBarcode': 'Usmjeri na barkod',
  'barcode.checkingCamera': 'Provjeravam kameru…',
  'barcode.needsCamera': 'Skeneru treba kamera.',
  // "Pojeo/pojela sam" would gender the reader; the participle agrees with nothing.
  'barcode.iAteThis': 'Pojedeno',
  'barcode.howMany': 'Koliko komada?',
  'barcode.howMuch': 'Koliko?',
  'barcode.scanAnother': 'Skeniraj još jedno',
  'barcode.addToMessage': 'Dodaj u poruku',
  'barcode.setTheAmount': 'Postavi količinu',
  'barcode.added': (name: string) => `${name} — dodano`,
  'barcode.addedToMessage': (count: number) =>
    `U poruci: ${n(count, { one: 'pakiranje', few: 'pakiranja', other: 'pakiranja' })}`,
  'barcode.nothingAddedYet': 'Još ništa nije dodano',
  'barcode.nothingUploaded': 'Ništa se ne šalje — kod se čita na telefonu.',
  'barcode.allowCamera': 'Dopusti pristup kameri',
  'barcode.perBasis': (kcal: string, protein: string, basis: string) =>
    `${kcal} kcal · ${protein} g proteina na ${basis}`,
  'barcode.tapToType': 'Dodirni brojku da je upišeš',
  'barcode.totalLine': (protein: string, mass: string) => `kcal · ${protein} g proteina · ${mass}`,
  'barcode.partialTitle': 'Za ovaj proizvod postoje samo djelomični podaci.',
  'barcode.partialHint':
    'Nije dovoljno za upis. Fotografiraj tablicu nutritivnih vrijednosti i dnevnik će je pročitati.',
  'barcode.notCatalogued': 'Taj proizvod nije u bazi.',
  'barcode.notCataloguedHint':
    'Marke trgovačkih lanaca često nisu. Umjesto toga fotografiraj tablicu nutritivnih vrijednosti i dnevnik će je pročitati.',

  'composer.listening': 'Slušam…',
  'composer.stopListening': 'Prestani slušati',
  'composer.sayWhatYouAte': 'Reci što jedeš',
  'composer.addPhotoShort': 'Dodaj fotografiju',

  'workouts.logActionMobile': '+ Upiši trening',
  'workouts.oneFewerSetShort': 'Jedna serija manje',
  'workouts.oneMoreSetShort': 'Jedna serija više',
  'workouts.noneSavedMobile':
    'Još nema spremljenih treninga. Spremljeni trening je popis koji koristiš iznova — upiši trening s vježbama pa prihvati ponudu da ga imenuješ ili ga složi ovdje.',
  'workouts.routineOn': (name: string, day: string) => `${name} — ${day}`,
  'workouts.set': 'postavljeno',
  'workouts.learnedGuess': (name: string) => `${name}?`,
  'workout.classMobile': 'Grupni trening',
  'workout.flexibilityMobile': 'Istezanje',
  'workout.routineNotSavedMobile': 'Upisano, ali trening nije spremljen',
  'workout.nameIt': 'Imenuj ga',
  'workout.logIt': 'Upiši ga',
  // `when` is "jučer", a weekday or a date; "kao" would need a case per shape.
  'workout.sameAsShort': (when: string) => `↻ ponovi · ${when}`,
  'workout.lastTime': (figure: string) => `prošli put ${figure}`,
  'workout.adjust': 'Prilagodi',
  'workout.setsDiffered': 'Serije se razlikuju',
  'workout.sameEverySet': 'Jednako u svakoj seriji',
  'workout.setsLabel': 'serije',
  'workout.searchExercises': 'Traži — naziv ili mišić',
  'workout.doneThese': 'Već odrađeno',
  'workout.browseMuscle': 'Ili pregledaj po mišiću',
  'workout.addNamed': (name: string) => `＋ Dodaj „${name}“`,
  'workout.nothingMatches': 'Ništa ne odgovara',
  'workout.otherLength': 'Drugo',
  'workout.minutesLabel': 'Minute',

  'editor.anotherItemLabel': 'još jedna stavka',

  'plan.cookTab': 'Kuhinja',
  'plan.theWeek': 'Tjedan',
  'plan.locked': 'Planiranje tjedna dio je paketa Coach',
  'plan.planItTitle': '🗓  Isplaniraj',
  'plan.wantsPlaceholderShort': 'Imaš nešto na umu? — „ništa s ribom“',
  // Beside a stepper that goes from 1 upwards: an abbreviation fits every count.
  'plan.peopleUnit': 'os.',
  'plan.minUnit': 'min',
  'plan.batchWhereItHelps': 'Kuhaj unaprijed gdje pomaže',
  'plan.batchCooking': 'Kuhanje unaprijed',
  'plan.planning': 'Planiram…',
  'plan.dinnersTitle': '🍽  Večere',
  'plan.lockedBody':
    'Sedam večera prema tvojim ciljevima i onome što već imaš u kuhinji, s kuhanjem unaprijed gdje pomaže i gotovim popisom za kupnju.',
  'plan.planItFooter':
    'Sedam večera prema tvojim ciljevima i onome što je već u kuhinji. Kuhanje unaprijed znači jedno kuhanje za dvije večeri.',
  'plan.cookingFor': 'Kuha se za',
  'plan.atMost': 'Najviše',
  'plan.batchHint': 'Jedno kuhanje za dvije večeri.',
  'plan.covers': (count: number) => ` · pokriva ${n(count, { one: 'večer', few: 'večeri', other: 'večeri' })}`,
  'plan.cookedNamed': (title: string) => `Skuhano: ${title}`,
  'plan.clearNamed': (day: string) => `Ukloni večeru — ${day}`,
  'shopping.titleShort': '🧾  Kupnja',
  'shopping.addSomethingElse': 'Dodaj još nešto',
  'shopping.alreadyHave': (things: string) => `Izostavljeno jer to već imaš: ${things}.`,
  'shopping.nothingToBuy': 'Još nema ništa za kupiti.',

  'progress.openExerciseTab': 'Otvori karticu Vježbanje',
  'quality.fillThemselvesIn': 'Reci dnevniku što je bilo na tanjuru i ove će se vrijednosti same popuniti.',
  'quality.partialCoverage': (percent: string) =>
    `Ove brojke ima samo ${percent}% današnjih kalorija, pa su zbrojevi donja granica, a ne cijeli dan.`,
  'quality.spentTail': (spent: string, plan: string, allowed: string) =>
    `${spent} — ${plan} uključuje ${allowed} mjesečno.`,
  'quality.estimateNote': (tail: string) =>
    `Ove četiri vrijednosti procjena su modela, pa ih imaju samo obroci koje upiše dnevnik — utipkani, ponovljeni i skenirani ostaju prazni. ${tail}`,

  // ---- The store ----------------------------------------------------------
  // «paket» for the tier, «pretplata» for the subscription, «trgovina» for the store.
  'plans.spent': 'Paket je potrošen',
  'plans.upgrade': 'Nadogradi',
  'plans.seeWhatAdds': (plan: string) => `Pogledaj što donosi ${plan}`,
  'plans.remainingHint': (remaining: string) => `${remaining}. Pogledaj pakete.`,
  'plans.hide': 'Sakrij',
  // "Dobro došao/došla natrag" is gendered.
  'plans.restored': 'Vraćeno. Drago nam je što si opet tu.',
  'plans.restoredShort': 'Vraćeno.',
  'plans.noneFound': 'Na ovom računu trgovine nije pronađena pretplata.',
  'plans.keepItGoing': 'Samo nastavi.',
  'plans.yearly': 'Godišnje',
  'plans.monthly': 'Mjesečno',
  'plans.oneMoment': 'Trenutak…',
  'plans.bestValue': 'Najisplativije',
  'plans.messagesHeading': 'Više poruka',
  'plans.messagesBody':
    'Povrh onoga što ti paket daje svaki mjesec. Plaćaš jednom, nije pretplata — ostaju dok ih ne potrošiš.',
  'plans.messagesCount': (count: number) => n(count, { one: 'poruka', few: 'poruke', other: 'poruka' }),
  'plans.messagesAdded': (count: number) =>
    `Dodano: ${n(count, { one: 'poruka', few: 'poruke', other: 'poruka' })}.`,
  'plans.messagesOnTheWay': 'Plaćeno. Poruke stižu za trenutak.',
  // After «Kupi» the singular is accusative.
  'plans.messagesBuyHint': (count: number, price: string) =>
    `Kupi ${n(count, { one: 'poruku', few: 'poruke', other: 'poruka' })} za ${price}`,
  'plans.scansHeading': 'Više skeniranja fotografija',
  'plans.scansBody': 'Plaćaš jednom, nije pretplata. Ostaju dok ih ne potrošiš.',
  'plans.scansCount': (count: number) =>
    n(count, { one: 'skeniranje fotografije', few: 'skeniranja fotografija', other: 'skeniranja fotografija' }),
  'plans.scansAdded': (count: number) =>
    `Dodano: ${n(count, { one: 'skeniranje', few: 'skeniranja', other: 'skeniranja' })}.`,
  'plans.scansOnTheWay': 'Plaćeno. Skeniranja stižu za trenutak.',
  'plans.scansBuyHint': (count: number, price: string) =>
    `Kupi ${n(count, { one: 'skeniranje fotografije', few: 'skeniranja fotografija', other: 'skeniranja fotografija' })} za ${price}`,
  'plans.checkingStore': 'Provjeravam trgovinu…',
  // "Već si platio/platila?" is gendered.
  'plans.alreadyPaid': 'Već plaćeno? Vrati kupnju',
  'plans.restorePrompt': 'Želim vratiti kupnju',
  'plans.paidNotShowing': 'Plaćeno, a ne vidi se? Vrati kupnju',
  'plans.freeOnEvery': 'Besplatno u svakom paketu',
  'plans.billedYearly': 'Naplaćuje se jednom godišnje',
  'plans.billedMonthly': 'Naplaćuje se mjesečno',
  'plans.everythingInPlus': 'Sve iz paketa Plus',
  'plans.yourPlan': 'Tvoj paket',
  'plans.aYear': 'godišnje',
  'plans.aMonth': 'mjesečno',
  'plans.worksOutAt': (price: string) => `Izlazi ${price} mjesečno.`,
  'plans.onFree': 'Koristiš Free. Sve što utipkaš ostaje besplatno — plaćaju se dijelovi koji razmišljaju.',
  'plans.onPlan': (plan: string) => `Koristiš ${plan}.`,
  'plans.savePercent': (percent: string) => ` · uštedi ${percent}%`,
  'plans.get': (plan: string) => `Uzmi ${plan}`,
  'plans.nothingOnSale':
    'Trgovina za ovu aplikaciju još ništa ne prodaje. Ništa nije zaključano što nije bilo i prije — vrati se poslije i bit će tu.',
  'plans.noStore': 'Ova verzija aplikacije ne može pristupiti trgovini, pa se odavde još ništa ne može kupiti.',
  'plans.restoreNote':
    'Ponovno čita ovaj račun trgovine i vraća sve što je već kupljeno. Ništa se ne naplaćuje ponovno.',
  'plans.manage': 'Upravljaj pretplatom ili je otkaži',
  'plans.smallPrint': (billing: string) =>
    `${billing} putem trgovine, a pretplata se obnavlja dok je ne otkažeš. Otkaži bilo kad u računu trgovine — plaćeno ostaje tvoje do kraja razdoblja.`,
  'plans.pendingLong':
    'Trgovina je primila uplatu, a paket je još na putu. Otključat će se sam — ništa ne treba ponovno plaćati.',
  'plans.pendingShort': 'Trgovina je primila uplatu. Paket se otključava za trenutak.',
  'plans.whatThatOpens': 'Što to otključava',
  'plans.startLogging': 'Počni upisivati',
  'plans.backToJournal': 'Natrag u dnevnik',
  'plans.youreOnPlan': (plan: string) => `Koristiš ${plan}.`,
  'plans.paymentReceived': 'Uplata je primljena.',
  'plans.manageOnStore': 'Upravljaj ili otkaži bilo kad u Pretplatama u trgovini.',
  'plans.youreOn': 'Koristiš',
  'plans.photoScans': 'Skeniranja fotografija',
  'plans.unlimited': 'Neograničeno',
  'plans.seeWhatIncludes': 'Pogledaj što tvoj paket uključuje',
  'plans.seeThePlans': 'Pogledaj pakete',
  'plans.restorePurchase': 'Vrati kupnju',
  'plans.planTitle': 'Paket',
  'plans.leftThisMonth': (left: string) => `preostalo ${left} ovaj mjesec`,
  'plans.plusBought': (bought: string) => ` · ${bought} kupljeno`,
  'plans.leftEver': (left: string) => `preostalo ${left}`,
  'setup.tellingYouThings': 'Što ti javljamo',
  'setup.emailFooterWithReview':
    'Tjedni pregled stiže ponedjeljkom ujutro. E-poruke o računu — promjena lozinke, prijava s nepoznatog uređaja — šalju se uvijek.',
  'setup.emailFooter':
    'E-poruke o računu — promjena lozinke, prijava s nepoznatog uređaja — šalju se uvijek.',
  'setup.confirmFirst': (email: string) =>
    `Dok ne potvrdiš ${email}, zaboravljenu lozinku nije moguće poništiti — ne bi bilo načina provjeriti da je sandučić tvoj.`,
  'setup.sendLinkAgain': 'Ponovno pošalji poveznicu',
  'setup.weeklyReview': 'Tjedni pregled',
  'setup.weeklyReviewHint': 'Sažetak prošlog tjedna, ponedjeljkom.',
  'setup.sendMeReview': 'Šalji mi tjedni pregled',
  'setup.nudges': 'Poticaji',
  'setup.nudgesHintMobile':
    'Najviše jedan tjedno, kad u dnevniku ima nešto vrijedno spomena. Uvijek se pojave u dnevniku; ovo ih šalje i na telefon — ili e-poštom, ako su obavijesti isključene.',
  'setup.sendMeNudges': 'Šalji mi poticaje',
  'setup.streaksAndGoals': 'Nizovi i ciljevi',
  'setup.streaksHint':
    'Niz dana s upisima vrijedan pažnje i dan kad vaga pokaže tvoju ciljnu težinu. Namjerno rijetko i nikad e-poštom — ovo stiže na telefon ili nikamo.',
  'setup.tellMeStreaks': 'Javljaj mi o nizovima i ciljevima',
  'setup.eveningRecap': 'Večernji sažetak',
  'setup.eveningRecapHint':
    'Današnje kalorije i proteini u odnosu na današnje ciljeve, u devet navečer. Svaki dan s barem jednim upisom — jedina obavijest ovdje koja nije povremena.',
  'setup.sendMeRecap': 'Šalji mi večernji sažetak',
  'setup.remindersTitle': 'Podsjetnici na ovom telefonu',
  'setup.remindersFooter':
    'Postavljeni ovdje, ostaju ovdje. Ne trebaju račun ni vezu, stižu bez obzira na paket i ne prelaze s tobom na novi telefon.',
  'setup.logYourDay': 'Upiši svoj dan',
  'setup.logYourDayHint':
    'Poticaj s tvog telefona, u vrijeme koje odabereš. Ne zna ništa o tvojim upisima — to je budilica, a ne mišljenje.',
  'setup.remindMeToLog': 'Podsjeti me na upis',
  'setup.at': 'U',
  'setup.reminderTime': 'Vrijeme podsjetnika',
  'setup.weighIn': 'Vaganje',
  'setup.weighInHint':
    'Jednom tjedno, prije doručka. Svakodnevno vaganje više mjeri jučerašnju sol nego tebe, pa se zato ne nudi svaki dan.',
  'setup.remindMeToWeigh': 'Podsjeti me na vaganje',
  'setup.on': 'Dan',
  'setup.weighInDay': 'Dan vaganja',
  'setup.weighInTime': 'Vrijeme vaganja',
  'setup.deleting': 'Brisanje…',
  'setup.deleteEverything': 'Izbriši sve',
  'setup.deleteWarningBefore': 'Ovo briše svaki obrok, fotografiju, težinu i razgovor na računu',
  'setup.deleteWarningAfter':
    ', na svim uređajima, i ne može se poništiti. Za potvrdu upiši lozinku.',

  // ---- The words the app uses about money ---------------------------------
  //
  // `few` is the form after 2–4, and for these nouns it is also the genitive
  // singular — which is what `wall.notOnPlan` needs after «nema».
  'meter.chat': (count: number) => w(count, { one: 'poruka', few: 'poruke', other: 'poruka' }),
  'meter.photo': (count: number) =>
    w(count, { one: 'skeniranje fotografije', few: 'skeniranja fotografija', other: 'skeniranja fotografija' }),
  'meter.pantryScan': (count: number) =>
    w(count, { one: 'skeniranje hladnjaka', few: 'skeniranja hladnjaka', other: 'skeniranja hladnjaka' }),
  'meter.recipe': (count: number) => w(count, { one: 'recept', few: 'recepta', other: 'recepata' }),
  'meter.mealPlan': (count: number) =>
    w(count, { one: 'plan obroka', few: 'plana obroka', other: 'planova obroka' }),

  'tier.pitchFree': 'Potpun dnevnik prehrane, radi bez mreže i bez ograničenja.',
  'tier.pitchPlus': 'Dnevnik svaki dan i tjedni osvrt na njega.',
  'tier.pitchCoach': 'I kuhinja: kuhaj iz hladnjaka, planiraj tjedan.',

  // Gets the capitalised `few` form ("Recepta"); a nominative plural subject
  // would need "Recepti", so the sentence is built on «nema» + genitive and
  // lowercases the word it is handed.
  'wall.notOnPlan': (plural: string) => `U tvom paketu nema ${String(plural).toLocaleLowerCase('hr')}`,
  // No adjective beside `noun`: "besplatne/besplatnih" would have to agree with
  // a noun whose gender this sentence does not know. After a colon the counted
  // phrase stands on its own.
  'wall.freeGrant': (count: number, noun: string) => `Besplatni dio je potrošen: ${count} ${noun}`,
  'wall.monthlyGrant': (count: number, noun: string) => `Potrošeno je sve za ovaj mjesec: ${count} ${noun}`,
  'wall.comeBack': (when: string) => ` Ponovno ih imaš ${when}.`,
  'wall.bodyChat': 'Ručno upisivanje obroka neograničeno je i uvijek besplatno — pokazat ću ti gdje.',
  'wall.bodyPhoto':
    'Obrok i dalje možeš utipkati, ponoviti neki raniji ili skenirati njegov barkod. Ništa od toga ne troši paket.',
  'wall.bodyPantryScan': 'Popis u kuhinji i dalje radi — namirnice možeš dodavati ručno.',
  'wall.bodyRecipe':
    'Sve već skuhano i dalje je spremljeno, a zbirku recepata možeš besplatno pregledavati.',
  'wall.bodyMealPlan':
    'Zadnji isplanirani tjedan i dalje je tu, a još uvijek možeš kuhati iz spremljenog recepta.',
  'wall.remaining': (count: number, noun: string) => `Još ${count} ${noun}`,
  // "Upisat ću sam/sama" is gendered; «ručno» is not.
  'wall.logMyself': 'Ovo ću upisati ručno',
  'wall.loggedByHand': 'Upisano ručno — taj je put uvijek otvoren i nikad ništa ne troši.',

  'tier.reviewAndNudge': 'Tjedni pregled i poticaj kad zastaneš',
  'tier.review': 'Tjedni pregled prehrane',
  'tier.nudge': 'Poticaj kad zastaneš',
  'tier.countNoun': (count: number, noun: string) => `${count} ${noun}`,
  'tier.toTry': (list: string) => `${list} za isprobavanje`,
  'tier.aMonth': (list: string) => `${list} mjesečno`,
  'tier.everythingIn': (plan: string) => `Sve iz paketa ${plan}`,

  'free.typing': 'Upisivanje obroka i njihovo ispravljanje',
  'free.repeat': 'Ponavljanje obroka i skeniranje barkoda',
  'free.history': 'Cijela povijest, prsten i niz dana',
  'free.offline': 'Upisivanje čak i bez signala',

  // Built round a colon for the same reason as `wall.freeGrant`; no verb has
  // to agree with the count, so English's is/are has nothing to map to.
  'spent.everGrant': (count: number, noun: string) => `Iskorišteno je sve besplatno: ${count} ${noun}`,
  'spent.monthly': (count: number, noun: string) =>
    `Iskorišteno je sve za ovaj mjesec: ${count} ${noun}`,

  // ---- Words the whole app uses -------------------------------------------
  // ---- Streaks and achievements. See STREAKS.md. ----
  'streak.logging': 'Niz upisa',
  'streak.training': 'Tjedni s treningom',
  'streak.days': (count: number) => n(count, { one: 'dan', few: 'dana', other: 'dana' }),
  'streak.weeks': (count: number) => n(count, { one: 'tjedan', few: 'tjedna', other: 'tjedana' }),
  'streak.best': (count: number) => `rekord ${count}`,
  'streak.atRisk': 'Upiši nešto danas da ga zadržiš',
  'streak.weekProgress': (done: number, needed: number) => `${done} od ${needed} dana ovaj tjedan`,
  'streak.weekMet': 'Ovaj se tjedan računa',
  'streak.weekBar': (needed: number) =>
    `${n(needed, { one: 'dan', few: 'dana', other: 'dana' })} tjedno i niz traje`,
  'streak.startTraining': 'Treniraj tri dana ovaj tjedan i počni niz',
  'achievements.title': 'Postignuća',
  'achievements.count': (done: number, total: number) => `${done} od ${total}`,
  'achievements.earnedOn': (date: string) => `Osvojeno ${date}`,
  'achievements.group.streaks': 'Nizovi',
  'achievements.group.training': 'Trening',
  'achievements.group.firsts': 'Prvi koraci',
  'achievements.group.totals': 'Ukupno',
  'badge.streak_7': 'Sedam zaredom',
  'badgeHow.streak_7': 'Upiši nešto sedam dana zaredom.',
  'badge.streak_30': 'Trideset zaredom',
  'badgeHow.streak_30': 'Upiši nešto trideset dana zaredom.',
  'badge.streak_100': 'Sto zaredom',
  'badgeHow.streak_100': 'Upiši nešto sto dana zaredom.',
  'badge.streak_365': 'Godina bez prekida',
  'badgeHow.streak_365': 'Upisuj svaki dan, cijelu godinu.',
  'badge.exercise_weeks_4': 'Četiri tjedna treninga',
  'badgeHow.exercise_weeks_4': 'Tri treninga tjedno, četiri tjedna zaredom.',
  'badge.exercise_weeks_12': 'Dvanaest tjedana treninga',
  'badgeHow.exercise_weeks_12': 'Tri treninga tjedno, dvanaest tjedana zaredom.',
  'badge.exercise_weeks_52': 'Godina treninga',
  'badgeHow.exercise_weeks_52': 'Tri treninga tjedno, cijelu godinu.',
  'badge.first_photo': 'Prva fotografija',
  'badgeHow.first_photo': 'Upiši obrok s fotografije.',
  'badge.first_barcode': 'Prvo skeniranje',
  'badgeHow.first_barcode': 'Skeniraj barkod.',
  'badge.first_workout': 'Prvi trening',
  'badgeHow.first_workout': 'Upiši trening.',
  'badge.first_weigh_in': 'Prvo vaganje',
  'badgeHow.first_weigh_in': 'Upiši svoju težinu.',
  'badge.days_100': 'Sto dana',
  'badgeHow.days_100': 'Sto dana s upisima, ne nužno zaredom.',
  'badge.days_365': 'Godina upisa',
  'badgeHow.days_365': 'Tristo šezdeset pet dana s upisima, ne nužno zaredom.',
  'badge.workouts_100': 'Sto treninga',
  'badgeHow.workouts_100': 'Sto dana s treningom.',

  'widget.today': (label: string) => `${label} danas`,
  'widget.of': (consumed: string, target: string) => `${consumed} od ${target} kcal`,
  'widget.tapToStart': 'Dodirni i započni dan',
  'widget.steps': (count: number) => n(count, { one: 'korak', few: 'koraka', other: 'koraka' }),
  'widget.stepsWord': 'koraka',
  'widget.usual': (average: string) => `od uobičajenih ${average}`,
  'toast.logged': (description: string, kcal: string) => `Upisano: ${description} — ${kcal} kcal`,
  'toast.removed': (description: string) => `Uklonjeno: ${description}`,
  'toast.tapToDismiss': (text: string) => `${text}. Dodirni za zatvaranje.`,
  'a11y.edit': (name: string) => `Uredi: ${name}`,
  'a11y.delete': (name: string) => `Izbriši: ${name}`,
  'a11y.remove': (name: string) => `Ukloni: ${name}`,

  'common.save': 'Spremi',
  'common.cancel': 'Odustani',
  'common.delete': 'Izbriši',
  'common.repeat': 'Ponovi',
  'common.undo': 'Poništi',
  'common.done': 'Gotovo',
  'common.add': 'Dodaj',
  'common.edit': 'Uredi',
  'common.close': 'Zatvori',
  'common.retry': 'Pokušaj ponovno',
  'common.offline': 'Nema mreže. Ovo će opet raditi kad se signal vrati.',
  'common.unexpected': 'Nešto je pošlo po zlu. Pokušaj ponovno.',
  'common.loading': 'Učitavanje…',
  'common.today': 'Danas',
  'common.yesterday': 'Jučer',

  /* The gym card, second pass. See GYM-CARD.md. */
  'common.saving': 'Spremanje…',
  'workout.addExercises': '＋ Dodaj vježbe',
  'workout.pickExercises': 'Dodaj vježbe',
  'workout.anyExercise': 'bilo koja vježba — samo upiši mišić',
  'workout.orNameIt': 'Ili upiši naziv',
  'workout.pointAtIt': 'Ili pokaži trenirane mišiće',
  'workout.front': 'Sprijeda',
  'workout.back': 'Straga',
  'workout.backToBody': (muscle: string) => `‹ ${muscle}`,
  'workout.addCount': (count: string) => `Dodaj ${count}`,
  'workout.aboutLength': (min: string) => `≈ ${min} min`,
  'workout.exactLength': (min: string) => `${min} min`,
  'workout.tapToFix': 'procjena · dodirni za ispravak',
  'workout.whatKind': 'Kakav trening?',
  'workout.lessNamed': (caption: string) => `Manje: ${caption}`,
  'workout.moreNamed': (caption: string) => `Više: ${caption}`,
};
