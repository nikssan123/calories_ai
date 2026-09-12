import type { LandingCopy } from './types';

/**
 * The landing page, in Slovak. Same voice as messages/sk.ts and the Play listing:
 * tykanie, and the reader is never gendered (no past tense or adjectives about
 * "you"). Thousands and prices take a non-breaking space: 2 180, 9,99 €, −17 %.
 */
export const sk: LandingCopy = {
  meta: {
    title: 'Day So Far — počítadlo kalórií, s ktorým stačí hovoriť',
    description:
      'Napíš vlastnými slovami, čo bolo na tanieri. Kalórie, bielkoviny, sacharidy a tuky sa zrátajú samy – bez databázy a bez 40 výsledkov pre „kuracie prsia“.',
  },

  nav: {
    how: 'Ako to funguje',
    features: 'Funkcie',
    pricing: 'Ceny',
    faq: 'Otázky',
    coaches: 'Pre trénerov',
    language: 'Jazyk',
  },

  switcher: {
    suggest: 'Čítať túto stránku po slovensky',
    dismiss: 'Nie, ďakujem',
  },

  cta: {
    get: 'Stiahnuť aplikáciu',
    iphone: 'Pre iPhone čoskoro',
    seeHow: 'Ako to funguje',
    storeSoon: 'čoskoro',
  },

  hero: {
    title: 'Povedz, čo bolo na tanieri.',
    lede: 'Počítadlo kalórií, s ktorým sa rozprávaš. Napíš, povedz alebo odfoť – vlastnými slovami. Kalórie, bielkoviny, sacharidy a tuky sa zrátajú samy.',
    trust: 'Začni zadarmo · Bez reklám · Bez sledovania',
  },

  demo: {
    logged: 'Kurací šalát s avokádom a cappuccino',
    loggedReply:
      'Zapísané ako obed – kuracie prsia veľké ako dlaň, pol avokáda a malé cappuccino.',
    summary: 'Zapísaný obed',
    description: 'Kurací šalát a cappuccino',
    chicken: 'Kuracie prsia',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avokádo',
    avocadoQuantity: 'polovica',
    coffee: 'Cappuccino',
    coffeeQuantity: 'malé',
    correction: 'kuracieho bolo dvakrát toľko',
    correctionReply: 'Upravené – ten istý záznam, teraz s 200 g kuracieho, a celý deň sa hneď prepočítal.',
    placeholder: 'Dve vajcia a hrianka…',
    caption:
      'Rozhovor s denníkom. Raňajky a medzijedlo už sú v dni zapísané; „kurací šalát s avokádom a cappuccino“ sa zapíše ako obed za približne 550 kalórií. Potom príde oprava na dvojnásobok kuracieho a ten istý záznam sa na mieste zmení na 715 – a s ním sa posunie kruh, makroživiny aj ukazovatele vlákniny, sodíka, nasýtených tukov a cukru.',
  },

  ways: {
    title: 'Štyri spôsoby, ako zapísať jedlo. Žiadny z nich nie je formulár.',
    items: [
      {
        title: 'Napíš to alebo povedz',
        body: '„Dve vajcia, hrianka a kúsok syra.“ Napíš to, alebo to povedz nahlas. Viac toho robiť netreba.',
      },
      {
        title: 'Odfoť to',
        body: 'Tanier, jedálny lístok, etiketa na balení. Odhad príde späť a je jasne označený ako odhad.',
      },
      {
        title: 'Naskenuj čiarový kód',
        body: 'Načíta sa etiketa a ty povieš, koľko toho bolo. Balenie ešte nikto nenaskenoval? Odfoť radšej etiketu.',
      },
      {
        title: 'To, čo zvyčajne',
        body: '„Moje zvyčajné raňajky“ zopakujú to, čo bolo na tanieri naposledy. Tvoja história, nie databáza cudzích ľudí.',
      },
    ],
  },

  corrections: {
    title: 'Zmeníš názor – zmení sa aj záznam.',
    body: '„Vajcia boli vlastne tri.“ Jedlo, ktoré už máš zapísané, sa opraví priamo – nezapíše sa dvakrát a nemusíš ho prepisovať ručne. Každá položka je uložená samostatne, takže oprava vajec nechá hrianku na pokoji.',
    cardLabel: 'Raňajky · jeden záznam',
    eggs: 'Vajcia',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Hrianka',
    toastQuantity: '2 plátky',
    cheese: 'Eidam',
    cheeseQuantity: '30 g',
    total: 'Spolu',
  },

  homeCooking: {
    title: 'Pre jedlo, ktoré nemá čiarový kód.',
    body: 'Väčšina počítadiel kalórií ťa pošle hľadať v databáze – a tá nikdy nepočula o tom, ako sa varí u vás doma. Tu to opíšeš ako kamarátovi, v ktoromkoľvek z trinástich jazykov, a zvyšok sa dopočíta sám.',
    examples: [
      'Tanier bryndzových halušiek',
      'Segedínsky guláš a štyri knedle',
      'Veľká miska fazuľovej polievky',
      'Dve palacinky s tvarohom',
    ],
  },

  quality: {
    title: 'Dva dni s rovnakými kalóriami môžu byť úplne iné.',
    body: '2 100 kalórií zo šošovice nie je to isté ako 2 100 kalórií z čipsov a mliečneho kokteilu. Preto každé jedlo dostane aj vlákninu, sodík, nasýtené tuky a cukor – z tej istej vety, bez písania navyše.',
    note: 'Pri vláknine je cieľom dosiahnuť minimum, pri ostatných troch neprekročiť strop.',
  },

  target: {
    badge: 'Plus',
    title: 'Cieľ, ktorý zistí, koľko naozaj spaľuješ.',
    body: 'Kalkulačka háda podľa výšky a váhy. Po pár týždňoch zapisovania a váženia je tu niečo spoľahlivejšie: koľko spaľuješ práve *ty*. Každý pondelok sa cieľ prispôsobí tomu, čo ukazujú čísla, a krátky prehľad povie prečo.',
    reviewDates: '11. – 17. augusta',
    reviewIntake:
      'Priemerne 2 180 kalórií denne pri cieli 2 290 a bielkoviny boli nad 150 g šesť dní zo siedmich. Váha za dva týždne klesla o 0,4 kg.',
    reviewChange:
      'Cieľ sa dnes zvyšuje: váha klesá tempom, aké chceš, a pritom ješ menej, než cieľ dovoľoval – pôvodné číslo bolo teda príliš nízke.',
    reviewBasis: 'Na základe 14 zapísaných dní a 6 vážení. Najviac +200.',
    guardrailsTitle: 'Skôr než niečo zmení',
    guardrails: [
      'Najprv aspoň 10 zapísaných dní a 4 váženia.',
      'Nikdy o viac než 200 kalórií naraz – a o menej, ak boli záznamy nepravidelné.',
      'Odhad, ktorý sa výrazne líši od výpočtu podľa vzorca, sa neberie vážne, ale zahodí.',
      'Ručne nastavený cieľ zostane vždy nedotknutý.',
    ],
    more: 'Ako sa to počíta',
  },

  features: {
    title: 'A všetko ostatné, čo by mal denník vedieť.',
    items: [
      {
        title: 'Funguje offline',
        body: 'Zapíš jedlo v lietadle alebo v posilňovni v suteréne. Hneď sa započíta a zosynchronizuje sa, keď budeš zase online.',
      },
      {
        title: 'Widgety na ploche',
        body: 'Koľko kalórií zostáva a dnešné kroky, bez otvárania aplikácie.',
      },
      {
        title: 'Kroky',
        body: 'Na Androide z Health Connect, na iPhone z krokomera, ktorý má telefón zabudovaný.',
      },
      {
        title: 'Tréningy',
        body: 'Série a opakovania, predvyplnené podľa minulého tréningu – 220 cvikov a tvoje vlastné zostavy.',
      },
      {
        title: 'Recepty',
        body: 'Asi sto receptov zoradených podľa toho, čo máš v kuchyni a koľko ti z dňa ešte zostáva.',
      },
      {
        title: 'Série a úspechy',
        body: 'Štrnásť odznakov na získanie, v každom pláne vrátane Free.',
      },
      {
        title: 'Deň končí, keď ideš spať',
        body: 'Maškrta o jednej v noci sa počíta k večeru, ku ktorému patrí. Hranicu dňa si posuň tam, kde sa tvoj deň naozaj končí.',
      },
      {
        title: 'Pohyb nie je poukážka na jedlo',
        body: 'Beh sa ukáže v tvojom dni aj v trendoch. Tvoj kalorický rozpočet však potichu nezväčší.',
      },
      {
        title: 'Trinásť jazykov',
        body: 'Celá aplikácia, od bulharčiny po gréčtinu. Jedlá opisuj v jazyku, v ktorom rozmýšľaš.',
      },
    ],
  },

  pricing: {
    title: 'Denník je zadarmo. Za premýšľanie sa trochu platí.',
    body: 'Ručný zápis jedla a súčet dňa zvládne priamo tvoj telefón, preto sú zadarmo natrvalo. Pochopiť vetu alebo fotku však dokáže len AI model – a to je tá časť, ktorá niečo stojí.',
    period: 'Obdobie platby',
    monthly: 'Mesačne',
    yearly: 'Ročne',
    saving: '−15 %',
    recommended: 'Odporúčané',
    plans: [
      {
        name: 'Free',
        monthly: 'Zadarmo',
        annual: 'Zadarmo',
        monthlyCadence: 'tak dlho, ako chceš',
        annualCadence: 'tak dlho, ako chceš',
        pitch: 'Celý denník, aj v lietadle.',
        allowance: [
          { figure: '10', unit: 'správ', period: 'mesačne' },
          { figure: '1', unit: 'skenovanie fotky', period: 'na vyskúšanie' },
        ],
        points: [
          'Ručné zapisovanie, opakovanie jedál a skenovanie čiarových kódov – bez obmedzenia',
          'Tvoj deň, história, váha a trendy',
          'Widgety, tréningy, recepty, série a úspechy',
        ],
        cta: 'Začať zadarmo',
      },
      {
        name: 'Plus',
        monthly: '10,99 €',
        annual: '104,99 €',
        monthlyCadence: 'mesačne, zrušiť môžeš kedykoľvek',
        annualCadence: 'ročne – 8,75 € mesačne',
        pitch: 'Namiesto písania sa s ním rozprávaš.',
        allowance: [
          { figure: '90', unit: 'správ', period: 'mesačne' },
          { figure: '8', unit: 'skenovaní fotiek', period: 'mesačne' },
        ],
        points: [
          'Všetko z plánu Free',
          'Týždenný prehľad toho, ako týždeň naozaj prebehol',
          'Cieľ, ktorý sa prispôsobí skutočným číslam',
          'Ďalšie správy a skenovania fotiek v balíčkoch, kedykoľvek ich potrebuješ',
        ],
        cta: 'Získať Plus',
      },
      {
        name: 'Coach',
        monthly: '25,99 €',
        annual: '264,99 €',
        monthlyCadence: 'mesačne, zrušiť môžeš kedykoľvek',
        annualCadence: 'ročne – 22,08 € mesačne',
        pitch: 'A pomôže rozhodnúť, čo bude na večeru.',
        allowance: [
          { figure: '180', unit: 'správ', period: 'mesačne' },
          { figure: '25', unit: 'skenovaní fotiek', period: 'mesačne' },
        ],
        points: [
          'Všetko z plánu Plus',
          '10 skenovaní chladničky mesačne, z ktorých vzniknú recepty',
          '8 receptov mesačne, napísaných z toho, čo máš v kuchyni',
          '2 týždenné plány večerí mesačne aj s nákupným zoznamom',
        ],
        cta: 'Získať Coach',
      },
    ],
    notes: [
      'Každý účet začína na pláne Free. Žiadna skúšobná verzia, ktorú nesmieš zabudnúť zrušiť.',
      'Limity sa dopĺňajú deň po dni v kĺzavom 30-dňovom období, takže nečakáš na žiadny dátum obnovenia.',
      'Došli skenovania fotiek? Balíčky začínajú na 4,19 € za desať, nikdy nepropadnú a použijú sa až po vyčerpaní mesačných.',
      'Keď prestaneš platiť, vrátiš sa na Free: denník aj história zostanú, k tomu 10 správ mesačne.',
    ],
    currency: 'Ceny sú v eurách. Presnú cenu pre tvoju krajinu ti ukáže Google Play.',
  },

  faq: {
    title: 'Otázky a odpovede.',
    items: [
      {
        q: 'Musím jedlo vážiť?',
        a: 'Nie. Porcie opíš tak, ako o nich hovoríš – „veľká miska“, „dva plátky“. Odhady sú označené ako odhady a pri úprave cieľa má odvážené množstvo väčšiu váhu.',
      },
      {
        q: 'Aké je to presné?',
        a: 'Približne ako starostlivý odhad – a vždy povie, keď háda. Ako sa to testuje a kde to zlyháva, je podrobne popísané.',
      },
      {
        q: 'Je to aj pre iPhone?',
        a: 'Na Androide už je. Aplikácia pre iPhone čaká na schválenie v App Store a odkaz sa na tejto stránke objaví v deň, keď vyjde.',
      },
      {
        q: 'Funguje to bez internetu?',
        a: 'Ručný zápis jedla, zopakovanie jedla aj prehľad dňa fungujú offline a zosynchronizujú sa, keď sa znova pripojíš. Vety, fotky a vyhľadávanie čiarových kódov potrebujú pripojenie.',
      },
      {
        q: 'V akých jazykoch funguje?',
        a: 'V angličtine, bulharčine, nemčine, španielčine, francúzštine, rumunčine, ukrajinčine, srbčine, chorvátčine, češtine, maďarčine, gréčtine a slovenčine. Jazyk sa riadi nastavením telefónu a zmeniť ho môžeš kedykoľvek.',
      },
      {
        q: 'Čo keď sa mi minú správy?',
        a: 'Denník funguje ďalej: jedlá môžeš stále zapisovať ručne, opakovať a skenovať čiarové kódy. Správy sa dopĺňajú deň po dni, alebo môžeš prejsť na vyšší plán.',
      },
      {
        q: 'Ako zruším predplatné?',
        a: 'V Google Play v časti Predplatné, kedykoľvek chceš. To, za čo je zaplatené, ti zostane do konca obdobia, potom sa vrátiš na Free.',
      },
      {
        q: 'Predávate moje údaje?',
        a: 'Nie. Žiadne reklamy, žiadna analytika, žiadne sledovanie a nič sa ďalej nepredáva. Čo sa zaznamenáva, ku komu sa to dostane a ako dlho sa to uchováva, nájdeš v zásadách ochrany súkromia.',
      },
      {
        q: 'Venujem sa výživovému poradenstvu. Je tu niečo aj pre mňa?',
        a: 'Áno: webový panel, v ktorom sleduješ dni svojich klientov, nastavuješ im ciele a píšeš komentáre, s 30-dňovým skúšobným obdobím zadarmo. S plánom Coach vyššie to nesúvisí.',
      },
    ],
    accuracyLink: 'Prečítať si o presnosti',
    privacyLink: 'Prečítať zásady ochrany súkromia',
    coachLink: 'Otvoriť panel pre trénerov',
  },

  privacy: {
    title: 'Tvoje jedlá zostávajú tvoje.',
    body: 'Žiadna analytika, žiadna reklama, nič na predaj. Tvoje jedlá sú riadky v databáze, ktorá existuje len preto, aby odpovedala na jednu otázku – čo bolo dnes na tanieri.',
    link: 'Prečítať zásady ochrany súkromia',
  },

  closing: {
    title: 'Začni raňajkami.',
    body: 'Nastavenie trvá minútu či dve: čo chceš dosiahnuť, tvoja výška a váha a ako veľmi sa hýbeš. Z toho sa vypočíta tvoj denný cieľ.',
  },

  footer: {
    howItWorks: 'Ako to funguje',
    accuracy: 'Presnosť',
    blog: 'Blog',
    recipes: 'Recepty',
    about: 'O aplikácii',
    privacy: 'Súkromie',
    terms: 'Podmienky',
    languages: 'Táto stránka v iných jazykoch',
  },
};
