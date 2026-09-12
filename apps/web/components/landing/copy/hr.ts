import type { LandingCopy } from './types';

/**
 * The landing page, in Croatian. Standard Croatian, ijekavian, „…“ quotes, and
 * the informal «ti» of the app and the Play listing. The reader is never
 * gendered: no «jeo si», «sam», «aktivan» — the present, the imperative or an
 * impersonal construction instead.
 *
 * Numbers as `hr-HR` writes them: 2.180, 0,4 kg, 9,99 €, −17 %. The tier is a
 * «paket», as in the app, so the extra messages and scans you buy are
 * «dokupiti» rather than a second kind of «paket».
 */
export const hr: LandingCopy = {
  meta: {
    title: 'Day So Far — brojač kalorija s kojim samo razgovaraš',
    description:
      'Reci što je bilo za jelo, svojim riječima. Kalorije, proteini, ugljikohidrati i masti zbroje se sami — bez pretraživanja baze i četrdeset rezultata za „kruh“.',
  },

  nav: {
    how: 'Kako radi',
    features: 'Mogućnosti',
    pricing: 'Cijene',
    faq: 'Česta pitanja',
    coaches: 'Za trenere',
    language: 'Jezik',
  },

  switcher: {
    suggest: 'Pročitaj ovu stranicu na hrvatskom',
    dismiss: 'Ne, hvala',
  },

  cta: {
    get: 'Preuzmi aplikaciju',
    iphone: 'Uskoro za iPhone',
    seeHow: 'Pogledaj kako radi',
    storeSoon: 'uskoro',
  },

  hero: {
    title: 'Samo reci što je bilo za jelo.',
    lede: 'Brojač kalorija s kojim razgovaraš. Utipkaj, izgovori ili fotografiraj, svojim riječima — kalorije, proteini, ugljikohidrati i masti zbroje se sami.',
    trust: 'Besplatno za početak · Bez oglasa · Bez praćenja',
  },

  demo: {
    logged: 'Pileća salata s avokadom i kava s mlijekom',
    loggedReply:
      'Upisano kao ručak — piletina veličine dlana, pola avokada i mala kava s mlijekom.',
    summary: 'Upisan ručak',
    description: 'Pileća salata i kava s mlijekom',
    chicken: 'Pileća prsa',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avokado',
    avocadoQuantity: 'pola',
    coffee: 'Kava s mlijekom',
    coffeeQuantity: 'mala',
    correction: 'ipak duplo piletine',
    correctionReply: 'Ispravljeno — isti upis, sada 200 g piletine, a s njim se pomaknuo i cijeli dan.',
    placeholder: 'Dva jaja i kriška kruha…',
    caption:
      'Razgovor s dnevnikom. Doručak i međuobrok već su upisani; „pileća salata s avokadom i kava s mlijekom“ upisuje se kao ručak od oko 550 kalorija — zatim se ispravlja na duplo piletine, a isti se upis na mjestu mijenja na 715, dok se s njim pomiču prsten, makronutrijenti te trake za vlakna, natrij, zasićene masti i šećer.',
  },

  ways: {
    title: 'Četiri načina za upis obroka. Nijedan nije obrazac.',
    items: [
      {
        title: 'Utipkaj ili izgovori',
        body: '„Dva jaja, kriška kruha i malo sira.“ Napiši to ili reci naglas. I to je sve.',
      },
      {
        title: 'Fotografiraj',
        body: 'Tanjur, jelovnik, deklaracija na pakiranju. Procjena stiže jasno označena kao procjena.',
      },
      {
        title: 'Skeniraj barkod',
        body: 'Dobiješ deklaraciju i kažeš koliko je pojedeno. Pakiranje još nitko nije skenirao? Fotografiraj deklaraciju.',
      },
      {
        title: 'Zatraži ono uobičajeno',
        body: '„Moj uobičajeni doručak“ ponovi ono što je zadnji put stvarno bilo na tanjuru. Tvoja povijest, a ne tuđa baza.',
      },
    ],
  },

  corrections: {
    title: 'Predomisli se. Upis se mijenja s tobom.',
    body: '„Ipak su bila tri jaja.“ Već upisani obrok ispravlja se na mjestu — ne upisuje se dvaput i ne čeka da ga ručno popraviš. Svaka se stavka vodi zasebno, pa ispravak jaja ne dira kruh.',
    cardLabel: 'Doručak · jedan upis',
    eggs: 'Jaja',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Kruh',
    toastQuantity: '2 kriške',
    cheese: 'Gauda',
    cheeseQuantity: '30 g',
    total: 'Ukupno',
  },

  homeCooking: {
    title: 'Za hranu koja nema barkod.',
    body: 'Većina brojača kalorija tjera te da pretražuješ bazu, a ta baza nikad nije čula za ono što se kuha u tvojoj obitelji. Ovdje jelo opišeš kao prijatelju, na bilo kojem od trinaest jezika, a ostatak se izračuna sam.',
    examples: [
      'Dvije sarme, ostale od nedjelje',
      'Zdjela graha s kobasicom i kruhom',
      'Blitva s krumpirom, pun tanjur',
      'Komad domaće pite od jabuka',
    ],
  },

  quality: {
    title: 'Isti broj kalorija, dva sasvim različita dana.',
    body: '2.100 kalorija leće nije isto što i 2.100 kalorija čipsa i milkshakea. Zato svaki obrok dobiva i vlakna, natrij, zasićene masti i šećer — sve iščitano iz iste rečenice, bez ikakvog dodatnog tipkanja.',
    note: 'Vlakna su minimum koji treba dosegnuti, a ostala tri gornje granice ispod kojih treba ostati.',
  },

  target: {
    badge: 'Plus',
    title: 'Cilj koji uči koliko stvarno trošiš.',
    body: 'Kalkulator nagađa iz visine i težine. Nakon dva tjedna upisivanja i vaganja postoji nešto pouzdanije: koliko trošiš upravo *ti*. Svakog ponedjeljka cilj slijedi ono što pokazuju podaci, a kratak pregled objašnjava zašto.',
    reviewDates: '11. – 17. kolovoza',
    reviewIntake:
      'Prosjek je bio 2.180 kalorija uz cilj od 2.290, a proteini su bili iznad 150 g šest od sedam dana. Težina je u dva tjedna pala 0,4 kg.',
    reviewChange:
      'Cilj ti od danas raste: mršaviš tempom koji želiš, a jedeš manje nego što je dopuštao, pa je stari broj bio prenizak.',
    reviewBasis: 'Na temelju 14 dana s upisima i 6 vaganja. Ograničeno na +200.',
    guardrailsTitle: 'Prije nego što išta pomakne',
    guardrails: [
      'Najprije barem 10 dana s upisima i 4 vaganja.',
      'Najviše 200 kalorija odjednom, i manje ako su upisi bili neredoviti.',
      'Procjena koja jako odstupa od formule odbacuje se umjesto da joj se vjeruje.',
      'Cilj koji postaviš ručno nikad se ne dira.',
    ],
    more: 'Kako se to računa',
  },

  features: {
    title: 'I sve ostalo što dnevnik treba znati.',
    items: [
      {
        title: 'Radi bez mreže',
        body: 'Upiši obrok u avionu ili u podrumskoj teretani. Odmah se broji, a sinkronizira se kad se vratiš na mrežu.',
      },
      {
        title: 'Widgeti na početnom zaslonu',
        body: 'Preostale kalorije i današnji koraci, bez otvaranja aplikacije.',
      },
      {
        title: 'Koraci',
        body: 'Na Androidu preko Health Connecta, a na iPhoneu iz ugrađenog brojača koraka.',
      },
      {
        title: 'Treninzi',
        body: 'Serije i ponavljanja od prošlog puta već te čekaju, za 220 vježbi i tvoje vlastite rutine.',
      },
      {
        title: 'Recepti',
        body: 'Stotinjak recepata, poredanih prema onome što imaš u kuhinji i što ti je od dana preostalo.',
      },
      {
        title: 'Nizovi i postignuća',
        body: 'Četrnaest znački koje možeš osvojiti — u svakom paketu, uključujući Free.',
      },
      {
        title: 'Dan završava kad ideš spavati',
        body: 'Međuobrok u jedan ujutro broji se u večer kojoj pripada. Granicu dana pomakni onamo gdje ti dan stvarno završava.',
      },
      {
        title: 'Vježbanje se upisuje, budžet ostaje',
        body: 'Trčanje se vidi u tvom danu i u trendovima, ali ti ne povećava potajno budžet kalorija.',
      },
      {
        title: 'Trinaest jezika',
        body: 'Cijela aplikacija, od bugarskog do grčkog. Obroke opisuj na jeziku na kojem razmišljaš.',
      },
    ],
  },

  pricing: {
    title: 'Dnevnik je besplatan. Razmišljanje malo košta.',
    body: 'Upisivanje obroka i zbrajanje dana događaju se na tvom telefonu, pa su besplatni zauvijek. Za razumijevanje rečenice ili fotografije treba AI model, a to je dio na koji stiže račun.',
    period: 'Razdoblje naplate',
    monthly: 'Mjesečno',
    yearly: 'Godišnje',
    saving: '−17 %',
    recommended: 'Preporučeno',
    plans: [
      {
        name: 'Free',
        monthly: 'Besplatno',
        annual: 'Besplatno',
        monthlyCadence: 'dokle god želiš',
        annualCadence: 'dokle god želiš',
        pitch: 'Cijeli dnevnik, čak i u avionu.',
        allowance: [
          { figure: '10', unit: 'poruka', period: 'mjesečno' },
          { figure: '1', unit: 'fotografija', period: 'za probu' },
        ],
        points: [
          'Upisivanje i ponavljanje obroka te skeniranje barkoda — neograničeno',
          'Tvoj dan, povijest, težina i trendovi',
          'Widgeti, treninzi, recepti, nizovi i postignuća',
        ],
        cta: 'Počni besplatno',
      },
      {
        name: 'Plus',
        monthly: '10,99 €',
        annual: '104,99 €',
        monthlyCadence: 'mjesečno, otkaži bilo kad',
        annualCadence: 'godišnje — 8,75 € mjesečno',
        pitch: 'Razgovaraj s dnevnikom umjesto ručnog upisa.',
        allowance: [
          { figure: '90', unit: 'poruka', period: 'mjesečno' },
          { figure: '8', unit: 'fotografija', period: 'mjesečno' },
        ],
        points: [
          'Sve iz paketa Free',
          'Tjedni pregled toga kako ti je tjedan stvarno prošao',
          'Cilj koji se prilagođava onome što pokazuju podaci',
          'Dodatne poruke i skeniranja fotografija možeš dokupiti kad god ti zatrebaju',
        ],
        cta: 'Uzmi Plus',
      },
      {
        name: 'Coach',
        monthly: '26,99 €',
        annual: '269,99 €',
        monthlyCadence: 'mjesečno, otkaži bilo kad',
        annualCadence: 'godišnje — 22,50 € mjesečno',
        pitch: 'I pomaže odlučiti što će biti za večeru.',
        allowance: [
          { figure: '180', unit: 'poruka', period: 'mjesečno' },
          { figure: '25', unit: 'fotografija', period: 'mjesečno' },
        ],
        points: [
          'Sve iz paketa Plus',
          '10 skeniranja hladnjaka mjesečno, iz kojih nastaju recepti',
          '8 recepata mjesečno, napisanih za ono što imaš u kuhinji',
          '2 plana tjednih večera mjesečno, s popisom za kupnju',
        ],
        cta: 'Uzmi Coach',
      },
    ],
    notes: [
      'Svaki račun počinje s paketom Free. Nema probnog razdoblja koje treba otkazati na vrijeme.',
      'Ono što paket uključuje puni se dan po dan, kroz pomično razdoblje od 30 dana, pa nema datuma obnove koji treba čekati.',
      'Ponestalo ti je skeniranja fotografija? Dodatna se kupuju od 4,29 € za deset, ne istječu i koriste se tek kad potrošiš mjesečna.',
      'Prestaneš li plaćati, vraćaš se na Free: dnevnik i povijest ostaju, uz 10 poruka mjesečno.',
    ],
    currency: 'Cijene su u eurima. Točnu cijenu za tvoju zemlju vidiš u Google Playu.',
  },

  faq: {
    title: 'Pitanja i odgovori.',
    items: [
      {
        q: 'Moram li vagati hranu?',
        a: 'Ne. Porcije opiši onako kako ih inače izgovaraš — „velika zdjela“, „dvije kriške“. Procjene su označene kao procjene, a izvagana količina više se računa kad se cilj prilagođava.',
      },
      {
        q: 'Koliko je to točno?',
        a: 'Otprilike koliko i pažljiva procjena — i kaže kad nagađa. Kako se testira i gdje griješi, detaljno je opisano.',
      },
      {
        q: 'Ima li ga za iPhone?',
        a: 'Na Androidu je već dostupan. Aplikacija za iPhone je na pregledu za App Store, a poveznica će se na ovoj stranici pojaviti onoga dana kad izađe.',
      },
      {
        q: 'Radi li bez interneta?',
        a: 'Upisivanje i ponavljanje obroka te pregled dana rade bez mreže i sinkroniziraju se kad se veza vrati. Za rečenice, fotografije i traženje barkoda treba veza.',
      },
      {
        q: 'Koje jezike govori?',
        a: 'Engleski, bugarski, njemački, španjolski, francuski, rumunjski, ukrajinski, srpski, hrvatski, češki, mađarski, grčki i slovački. Prati jezik postavljen na telefonu, a promijeniti ga možeš bilo kad.',
      },
      {
        q: 'Što ako mi ponestane poruka?',
        a: 'Dnevnik i dalje radi: obroke i dalje možeš upisivati i ponavljati, a barkodove skenirati. Poruke se vraćaju dan po dan, a možeš i nadograditi paket.',
      },
      {
        q: 'Kako otkazati?',
        a: 'U trgovini Google Play, pod „Pretplate“, kad god želiš. Plaćeno ostaje tvoje do kraja razdoblja, a zatim se vraćaš na Free.',
      },
      {
        q: 'Prodajete li moje podatke?',
        a: 'Ne. Bez oglasa, bez analitike, bez praćenja i ništa se ne prodaje dalje. Što se bilježi, kome stiže i koliko se čuva, piše u pravilima privatnosti.',
      },
      {
        q: 'Savjetujem klijente o prehrani. Ima li nešto i za mene?',
        a: 'Da: web ploča na kojoj pratiš dane svojih klijenata, postavljaš im ciljeve i ostavljaš komentare, s 30 dana besplatne probe. Odvojena je od paketa Coach iznad.',
      },
    ],
    accuracyLink: 'Pročitaj o točnosti',
    privacyLink: 'Pročitaj pravila privatnosti',
    coachLink: 'Otvori ploču za trenere',
  },

  privacy: {
    title: 'Tvoji obroci ostaju tvoji.',
    body: 'Bez analitike, bez oglašavanja, ništa za prodaju. Tvoji su obroci redci u bazi podataka koja postoji samo da odgovori na jedno pitanje — što je danas bilo na tanjuru.',
    link: 'Pročitaj pravila privatnosti',
  },

  closing: {
    title: 'Počni od doručka.',
    body: 'Postavljanje traje minutu-dvije: što želiš postići, visina i težina te koliko se krećeš. Iz toga se izračuna tvoj cilj.',
  },

  footer: {
    howItWorks: 'Kako radi',
    accuracy: 'Točnost',
    blog: 'Blog',
    recipes: 'Recepti',
    about: 'O nama',
    privacy: 'Privatnost',
    terms: 'Uvjeti korištenja',
    languages: 'Ova stranica na drugim jezicima',
  },
};
