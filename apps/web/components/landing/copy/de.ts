import type { LandingCopy } from './types';

/**
 * The landing page, in German.
 *
 * "du" throughout, like the app's catalogue and the Play listing. The nouns are
 * the app's own: Journal, Tagebuch, Wochenrückblick, Küche, Nachrichten,
 * Foto-Scans, Ziel, Wiegungen, Serien und Erfolge. Prices are euro amounts
 * written the German way, with the symbol after the figure.
 */
export const de: LandingCopy = {
  meta: {
    title: 'Day So Far — der Kalorienzähler, mit dem du einfach redest',
    description:
      'Sag in eigenen Worten, was du gegessen hast. Kalorien und Makros rechnen sich von selbst zusammen — keine Datenbanksuche, keine 40 Treffer für „Hähnchenbrust“.',
  },

  nav: {
    how: 'So geht’s',
    features: 'Funktionen',
    pricing: 'Preise',
    faq: 'FAQ',
    coaches: 'Für Coaches',
    language: 'Sprache',
  },

  switcher: {
    suggest: 'Diese Seite auf Deutsch lesen',
    dismiss: 'Nein, danke',
  },

  cta: {
    get: 'Hol dir die App',
    iphone: 'Bald fürs iPhone',
    seeHow: 'So funktioniert’s',
    storeSoon: 'bald',
  },

  hero: {
    title: 'Sag einfach, was du gegessen hast.',
    lede: 'Der Kalorienzähler, mit dem du redest. Tipp es, sag es oder fotografier es, ganz in deinen Worten — Kalorien, Eiweiß, Kohlenhydrate und Fett rechnen sich von selbst zusammen.',
    trust: 'Kostenlos starten · Keine Werbung · Keine Tracker',
  },

  demo: {
    logged: 'Hähnchensalat mit Avocado, dazu ein Cappuccino',
    loggedReply:
      'Als Mittagessen eingetragen — eine handtellergroße Hähnchenbrust, eine halbe Avocado und ein kleiner Cappuccino.',
    summary: 'Mittagessen eingetragen',
    description: 'Hähnchensalat und Cappuccino',
    chicken: 'Hähnchenbrust',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avocado',
    avocadoQuantity: 'halb',
    coffee: 'Cappuccino',
    coffeeQuantity: 'klein',
    correction: 'mach doppelt hähnchen draus',
    correctionReply: 'Erledigt — derselbe Eintrag, jetzt mit 200 g Hähnchen, und dein Tag ist mitgezogen.',
    placeholder: 'Zwei Eier und Toast…',
    caption:
      'Ein Gespräch mit dem Journal. Frühstück und ein Snack sind schon eingetragen; „Hähnchensalat mit Avocado, dazu ein Cappuccino“ wird als Mittagessen mit etwa 550 Kalorien erfasst — dann auf doppelt Hähnchen korrigiert, und derselbe Eintrag springt auf 715, während sich der Ring, die Makros und die Balken für Ballaststoffe, Natrium, gesättigtes Fett und Zucker mitbewegen.',
  },

  ways: {
    title: 'Vier Wege, eine Mahlzeit einzutragen. Kein einziges Formular.',
    items: [
      {
        title: 'Tipp es oder sag es',
        body: '„Zwei Eier, Toast und etwas Käse.“ Schreib es auf oder sag es laut. Mehr musst du nicht tun.',
      },
      {
        title: 'Fotografier es',
        body: 'Ein Teller, eine Speisekarte, das Etikett einer Packung. Zurück kommt eine Schätzung — und sie ist als Schätzung gekennzeichnet.',
      },
      {
        title: 'Scann den Barcode',
        body: 'Das Etikett kommt zurück, und du sagst, wie viel du davon hattest. Hat die Packung noch niemand gescannt? Dann fotografier einfach das Etikett.',
      },
      {
        title: 'Das Übliche, bitte',
        body: '„Mein übliches Frühstück“ übernimmt, was du beim letzten Mal wirklich gegessen hast. Dein Verlauf, nicht die Datenbank von Fremden.',
      },
    ],
  },

  corrections: {
    title: 'Anders überlegt? Der Eintrag ändert sich mit.',
    body: '„Moment, es waren drei Eier.“ Die Mahlzeit, die du schon eingetragen hast, wird direkt korrigiert — nicht doppelt eingetragen und nicht dir zum Nachbessern überlassen. Jeder Posten wird einzeln geführt: Änderst du die Eier, bleibt der Toast unberührt.',
    cardLabel: 'Frühstück · ein Eintrag',
    eggs: 'Eier',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Toast',
    toastQuantity: '2 Scheiben',
    cheese: 'Gouda',
    cheeseQuantity: '30 g',
    total: 'Gesamt',
  },

  homeCooking: {
    title: 'Gemacht für Essen ohne Barcode.',
    body: 'Bei den meisten Kalorienzählern musst du dich durch eine Datenbank suchen — und die weiß nichts davon, wie in deiner Familie gekocht wird. Hier beschreibst du dein Essen so, wie du es einem Freund erzählen würdest, in einer von dreizehn Sprachen, und die App rechnet den Rest aus.',
    examples: [
      'Linseneintopf mit Würstchen, ein Teller',
      'Spaghetti Bolognese, große Portion',
      '2 Frikadellen mit Kartoffelsalat',
      'Ein Stück Apfelkuchen, selbst gebacken',
    ],
  },

  quality: {
    title: 'Gleiche Kalorien, und doch zwei ganz verschiedene Tage.',
    body: '2.100 Kalorien aus Linsen sind nicht dasselbe wie 2.100 Kalorien aus Chips und Milchshake. Deshalb bekommt jede Mahlzeit auch Werte für Ballaststoffe, Natrium, gesättigtes Fett und Zucker — aus demselben Satz gelesen, ohne dass du extra etwas eintippen musst.',
    note: 'Bei Ballaststoffen willst du eine Untergrenze erreichen, bei den anderen dreien unter einer Obergrenze bleiben.',
  },

  target: {
    badge: 'Plus',
    title: 'Ein Ziel, das lernt, was du wirklich verbrennst.',
    body: 'Ein Rechner rät anhand deiner Größe und deines Gewichts. Nach ein paar Wochen mit Einträgen und Wiegen gibt es eine bessere Grundlage: das, was *du* verbrennst. Jeden Montag richtet sich dein Ziel nach den Zahlen, und ein kurzer Rückblick sagt dir, warum.',
    reviewDates: '11.–17. August',
    reviewIntake:
      'Du hast im Schnitt 2.180 Kalorien gegessen, bei einem Ziel von 2.290, und das Eiweiß lag an sechs von sieben Tagen über 150 g. Dein Gewicht ist in zwei Wochen um 0,4 kg gesunken.',
    reviewChange:
      'Dein Ziel steigt heute: Du hast so schnell abgenommen, wie du wolltest, und dabei weniger gegessen, als es erlaubt hätte — die alte Zahl war also zu niedrig.',
    reviewBasis: 'Aus 14 erfassten Tagen und 6 Wiegungen. Begrenzt auf +200.',
    guardrailsTitle: 'Bevor sich etwas ändert',
    guardrails: [
      'Erst mindestens 10 erfasste Tage und 4 Wiegungen.',
      'Nie mehr als 200 Kalorien auf einmal, und weniger, wenn die Einträge lückenhaft waren.',
      'Eine Schätzung, die weit von der Formel abweicht, wird verworfen statt geglaubt.',
      'Ein Ziel, das du selbst gesetzt hast, bleibt immer unangetastet.',
    ],
    more: 'So wird gerechnet',
  },

  features: {
    title: 'Und alles andere, was ein Tagebuch können sollte.',
    items: [
      {
        title: 'Funktioniert offline',
        body: 'Trag eine Mahlzeit im Flugzeug ein oder im Fitnessstudio im Keller. Sie zählt sofort und synchronisiert sich, sobald du wieder Empfang hast.',
      },
      {
        title: 'Widgets für den Startbildschirm',
        body: 'Übrige Kalorien und die Schritte von heute, ohne die App zu öffnen.',
      },
      {
        title: 'Schritte',
        body: 'Auf Android über Health Connect, auf dem iPhone vom eingebauten Schrittzähler.',
      },
      {
        title: 'Training',
        body: 'Sätze und Wiederholungen, vorausgefüllt vom letzten Mal — für 220 Übungen und deine eigenen Trainings.',
      },
      {
        title: 'Rezepte',
        body: 'Rund hundert, sortiert nach dem, was deine Küche hergibt und was von deinem Tag noch übrig ist.',
      },
      {
        title: 'Serien und Erfolge',
        body: 'Vierzehn Erfolge zum Sammeln, in jedem Plan — auch in Free.',
      },
      {
        title: 'Der Tag endet, wenn du schlafen gehst',
        body: 'Ein Snack um 1 Uhr nachts zählt zu dem Abend, zu dem er gehört. Verschieb die Grenze dorthin, wo dein Tag wirklich endet.',
      },
      {
        title: 'Sport wird erfasst, nicht verfuttert',
        body: 'Ein Lauf taucht in deinem Tag und in deinen Trends auf. Dein Kalorienbudget wird dadurch aber nicht heimlich größer.',
      },
      {
        title: 'Dreizehn Sprachen',
        body: 'Die ganze App, von Bulgarisch bis Griechisch. Beschreib deine Mahlzeiten in der Sprache, in der du denkst.',
      },
    ],
  },

  pricing: {
    title: 'Das Tagebuch ist kostenlos. Das Mitdenken kostet ein wenig.',
    body: 'Eine Mahlzeit eintippen und den Tag zusammenrechnen passiert auf deinem Handy — deshalb bleibt das für immer kostenlos. Einen Satz oder ein Foto zu verstehen, braucht ein KI-Modell, und genau dieser Teil kostet Geld.',
    period: 'Abrechnungszeitraum',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
    saving: '−15 %',
    recommended: 'Empfohlen',
    plans: [
      {
        name: 'Free',
        monthly: 'Kostenlos',
        annual: 'Kostenlos',
        monthlyCadence: 'so lange du willst',
        annualCadence: 'so lange du willst',
        pitch: 'Das ganze Tagebuch, sogar im Flugzeug.',
        allowance: [
          { figure: '10', unit: 'Nachrichten', period: 'im Monat' },
          { figure: '1', unit: 'Foto-Scan', period: 'zum Testen' },
        ],
        points: [
          'Mahlzeiten eintippen, wiederholen und Barcodes scannen — unbegrenzt',
          'Dein Tag, dein Verlauf, dein Gewicht und deine Trends',
          'Widgets, Training, Rezepte, Serien und Erfolge',
        ],
        cta: 'Kostenlos starten',
      },
      {
        name: 'Plus',
        monthly: '9,99 €',
        annual: '99,99 €',
        monthlyCadence: 'im Monat, jederzeit kündbar',
        annualCadence: 'im Jahr — 8,33 € im Monat',
        pitch: 'Einfach reden statt tippen.',
        allowance: [
          { figure: '90', unit: 'Nachrichten', period: 'im Monat' },
          { figure: '8', unit: 'Foto-Scans', period: 'im Monat' },
        ],
        points: [
          'Alles aus Free',
          'Ein Wochenrückblick, wie deine Woche wirklich lief',
          'Ein Ziel, das sich nach den Zahlen richtet',
          'Zusätzliche Nachrichten und Foto-Scans als Paket, wann immer du sie brauchst',
        ],
        cta: 'Plus holen',
      },
      {
        name: 'Coach',
        monthly: '24,99 €',
        annual: '254,99 €',
        monthlyCadence: 'im Monat, jederzeit kündbar',
        annualCadence: 'im Jahr — 21,25 € im Monat',
        pitch: 'Und es entscheidet mit, was es zum Abendessen gibt.',
        allowance: [
          { figure: '180', unit: 'Nachrichten', period: 'im Monat' },
          { figure: '25', unit: 'Foto-Scans', period: 'im Monat' },
        ],
        points: [
          'Alles aus Plus',
          '10 Kühlschrank-Scans im Monat, aus denen Rezepte werden',
          '8 Rezepte im Monat, geschrieben für das, was in deiner Küche ist',
          '2 Wochenpläne fürs Abendessen im Monat, samt Einkaufsliste',
        ],
        cta: 'Coach holen',
      },
    ],
    notes: [
      'Jedes Konto startet mit Free. Es gibt keine Testphase, die du rechtzeitig kündigen musst.',
      'Kontingente füllen sich über rollierende 30 Tage Tag für Tag wieder auf — es gibt also keinen Stichtag, auf den du warten musst.',
      'Keine Foto-Scans mehr? Pakete gibt es ab 4,09 € für zehn Stück. Sie verfallen nie und werden erst genutzt, wenn die Scans des Monats aufgebraucht sind.',
      'Hörst du auf zu zahlen, bist du wieder auf Free: Dein Tagebuch und dein Verlauf bleiben, mit 10 Nachrichten im Monat.',
    ],
    currency: 'Preise in Euro. Den genauen Preis für dein Land zeigt dir Google Play.',
  },

  faq: {
    title: 'Fragen und Antworten.',
    items: [
      {
        q: 'Muss ich mein Essen abwiegen?',
        a: 'Nein. Beschreib Portionen so, wie du sie sagen würdest — „eine große Schüssel“, „zwei Scheiben“. Schätzungen sind als Schätzungen gekennzeichnet, und eine abgewogene Menge zählt mehr, wenn sich dein Ziel anpasst.',
      },
      {
        q: 'Wie genau ist das?',
        a: 'Etwa so genau wie eine sorgfältige Schätzung — und die App sagt dir, wenn sie rät. Wie sie getestet wird und wo sie danebenliegt, ist ausführlich dokumentiert.',
      },
      {
        q: 'Gibt es die App fürs iPhone?',
        a: 'Auf Android gibt es sie jetzt schon. Die iPhone-App wird gerade vom App Store geprüft, und sobald sie erscheint, steht der Link noch am selben Tag auf dieser Seite.',
      },
      {
        q: 'Funktioniert die App ohne Internet?',
        a: 'Mahlzeiten eintippen, eine wiederholen und deinen Tag ansehen — all das geht offline und wird synchronisiert, sobald du wieder verbunden bist. Sätze, Fotos und Barcode-Abfragen brauchen eine Verbindung.',
      },
      {
        q: 'Welche Sprachen spricht die App?',
        a: 'Englisch, Bulgarisch, Deutsch, Spanisch, Französisch, Rumänisch, Ukrainisch, Serbisch, Kroatisch, Tschechisch, Ungarisch, Griechisch und Slowakisch. Sie richtet sich nach der Spracheinstellung deines Handys, und du kannst sie jederzeit ändern.',
      },
      {
        q: 'Was passiert, wenn meine Nachrichten aufgebraucht sind?',
        a: 'Das Tagebuch funktioniert weiter: Du kannst Mahlzeiten weiterhin eintippen, wiederholen und Barcodes scannen. Nachrichten füllen sich Tag für Tag wieder auf, oder du machst ein Upgrade.',
      },
      {
        q: 'Wie kündige ich?',
        a: 'In Google Play unter „Abos“, wann immer du willst. Was du bezahlt hast, behältst du bis zum Ende des Zeitraums; danach bist du wieder auf Free.',
      },
      {
        q: 'Verkauft ihr meine Daten?',
        a: 'Nein. Keine Werbung, keine Analyse-Tools, keine Tracker, und nichts wird weiterverkauft. Was gespeichert wird, an wen es geht und wie lange es aufbewahrt wird, steht alles in der Datenschutzerklärung.',
      },
      {
        q: 'Ich bin Ernährungscoach. Gibt es etwas für mich?',
        a: 'Ja: ein Web-Dashboard, in dem du die Tage deiner Klienten verfolgst, ihre Ziele setzt und Kommentare hinterlässt — 30 Tage kostenlos zum Testen. Es ist unabhängig vom Coach-Plan oben.',
      },
    ],
    accuracyLink: 'Mehr zur Genauigkeit',
    privacyLink: 'Datenschutzerklärung lesen',
    coachLink: 'Zum Coach-Dashboard',
  },

  privacy: {
    title: 'Deine Mahlzeiten gehören dir.',
    body: 'Keine Analyse-Tools, keine Werbung, nichts zu verkaufen. Deine Mahlzeiten sind Zeilen in einer Datenbank, die nur eine Frage beantworten soll: Was hast du heute gegessen?',
    link: 'Datenschutzerklärung lesen',
  },

  closing: {
    title: 'Fang mit dem Frühstück an.',
    body: 'Die Einrichtung dauert ein, zwei Minuten: dein Ziel, deine Größe und dein Gewicht und wie aktiv du bist. Daraus errechnet sich dein Tagesziel.',
  },

  footer: {
    howItWorks: 'So funktioniert’s',
    accuracy: 'Genauigkeit',
    blog: 'Blog',
    recipes: 'Rezepte',
    about: 'Über uns',
    privacy: 'Datenschutz',
    terms: 'Nutzungsbedingungen',
    languages: 'Diese Seite in anderen Sprachen',
  },
};
