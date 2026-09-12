import type { LandingCopy } from './types';

/**
 * The landing page, in Hungarian. Informal «te», like the Play listing and the
 * app's own catalogue; in the copy the English em dash is the spaced en dash
 * Hungarian typography uses (the title keeps the brand's "Day So Far —"). Four-digit numbers go ungrouped ("2100"), the way
 * `Intl.NumberFormat('hu')` and the app print them. Dollar prices put the sign
 * after the amount, and where a sentence needs a case ending on one it takes
 * the catalogue's "… € áron" instead.
 */
export const hu: LandingCopy = {
  meta: {
    title: 'Day So Far — a kalóriaszámláló, amellyel csak beszélgetsz',
    description:
      'Mondd el a saját szavaiddal, mit ettél. Kalória, fehérje, szénhidrát és zsír magától összeadódik – nincs adatbázis, nincs negyven találat a „csirkemell” szóra.',
  },

  nav: {
    how: 'Így működik',
    features: 'Funkciók',
    pricing: 'Árak',
    faq: 'GYIK',
    coaches: 'Edzőknek',
    language: 'Nyelv',
  },

  switcher: {
    suggest: 'Olvasd el az oldalt magyarul',
    dismiss: 'Nem, köszönöm',
  },

  cta: {
    get: 'App letöltése',
    iphone: 'Hamarosan iPhone-ra',
    seeHow: 'Hogyan működik?',
    storeSoon: 'hamarosan',
  },

  hero: {
    title: 'Csak mondd el, mit ettél.',
    lede: 'A kalóriaszámláló, amellyel csak beszélgetsz. Írd be vagy mondd el a saját szavaiddal, esetleg fotózd le – a kalória, a fehérje, a szénhidrát és a zsír magától összeadódik.',
    trust: 'Ingyen elkezdheted · Nincs reklám · Nincs követőkód',
  },

  demo: {
    logged: 'Csirkesaláta avokádóval és egy tejeskávé',
    loggedReply:
      'Rögzítve ebédként: egy tenyérnyi csirkemell, fél avokádó és egy kis tejeskávé.',
    summary: 'Ebéd rögzítve',
    description: 'Csirkesaláta és tejeskávé',
    chicken: 'Csirkemell',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avokádó',
    avocadoQuantity: 'fél',
    coffee: 'Tejeskávé',
    coffeeQuantity: 'kicsi',
    correction: 'inkább dupla csirke volt',
    correctionReply: 'Kész – ugyanaz a bejegyzés, most 200 g csirkével, és a napod is ehhez igazodott.',
    placeholder: 'Két tojás és egy pirítós…',
    caption:
      'Beszélgetés a naplóval. A reggeli és egy nasi már szerepel a napon; a „csirkesaláta avokádóval és egy tejeskávé” ebédként kerül be, nagyjából 550 kalóriával – aztán dupla csirkére javítjuk, és ugyanaz a bejegyzés helyben 715-re frissül, vele együtt pedig a kör, a makrók, valamint a rost, a nátrium, a telített zsír és a cukor sávja is.',
  },

  ways: {
    title: 'Négyféleképpen rögzíthetsz. Egyik sem űrlap.',
    items: [
      {
        title: 'Írd be vagy mondd ki',
        body: '„Két tojás, pirítós és egy kis sajt.” Írd be, vagy mondd ki hangosan. Ennyi az egész.',
      },
      {
        title: 'Fotózd le',
        body: 'Tányért, étlapot, a csomagolás címkéjét. A becslést becslésként jelölve kapod vissza.',
      },
      {
        title: 'Olvasd be a vonalkódot',
        body: 'Megjönnek a címke adatai, te pedig megmondod, mennyit ettél. Még senki nem olvasta be? Fotózd le inkább a címkét.',
      },
      {
        title: 'Kérd a szokásosat',
        body: '„A szokásos reggelim” – és az kerül be, amit legutóbb valóban ettél. A saját előzményeid, nem egy idegen adatbázisa.',
      },
    ],
  },

  corrections: {
    title: 'Meggondoltad magad? A bejegyzés is módosul.',
    body: '„Igazából három tojás volt.” A már rögzített étkezés helyben javul – nem kerül be kétszer, és nem neked kell kézzel kijavítanod. Minden tételt külön kezel, így a tojás javítása a pirítóshoz hozzá sem nyúl.',
    cardLabel: 'Reggeli · egy bejegyzés',
    eggs: 'Tojás',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Pirítós',
    toastQuantity: '2 szelet',
    cheese: 'Trappista',
    cheeseQuantity: '30 g',
    total: 'Összesen',
  },

  homeCooking: {
    title: 'Olyan ételekhez, amelyeken nincs vonalkód.',
    body: 'A legtöbb kalóriaszámlálóban adatbázisban kell keresgélned, az adatbázis pedig sosem hallott arról, ahogy nálatok otthon főznek. Itt úgy írod le, ahogy egy barátodnak mesélnéd, tizenhárom nyelv bármelyikén, a többit pedig kiszámolja.',
    examples: [
      'Paprikás krumpli kolbásszal, egy tányér',
      'Maradék pörkölt nokedlivel, egy adag',
      'Tökfőzelék két fasírttal',
      'Két szelet házi almás pite',
    ],
  },

  quality: {
    title: 'Ugyanannyi kalória, mégis két egészen más nap.',
    body: '2100 kalória lencséből nem ugyanaz, mint 2100 kalória chipsből és milkshake-ből. Ezért minden étkezéshez rost, nátrium, telített zsír és cukor is tartozik – ugyanabból a mondatból kiolvasva, anélkül hogy bármit külön be kellene írnod.',
    note: 'Rostból a minimumot érdemes elérni, a másik háromból a maximum alatt maradni.',
  },

  target: {
    badge: 'Plus',
    title: 'Cél, amely megtanulja, mennyit égetsz valójában.',
    body: 'Egy kalkulátor a magasságodból és a testsúlyodból tippel. Pár hét rögzítés és mérés után van ennél jobb kiindulópont: hogy *te* mennyit égetsz. A célod minden hétfőn a tényekhez igazodik, egy rövid értékelés pedig elmondja, miért.',
    reviewDates: 'augusztus 11–17.',
    reviewIntake:
      'Átlagosan 2180 kalóriát ettél a 2290 kalóriás célod mellett, és hétből hat napon 150 g fölött maradt a fehérje. A testsúlyod két hét alatt 0,4 kg-ot csökkent.',
    reviewChange:
      'A célod mától emelkedik: a kívánt ütemben fogytál, miközben kevesebbet ettél, mint amennyit megengedett – vagyis a régi szám túl alacsony volt.',
    reviewBasis: '14 rögzített nap és 6 mérés alapján. Legfeljebb +200.',
    guardrailsTitle: 'Mielőtt bármit módosítana',
    guardrails: [
      'Előbb legalább 10 rögzített nap és 4 mérés kell.',
      'Egyszerre legfeljebb 200 kalóriát módosít, hiányos rögzítésnél kevesebbet.',
      'Ha a becslés messze esik attól, amit a képlet jósol, elveti – nem hisz neki.',
      'Ha magad állítottad be a célt, ahhoz sosem nyúl.',
    ],
    more: 'A számítás részletei',
  },

  features: {
    title: 'És minden más, amit egy naplónak tudnia kell.',
    items: [
      {
        title: 'Térerő nélkül is működik',
        body: 'Írd be az étkezést a repülőn vagy az alagsori konditeremben. Azonnal beleszámít a napodba, és szinkronizál, amint újra van térerő.',
      },
      {
        title: 'Kezdőképernyős widgetek',
        body: 'A maradék kalória és a mai lépések, az app megnyitása nélkül.',
      },
      {
        title: 'Lépések',
        body: 'Androidon a Health Connectből, iPhone-on a telefon saját lépésszámlálójából.',
      },
      {
        title: 'Edzések',
        body: 'Sorozatok és ismétlések a legutóbbi alkalomból kitöltve, 220 gyakorlattal és a saját edzésterveiddel.',
      },
      {
        title: 'Receptek',
        body: 'Nagyjából száz, aszerint rendezve, mi van a konyhádban, és mennyi maradt a napodból.',
      },
      {
        title: 'Szériák és eredmények',
        body: 'Tizennégy megszerezhető eredmény, minden csomagban, a Free-ben is.',
      },
      {
        title: 'A nap lefekvéskor ér véget',
        body: 'A hajnali egykor bekapott nasi ahhoz az estéhez számít, ahová tartozik. Tedd a napváltást oda, ahol a te napod valóban véget ér.',
      },
      {
        title: 'A mozgás látszik, de nem ehető vissza',
        body: 'A futás megjelenik a napodban és a trendjeidben. A kalóriakeretedet viszont nem növeli meg csendben.',
      },
      {
        title: 'Tizenhárom nyelv',
        body: 'Az egész alkalmazás, a bolgártól a görögig. Írd le az étkezéseidet azon a nyelven, amelyen gondolkodsz.',
      },
    ],
  },

  pricing: {
    title: 'A napló ingyenes. A gondolkodás kerül egy kicsit.',
    body: 'Az étkezés beírása és a nap összesítése a telefonodon történik, ezért mindig ingyenes marad. Egy mondat vagy egy fotó megértéséhez viszont AI-modell kell, és ez az a rész, aminek ára van.',
    period: 'Számlázási időszak',
    monthly: 'Havi',
    yearly: 'Éves',
    saving: '−12%',
    recommended: 'Ajánlott',
    plans: [
      {
        name: 'Free',
        monthly: 'Ingyenes',
        annual: 'Ingyenes',
        monthlyCadence: 'ameddig csak szeretnéd',
        annualCadence: 'ameddig csak szeretnéd',
        pitch: 'A teljes napló, akár a repülőn is.',
        allowance: [
          { figure: '10', unit: 'üzenet', period: 'havonta' },
          { figure: '1', unit: 'fotóelemzés', period: 'kipróbálásra' },
        ],
        points: [
          'Étkezések beírása, ismétlése és vonalkód-beolvasás – korlátlanul',
          'A napod, az előzményeid, a testsúlyod és a trendjeid',
          'Widgetek, edzések, receptek, szériák és eredmények',
        ],
        cta: 'Kezdd ingyen',
      },
      {
        name: 'Plus',
        monthly: '9,99 €',
        annual: '104,99 €',
        monthlyCadence: 'havonta, bármikor lemondható',
        annualCadence: 'évente – ez havi 8,75 €',
        pitch: 'Beszélj hozzá gépelés helyett.',
        allowance: [
          { figure: '90', unit: 'üzenet', period: 'havonta' },
          { figure: '8', unit: 'fotóelemzés', period: 'havonta' },
        ],
        points: [
          'Minden Free-funkció',
          'Heti értékelés arról, hogyan ment valójában a heted',
          'A tényekhez igazodó cél',
          'Még több üzenet és fotóelemzés egyszeri vásárlással, amikor csak kell',
        ],
        cta: 'Plus előfizetés',
      },
      {
        name: 'Coach',
        monthly: '25,99 €',
        annual: '254,99 €',
        monthlyCadence: 'havonta, bármikor lemondható',
        annualCadence: 'évente – ez havi 21,25 €',
        pitch: 'És abban is segít, mi legyen vacsorára.',
        allowance: [
          { figure: '180', unit: 'üzenet', period: 'havonta' },
          { figure: '25', unit: 'fotóelemzés', period: 'havonta' },
        ],
        points: [
          'Minden Plus-funkció',
          'Havi 10 hűtőfotó, receptekké alakítva',
          'Havi 8 recept abból, ami a konyhádban van',
          'Havi 2 heti vacsoraterv, bevásárlólistával',
        ],
        cta: 'Coach előfizetés',
      },
    ],
    notes: [
      'Minden fiók a Free csomaggal indul. Nincs próbaidőszak, amit időben le kellene mondani.',
      'A keret egy gördülő 30 napos időszakban, naponként töltődik vissza, így nincs fordulónap, amire várnod kellene.',
      'Elfogytak a fotóelemzéseid? Tíz darab már 4,09 € áron megvehető, sosem jár le, és csak a havi keret után kezd fogyni.',
      'Ha nem fizetsz tovább, visszakerülsz a Free csomagra: a naplód és az előzményeid megmaradnak, havi 10 üzenettel.',
    ],
    currency: 'Az árak euróban értendők. Az országodra érvényes pontos árat a Google Play mutatja.',
  },

  faq: {
    title: 'Kérdések és válaszok.',
    items: [
      {
        q: 'Le kell mérnem az ételt?',
        a: 'Nem. Úgy írd le az adagot, ahogy mondanád – „egy nagy tál”, „két szelet”. A becsléseket becslésként jelöli, a lemért mennyiség pedig többet számít, amikor a célod igazodik.',
      },
      {
        q: 'Mennyire pontos?',
        a: 'Nagyjából annyira, mint egy gondos becslés, és szól, ha csak tippel. Hogy hogyan teszteljük, és hol téved, azt részletesen leírtuk.',
      },
      {
        q: 'Van iPhone-ra is?',
        a: 'Androidon már elérhető. Az iPhone-os app az App Store-nál jóváhagyásra vár, és a megjelenés napján itt, ezen az oldalon lesz a linkje.',
      },
      {
        q: 'Működik internet nélkül?',
        a: 'Az étkezés beírása, egy korábbi megismétlése és a napod áttekintése offline is működik, és szinkronizál, amint újra van kapcsolat. A mondatokhoz, a fotókhoz és a vonalkódok kereséséhez internet kell.',
      },
      {
        q: 'Milyen nyelveken beszél?',
        a: 'Angolul, bolgárul, németül, spanyolul, franciául, románul, ukránul, szerbül, horvátul, csehül, magyarul, görögül és szlovákul. A telefonod beállítását követi, és bármikor átállíthatod.',
      },
      {
        q: 'Mi történik, ha elfogynak az üzeneteim?',
        a: 'A napló tovább működik: továbbra is beírhatod az étkezéseket, megismételheted őket, és beolvashatod a vonalkódokat. Az üzenetek naponta töltődnek vissza, vagy válthatsz nagyobb csomagra.',
      },
      {
        q: 'Hogyan mondhatom le?',
        a: 'A Google Playben, az Előfizetések menüben, bármikor. Amiért fizettél, az az időszak végéig megmarad, utána visszakerülsz a Free csomagra.',
      },
      {
        q: 'Eladjátok az adataimat?',
        a: 'Nem. Nincs reklám, nincs analitika, nincs követőkód, és semmit nem adunk tovább. Hogy mit rögzítünk, kihez jut el és meddig őrizzük, az mind benne van az adatvédelmi irányelvekben.',
      },
      {
        q: 'Táplálkozási edző vagyok. Nekem is van valami?',
        a: 'Igen: egy webes edzői felület, ahol követheted az ügyfeleid napjait, beállíthatod a céljaikat és megjegyzést írhatsz nekik, 30 napos ingyenes próbaidővel. Ez független a fenti Coach csomagtól.',
      },
    ],
    accuracyLink: 'Olvass a pontosságról',
    privacyLink: 'Olvasd el az adatvédelmi irányelveket',
    coachLink: 'Nyisd meg az edzői felületet',
  },

  privacy: {
    title: 'Az étkezéseid a tieid maradnak.',
    body: 'Nincs analitika, nincs reklám, nincs mit eladni. Az étkezéseid sorok egy adatbázisban, amely egyetlen kérdés miatt létezik: mit ettél ma?',
    link: 'Olvasd el az adatvédelmi irányelveket',
  },

  closing: {
    title: 'Kezdd a reggelivel.',
    body: 'A beállítás egy-két perc: mit szeretnél elérni, milyen magas vagy, mennyi a testsúlyod és mennyit mozogsz. Ebből kiszámoljuk a napi célodat.',
  },

  footer: {
    howItWorks: 'Így működik',
    accuracy: 'Pontosság',
    blog: 'Blog',
    recipes: 'Receptek',
    about: 'Rólunk',
    privacy: 'Adatvédelem',
    terms: 'Feltételek',
    languages: 'Ez az oldal más nyelveken',
  },
};
