import type { LandingCopy } from './types';

/**
 * The landing page, in French — "tu", like the app and the Play listing.
 *
 * The spaces are not all the same character. A narrow no-break space goes
 * before `;`, `?`, `!` and `%` and between thousands ("2 180", which is what
 * `Intl` prints for fr); an ordinary no-break space goes before `:`, inside
 * « guillemets », before `€` and between a figure and its unit. They look like
 * plain spaces in an editor, and they are what stops a line from starting with
 * a lone question mark.
 *
 * "Flat white" became a "petit crème", which is what a small milky coffee is
 * called at a French counter. The cheddar on the correction card is Comté.
 */
export const fr: LandingCopy = {
  meta: {
    title: 'Day So Far — le compteur de calories qui t’écoute',
    description:
      'Dis ce que tu as mangé, avec tes mots. Calories, protéines, glucides, lipides : tout s’additionne. Sans base de données ni quarante résultats pour « poulet ».',
  },

  nav: {
    how: 'Comment ça marche',
    features: 'Fonctionnalités',
    pricing: 'Tarifs',
    faq: 'FAQ',
    coaches: 'Pour les coachs',
    language: 'Langue',
  },

  switcher: {
    suggest: 'Lire cette page en français',
    dismiss: 'Non merci',
  },

  cta: {
    get: 'Installer l’appli',
    iphone: 'Bientôt sur iPhone',
    seeHow: 'Comment ça marche',
    storeSoon: 'bientôt',
  },

  hero: {
    title: 'Dis juste ce que tu as mangé.',
    lede: 'Le compteur de calories à qui tu parles. Écris ton repas, dis-le ou prends-le en photo, avec tes mots — calories, protéines, glucides et lipides s’additionnent tout seuls.',
    trust: 'Gratuit pour commencer · Sans pub · Sans traceurs',
  },

  demo: {
    logged: 'Salade de poulet à l’avocat, et un petit crème',
    loggedReply:
      'Noté pour le déjeuner — un blanc de poulet de la taille d’une paume, un demi-avocat et un petit crème.',
    summary: 'Déjeuner noté',
    description: 'Salade de poulet et petit crème',
    chicken: 'Blanc de poulet',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Avocat',
    avocadoQuantity: 'un demi',
    coffee: 'Café crème',
    coffeeQuantity: 'petit',
    correction: 'en fait, double poulet',
    correctionReply: 'C’est fait — même entrée, 200 g de poulet maintenant, et ta journée a suivi.',
    placeholder: 'Deux œufs et une tartine…',
    caption:
      'Une conversation avec le journal. Le petit-déjeuner et un en-cas sont déjà dans la journée ; « salade de poulet à l’avocat, et un petit crème » est noté comme déjeuner, pour environ 550 calories — puis corrigé en double poulet : la même entrée passe à 715, et l’anneau, les macros et les jauges de fibres, sodium, graisses saturées et sucre suivent.',
  },

  ways: {
    title: 'Quatre façons de noter un repas. Aucun formulaire.',
    items: [
      {
        title: 'Écris-le ou dis-le',
        body: '« Deux œufs, une tartine et un peu de fromage. » Écris-le, ou dis-le à voix haute. C’est tout ce qu’il y a à faire.',
      },
      {
        title: 'Prends-le en photo',
        body: 'Une assiette, la carte du restaurant, l’étiquette d’un paquet. Tu reçois une estimation, présentée comme telle.',
      },
      {
        title: 'Scanne le code-barres',
        body: 'L’étiquette s’affiche, tu dis combien tu en as pris. Personne ne l’a encore scanné ? Photographie l’étiquette à la place.',
      },
      {
        title: 'Comme d’habitude',
        body: '« Mon petit-déjeuner habituel » reprend ce que tu as vraiment mangé la dernière fois. Ton historique, pas la base de données d’un inconnu.',
      },
    ],
  },

  corrections: {
    title: 'Tu changes d’avis ? L’entrée aussi.',
    body: '« En fait, il y avait trois œufs. » Le repas déjà noté est corrigé sur place — ni enregistré deux fois, ni laissé à corriger à la main. Chaque aliment est gardé à part : corriger les œufs ne touche pas au pain.',
    cardLabel: 'Petit-déjeuner · une entrée',
    eggs: 'Œufs',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Pain grillé',
    toastQuantity: '2 tranches',
    cheese: 'Comté',
    cheeseQuantity: '30 g',
    total: 'Total',
  },

  homeCooking: {
    title: 'Pensé pour les plats sans code-barres.',
    body: 'La plupart des compteurs de calories te font chercher dans une base de données, et cette base n’a jamais entendu parler de la cuisine de ta famille. Ici, tu décris ton assiette comme à un ami, dans l’une des treize langues, et l’appli fait le reste.',
    examples: [
      'Hachis parmentier, une grosse part',
      'Un reste de blanquette avec du riz',
      'Un croque-monsieur et une salade verte',
      'Une part de gâteau au yaourt maison',
    ],
  },

  quality: {
    title: 'À calories égales, deux journées peuvent n’avoir rien à voir.',
    body: '2 100 calories de lentilles, ce n’est pas 2 100 calories de chips et un milk-shake. Alors chaque repas reçoit aussi ses fibres, son sodium, ses graisses saturées et son sucre — tirés de la même phrase, sans rien taper de plus.',
    note: 'Les fibres sont un minimum à atteindre ; les trois autres, des plafonds à ne pas dépasser.',
  },

  target: {
    badge: 'Plus',
    title: 'Un objectif qui apprend ce que tu brûles vraiment.',
    body: 'Un calculateur devine à partir de ta taille et de ton poids. Au bout de quinze jours de repas notés et de pesées, on a mieux sur quoi s’appuyer : ce que *toi*, tu brûles. Chaque lundi, ton objectif suit les faits, et un court bilan t’explique pourquoi.',
    reviewDates: '11 – 17 août',
    reviewIntake:
      'Tu as mangé en moyenne 2 180 calories pour un objectif de 2 290, et tes protéines sont restées au-dessus de 150 g six jours sur sept. Ton poids a baissé de 0,4 kg en deux semaines.',
    reviewChange:
      'Ton objectif monte aujourd’hui : tu perds au rythme voulu tout en mangeant moins que ce qu’il permettait, donc l’ancien chiffre était trop bas.',
    reviewBasis: 'D’après 14 jours notés et 6 pesées. Plafonné à +200.',
    guardrailsTitle: 'Avant de toucher à quoi que ce soit',
    guardrails: [
      'D’abord, au moins 10 jours notés et 4 pesées.',
      'Jamais plus de 200 calories d’un coup, et moins si le suivi a été irrégulier.',
      'Une estimation très éloignée de ce que prévoit la formule est écartée, pas crue.',
      'Un objectif que tu as fixé toi-même n’est jamais modifié.',
    ],
    more: 'Comment se fait le calcul',
  },

  features: {
    title: 'Et tout ce qu’on attend d’un bon journal.',
    items: [
      {
        title: 'Fonctionne hors ligne',
        body: 'Note un repas dans l’avion ou dans une salle de sport en sous-sol. Il compte tout de suite et se synchronise dès que tu retrouves du réseau.',
      },
      {
        title: 'Widgets sur l’écran d’accueil',
        body: 'Les calories restantes et les pas du jour, sans ouvrir l’appli.',
      },
      {
        title: 'Nombre de pas',
        body: 'Via Health Connect sur Android, ou le podomètre intégré du téléphone sur iPhone.',
      },
      {
        title: 'Séances de sport',
        body: 'Séries et répétitions pré-remplies d’après la dernière fois, parmi 220 exercices et tes propres séances types.',
      },
      {
        title: 'Recettes',
        body: 'Une centaine, classées selon ce qu’il y a dans ta cuisine et ce qu’il reste de ta journée.',
      },
      {
        title: 'Séries et récompenses',
        body: 'Quatorze badges à débloquer, sur tous les forfaits, Free compris.',
      },
      {
        title: 'La journée finit quand tu te couches',
        body: 'Un en-cas à 1 h du matin compte pour la soirée à laquelle il appartient. Place la limite là où ta journée finit vraiment.',
      },
      {
        title: 'Le sport se note, il ne se mange pas',
        body: 'Une course apparaît dans ta journée et dans tes tendances. Elle ne gonfle pas ton budget calories en douce.',
      },
      {
        title: 'Treize langues',
        body: 'Toute l’appli, du bulgare au grec. Décris tes repas dans la langue dans laquelle tu penses.',
      },
    ],
  },

  pricing: {
    title: 'Le journal est gratuit. Ce qui réfléchit coûte un peu.',
    body: 'Taper un repas et additionner la journée, ça se passe sur ton téléphone : c’est donc gratuit, pour toujours. Comprendre une phrase ou une photo demande un modèle d’IA, et c’est cette partie-là qui a un coût.',
    period: 'Période de facturation',
    monthly: 'Mensuel',
    yearly: 'Annuel',
    saving: '−12 %',
    recommended: 'Recommandé',
    plans: [
      {
        name: 'Free',
        monthly: 'Gratuit',
        annual: 'Gratuit',
        monthlyCadence: 'aussi longtemps que tu veux',
        annualCadence: 'aussi longtemps que tu veux',
        pitch: 'Tout le journal, même en avion.',
        allowance: [
          { figure: '10', unit: 'messages', period: 'par mois' },
          { figure: '1', unit: 'scan de photo', period: 'pour essayer' },
        ],
        points: [
          'Taper tes repas, les répéter et scanner les codes-barres — en illimité',
          'Ta journée, ton historique, ton poids et tes tendances',
          'Widgets, séances de sport, recettes, séries et récompenses',
        ],
        cta: 'Commencer sur Free',
      },
      {
        name: 'Plus',
        monthly: '9,99 €',
        annual: '104,99 €',
        monthlyCadence: 'par mois, résiliable à tout moment',
        annualCadence: 'par an — soit 8,75 € par mois',
        pitch: 'Parle-lui au lieu de taper.',
        allowance: [
          { figure: '90', unit: 'messages', period: 'par mois' },
          { figure: '8', unit: 'scans de photo', period: 'par mois' },
        ],
        points: [
          'Tout ce qu’il y a dans Free',
          'Un bilan hebdomadaire de ce qu’a vraiment été ta semaine',
          'Un objectif qui s’ajuste aux faits',
          'Des messages et des scans de photo en plus, en packs, dès que tu en as besoin',
        ],
        cta: 'Prendre Plus',
      },
      {
        name: 'Coach',
        monthly: '25,99 €',
        annual: '254,99 €',
        monthlyCadence: 'par mois, résiliable à tout moment',
        annualCadence: 'par an — soit 21,25 € par mois',
        pitch: 'Et il t’aide à décider quoi manger ce soir.',
        allowance: [
          { figure: '180', unit: 'messages', period: 'par mois' },
          { figure: '25', unit: 'scans de photo', period: 'par mois' },
        ],
        points: [
          'Tout ce qu’il y a dans Plus',
          '10 scans de frigo par mois, transformés en recettes',
          '8 recettes par mois, écrites pour ce qu’il y a dans ta cuisine',
          '2 plans de la semaine par mois, dîners et liste de courses compris',
        ],
        cta: 'Prendre Coach',
      },
    ],
    notes: [
      'Tout compte démarre sur Free. Pas d’essai gratuit à penser à annuler.',
      'Les quotas se rechargent jour après jour sur 30 jours glissants : aucune date de remise à zéro à attendre.',
      'Plus de scans de photo ? Les packs démarrent à 4,09 € les dix, n’expirent jamais et ne servent qu’une fois ceux du mois épuisés.',
      'Tu arrêtes de payer ? Tu repasses sur Free : ton journal et ton historique restent, avec 10 messages par mois.',
    ],
    currency: 'Prix en euros. Google Play t’affiche le prix exact pour ton pays.',
  },

  faq: {
    title: 'Tes questions, nos réponses.',
    items: [
      {
        q: 'Faut-il peser ce que je mange ?',
        a: 'Non. Décris les portions comme tu les dirais — « un grand bol », « deux tranches ». Les estimations sont signalées comme telles, et une quantité pesée compte davantage quand ton objectif s’ajuste.',
      },
      {
        q: 'C’est précis ?',
        a: 'À peu près autant qu’une estimation soigneuse, et l’appli te dit quand elle devine. La façon dont c’est testé, et les cas où ça se trompe, sont décrits en détail.',
      },
      {
        q: 'C’est disponible sur iPhone ?',
        a: 'C’est déjà sur Android. L’appli iPhone est en cours de validation sur l’App Store, et le lien apparaîtra sur cette page le jour de sa sortie.',
      },
      {
        q: 'Ça marche sans Internet ?',
        a: 'Taper un repas, en répéter un et consulter ta journée : tout ça fonctionne hors ligne, et se synchronise quand tu te reconnectes. Les phrases, les photos et la recherche de codes-barres ont besoin d’une connexion.',
      },
      {
        q: 'Quelles langues l’appli parle-t-elle ?',
        a: 'Anglais, bulgare, allemand, espagnol, français, roumain, ukrainien, serbe, croate, tchèque, hongrois, grec et slovaque. Elle suit la langue de ton téléphone, et tu peux en changer quand tu veux.',
      },
      {
        q: 'Que se passe-t-il quand je n’ai plus de messages ?',
        a: 'Le journal continue de fonctionner : tu peux toujours taper tes repas, les répéter et scanner des codes-barres. Les messages se rechargent jour après jour, ou tu peux passer au forfait supérieur.',
      },
      {
        q: 'Comment résilier ?',
        a: 'Dans Google Play, rubrique Abonnements, quand tu veux. Tu gardes ce que tu as payé jusqu’à la fin de la période, puis tu repasses sur Free.',
      },
      {
        q: 'Vous vendez mes données ?',
        a: 'Non. Pas de pub, pas d’outils d’analyse, pas de traceurs, et rien n’est revendu. Ce qui est enregistré, à qui c’est transmis et combien de temps c’est conservé : tout est dans la politique de confidentialité.',
      },
      {
        q: 'Je suis coach en nutrition. Il y a quelque chose pour moi ?',
        a: 'Oui : un tableau de bord sur le web pour suivre les journées de tes clients, fixer leurs objectifs et laisser des commentaires, avec 30 jours d’essai gratuit. C’est indépendant du forfait Coach ci-dessus.',
      },
    ],
    accuracyLink: 'En savoir plus sur la précision',
    privacyLink: 'Lire la politique de confidentialité',
    coachLink: 'Ouvrir le tableau de bord coach',
  },

  privacy: {
    title: 'Tes repas restent à toi.',
    body: 'Pas d’outils d’analyse, pas de publicité, rien à vendre. Tes repas sont des lignes dans une base de données qui n’existe que pour répondre à une question : qu’as-tu mangé aujourd’hui ?',
    link: 'Lire la politique de confidentialité',
  },

  closing: {
    title: 'Commence par le petit-déjeuner.',
    body: 'La configuration prend une minute ou deux : ton objectif, ta taille et ton poids, et ton niveau d’activité. Ton objectif du jour est calculé à partir de là.',
  },

  footer: {
    howItWorks: 'Comment ça marche',
    accuracy: 'Précision',
    blog: 'Blog',
    recipes: 'Recettes',
    about: 'À propos',
    privacy: 'Confidentialité',
    terms: 'Conditions',
    languages: 'Cette page dans d’autres langues',
  },
};
