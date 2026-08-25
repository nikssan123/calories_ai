import type { Messages } from '@/lib/i18n';

/**
 * French.
 *
 * Second person singular and informal — "tu", never "vous". A calorie journal
 * is about as intimate as software gets, and "vous" would make it a form.
 *
 * Two typographic habits kept on purpose, because their absence is what makes
 * French text look machine-made: the narrow no-break space before `?`, `!` and
 * `:` — written here as a normal space, which is what the layout can actually
 * render — and the curly apostrophe in "aujourd’hui", never the straight one.
 *
 * French is also the reason `plural()` uses `Intl.PluralRules`: it puts zero in
 * the *singular* category, so "0 jour" is correct and "0 jours" is not. No
 * two-form helper can express that.
 */
export const fr: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  //
  // Six words that have to survive being read a hundred times a day, in a
  // 60px-wide target. Length is a constraint here, not a preference.
  'nav.journal': 'Journal',
  'nav.today': 'Aujourd’hui',
  'nav.progress': 'Progrès',
  'nav.exercise': 'Sport',
  'nav.cook': 'Cuisine',
  'nav.you': 'Profil',
  'nav.history': 'Historique',
  'nav.admin': 'Admin',
  'nav.signOut': 'Se déconnecter',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Aujourd’hui',
  'today.toGo': 'restantes',
  'today.over': 'au-dessus',
  'today.burned': (kcal: string) => `+${kcal} brûlées`,
  'today.viewCalendar': 'Voir le calendrier',
  'today.previousDay': 'Jour précédent',
  'today.nextDay': 'Jour suivant',
  'today.nothingLogged': 'Rien d’enregistré pour l’instant.',
  'today.nothingLoggedHint': 'Dis au journal ce que tu as mangé.',
  'today.logAgain': 'Enregistrer à nouveau',
  'today.weighed': 'Pesé',
  'today.weight': 'Poids',
  'today.exercise': 'Sport',
  'today.roughEstimate': 'estimation approximative',
  'today.changeHint': 'Pour le changer, dis-le dans le journal : « il y avait plus de riz ».',

  'meal.breakfast': 'Petit-déjeuner',
  'meal.lunch': 'Déjeuner',
  'meal.dinner': 'Dîner',
  'meal.snack': 'En-cas',

  'macro.protein': 'Protéines',
  'macro.carbs': 'Glucides',
  'macro.fat': 'Lipides',
  'macro.fiber': 'Fibres',

  // ---- History ------------------------------------------------------------
  'history.title': 'Historique',
  'history.thisMonth': 'Ce mois-ci',
  'history.previousMonth': 'Mois précédent',
  'history.nextMonth': 'Mois suivant',
  'history.avgIntake': 'Moyenne',
  'history.logged': 'Enregistrés',
  'history.exercise': 'Sport',
  'history.onTarget': 'Dans l’objectif',
  'history.under': 'En dessous',
  'history.over': 'Au-dessus',
  'history.noTarget': 'Sans objectif',
  'history.openInToday': 'Ouvrir dans Aujourd’hui →',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Deux œufs et une tartine…',
  'composer.send': 'Envoyer',
  'composer.addPhoto': 'Ajouter une photo ou scanner un emballage',
  'composer.takePhoto': 'Prendre une photo',
  'composer.choosePhoto': 'Choisir une photo',
  'composer.scanBarcode': 'Scanner un code-barres',
  'composer.removePhoto': 'Retirer la photo',
  'composer.selectedMeal': 'Repas sélectionné',
  'composer.labelHint': 'Voici l’étiquette — enregistre ce que j’ai mangé à partir d’elle.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Profil',
  'setup.about': 'À propos de toi',
  'setup.account': 'Compte',
  'setup.appearance': 'Apparence',
  'setup.dangerZone': 'Attention',
  'setup.displayName': 'Nom',
  'setup.sex': 'Sexe',
  'setup.birthDate': 'Date de naissance',
  'setup.height': 'Taille',
  'setup.targetWeight': 'Poids cible',
  'setup.activity': 'Activité',
  'setup.goal': 'Objectif',
  'setup.units': 'Unités',
  'setup.language': 'Langue',
  'setup.dayStartsAt': 'La journée commence à',
  'setup.timezone': 'Fuseau horaire',
  'setup.email': 'E-mail',
  'setup.addressConfirmed': 'Adresse confirmée',
  'setup.addressNotConfirmed': 'Adresse non confirmée',
  'setup.deleteAccount': 'Supprimer le compte',
  'setup.deleteFailed': 'Le compte n’a pas pu être supprimé.',
  'setup.contactSupport': 'Contacter le support',
  'setup.save': 'Enregistrer',
  'setup.saving': 'Enregistrement…',
  'setup.saved': 'Enregistré',

  // ---- Configuration inachevée ---------------------------------------------
  'setup.placeholder': 'Ces chiffres sont provisoires.',
  'setup.placeholderAction': 'Terminez la configuration dans le journal.',
  'setup.inProgress': 'Configuration en cours — votre objectif est provisoire en attendant.',

  'sex.male': 'Homme',
  'sex.female': 'Femme',

  'goal.lose': 'Perdre',
  'goal.maintain': 'Maintenir',
  'goal.gain': 'Prendre',

  'activity.sedentary': 'Sédentaire',
  'activity.light': 'Léger',
  'activity.moderate': 'Modéré',
  'activity.active': 'Actif',
  'activity.veryActive': 'Très actif',

  'units.metric': 'Métrique',
  'units.imperial': 'Impérial',

  'theme.system': 'Système',
  'theme.light': 'Clair',
  'theme.dark': 'Sombre',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Se connecter',
  'auth.signInSubtitle': 'Connecte-toi et reprends où tu t’es arrêté.',
  'auth.createAccount': 'Créer un compte',
  'auth.createAccountTitle': 'Crée ton compte',
  'auth.email': 'E-mail',
  'auth.password': 'Mot de passe',
  'auth.passwordHint': 'Au moins 8 caractères.',
  'auth.nameOptional': 'Nom (facultatif)',
  'auth.continueWithGoogle': 'Continuer avec Google',
  'auth.forgotPassword': 'Mot de passe oublié ?',
  'auth.haveAccount': 'Tu as déjà un compte ?',
  'auth.newHere': 'Nouveau ici ?',
  'auth.signupsClosed': 'Les inscriptions sont fermées sur ce serveur.',
  'auth.googleFailed': 'Google n’a pas pu te connecter. Réessaie, ou utilise ton e-mail et ton mot de passe.',
  'auth.genericFailure': 'Quelque chose s’est mal passé à la connexion. Réessaie.',
  'auth.oneMoment': 'Un instant…',
  'auth.privacyPolicy': 'Politique de confidentialité',
  'auth.language': 'Langue',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Regarde tes e-mails',
  'verify.sentTo': (email: string) => `On a envoyé six chiffres à ${email}. Saisis-les et c’est bon.`,
  'verify.sentBlind': 'On t’a envoyé six chiffres. Saisis-les et c’est bon.',
  'verify.title': 'Confirme ton e-mail',
  'verify.checkInbox': 'Regarde ta boîte de réception',
  'verify.enterCode': 'Saisis le code',
  'verify.sixDigitCode': 'Code à six chiffres',
  'verify.confirm': 'Confirmer',
  'verify.confirming': 'Confirmation…',
  'verify.confirmed': 'E-mail confirmé',
  'verify.alreadyConfirmed': 'Déjà confirmé',
  'verify.readyMessage': 'Cette adresse est prête.',
  'verify.sendNewCode': 'Envoyer un nouveau code',
  'verify.sending': 'Envoi…',
  'verify.startJournal': 'Commencer le journal',
  'verify.signInFirst': 'Connecte-toi d’abord, puis saisis le code qu’on t’a envoyé.',
  'verify.signOutAndRestart': 'Se déconnecter et recommencer',
  'verify.linkFailed': 'Ce lien n’a pas fonctionné',

  // ---- Words the whole app uses -------------------------------------------
  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.delete': 'Supprimer',
  'common.done': 'Terminé',
  'common.add': 'Ajouter',
  'common.edit': 'Modifier',
  'common.close': 'Fermer',
  'common.retry': 'Réessayer',
  'common.loading': 'Chargement…',
  'common.today': 'Aujourd’hui',
  'common.yesterday': 'Hier',
};
