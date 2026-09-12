import type { LandingCopy } from './types';

/**
 * The landing page, in Romanian.
 *
 * „Tu”, like the app and the Play listing, and the reader is never gendered —
 * no adjective or participle about "you" („cât te miști”, not „cât de activ
 * ești”). The words are the app's own: „a nota”, „ținta”, „bilanț
 * săptămânal”, „scanări foto”, „serii și realizări”, „planul Free”.
 *
 * Numbers as Romanian writes them (2.180, 0,4 kg, 20 de …), and the "de" that
 * a count from 20 up puts before its noun lives in the allowance `unit`. Dollar
 * prices with the symbol after the amount, held to it by a no-break space.
 */
export const ro: LandingCopy = {
  meta: {
    title: 'Day So Far — contor de calorii cu care doar vorbești',
    description:
      'Spune ce ai mâncat, cu vorbele tale. Calorii, proteine, carbohidrați și grăsimi se adună singure — fără baze de date, fără 40 de rezultate la „piept de pui”.',
  },

  nav: {
    how: 'Cum funcționează',
    features: 'Funcții',
    pricing: 'Prețuri',
    faq: 'Întrebări',
    coaches: 'Pentru antrenori',
    language: 'Limbă',
  },

  switcher: {
    suggest: 'Citește pagina în română',
    dismiss: 'Nu, mulțumesc',
  },

  cta: {
    get: 'Descarcă aplicația',
    iphone: 'În curând pe iPhone',
    seeHow: 'Vezi cum merge',
    storeSoon: 'în curând',
  },

  hero: {
    title: 'Spune ce ai mâncat. Atât.',
    lede: 'Contorul de calorii cu care stai de vorbă. Scrie cu vorbele tale, spune cu voce tare sau fă o poză — caloriile, proteinele, carbohidrații și grăsimile se adună singure.',
    trust: 'Începi gratuit · Fără reclame · Fără trackere',
  },

  demo: {
    logged: 'Salată de pui cu avocado și un cappuccino',
    loggedReply:
      'Am notat prânzul — un piept de pui cât palma, jumătate de avocado și un cappuccino mic.',
    summary: 'Prânz notat',
    description: 'Salată de pui și cappuccino',
    chicken: 'Piept de pui',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avocado',
    avocadoQuantity: 'jumătate',
    coffee: 'Cappuccino',
    coffeeQuantity: 'mic',
    correction: 'era porție dublă de pui',
    correctionReply: 'Corectat — aceeași intrare, acum cu 200 g de pui, iar ziua s-a recalculat și ea.',
    placeholder: 'Două ouă și pâine prăjită…',
    caption:
      'O conversație cu jurnalul. Micul dejun și o gustare sunt deja în ziua ta; „salată de pui cu avocado și un cappuccino” e notată ca prânz, cu aproximativ 550 de calorii — apoi e corectată la porție dublă de pui, iar aceeași intrare se actualizează pe loc la 715, în timp ce cercul, macronutrienții și barele pentru fibre, sodiu, grăsimi saturate și zahăr se mișcă odată cu ea.',
  },

  ways: {
    title: 'Patru feluri de a nota o masă. Niciunul nu e un formular.',
    items: [
      {
        title: 'Scrie sau spune',
        body: '„Două ouă, pâine prăjită și niște brânză.” Scrie-o sau spune-o cu voce tare. Asta e tot ce ai de făcut.',
      },
      {
        title: 'Fă o poză',
        body: 'O farfurie, un meniu, eticheta de pe ambalaj. Primești o estimare, marcată clar ca estimare.',
      },
      {
        title: 'Scanează codul de bare',
        body: 'Apare eticheta, iar tu spui cât ai mâncat. Nu l-a mai scanat nimeni? Fotografiază eticheta.',
      },
      {
        title: 'Cere „ca de obicei”',
        body: '„Micul dejun ca de obicei” notează din nou ce ai mâncat de fapt data trecută. Istoricul tău, nu baza de date a altcuiva.',
      },
    ],
  },

  corrections: {
    title: 'Te-ai răzgândit? Intrarea se schimbă și ea.',
    body: '„De fapt, au fost trei ouă.” Masa deja notată se corectează pe loc — nu apare de două ori și nu rămâne s-o repari de mână. Fiecare aliment e ținut separat, așa că, dacă modifici ouăle, pâinea prăjită rămâne neatinsă.',
    cardLabel: 'Mic dejun · o singură intrare',
    eggs: 'Ouă',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Pâine prăjită',
    toastQuantity: '2 felii',
    cheese: 'Cașcaval',
    cheeseQuantity: '30 g',
    total: 'Total',
  },

  homeCooking: {
    title: 'Pentru mâncarea care n-are cod de bare.',
    body: 'Majoritatea aplicațiilor de calorii te pun să cauți într-o bază de date, iar baza de date n-a auzit în viața ei cum se gătește la tine acasă. Aici descrii masa cum i-ai povesti unui prieten, în oricare dintre cele treisprezece limbi, iar restul îl calculează aplicația.',
    examples: [
      '5 sarmale cu smântână și mămăligă',
      'Un castron de ciorbă de perișoare',
      'Musaca de cartofi, o bucată mare',
      'Două clătite cu dulceață de casă',
    ],
  },

  quality: {
    title: 'Două zile cu aceleași calorii pot fi două zile foarte diferite.',
    body: '2.100 de calorii din linte nu sunt totuna cu 2.100 de calorii din chipsuri și un milkshake. Așa că fiecare masă primește și fibrele, sodiul, grăsimile saturate și zahărul — citite din aceeași propoziție, fără nimic în plus de scris.',
    note: 'La fibre ai un minim de atins; la celelalte trei, un maxim de nedepășit.',
  },

  target: {
    badge: 'Plus',
    title: 'O țintă care învață cât arzi de fapt.',
    body: 'Un calculator ghicește după înălțime și greutate. După vreo două săptămâni în care notezi și te cântărești, apare ceva mai sigur: cât arzi *tu*. În fiecare luni, ținta se ia după cifre, iar un bilanț scurt îți explică de ce.',
    reviewDates: '11–17 august',
    reviewIntake:
      'Ai mâncat în medie 2.180 de calorii, față de o țintă de 2.290, iar proteinele au rămas peste 150 g în șase zile din șapte. Greutatea a scăzut cu 0,4 kg în două săptămâni.',
    reviewChange:
      'Ținta ta crește de azi: ai slăbit în ritmul dorit mâncând mai puțin decât îți permitea, deci vechea cifră era prea mică.',
    reviewBasis: 'Din 14 zile notate și 6 cântăriri. Cel mult +200.',
    guardrailsTitle: 'Înainte să schimbe ceva',
    guardrails: [
      'Mai întâi, cel puțin 10 zile notate și 4 cântăriri.',
      'Cel mult 200 de calorii la o ajustare — mai puțin dacă notatul a avut goluri.',
      'O estimare care se abate mult de la ce prezice formula e ignorată, nu luată de bună.',
      'O țintă pe care ai setat-o tu nu se schimbă niciodată.',
    ],
    more: 'Cum se face calculul',
  },

  features: {
    title: 'Și tot ce mai trebuie să facă un jurnal alimentar.',
    items: [
      {
        title: 'Merge și offline',
        body: 'Notează manual o masă în avion sau într-o sală de sport de la subsol. Se socotește imediat și se sincronizează când prinzi din nou semnal.',
      },
      {
        title: 'Widgeturi pe ecranul principal',
        body: 'Caloriile rămase și pașii de azi, fără să deschizi aplicația.',
      },
      {
        title: 'Pași',
        body: 'Din Health Connect pe Android sau din contorul de pași al telefonului pe iPhone.',
      },
      {
        title: 'Antrenamente',
        body: 'Serii și repetări completate după data trecută, la 220 de exerciții și la rutinele tale.',
      },
      {
        title: 'Rețete',
        body: 'Cam o sută, ordonate după ce ai în bucătărie și după cât a mai rămas din ziua ta.',
      },
      {
        title: 'Serii și realizări',
        body: 'Paisprezece realizări de deblocat, în orice plan, inclusiv Free.',
      },
      {
        title: 'Ziua se termină când te culci',
        body: 'O gustare la 1 noaptea se socotește la seara căreia îi aparține. Alege ora la care se termină de fapt ziua ta.',
      },
      {
        title: 'Mișcarea se notează, nu intră în buget',
        body: 'O alergare apare în ziua ta și în tendințe. Nu-ți mărește pe tăcute bugetul de calorii.',
      },
      {
        title: 'Treisprezece limbi',
        body: 'Toată aplicația, de la bulgară la greacă. Descrie-ți mesele în limba în care gândești.',
      },
    ],
  },

  pricing: {
    title: 'Jurnalul e gratuit. Partea care gândește costă puțin.',
    body: 'Când scrii tu o masă și aduni ziua, totul se petrece pe telefon, așa că rămâne gratuit pentru totdeauna. Înțelegerea unei propoziții sau a unei poze cere un model AI — și asta e partea care costă.',
    period: 'Perioada de facturare',
    monthly: 'Lunar',
    yearly: 'Anual',
    saving: '−12 %',
    recommended: 'Recomandat',
    plans: [
      {
        name: 'Free',
        monthly: 'Gratuit',
        annual: 'Gratuit',
        monthlyCadence: 'cât timp vrei',
        annualCadence: 'cât timp vrei',
        pitch: 'Tot jurnalul, chiar și în avion.',
        allowance: [
          { figure: '10', unit: 'mesaje', period: 'pe lună' },
          { figure: '1', unit: 'scanare foto', period: 'de încercare' },
        ],
        points: [
          'Scrierea meselor, repetarea lor și scanarea codurilor de bare — fără limită',
          'Ziua ta, istoricul, greutatea și tendințele tale',
          'Widgeturi, antrenamente, rețete, serii și realizări',
        ],
        cta: 'Începe gratuit',
      },
      {
        name: 'Plus',
        monthly: '9,99 €',
        annual: '104,99 €',
        monthlyCadence: 'pe lună, anulezi oricând',
        annualCadence: 'pe an — 8,75 € pe lună',
        pitch: 'Vorbești cu jurnalul în loc să scrii tu fiecare masă.',
        allowance: [
          { figure: '90', unit: 'de mesaje', period: 'pe lună' },
          { figure: '8', unit: 'scanări foto', period: 'pe lună' },
        ],
        points: [
          'Tot ce include Free',
          'Un bilanț săptămânal despre cum a mers de fapt săptămâna',
          'O țintă care se ajustează după datele reale',
          'Pachete de mesaje și scanări foto în plus, oricând ai nevoie',
        ],
        cta: 'Alege Plus',
      },
      {
        name: 'Coach',
        monthly: '25,99 €',
        annual: '254,99 €',
        monthlyCadence: 'pe lună, anulezi oricând',
        annualCadence: 'pe an — 21,25 € pe lună',
        pitch: 'Și te ajută să hotărăști ce faci de cină.',
        allowance: [
          { figure: '180', unit: 'de mesaje', period: 'pe lună' },
          { figure: '25', unit: 'de scanări foto', period: 'pe lună' },
        ],
        points: [
          'Tot ce include Plus',
          '10 scanări de frigider pe lună, transformate în rețete',
          '8 rețete pe lună, scrise pentru ce ai în bucătărie',
          '2 planuri săptămânale de cine pe lună, cu lista de cumpărături',
        ],
        cta: 'Alege Coach',
      },
    ],
    notes: [
      'Orice cont începe cu planul Free. Nu există nicio perioadă de probă pe care să nu uiți s-o anulezi.',
      'Ce include planul se reîncarcă zi de zi, pe o perioadă mobilă de 30 de zile, deci nu aștepți nicio dată de resetare.',
      'Ai rămas fără scanări foto? Pachetele pornesc de la 4,09 € pentru zece, nu expiră niciodată și se folosesc doar după ce s-au terminat cele din luna respectivă.',
      'Dacă nu mai plătești, revii la planul Free: jurnalul și istoricul rămân, cu 10 mesaje pe lună.',
    ],
    currency: 'Prețuri în euro. Prețul exact pentru țara ta îl vezi în Google Play.',
  },

  faq: {
    title: 'Întrebări și răspunsuri.',
    items: [
      {
        q: 'Trebuie să-mi cântăresc mâncarea?',
        a: 'Nu. Descrie porțiile cum le-ai spune — „un castron mare”, „două felii”. Estimările sunt marcate ca estimări, iar o cantitate cântărită contează mai mult când se ajustează ținta.',
      },
      {
        q: 'Cât de precis e?',
        a: 'Cam cât o estimare atentă — și îți spune când ghicește. Cum îl testăm și unde greșește — totul e scris pe larg.',
      },
      {
        q: 'Există și pe iPhone?',
        a: 'Deocamdată e pe Android. Aplicația de iPhone e în verificare la App Store, iar linkul apare pe pagina asta în ziua în care se lansează.',
      },
      {
        q: 'Merge fără internet?',
        a: 'Scrierea unei mese, repetarea uneia și verificarea zilei merg toate offline și se sincronizează când revii online. Propozițiile, pozele și căutarea codurilor de bare au nevoie de conexiune.',
      },
      {
        q: 'Ce limbi vorbește?',
        a: 'Engleză, bulgară, germană, spaniolă, franceză, română, ucraineană, sârbă, croată, cehă, maghiară, greacă și slovacă. Ia limba telefonului și o poți schimba oricând.',
      },
      {
        q: 'Ce se întâmplă când rămân fără mesaje?',
        a: 'Jurnalul merge în continuare: poți să scrii mese, să le repeți și să scanezi coduri de bare. Mesajele se reîncarcă zi de zi. Sau faci upgrade.',
      },
      {
        q: 'Cum anulez?',
        a: 'Din Google Play, la Abonamente, oricând vrei. Păstrezi ce ai plătit până la sfârșitul perioadei, apoi revii la planul Free.',
      },
      {
        q: 'Îmi vindeți datele?',
        a: 'Nu. Fără reclame, fără instrumente de analiză, fără trackere și nimic vândut mai departe. Ce se înregistrează, la cine ajunge și cât timp se păstrează — totul e în politica de confidențialitate.',
      },
      {
        q: 'Fac coaching de nutriție. Aveți ceva și pentru mine?',
        a: 'Da: un panou web în care urmărești zilele clienților, le setezi țintele și lași comentarii, cu 30 de zile de probă gratuită. E separat de planul Coach de mai sus.',
      },
    ],
    accuracyLink: 'Citește despre precizie',
    privacyLink: 'Citește politica de confidențialitate',
    coachLink: 'Deschide panoul pentru antrenori',
  },

  privacy: {
    title: 'Mesele tale rămân ale tale.',
    body: 'Fără instrumente de analiză, fără reclame, nimic de vândut. Mesele tale sunt rânduri într-o bază de date care există ca să răspundă la o singură întrebare — ce ai mâncat azi.',
    link: 'Citește politica de confidențialitate',
  },

  closing: {
    title: 'Începe cu micul dejun.',
    body: 'Configurarea durează un minut sau două: obiectivul, înălțimea, greutatea și cât te miști. De acolo se calculează ținta.',
  },

  footer: {
    howItWorks: 'Cum funcționează',
    accuracy: 'Precizie',
    blog: 'Blog',
    recipes: 'Rețete',
    about: 'Despre',
    privacy: 'Confidențialitate',
    terms: 'Termeni',
    languages: 'Pagina în alte limbi',
  },
};
