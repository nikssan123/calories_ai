import type { Messages } from '@/lib/i18n';

/**
 * German.
 *
 * Second person singular and informal throughout — "du", never "Sie". The
 * English copy says "you" the way a friend does, and "Sie" would make the same
 * sentences correct, polite, and about a different product.
 *
 * **The length case.** German is why this language was picked second: it is the
 * layout stress test. `nav.progress` is "Fortschritt" — eleven characters
 * against English's five-character "Today" — and it is the widest label the tab
 * bar has ever had to draw. It is the accurate word and it stays; if it clips
 * on a narrow phone, the bar's type size is the thing to change, not the
 * German. Look at it on a real device before assuming either way.
 */
export const de: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  //
  // Six words that have to survive being read a hundred times a day, in a
  // 60px-wide target. Length is a constraint here, not a preference.
  'nav.journal': 'Journal',
  'nav.today': 'Heute',
  'nav.progress': 'Fortschritt',
  'nav.exercise': 'Sport',
  'nav.cook': 'Küche',
  'nav.you': 'Profil',
  'nav.history': 'Verlauf',
  'nav.admin': 'Admin',
  'nav.signOut': 'Abmelden',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Heute',
  'today.toGo': 'übrig',
  'today.over': 'darüber',
  'today.burned': (kcal: string) => `+${kcal} verbrannt`,
  'today.viewCalendar': 'Kalender ansehen',
  'today.previousDay': 'Vorheriger Tag',
  'today.nextDay': 'Nächster Tag',
  'today.nothingLogged': 'Noch nichts erfasst.',
  'today.nothingLoggedHint': 'Sag dem Journal, was du gegessen hast.',
  'today.logAgain': 'Nochmal erfassen',
  'today.weighed': 'Gewogen',
  'today.weight': 'Gewicht',
  'today.exercise': 'Sport',
  'today.roughEstimate': 'grobe Schätzung',
  'today.changeHint': 'Sag es einfach im Journal, um das zu ändern — „es war mehr Reis“.',

  'meal.breakfast': 'Frühstück',
  'meal.lunch': 'Mittagessen',
  'meal.dinner': 'Abendessen',
  'meal.snack': 'Snacks',

  'macro.protein': 'Eiweiß',
  'macro.carbs': 'Kohlenhydrate',
  'macro.fat': 'Fett',
  'macro.fiber': 'Ballaststoffe',

  // ---- History ------------------------------------------------------------
  'history.title': 'Verlauf',
  'history.thisMonth': 'Dieser Monat',
  'history.previousMonth': 'Vorheriger Monat',
  'history.nextMonth': 'Nächster Monat',
  'history.avgIntake': 'Schnitt',
  'history.logged': 'Erfasst',
  'history.exercise': 'Sport',
  'history.onTarget': 'Im Ziel',
  'history.under': 'Darunter',
  'history.over': 'Darüber',
  'history.noTarget': 'Kein Ziel',
  'history.openInToday': 'In Heute öffnen →',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Zwei Eier und Toast…',
  'composer.send': 'Senden',
  'composer.addPhoto': 'Foto hinzufügen oder Packung scannen',
  'composer.takePhoto': 'Foto aufnehmen',
  'composer.choosePhoto': 'Foto auswählen',
  'composer.scanBarcode': 'Barcode scannen',
  'composer.removePhoto': 'Foto entfernen',
  'composer.selectedMeal': 'Ausgewählte Mahlzeit',
  'composer.labelHint': 'Das ist das Etikett — erfasse danach, was ich gegessen habe.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Profil',
  'setup.about': 'Über dich',
  'setup.account': 'Konto',
  'setup.appearance': 'Darstellung',
  'setup.dangerZone': 'Achtung',
  'setup.displayName': 'Name',
  'setup.sex': 'Geschlecht',
  'setup.birthDate': 'Geburtsdatum',
  'setup.height': 'Größe',
  'setup.targetWeight': 'Zielgewicht',
  'setup.activity': 'Aktivität',
  'setup.goal': 'Ziel',
  'setup.units': 'Einheiten',
  'setup.language': 'Sprache',
  'setup.dayStartsAt': 'Tag beginnt um',
  'setup.timezone': 'Zeitzone',
  'setup.email': 'E-Mail',
  'setup.addressConfirmed': 'Adresse bestätigt',
  'setup.addressNotConfirmed': 'Adresse nicht bestätigt',
  'setup.deleteAccount': 'Konto löschen',
  'setup.deleteFailed': 'Das Konto konnte nicht gelöscht werden.',
  'setup.contactSupport': 'Support kontaktieren',
  'setup.save': 'Speichern',
  'setup.saving': 'Wird gespeichert…',
  'setup.saved': 'Gespeichert',

  // ---- Einrichtung noch nicht abgeschlossen --------------------------------
  'setup.placeholder': 'Diese Zahlen sind vorläufig.',
  'setup.placeholderAction': 'Schließe die Einrichtung im Journal ab.',
  'setup.inProgress': 'Einrichtung läuft — dein Ziel ist vorläufig, bis wir fertig sind.',

  'sex.male': 'Männlich',
  'sex.female': 'Weiblich',

  'goal.lose': 'Abnehmen',
  'goal.maintain': 'Halten',
  'goal.gain': 'Zunehmen',

  'activity.sedentary': 'Sitzend',
  'activity.light': 'Leicht',
  'activity.moderate': 'Mittel',
  'activity.active': 'Aktiv',
  'activity.veryActive': 'Sehr aktiv',

  'units.metric': 'Metrisch',
  'units.imperial': 'Imperial',

  'theme.system': 'System',
  'theme.light': 'Hell',
  'theme.dark': 'Dunkel',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Anmelden',
  'auth.signInSubtitle': 'Melde dich an und mach da weiter, wo du aufgehört hast.',
  'auth.createAccount': 'Konto erstellen',
  'auth.createAccountTitle': 'Erstelle dein Konto',
  'auth.email': 'E-Mail',
  'auth.password': 'Passwort',
  'auth.passwordHint': 'Mindestens 8 Zeichen.',
  'auth.nameOptional': 'Name (optional)',
  'auth.continueWithGoogle': 'Weiter mit Google',
  'auth.forgotPassword': 'Passwort vergessen?',
  'auth.haveAccount': 'Schon ein Konto?',
  'auth.newHere': 'Neu hier?',
  'auth.signupsClosed': 'Auf diesem Server sind keine Registrierungen möglich.',
  'auth.googleFailed': 'Google konnte dich nicht anmelden. Versuch es nochmal oder nimm E-Mail und Passwort.',
  'auth.genericFailure': 'Bei der Anmeldung ist etwas schiefgelaufen. Versuch es nochmal.',
  'auth.oneMoment': 'Einen Moment…',
  'auth.privacyPolicy': 'Datenschutzerklärung',
  'auth.language': 'Sprache',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Sieh in deine E-Mails',
  'verify.sentTo': (email: string) => `Wir haben sechs Ziffern an ${email} geschickt. Gib sie ein und du bist drin.`,
  'verify.sentBlind': 'Wir haben dir sechs Ziffern geschickt. Gib sie ein und du bist drin.',
  'verify.title': 'Bestätige deine E-Mail',
  'verify.checkInbox': 'Sieh in dein Postfach',
  'verify.enterCode': 'Code eingeben',
  'verify.sixDigitCode': 'Sechsstelliger Code',
  'verify.confirm': 'Bestätigen',
  'verify.confirming': 'Wird bestätigt…',
  'verify.confirmed': 'E-Mail bestätigt',
  'verify.alreadyConfirmed': 'Bereits bestätigt',
  'verify.readyMessage': 'Diese Adresse ist eingerichtet und bereit.',
  'verify.sendNewCode': 'Neuen Code senden',
  'verify.sending': 'Wird gesendet…',
  'verify.startJournal': 'Journal starten',
  'verify.signInFirst': 'Melde dich zuerst an und gib dann den Code aus der E-Mail ein.',
  'verify.signOutAndRestart': 'Abmelden und neu beginnen',
  'verify.linkFailed': 'Der Link hat nicht funktioniert',

  // ---- Words the whole app uses -------------------------------------------
  'common.save': 'Speichern',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.done': 'Fertig',
  'common.add': 'Hinzufügen',
  'common.edit': 'Bearbeiten',
  'common.close': 'Schließen',
  'common.retry': 'Nochmal versuchen',
  'common.loading': 'Wird geladen…',
  'common.today': 'Heute',
  'common.yesterday': 'Gestern',
};
