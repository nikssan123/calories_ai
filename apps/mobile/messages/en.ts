/**
 * The English catalogue for the native app, and the shape every other one is
 * checked against.
 *
 * Deliberately its own file rather than an import from `apps/web/messages`.
 * The two apps do not say all the same things — the phone has a scanner and a
 * share sheet, the web has a sidebar and a keyboard hint — and a shared
 * catalogue would make every string either present on both or awkwardly
 * conditional on neither. What they do share is the *keys* for the things they
 * both draw, so a translator moving between them recognises them.
 *
 * See the web twin for the conventions: keys read like sentences, a message
 * that takes a number is a function, and food names, numbers and units are
 * never in here at all.
 */
export const en = {
  // ---- The tab bar and the sidebar ---------------------------------------
  //
  // Six words that have to survive being read a hundred times a day, in a
  // 60px-wide target. Length is a constraint here, not a preference.
  'nav.journal': 'Journal',
  'nav.today': 'Today',
  'nav.progress': 'Progress',
  'nav.exercise': 'Exercise',
  'nav.cook': 'Cook',
  'nav.you': 'You',
  'nav.history': 'History',
  'nav.admin': 'Admin',
  'nav.signOut': 'Sign out',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Today',
  /** The ring's caption under the figure. Two words at the outside. */
  'today.toGo': 'to go',
  'today.over': 'over',
  'today.burned': (kcal: string) => `+${kcal} burned`,
  'today.viewCalendar': 'View calendar',
  'today.previousDay': 'Previous day',
  'today.nextDay': 'Next day',
  'today.nothingLogged': 'Nothing logged yet.',
  'today.nothingLoggedHint': 'Tell the journal what you ate.',
  'today.logAgain': 'Log again',
  'today.weighed': 'Weighed',
  'today.weight': 'Weight',
  'today.exercise': 'Exercise',
  'today.roughEstimate': 'rough estimate',
  'today.changeHint': 'To change this, say so in the journal — “there was more rice”.',

  'meal.breakfast': 'Breakfast',
  'meal.lunch': 'Lunch',
  'meal.dinner': 'Dinner',
  'meal.snack': 'Snacks',

  'macro.protein': 'Protein',
  'macro.carbs': 'Carbs',
  'macro.fat': 'Fat',
  'macro.fiber': 'Fibre',

  // ---- History ------------------------------------------------------------
  'history.title': 'History',
  'history.thisMonth': 'This month',
  'history.previousMonth': 'Previous month',
  'history.nextMonth': 'Next month',
  'history.avgIntake': 'Avg intake',
  'history.logged': 'Logged',
  'history.exercise': 'Exercise',
  'history.onTarget': 'On target',
  'history.under': 'Under',
  'history.over': 'Over',
  'history.noTarget': 'No target',
  'history.openInToday': 'Open in Today →',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Two eggs and toast…',
  'composer.send': 'Send',
  'composer.addPhoto': 'Add a photo or scan a packet',
  'composer.takePhoto': 'Take a photo',
  'composer.choosePhoto': 'Choose a photo',
  'composer.scanBarcode': 'Scan a barcode',
  'composer.removePhoto': 'Remove photo',
  'composer.selectedMeal': 'Selected meal',
  'composer.labelHint': 'This is the label — log what I ate off it.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'You',
  'setup.about': 'About you',
  'setup.account': 'Account',
  'setup.appearance': 'Appearance',
  'setup.dangerZone': 'Danger zone',
  'setup.displayName': 'Name',
  'setup.sex': 'Sex',
  'setup.birthDate': 'Date of birth',
  'setup.height': 'Height',
  'setup.targetWeight': 'Target weight',
  'setup.activity': 'Activity',
  'setup.goal': 'Goal',
  'setup.units': 'Units',
  /** The row this whole feature is for. */
  'setup.language': 'Language',
  'setup.dayStartsAt': 'Day starts at',
  'setup.timezone': 'Time zone',
  'setup.email': 'Email',
  'setup.addressConfirmed': 'Address confirmed',
  'setup.addressNotConfirmed': 'Address not confirmed',
  'setup.deleteAccount': 'Delete account',
  'setup.deleteFailed': 'Could not delete the account.',
  'setup.contactSupport': 'Contact support',
  'setup.save': 'Save',
  'setup.saving': 'Saving…',
  'setup.saved': 'Saved',

  'sex.male': 'Male',
  'sex.female': 'Female',

  'goal.lose': 'Lose',
  'goal.maintain': 'Maintain',
  'goal.gain': 'Gain',

  'activity.sedentary': 'Sedentary',
  'activity.light': 'Light',
  'activity.moderate': 'Moderate',
  'activity.active': 'Active',
  'activity.veryActive': 'Very active',

  'units.metric': 'Metric',
  'units.imperial': 'Imperial',

  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Sign in',
  'auth.signInSubtitle': 'Sign in to pick up where you left off.',
  'auth.createAccount': 'Create account',
  'auth.createAccountTitle': 'Create your account',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordHint': 'At least 8 characters.',
  'auth.nameOptional': 'Name (optional)',
  'auth.continueWithGoogle': 'Continue with Google',
  'auth.forgotPassword': 'Forgot your password?',
  'auth.haveAccount': 'Already have an account?',
  'auth.newHere': 'New here?',
  'auth.signupsClosed': 'Sign-ups are closed on this server.',
  'auth.googleFailed': 'Google could not sign you in. Try again, or use your email and password.',
  'auth.genericFailure': 'Something went wrong signing in. Try again.',
  'auth.oneMoment': 'Just a moment…',
  'auth.privacyPolicy': 'Privacy Policy',
  /** The pre-account language picker's label. Sits on the sign-in screen. */
  'auth.language': 'Language',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Check your email',
  'verify.sentTo': (email: string) => `We sent six digits to ${email}. Enter them and you're in.`,
  'verify.sentBlind': 'We sent you six digits. Enter them and you’re in.',
  'verify.title': 'Confirm your email',
  'verify.checkInbox': 'Check your inbox',
  'verify.enterCode': 'Enter the code',
  'verify.sixDigitCode': 'Six-digit code',
  'verify.confirm': 'Confirm',
  'verify.confirming': 'Confirming…',
  'verify.confirmed': 'Email confirmed',
  'verify.alreadyConfirmed': 'Already confirmed',
  'verify.readyMessage': 'This address is set up and ready.',
  'verify.sendNewCode': 'Send a new code',
  'verify.sending': 'Sending…',
  'verify.startJournal': 'Start your journal',
  'verify.signInFirst': 'Sign in first, then enter the code we emailed you.',
  'verify.signOutAndRestart': 'Sign out and start again',
  'verify.linkFailed': 'That link didn’t work',

  // ---- Words the whole app uses -------------------------------------------
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.done': 'Done',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
} as const;
