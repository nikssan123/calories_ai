import type { LandingCopy } from './types';

/**
 * The landing page, in Czech.
 *
 * Informal "ty", like the app's catalogue and the Play listing. The Czech past
 * tense is gendered ("jedl", "sám"), so sentences about the reader are put in
 * the present, a neuter passive ("Zapsáno") or a noun instead. A paid plan is a
 * "tarif"; the person who coaches is a "trenér". Quotes „…“, a spaced en dash
 * for the English em dash, and figures with a non-breaking space before
 * thousands, "€" and "%".
 */
export const cs: LandingCopy = {
  meta: {
    title: 'Day So Far — počítadlo kalorií, kterému stačí říct, co jíš',
    description:
      'Řekni vlastními slovy, co bylo k jídlu. Kalorie, bílkoviny, sacharidy a tuky se sečtou samy – žádná databáze, žádných čtyřicet výsledků pro „kuřecí prsa“.',
  },

  nav: {
    how: 'Jak to funguje',
    features: 'Funkce',
    pricing: 'Ceník',
    faq: 'Časté dotazy',
    coaches: 'Pro trenéry',
    language: 'Jazyk',
  },

  switcher: {
    suggest: 'Přečíst tuto stránku česky',
    dismiss: 'Ne, díky',
  },

  cta: {
    get: 'Stáhnout aplikaci',
    iphone: 'Pro iPhone už brzy',
    seeHow: 'Jak to funguje',
    storeSoon: 'brzy',
  },

  hero: {
    title: 'Prostě řekni, co bylo k jídlu.',
    lede: 'Počítadlo kalorií, se kterým si povídáš. Vlastními slovy to napiš, řekni nahlas nebo vyfoť – kalorie, bílkoviny, sacharidy a tuky se sečtou samy.',
    trust: 'Začni zdarma · Žádné reklamy · Žádné sledování',
  },

  demo: {
    logged: 'Kuřecí salát s avokádem a cappuccino',
    loggedReply:
      'Zapsáno k obědu – kuřecí prsa zhruba velikosti dlaně, půlka avokáda a malé cappuccino.',
    summary: 'Zapsaný oběd',
    description: 'Kuřecí salát a cappuccino',
    chicken: 'Kuřecí prsa',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avokádo',
    avocadoQuantity: 'půlka',
    coffee: 'Cappuccino',
    coffeeQuantity: 'malé',
    correction: 'kuřete bylo dvakrát tolik',
    correctionReply: 'Upraveno – pořád tentýž zápis, teď s 200 g kuřete, a celý den se podle toho přepočítal.',
    placeholder: 'Dvě vajíčka a rohlík…',
    caption:
      'Konverzace s deníkem. Snídaně a svačina už jsou v dni zapsané; „kuřecí salát s avokádem a cappuccino“ se zapíše jako oběd za zhruba 550 kalorií – pak přijde oprava na dvojnásob kuřete a tentýž zápis se na místě změní na 715, zatímco kruh, makra i ukazatele vlákniny, sodíku, nasycených tuků a cukru se posunou s ním.',
  },

  ways: {
    title: 'Čtyři způsoby, jak zapsat jídlo. Ani jeden není formulář.',
    items: [
      {
        title: 'Napiš to nebo řekni',
        body: '„Dvě vajíčka, rohlík a kousek sýra.“ Napiš to, nebo to řekni nahlas. A to je celé.',
      },
      {
        title: 'Vyfoť to',
        body: 'Talíř, jídelní lístek, etiketa na balení. Výsledek dostaneš jasně označený jako odhad.',
      },
      {
        title: 'Naskenuj čárový kód',
        body: 'Načtou se údaje z etikety a ty jen řekneš, kolik toho bylo. Tohle balení ještě nikdo nenaskenoval? Tak vyfoť etiketu.',
      },
      {
        title: 'Řekni si o to obvyklé',
        body: '„Snídaně jako obvykle“ zopakuje to, co bylo minule doopravdy na talíři. Tvoje vlastní historie, ne databáze cizích lidí.',
      },
    ],
  },

  corrections: {
    title: 'Změníš názor. Změní se i zápis.',
    body: '„Vlastně to byla tři vajíčka.“ Jídlo, které už máš zapsané, se opraví přímo na místě – nezapíše se dvakrát a nemusíš ho přepisovat ručně. Každá položka se drží zvlášť, takže oprava vajíček nechá toust na pokoji.',
    cardLabel: 'Snídaně · jeden zápis',
    eggs: 'Vajíčka',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Toust',
    toastQuantity: '2 plátky',
    cheese: 'Eidam',
    cheeseQuantity: '30 g',
    total: 'Celkem',
  },

  homeCooking: {
    title: 'Pro jídlo, které nemá čárový kód.',
    body: 'Většina počítadel kalorií tě nechá hledat v databázi – a ta o tom, jak se vaří u vás doma, v životě neslyšela. Tady to popíšeš jako kamarádovi, v kterémkoli ze třinácti jazyků, a zbytek se dopočítá sám.',
    examples: [
      'Guláš a čtyři knedlíky',
      'Kuře na paprice s rýží, menší talíř',
      'Miska čočky na kyselo s vajíčkem',
      'Kousek domácí bábovky',
    ],
  },

  quality: {
    title: 'Dva dny se stejnými kaloriemi můžou vypadat úplně jinak.',
    body: '2\u00a0100 kalorií z čočky není totéž co 2\u00a0100 kalorií z chipsů a mléčného koktejlu. Proto u každého jídla dostaneš i vlákninu, sodík, nasycené tuky a cukr – vyčtené ze stejné věty, bez psaní čehokoli navíc.',
    note: 'Vláknina je minimum, na které se chceš dostat; zbylé tři jsou stropy, pod kterými chceš zůstat.',
  },

  target: {
    badge: 'Plus',
    title: 'Cíl, který se naučí, kolik doopravdy spálíš.',
    body: 'Kalkulačka jen hádá podle výšky a váhy. Po pár týdnech zapisování a vážení je tu něco lepšího: kolik spaluješ *ty*. Každé pondělí se cíl přizpůsobí tomu, co ukazují data, a krátký přehled ti řekne proč.',
    reviewDates: '11.–17. srpna',
    reviewIntake:
      'V průměru 2\u00a0180 kalorií denně při cíli 2\u00a0290 a bílkoviny šest dní ze sedmi nad 150 g. Váha je za dva týdny o 0,4 kg níž.',
    reviewChange:
      'Cíl se dnes zvyšuje: hubneš tempem, jaké chceš, a přitom jíš méně, než ti dovoloval – takže původní číslo bylo moc nízké.',
    reviewBasis: 'Ze 14 zapsaných dní a 6 vážení. Omezeno na +200.',
    guardrailsTitle: 'Než se cokoli změní',
    guardrails: [
      'Nejdřív aspoň 10 zapsaných dní a 4 vážení.',
      'Nejvýš o 200 kalorií najednou – a méně, když měly zápisy mezery.',
      'Odhad, který je daleko od toho, co předpovídá vzorec, se zahodí – nevěří se mu.',
      'Cíl nastavený ručně zůstane vždycky nedotčený.',
    ],
    more: 'Jak funguje výpočet',
  },

  features: {
    title: 'A všechno další, co má deník umět.',
    items: [
      {
        title: 'Funguje offline',
        body: 'Zapiš jídlo v letadle nebo ve sklepní posilovně. Započítá se hned a srovná se, až budeš zase online.',
      },
      {
        title: 'Widgety na plochu',
        body: 'Kolik kalorií zbývá a dnešní kroky, bez otevírání aplikace.',
      },
      {
        title: 'Kroky',
        body: 'Z Health Connect na Androidu, nebo z krokoměru přímo v iPhonu.',
      },
      {
        title: 'Tréninky',
        body: 'Série a opakování předvyplněné podle minula – u 220 cviků i tvých vlastních tréninků.',
      },
      {
        title: 'Recepty',
        body: 'Zhruba stovka, seřazená podle toho, co máš v kuchyni a kolik ti ještě zbývá ze dne.',
      },
      {
        title: 'Série a úspěchy',
        body: 'Čtrnáct odznaků k získání, v každém tarifu včetně Free.',
      },
      {
        title: 'Den končí, až jdeš spát',
        body: 'Svačina v jednu v noci se počítá k večeru, ke kterému patří. Hranici posuň tam, kde tvůj den doopravdy končí.',
      },
      {
        title: 'Pohyb se zapisuje, nikdy nepřičítá',
        body: 'Běh uvidíš ve svém dni i v trendech. Jen ti potichu nezvětší kalorický rozpočet.',
      },
      {
        title: 'Třináct jazyků',
        body: 'Celá aplikace, od bulharštiny po řečtinu. Popisuj jídla v jazyce, ve kterém přemýšlíš.',
      },
    ],
  },

  pricing: {
    title: 'Deník je zdarma. Přemýšlení stojí jen trochu.',
    body: 'Ruční zápis jídla a sčítání dne běží přímo v telefonu, a proto jsou zdarma natrvalo. Porozumět větě nebo fotce ale musí AI model – a to je ta část, za kterou přichází účet.',
    period: 'Fakturační období',
    monthly: 'Měsíčně',
    yearly: 'Ročně',
    saving: '−12\u00a0%',
    recommended: 'Doporučujeme',
    plans: [
      {
        name: 'Free',
        monthly: 'Zdarma',
        annual: 'Zdarma',
        monthlyCadence: 'jak dlouho budeš chtít',
        annualCadence: 'jak dlouho budeš chtít',
        pitch: 'Celý deník, klidně i v letadle.',
        allowance: [
          { figure: '10', unit: 'zpráv', period: 'měsíčně' },
          { figure: '1', unit: 'sken fotky', period: 'na vyzkoušení' },
        ],
        points: [
          'Ruční zápis, opakování jídel a skenování čárových kódů – bez omezení',
          'Tvůj den, historie, váha a trendy',
          'Widgety, tréninky, recepty, série a úspěchy',
        ],
        cta: 'Začít zdarma',
      },
      {
        name: 'Plus',
        monthly: '9,99\u00a0€',
        annual: '104,99\u00a0€',
        monthlyCadence: 'měsíčně, zrušit můžeš kdykoli',
        annualCadence: 'ročně – 8,75\u00a0€ měsíčně',
        pitch: 'Místo ručního zápisu si prostě povídej.',
        allowance: [
          { figure: '90', unit: 'zpráv', period: 'měsíčně' },
          { figure: '8', unit: 'skenů fotek', period: 'měsíčně' },
        ],
        points: [
          'Vše z tarifu Free',
          'Týdenní přehled toho, jak tvůj týden doopravdy proběhl',
          'Cíl, který se řídí daty',
          'Další zprávy a skeny fotek v balíčcích, kdykoli je potřebuješ',
        ],
        cta: 'Pořídit Plus',
      },
      {
        name: 'Coach',
        monthly: '25,99\u00a0€',
        annual: '254,99\u00a0€',
        monthlyCadence: 'měsíčně, zrušit můžeš kdykoli',
        annualCadence: 'ročně – 21,25\u00a0€ měsíčně',
        pitch: 'A pomůže vymyslet, co bude k večeři.',
        allowance: [
          { figure: '180', unit: 'zpráv', period: 'měsíčně' },
          { figure: '25', unit: 'skenů fotek', period: 'měsíčně' },
        ],
        points: [
          'Vše z tarifu Plus',
          '10 skenů lednice měsíčně, proměněných v recepty',
          '8 receptů měsíčně, psaných podle toho, co máš v kuchyni',
          '2 týdenní plány večeří měsíčně, i s nákupním seznamem',
        ],
        cta: 'Pořídit Coach',
      },
    ],
    notes: [
      'Každý účet začíná na tarifu Free. Žádná zkušební lhůta, kterou musíš hlídat a včas zrušit.',
      'Limity se doplňují den po dni v klouzavém 30denním okně, takže nečekáš na žádné datum obnovení.',
      'Došly skeny fotek? Balíčky začínají na 4,09\u00a0€ za deset, nikdy nepropadají a čerpají se, až když dojdou ty měsíční.',
      'Přestaneš platit a jsi zpátky na Free: deník i historie zůstanou, s 10 zprávami měsíčně.',
    ],
    currency: 'Ceny jsou v eurech. Přesnou cenu pro tvou zemi ti ukáže Google Play.',
  },

  faq: {
    title: 'Na co se lidé ptají.',
    items: [
      {
        q: 'Musím jídlo vážit?',
        a: 'Ne. Porce popiš tak, jak se běžně říká – „velká miska“, „dva plátky“. Odhady jsou označené jako odhady a zvážené množství má při úpravě cíle větší váhu.',
      },
      {
        q: 'Jak je to přesné?',
        a: 'Zhruba jako pečlivý odhad – a řekne, když hádá. Jak to testujeme a kde se to plete, máme sepsané do posledního detailu.',
      },
      {
        q: 'Je to i pro iPhone?',
        a: 'Na Androidu už je. Aplikace pro iPhone čeká na schválení v App Store a odkaz se na téhle stránce objeví hned v den vydání.',
      },
      {
        q: 'Funguje to bez internetu?',
        a: 'Ruční zápis jídla, jeho zopakování i přehled dne fungují offline a srovnají se, až budeš zase online. Věty, fotky a vyhledání čárových kódů potřebují připojení.',
      },
      {
        q: 'Jaké jazyky umí?',
        a: 'Angličtinu, bulharštinu, němčinu, španělštinu, francouzštinu, rumunštinu, ukrajinštinu, srbštinu, chorvatštinu, češtinu, maďarštinu, řečtinu a slovenštinu. Řídí se nastavením telefonu a změnit to můžeš kdykoli.',
      },
      {
        q: 'Co když mi dojdou zprávy?',
        a: 'Deník funguje dál: jídla můžeš pořád zapisovat ručně, opakovat a skenovat čárové kódy. Zprávy se doplňují den po dni, nebo můžeš přejít na vyšší tarif.',
      },
      {
        q: 'Jak předplatné zruším?',
        a: 'V Google Play v sekci Předplatná, kdykoli se ti to hodí. Co máš zaplacené, ti zůstane do konce období, pak se vrátíš na Free.',
      },
      {
        q: 'Prodáváte moje data?',
        a: 'Ne. Žádné reklamy, žádná analytika, žádné sledování a nic se dál neprodává. Co se ukládá, komu se to dostane a jak dlouho se to uchovává, najdeš v zásadách ochrany osobních údajů.',
      },
      {
        q: 'Vedeš klienty ve výživě? Je tu něco i pro tebe?',
        a: 'Ano: webový panel, kde sleduješ dny svých klientů, nastavuješ jim cíle a píšeš komentáře – prvních 30 dní zdarma na vyzkoušení. S tarifem Coach výše to nesouvisí.',
      },
    ],
    accuracyLink: 'Přečíst si o přesnosti',
    privacyLink: 'Přečíst zásady ochrany osobních údajů',
    coachLink: 'Otevřít trenérský panel',
  },

  privacy: {
    title: 'Tvoje jídla zůstanou tvoje.',
    body: 'Žádná analytika, žádné reklamy, nic na prodej. Tvoje jídla jsou řádky v databázi, která existuje kvůli jediné otázce – co dnes bylo k jídlu.',
    link: 'Přečíst zásady ochrany osobních údajů',
  },

  closing: {
    title: 'Začni snídaní.',
    body: 'Nastavení zabere minutu nebo dvě: čeho chceš dosáhnout, výška a váha a jak moc se hýbeš. Z toho se spočítá tvůj denní cíl.',
  },

  footer: {
    howItWorks: 'Jak to funguje',
    accuracy: 'Přesnost',
    blog: 'Blog',
    recipes: 'Recepty',
    about: 'O nás',
    privacy: 'Soukromí',
    terms: 'Podmínky',
    languages: 'Tato stránka v dalších jazycích',
  },
};
