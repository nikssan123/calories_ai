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
import { pluralFor, pluralWordFor } from '@ct/shared';

/**
 * This language's plural categories, bound once at the top of the file. Same
 * deal as the web twin — see `plural()` in `shared/locale.ts`.
 */
const n = pluralFor('en');
/** The agreeing noun without its number, for the paywall's sentences. */
const w = pluralWordFor('en');

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
  'today.exerciseFooter': 'Shown separately from your target — exercise burn is a rough estimate.',
  'today.exerciseTitle': '🏃  Exercise',
  'today.thatChange': 'That change',
  'today.couldNotSave': (what: string, reason: string) => `${what} could not be saved. ${reason}`,
  'today.waitingToSync': (count: number) =>
    n(count, { one: 'change waiting to sync', other: 'changes waiting to sync' }),
  'today.lastSavedDay': ' · showing your last saved day',
  'today.offlineDay': 'Offline — showing your last saved day.',
  'today.unsent': ' · waiting to sync',
  'today.macroLine': (protein: string, carbs: string, fat: string) =>
    `${protein}P · ${carbs}C · ${fat}F`,
  'today.changeHint': 'To change this, say so in the journal — “there was more rice”.',

  'meal.breakfast': 'Breakfast',
  'meal.lunch': 'Lunch',
  'meal.dinner': 'Dinner',
  'meal.snack': 'Snacks',
  /** One snack, as a card labels it. `meal.snack` is the plural heading. */
  'meal.snackOne': 'Snack',

  'macro.protein': 'Protein',
  'macro.carbs': 'Carbs',
  'macro.fat': 'Fat',
  'macro.fiber': 'Fibre',
  /** One letter each, for the macro bar's legend. See the web twin. */
  'macro.proteinInitial': 'P',
  'macro.carbsInitial': 'C',
  'macro.fatInitial': 'F',

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
  'history.day': 'Day',
  'history.nothingThatDay': 'Nothing logged that day.',
  'history.nothingYet': 'Nothing logged yet.',
  'history.days': 'days',
  'history.back': 'Back',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Two eggs and toast…',
  'composer.send': 'Send',
  'composer.addPhoto': 'Add a photo or scan a packet',
  'composer.takePhoto': 'Take a photo',
  'composer.choosePhoto': 'Choose a photo',
  'composer.scanBarcode': 'Scan a barcode',
  'composer.removePhoto': 'Remove photo',
  'composer.setAmountFor': (name: string) => `Set the amount for ${name}`,
  'composer.removeScan': (name: string) => `Remove ${name}`,
  'composer.cameraBlockedTitle': 'Day So Far cannot open the camera',
  'composer.cameraBlockedBody':
    'Camera access is turned off for this app, so iOS will not open it. Turn it on in Settings, or choose a photo from your library instead.',
  'composer.openSettings': 'Open Settings',
  'composer.notNow': 'Not now',
  'composer.photoUnreadable': 'That photo could not be read. Try another one.',
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
  'setup.deleteTypeEmail': 'Type the address above to confirm. This account signs in with Google, so there is no password to check.',
  'setup.deleteAccount': 'Delete account',
  'setup.deleteFailed': 'Could not delete the account.',
  'setup.contactSupport': 'Contact support',
  'setup.save': 'Save',
  'setup.saving': 'Saving…',
  'setup.saved': 'Saved',
  /**
   * The receipt for a save that could have moved the daily target.
   *
   * Two numbers rather than a word, because "Saved" cannot tell the difference
   * between a target that moved a long way and one the server declined to
   * touch — and the second case is the one somebody is owed an answer about.
   */
  'setup.savedTargetMoved': (from: string, to: string) => `Saved — daily target ${from} → ${to} kcal`,
  'setup.savedTargetSame': (kcal: string) => `Saved — daily target unchanged at ${kcal} kcal`,
  'setup.activitySedentary': 'Desk job, little exercise',
  'setup.activityLight': 'Light exercise 1–3 days/week',
  'setup.activityModerate': 'Moderate exercise 3–5 days/week',
  'setup.activityActive': 'Hard exercise 6–7 days/week',
  'setup.activityVeryActive': 'Physical job or twice-daily training',
  'setup.dailyTarget': 'Your daily target',
  'setup.optional': 'Optional',
  'setup.dayTitle': 'Day',
  'setup.dayFooter':
    'Food eaten before the day starts counts toward the previous day — so a 1am snack lands on the evening it belongs to.',
  'setup.appearanceFooter': 'System follows your device, including its light and dark schedule.',
  'setup.signedInAs': 'Signed in as',
  'setup.aboutTitle': 'About',
  'setup.privacyPolicy': 'Privacy policy',
  'setup.termsOfService': 'Terms of service',
  'setup.unsavedChanges': 'Unsaved changes',
  'setup.saveChanges': 'Save changes',

  /**
   * Said when somebody empties a field the target cannot be computed without.
   * Refused rather than reverted — see `save()` in `app/(tabs)/setup.tsx`.
   */
  'setup.requiredMissing':
    'Sex, date of birth, height, goal and activity are all needed to work out your target.',

  // ---- The first run ------------------------------------------------------
  //
  // The setup wizard, which is the first thing a new account sees and the only
  // screen in the app most people will read every word of. Two rules run
  // through the whole of it, both inherited from the conversation it replaced:
  // a question is asked in the words somebody would use out loud, and nothing
  // explains why the app wants to know unless the answer is genuinely not
  // obvious. "How tall are you" needs no preamble.
  'ob.back': 'Back',
  'ob.continue': 'Continue',

  'ob.welcomeTitle': 'Let’s build your plan',
  'ob.welcomeBody':
    'Six quick questions — about half a minute — and you’ll have a calorie and protein target worked out for your body rather than for nobody in particular. You can change any of it later.',
  'ob.welcomeStart': 'Get started',

  'ob.goalTitle': 'What are you here to do?',
  'ob.goalBody': 'This sets whether your day sits under, at, or over what you burn.',
  'ob.goalLose': 'Lose weight',
  'ob.goalLoseHint': 'A steady deficit you can actually keep to',
  'ob.goalMaintain': 'Stay where I am',
  'ob.goalMaintainHint': 'Eat what you burn, and keep an eye on it',
  'ob.goalGain': 'Gain weight',
  'ob.goalGainHint': 'A small surplus, with the protein to use it',

  'ob.sexTitle': 'Which should we calculate for?',
  'ob.sexBody':
    'Resting burn differs enough that guessing would put your target out by a couple of hundred calories a day.',

  'ob.birthTitle': 'When were you born?',
  'ob.birthBody': 'Age is the last thing the burn calculation needs.',
  'ob.birthAge': (count: number) => n(count, { one: 'year old', other: 'years old' }),
  'ob.birthTooYoung': 'This app is for 13 and over.',
  'ob.birthImplausible': 'Check the year — that date looks off.',

  'ob.bodyTitle': 'Your height and weight',
  'ob.bodyBody':
    'Roughly is fine. The weight is logged as your first weigh-in, so the chart starts today.',
  'ob.bodyHeight': 'Height',
  'ob.bodyWeight': 'Weight',
  'ob.bodyHeightOff': 'That height looks off — check the units.',
  'ob.bodyWeightOff': 'That weight looks off — check the units.',

  /**
   * The two skips, and they read differently on purpose.
   *
   * The goal weight one stores nothing, so it promises nothing. The activity
   * one names the answer it writes, because `predictTdee` reads
   * `activity_level ?? 'moderate'` and a skip that quietly picked for you
   * without saying so would be a form answering its own question.
   */
  'ob.skip': 'Skip for now',
  'ob.activitySkip': 'Not sure — assume moderate',

  'ob.targetTitle': 'What are you aiming for?',
  'ob.targetBody': 'A goal weight, so the app can say how far along you are. Move it any time.',
  /** `amount` arrives with its unit — "8.5 kg", "19 lb". */
  'ob.targetToGo': (amount: string) => `${amount} to go`,
  'ob.targetSame': 'The same as where you are now',
  'ob.targetMustBeLower': 'Pick something below your current weight.',
  'ob.targetMustBeHigher': 'Pick something above your current weight.',

  'ob.activityTitle': 'How much do you move?',
  'ob.activityBody': 'Your ordinary week — not counting workouts you log in the app.',

  'ob.buildingTitle': 'Building your plan',
  'ob.buildingStep1': 'Working out what you burn',
  'ob.buildingStep2': 'Setting your daily calories',
  'ob.buildingStep3': 'Splitting your protein, carbs and fat',
  'ob.buildingFailed': 'Your plan couldn’t be saved.',
  'ob.retry': 'Try again',

  'ob.planEyebrow': 'Your daily target',
  'ob.planCalories': 'calories a day',
  'ob.planFootnote':
    'A starting point, not a verdict. It adjusts each week from what you log and what the scale does.',
  'ob.planStart': 'Start logging',

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

  'theme.label': 'Theme',
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
  'auth.or': 'or',
  'auth.createAccountSubtitle':
    'Then tell the journal a little about yourself and it will work out your targets.',
  'auth.emailFirst': 'Put your email in first and I’ll send a link.',

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

  // ---- Cook ---------------------------------------------------------------
  //
  // The screen with the most sentences per pixel in the app, and the one where
  // an English string is most conspicuous — half of it is the model writing in
  // your language already, so the chrome around it saying "Find me something"
  // reads as a bug rather than as an untranslated label.
  'cook.title': 'Cook',
  'cook.kitchenEmpty': 'Your kitchen is empty',
  /** The kitchen chip's count. Ingredients, not meals. */
  'cook.things': (count: number) => n(count, { one: 'thing', other: 'things' }),
  'cook.toCheck': (count: number) => `· ${count} to check`,
  'cook.yourKitchen': 'Your kitchen',
  'cook.yourKitchenDesc': 'What I’ll cook from. It only has to be roughly right.',
  'cook.thinking': 'Thinking…',
  'cook.nothingLeftToday': 'Nothing left today',
  /** The primary button. Short enough to sit beside a filter toggle. */
  'cook.findMeSomething': 'Find me something',
  'cook.anythingSpecific': 'Anything specific?',
  'cook.anythingSpecificDesc':
    'All optional. Without any of it I still work from your kitchen and your day.',
  'cook.alreadyWriting': 'Already writing one…',
  'cook.noRunsLeft': 'No recipe runs left today',
  'cook.planTheWeek': 'Plan the week',
  'cook.forYou': 'For you',
  'cook.library': 'Library',
  'cook.searchLibrary': 'Search the library',
  /**
   * Split around the button's own name, which is emphasised in place. Every
   * language this ships in keeps verb-then-object here, so the two halves stay
   * two halves.
   */
  'cook.emptyBefore': 'Nothing yet. Press',
  'cook.emptyAfter':
    'and I’ll invent a recipe from what’s in your kitchen — or start from a photo, or a recipe you already have.',
  'cook.perPortion': 'per portion',
  /** `unit` is the library's own serving size, which is data and stays English. */
  'cook.per': (unit: string) => `per ${unit}`,
  'cook.nothingMatching': (query: string) => `Nothing matching “${query}”.`,
  'cook.libraryNote':
    'Real recipes from the USDA’s public-domain collection, sorted by how much of one you already have.',

  // The line printed over the skeletons while a run is in flight. It repeats
  // what was asked, which is the thing a spinner cannot say.
  'cook.writingAround': (things: string) => `Writing a recipe around the ${things} in your photo…`,
  'cook.writingFor': (asked: string) =>
    `Writing a recipe for “${asked}”, from what’s in your kitchen…`,
  'cook.writingPlain': 'Writing a recipe from what’s in your kitchen…',

  // The budget line under the button — what pressing it will do, and what it
  // is writing against. See CookPage for why this sentence earns its place.
  'cook.planLocked': 'Writing recipes is part of Coach.',
  'cook.runs': (count: number) => n(count, { one: 'recipe run', other: 'recipe runs' }),
  'cook.planSpent': (runs: string) => `That’s your ${runs} for today.`,
  'cook.planSpentBack': (when: string) => ` You’ll have another ${when}.`,
  'cook.planEmptyKitchen':
    'Your kitchen is empty, so I’ll suggest things one small shop would cover — and name what to buy.',
  'cook.planFromWants': 'I’ll work from what you asked for and what’s in your kitchen',
  'cook.planFromKitchen': 'I’ll invent a recipe from what’s in your kitchen',
  'cook.planAtTarget': (from: string) =>
    `${from} — and you’re at your target today, so I’ll keep it light.`,
  'cook.planAiming': (from: string, kcal: string, protein: string) =>
    `${from}, aiming at the ${kcal} kcal and ${protein}g protein you have left.`,

  // ---- The recipe brief ---------------------------------------------------
  'brief.anythingElse': 'Anything else?',
  'brief.wantsPlaceholder': '“one-pan”, “use up the spinach”, “no coriander”',
  'brief.time': 'Time',
  'brief.minutes': (count: number) => `${count} min`,
  'brief.meal': 'Meal',
  'brief.cook': 'Cook',
  'brief.justTonight': 'Just tonight',
  'brief.portions': (count: number) => n(count, { one: 'portion', other: 'portions' }),
  'brief.proteinAtLeast': 'Protein at least',
  'brief.caloriesAtMost': 'Calories at most',

  // ---- What you don’t eat -------------------------------------------------
  'diet.title': 'What you don’t eat',
  'diet.footer':
    'Applied to every recipe suggestion as a hard limit, not a preference. It does not change how the journal logs what you actually eat — tell it what you had and it records it.',
  'diet.none': 'No restriction',
  'diet.vegetarian': 'Vegetarian',
  'diet.vegan': 'Vegan',
  'diet.pescatarian': 'Pescatarian',
  'diet.avoidPlaceholder': 'Anything else — an allergy, a dislike',
  'diet.stopAvoiding': (item: string) => `Stop avoiding ${item}`,

  // ---- The fridge scan ----------------------------------------------------
  'scan.notAnImage': 'That file is not an image I can read.',
  'scan.noFood': 'I couldn’t make out any food in that photo.',
  'scan.added': (count: number) => `Added ${n(count, { one: 'thing', other: 'things' })}`,
  'scan.reading': 'Reading the photo…',
  'scan.fromPhoto': 'From a photo',
  'scan.scanMyFridge': 'Scan my fridge',
  'scan.whatICanSee': 'What I can see',
  'scan.tapWrong': 'Tap anything I got wrong.',
  'scan.alreadyListed': '· already listed',
  'scan.adding': 'Adding…',
  'scan.addToKitchen': 'Add to my kitchen',
  'scan.findingRecipes': 'Finding recipes…',
  'scan.cookWithThese': 'Cook with these',

  // ---- The kitchen list ---------------------------------------------------
  'pantry.addToList': 'Add to the list',
  'pantry.addPlaceholder': 'chicken, rice, peppers',
  'pantry.stillThere': (count: number) => `Still there? · ${count}`,
  'pantry.yes': 'Yes',
  'pantry.removed': (name: string) => `Removed ${name}`,
  'pantry.remove': (name: string) => `Remove ${name}`,
  'pantry.emptyHint': 'Nothing here yet. Type a few things above, or photograph your shelf.',
  'pantry.inTheKitchen': (count: number) => `In the kitchen · ${count}`,
  'pantry.staples': (count: number) => `Staples · ${count}`,

  // ---- A recipe you already have ------------------------------------------
  'import.chip': 'Paste one',
  'import.title': 'A recipe you already have',
  'import.desc': 'I’ll work out the calories and leave the cooking alone.',
  'import.unreadable': 'I couldn’t read that as a recipe.',
  'import.saved': (title: string, kcal: string) => `Saved ${title} — ${kcal} kcal a portion`,
  'import.placeholder':
    'Paste or type the recipe — ingredients and method, however you have it written.',
  'import.working': 'Working out the numbers…',
  'import.workOutMacros': 'Work out the macros',

  // ---- A recipe -----------------------------------------------------------
  'recipe.save': 'Save',
  'recipe.saved': 'Saved',
  'recipe.saveThis': 'Save this recipe',
  'recipe.unsaveThis': 'Unsave this recipe',
  'recipe.usesYour': (things: string) => `Uses your ${things}`,
  'recipe.fitsToday': 'Fits what’s left of today',
  'recipe.steps': (count: number) => n(count, { one: 'step', other: 'steps' }),
  'recipe.saveNamed': (title: string) => `Save ${title}`,
  'recipe.unsaveNamed': (title: string) => `Unsave ${title}`,
  'recipe.forPortions': (portions: string) => `for ${portions} portions`,
  'recipe.portionsCount': (count: number) => n(count, { one: 'portion', other: 'portions' }),
  'recipe.howToMakeIt': (steps: string) => `How to make it · ${steps}`,
  'recipe.ingredientsMakes': (portions: string) => `Ingredients · makes ${portions}`,
  'recipe.iAteThis': (kcal: string) => `I ate this · ${kcal} kcal`,
  'recipe.openFull': 'Open the full recipe',
  'recipe.backToCook': 'Back to Cook',
  'recipe.logged': (what: string, kcal: string) => `Logged ${what} — ${kcal} kcal`,
  'recipe.forServings': (servings: string, unit: string) => `for ${servings} × ${unit}`,
  'recipe.publicDomain': 'public domain',
  'recipe.iAteThisPlain': (kcal: string) => `I ate this · ${kcal}`,
  'recipe.youdNeed': (things: string) => `You’d need ${things}`,
  'recipe.fromLibrary': 'From the library',
  'recipe.madeForYou': 'Made for you',
  'recipe.madeForKitchen': 'Made for your kitchen',
  'recipe.adaptedForYou': 'Adapted for you',
  'recipe.yourOwn': 'Your own recipe',
  'recipe.seeOriginal': 'See the original',
  'recipe.writtenAgainst': (kcal: string, date: string) =>
    ` Written against the ${kcal} kcal you had left on ${date}.`,
  'recipe.ingredients': 'Ingredients',
  'recipe.notInKitchen': '· not in your kitchen',
  'recipe.method': 'Method',
  'recipe.showMethod': 'Show the method',
  'recipe.hideMethod': 'Hide the method',
  'recipe.logging': 'Logging…',
  'recipe.yesTonight': 'yes, tonight',
  'recipe.yesNow': 'yes, now',
  'recipe.howMuch': 'How much did you have?',
  'recipe.less': 'Less',
  'recipe.more': 'More',
  'recipe.servingsCount': (servings: string) => `${servings} servings`,
  'recipe.portion': 'portion',
  'recipe.makeItFit': 'Make it fit me',
  'recipe.reworking': 'Reworking…',
  'recipe.notInLibrary': 'That recipe isn’t in the library.',
  'recipe.notHere': 'That recipe isn’t here any more.',
  'recipe.nothingCameBack': 'Nothing came back from that.',
  'recipe.ingredientsNote':
    'Measured for the finished dish, as published — so there are no per-ingredient numbers to show.',
  /** How much to trust the numbers. Three sentences, warmest to bluntest. */
  'recipe.confidenceHigh': 'The numbers here are as good as this app gets without weighing anything.',
  'recipe.confidenceMedium':
    'The numbers are an estimate — close enough to log, worth a second look if it matters.',
  'recipe.confidenceLow': 'These numbers are a rough guess. Weigh what you can if the day is tight.',

  // ---- Progress -----------------------------------------------------------
  //
  // Emoji stay inside the string: they are the same picture in every language,
  // and splitting them out would mean five call sites concatenating a heading.
  'progress.title': 'Progress',
  'progress.daysWindow': (count: number) => `${count} days`,
  'progress.daysShort': (count: number) => `${count}d`,
  'progress.weightTitle': '⚖️  Weight',
  'progress.noWeighIns': 'No weigh-ins yet. Log one below, or just tell the journal.',
  'progress.noWeighIn': 'No weigh-in',
  'progress.trendReadout': (value: string) => `7-day avg ${value} — the line`,
  'progress.thisWeek': 'this week',
  'progress.avg7d': '7-day avg',
  'progress.sinceStart': 'Since start',
  'progress.toTarget': 'To target',
  'progress.logTodaysWeight': (unit: string) => `Log today’s weight (${unit})`,
  'progress.caloriesTitle': '🔥  Calories',
  'progress.avgDayTarget': (target: string) => `avg/day · target ${target}`,
  'progress.proteinTitle': '💪  Protein',
  /**
   * Split around the emphasised count, which is bold in place. The middle is
   * its own key so a language can put the two numbers together its own way.
   */
  'progress.hitTargetBefore': 'Hit the target on',
  'progress.ofDays': (hit: string, logged: string) => `${hit} of ${logged}`,
  'progress.hitTargetAfter': 'logged days.',
  'progress.qualityTitle': '🥦  Diet quality',
  'progress.days': (count: number) => n(count, { one: 'day', other: 'days' }),
  'progress.qualityFooter': (days: string, percent: string) =>
    `Averaged over ${days} — ${percent}% of what you logged carries these figures.`,
  'progress.chartNutrient': (label: string) => `Chart ${label}`,
  'progress.exerciseTitle': '🏃  Exercise',
  'progress.exerciseFooter':
    'Ask the journal anything about this data — “why haven’t I lost weight this week?”',
  'progress.sessionsOver': (kcal: string, days: string) =>
    `sessions · ~${kcal} kcal over ${days} days`,
  'progress.qualityLine': (label: string, aim: string, target: string) =>
    `${label} avg/day · ${aim} ${target}`,
  'progress.aimFor': 'aim for',
  'progress.keepUnder': 'keep under',

  // ---- Exercise -----------------------------------------------------------
  'exercise.title': 'Exercise',
  'exercise.nothingLogged': (days: string) => `Nothing logged in the last ${days} days.`,
  /** `example` is a distance in this person's own units — "5km", "3 mile". */
  'exercise.tellTheJournal': (example: string) => `Tell the journal — “went for a ${example} run”.`,
  'exercise.consistencyTitle': '🔁  Consistency',
  'exercise.activeOf': (days: string, sessions: string) => `active of ${days} days · ${sessions}`,
  'exercise.sessionsCount': (count: number) => n(count, { one: 'session', other: 'sessions' }),
  'exercise.burnedPerDay': 'Calories burned per day',
  'exercise.burned': 'Burned',
  'exercise.distance': 'Distance',
  'exercise.time': 'Time',
  'exercise.sessionsTitle': '🏃  Sessions',
  'exercise.burnNote': (example: string) =>
    `Burn is an estimate and is never netted off your calorie target. Correct one in the journal — “that run was closer to ${example}”.`,
  'exercise.minutes': (minutes: string) => `${minutes} min`,
  'exercise.restDay': 'Rest day',
  'exercise.moreSessions': (count: string) => `+${count} more`,

  // ---- Saved workouts -----------------------------------------------------
  'workouts.logTitle': '🏋️  Log a workout',
  'workouts.logAction': 'Log a workout',
  'workouts.savedTitle': '🏋️  Saved workouts',
  'workouts.buildOne': 'Build one',
  'workouts.reuseHint': 'One tap fills the whole card in, with the weights you used last time.',
  'workouts.whereSessionsGo':
    'Sessions you log appear in the history below. This list is only for workouts you want to repeat.',
  'workouts.loadFailed': 'Couldn’t load your saved workouts.',
  'workouts.noneSavedTitle': 'No workouts saved yet.',
  'workouts.noneSavedHint':
    'A saved workout is a list you reuse — log a session with its exercises and take the offer to name it, or build one here.',
  'workouts.exerciseCount': (count: number) => n(count, { one: 'exercise', other: 'exercises' }),
  'workouts.doneTimes': (times: string) => ` · done ${times}×`,
  'workouts.editNamed': (name: string) => `Edit ${name}`,
  'workouts.deleteNamed': (name: string) => `Delete ${name}`,
  'workouts.weekTitle': '🗓️  Your week',
  'workouts.weekFooter':
    'Days you set are fixed. Days you leave open follow whatever you actually keep doing.',
  'workouts.workoutFor': (day: string) => `Workout for ${day}`,
  'workouts.usually': (workout: string) => `${workout} — usually`,
  'workouts.youSetThis': 'you set this',
  'workouts.learned': 'learned',
  'workouts.editTitle': '✏️  Edit workout',
  'workouts.buildTitle': '🏋️  Build a workout',
  'workouts.icon': 'Icon',
  'workouts.namePlaceholder': 'Push, Chest day, Legs A…',
  'workouts.nameLabel': 'Workout name',
  'workouts.sets': (count: number) => n(count, { one: 'set', other: 'sets' }),
  'workouts.oneFewerSet': (exercise: string) => `One fewer set of ${exercise}`,
  'workouts.oneMoreSet': (exercise: string) => `One more set of ${exercise}`,
  'workouts.removeExercise': (exercise: string) => `Remove ${exercise}`,

  // ---- Resetting a password -----------------------------------------------
  'plan.title': 'This week',
  'plan.subtitle': 'Dinners, priced against your targets. One tap logs the night you cooked.',
  'plan.weekTitle': (range: string) => `📅  ${range}`,
  'plan.weekFooter': 'Open a night to read the method, or skip it if you are out.',
  'plan.nothingYet': 'Nothing planned for this week yet.',
  /** Split around the link into the journal, which is a word inside the sentence. */
  'plan.askInBefore': 'Fill the week in below, or ask for it in the',
  'plan.journal': 'journal',
  'plan.howToTitle': '🍳  How to plan the week',
  'plan.howToBefore':
    'This is the most expensive thing the kitchen does, so it runs once and you edit it after. Or say it in the',
  'plan.howToAfter': '— “plan my dinners this week, two of us, nothing over 30 minutes”.',
  'plan.anythingHappening': 'Anything happening this week?',
  'plan.wantsPlaceholder': '“out on Thursday”, “use up the squash”',
  'plan.howManyItFeeds': 'How many it feeds',
  'plan.howManyItFeedsHint': 'Every dinner is cooked for this many.',
  'plan.people': (count: number) => n(count, { one: 'person', other: 'people' }),
  'plan.cookOnce': 'Cook once, eat twice',
  'plan.cookOnceHint':
    'A bigger cook covers the night after it, so the week has fewer evenings at the stove.',
  'plan.longestCook': 'Longest cook',
  'plan.longestCookHint': 'No dinner in the week takes longer than this.',
  'plan.anyLength': 'Any length',
  'plan.any': 'Any',
  'plan.minutesShort': (minutes: string) => `${minutes}m`,
  'plan.minutesLabel': (minutes: string) => `${minutes} minutes`,
  'plan.writing': 'Writing the week…',
  'plan.again': 'Plan it again',
  'plan.planTheWeek': 'Plan the week',
  /** The figure itself is set larger and sits just before this. */
  'plan.kcalProtein': (protein: string) => `kcal · ${protein}g protein`,
  'plan.coversNext': 'Cooks enough for the next night too',
  'plan.coversMore': (nights: string) => `Cooks enough for ${nights} more nights`,
  'plan.cooked': 'Cooked',
  'plan.skipNamed': (day: string) => `Skip ${day}`,
  'plan.nothingPlanned': 'Nothing planned',
  'plan.nightsCount': (count: number) => n(count, { one: 'night', other: 'nights' }),

  'shopping.title': '🧺  Shopping list',
  'shopping.haveAlready': (things: string) =>
    `Left off because your kitchen has them: ${things}.`,
  'shopping.addToList': 'Add to the list',
  'shopping.placeholder': 'kitchen roll, bin bags',
  'shopping.addHint':
    'For anything no recipe would ask for. The ingredients below come from the week.',
  'shopping.empty': 'Nothing on the list yet. Plan the week, or write what you need.',
  'shopping.putBack': (name: string) => `Put ${name} back on the list`,
  'shopping.tickOff': (name: string) => `Tick off ${name}`,
  'shopping.takeOff': (name: string) => `Take ${name} off the list`,

  // ---- The barcode scanner ------------------------------------------------
  'barcode.isThisIt': 'Is this it?',
  'barcode.scanThePacket': 'Scan the packet',
  'barcode.sayHowMuch': 'Say how much of it you had.',
  'barcode.pointAtIt': 'Point at the barcode — the label comes back.',
  'barcode.noCamera':
    'No camera here — photograph the barcode instead and I’ll read it off the picture.',
  'barcode.reading': 'Reading it…',
  'barcode.photographInstead': 'Photograph it instead',
  'barcode.unreadable': 'I couldn’t read a barcode in that — try filling more of the frame.',
  'barcode.badFormat': 'I can’t read that image format — a JPEG or PNG will work.',
  'barcode.aServing': (mass: string) => `${mass} a serving`,
  'barcode.weighIt': 'Weigh it',
  'barcode.servings': 'servings',
  'barcode.weighed': 'weighed',
  'barcode.howMuchIn': (unit: string) => `How much did you have, in ${unit}`,
  'barcode.sourceOff': 'Data from Open Food Facts',
  'barcode.sourceUsdaLong': 'Data from USDA FoodData Central',
  'barcode.sourceUsda': 'Data from USDA',
  'barcode.wrongPacket': 'Wrong packet?',
  'barcode.notFound': 'Couldn’t find it',
  'barcode.notFoundBody':
    'Nobody has catalogued that one yet — plenty of own-brands never are. Snap the nutrition panel instead and I’ll read it off the label.',
  'barcode.photographLabel': 'Photograph the label',
  'barcode.scanDifferent': 'Scan a different packet',

  'repeat.footer':
    'Logs it at today’s time. If the portion was different, just say so in the journal and I’ll fix it.',
  'repeat.search': 'Search your meals',
  'repeat.kcalProtein': (kcal: string, protein: string) => `${kcal} kcal · ${protein}g protein`,
  'repeat.logAgainNamed': (what: string) => `Log ${what} again`,
  'repeat.adding': 'Adding…',

  'editor.needsAnItem': 'A meal needs at least one item. Delete it instead?',
  'editor.needsAName': 'What was it? A meal needs a name.',
  'editor.logItYourself': 'Log it yourself',
  'editor.fixWhatsWrong': 'Fix what’s wrong',
  'editor.whatThisWas': 'What this was',
  'editor.whatWasIt': 'What was it?',
  'editor.itemName': (index: string) => `Item ${index} name`,
  'editor.itemPlaceholder': 'Item',
  'editor.removeItem': (what: string) => `Remove ${what}`,
  'editor.itemFallback': (index: string) => `item ${index}`,
  'editor.itemQuantity': (index: string) => `Item ${index} quantity`,
  'editor.howMuch': 'how much',
  'editor.itemCalories': (index: string) => `Item ${index} calories`,
  'editor.itemProtein': (index: string) => `Item ${index} protein`,
  'editor.itemCarbs': (index: string) => `Item ${index} carbs`,
  'editor.itemFat': (index: string) => `Item ${index} fat`,
  'editor.adjustedHeading': 'Saved. Some figures could not be stored as typed:',
  'editor.adjustedMass': (name: string) => `${name} — the protein, carbs and fat weighed more than the food itself`,
  'editor.adjustedCeiling': (name: string) => `${name} — that weight of food cannot hold that many calories`,
  'editor.adjustedFloor': (name: string) => `${name} — its macros carry more calories than that`,
  'editor.anotherItem': 'another item',
  'editor.log': 'Log',
  'editor.saveTotal': (verb: string, kcal: string) => `${verb} · ${kcal} kcal`,

  // ---- Cards in the conversation ------------------------------------------
  'chat.removed': 'Removed',
  'chat.openWeekPlan': 'Open the week’s plan',
  'chat.thisWeeksDinners': 'This week’s dinners',
  'chat.nights': (count: number) => n(count, { one: 'night', other: 'nights' }),
  'chat.nothingPlanned': 'Nothing planned',
  'chat.burnEstimate': 'Burn is an estimate',
  'chat.notAddedToBudget': ' · not added to your budget',
  'chat.editNamed': (name: string) => `Edit ${name}`,
  'chat.notAWeight': 'That is not a weight.',
  'chat.editWeighIn': 'Edit this weigh-in',
  'chat.notEnoughDays': 'Not enough logged days yet to draw a trend.',
  'chat.lastWeek': 'Last week',
  'chat.nothingLogged': 'Nothing logged',
  'chat.kcalTitle': (kcal: string) => `${kcal} kcal`,
  'chat.nothingLoggedThisWeek': 'Nothing logged this week.',
  'chat.weekSummary': (days: string, onTarget: string) =>
    `${days} logged, ${onTarget} within 10% of target.`,
  'chat.aDayAgainst': (target: string) => `a day, against ${target}`,
  'chat.onTheScale': 'on the scale',
  'chat.burnedOver': (sessions: string) => `burned over ${sessions}`,
  'chat.proteinADayAgainst': (target: string) => `protein a day, against ${target}`,
  'chat.showLess': 'Show less',
  'chat.readTheRest': (count: string) => `Read the rest (${count} more)`,
  'chat.atLoad': (loads: string) => ` at ${loads}`,
  'chat.setsCount': (count: number) => n(count, { one: 'set', other: 'sets' }),

  /** One letter each, for the macro bar's legend. Not abbreviations of the
      words above them in every language — Bulgarian's are П, В and М. */
  /** One snack, as a card labels it. `meal.snack` is the plural heading. */

  // ---- The journal --------------------------------------------------------
  'journal.promptEggs': 'Two eggs, toast and coffee',
  'journal.promptLunch': 'Chicken and rice for lunch',
  /** `distance` carries the unit, because a distance without one is not a sentence. */
  'journal.promptRun': (distance: string) => `Went for a ${distance} run`,
  'journal.promptProtein': 'Am I eating enough protein?',
  'journal.emptyTitle': 'What have you eaten today?',
  'journal.emptyBody':
    'Type it or take a photo — whatever’s easiest. No forms, nothing to search for. Say what happened and I’ll work out the rest.',
  'journal.over': (kcal: string) => `${kcal} over`,
  'journal.left': (kcal: string) => `${kcal} left`,
  'journal.burned': (kcal: string) => `−${kcal} burned`,
  'journal.net': (kcal: string) => ` · net ${kcal} kcal`,
  'journal.loggedMeal': 'Logged meal',
  'journal.thinking': 'Thinking',
  /**
   * A turn whose connection died with the answer still owed.
   *
   * Deliberately not the transport's own words. What the phone hands up here
   * is a Java socket exception, and printing it turned a locked screen into
   * what reads as a crash. The server finishes the turn regardless — see the
   * note on `request.raw.on('close')` in `sse.ts` — so the second sentence is
   * a promise the app actually keeps: it re-reads the conversation on the way
   * back in.
   */
  'journal.lost':
    'The connection dropped before the reply arrived. Whatever landed will be here when you come back.',

  // What to call the pause while a tool runs. Verbs only — see `toolLabel`.
  'tool.log': 'Logging',
  'tool.update': 'Updating',
  'tool.delete': 'Removing',
  'tool.get': 'Checking',
  'tool.search': 'Looking back',
  'tool.find': 'Finding',
  'tool.set': 'Saving',
  'tool.show': 'Drawing',
  'tool.suggest': 'Thinking up',
  'tool.import': 'Importing',
  'tool.adapt': 'Adapting',
  'tool.save': 'Saving',
  'tool.plan': 'Planning',
  'tool.cook': 'Cooking',
  'tool.repeat': 'Repeating',
  'tool.remember': 'Remembering',
  'tool.forget': 'Forgetting',
  'tool.lookup': 'Looking up',
  'tool.run': 'Running',
  'tool.define': 'Defining',
  'tool.ask': 'Asking about',

  // ---- The workout card ---------------------------------------------------
  'workout.strength': 'Weights',
  'workout.cardio': 'Cardio',
  'workout.class': 'Class',
  'workout.sport': 'Sport',
  'workout.flexibility': 'Mobility',
  'workout.fallbackName': 'Workout',
  'workout.savedRoutine': (name: string) => `Saved “${name}” — one tap next time`,
  'workout.routineNotSaved': 'Logged, but the routine did not save',
  'workout.updated': (what: string, kcal: string) => `Updated ${what} — now ~${kcal} kcal`,
  'workout.logged': (what: string, kcal: string) => `Logged ${what} — ~${kcal} kcal`,
  'workout.change': 'Change',
  'workout.yourWorkouts': 'Your workouts',
  'workout.today': '· today',
  'workout.howLong': 'How long?',
  'workout.addWhatYouDid': 'Add what you did',
  'workout.sameAs': (when: string) => `Same as ${when}`,
  'workout.exerciseCount': (count: number) => `(${n(count, { one: 'exercise', other: 'exercises' })})`,
  'workout.yours': '· yours',
  'workout.saveThisAs': (name: string) => `Save this as “${name}”`,
  'workout.nameForThis': 'Name for this workout',
  'workout.dontSave': 'Don’t save this as a workout',
  'workout.saveChanges': 'Save changes',
  'workout.logSession': 'Log this session',
  'workout.fixWhatsWrong': 'Fix what’s wrong',
  'workout.whatDidYouDo': 'What did you do?',
  'workout.roughlyIsFine': 'Roughly is fine.',
  'workout.reps': 'reps',
  'workout.min': 'min',
  'workout.removeSet': (index: string) => `Remove set ${index}`,
  'workout.anotherSet': 'Another set',
  'workout.removeNamed': (name: string) => `Remove ${name}`,

  // ---- The weekly review --------------------------------------------------
  'review.lastWeek': '📅  Last week',
  'review.title': '📅  Weekly review',
  'review.pitch':
    'Every Monday morning you’ll get a short read on how the week went — what the numbers actually showed, and whether your target needs to move. No lectures, just the picture.',
  'review.writing': 'Writing…',
  'review.writeOne': 'Write one now',
  'review.currentTarget': (kcal: string) => `Target ${kcal} kcal.`,
  'review.willApply': 'Next review will apply this. ',
  'review.kcalUnit': (kcal: string) => `${kcal} kcal`,

  'quality.title': '🥦\u00a0\u00a0Diet quality',
  'quality.partlyMeasured': 'partly measured',
  'quality.notEstimated': 'not estimated',

  'nutrient.sodium': 'Sodium',
  'nutrient.satFat': 'Sat fat',
  'nutrient.sugar': 'Sugar',

  'chart.daily': 'Daily chart',
  'chart.arrowHint': (label: string) => `${label}. Use the arrow keys to read a day.`,

  // ---- What the phone says and the web does not ---------------------------
  //
  // The scanner is a full-screen camera rather than a dialog, the store is a
  // thing only the app has, and the plan screen is narrower — so these are the
  // strings with no web twin to share a key with.
  'cook.photographFridge': 'photograph your fridge',
  'cook.kitchenLocked': 'The kitchen is part of Coach',
  'cook.kitchenLockedBody':
    'Photograph your fridge, get a recipe written around what’s in it, and plan a week of dinners from there. The recipe library below stays free — browse it, cook from it, log it.',
  /** Split around the tab's own name, which is emphasised in place. */
  'cook.emptyLockedBefore': 'Nothing here yet. The',
  'cook.emptyLockedAfter': 'tab above is full of recipes you can cook and log for nothing.',
  'cook.emptyAfterShort': 'and I’ll invent a recipe from what’s in your kitchen.',
  'cook.workOutCalories': 'Work out the calories',
  'cook.readingIt': 'Reading it…',

  'scan.photographShelf': 'Photograph your shelf',
  'scan.looking': 'Looking…',
  'scan.scanYourFridge': 'Scan your fridge',
  'scan.notSure': 'not sure',
  'scan.isThisIt': 'Is this what I’m looking at?',
  'scan.addToKitchenShort': 'Add to kitchen',
  'scan.cooking': 'Cooking…',
  'scan.cookFromThese': 'Cook from these',
  'pantry.stillHaveIt': 'Still have it',
  'pantry.iStillHave': (name: string) => `I still have ${name}`,

  'barcode.title': 'Scan a barcode',
  'barcode.lookingUp': 'Looking it up…',
  'barcode.pointAtBarcode': 'Point at the barcode',
  'barcode.checkingCamera': 'Checking the camera…',
  'barcode.needsCamera': 'The scanner needs the camera.',
  'barcode.iAteThis': 'I ate this',
  'barcode.howMany': 'How many?',
  'barcode.howMuch': 'How much?',
  'barcode.scanAnother': 'Scan another',
  'barcode.addToMessage': 'Add to my message',
  'barcode.setTheAmount': 'Set the amount',
  'barcode.added': (name: string) => `${name} — added`,
  'barcode.addedToMessage': (count: number) =>
    `${n(count, { one: 'packet', other: 'packets' })} added to your message`,
  'barcode.nothingAddedYet': 'Nothing added yet',

  'composer.listening': 'Listening…',
  'composer.stopListening': 'Stop listening',
  'composer.sayWhatYouAte': 'Say what you ate',
  'composer.addPhotoShort': 'Add a photo',

  'workouts.logActionMobile': '+ Log a workout',
  'workouts.oneFewerSetShort': 'One fewer set',
  'workouts.oneMoreSetShort': 'One more set',
  'workouts.noneSavedMobile':
    'No workouts saved yet. A saved workout is a list you reuse — log a session with its exercises and take the offer to name it, or build one here.',
  'workouts.routineOn': (name: string, day: string) => `${name} on ${day}`,
  'workouts.set': 'set',
  'workouts.learnedGuess': (name: string) => `${name}?`,
  'workout.classMobile': 'A class',
  'workout.flexibilityMobile': 'Stretching',
  'workout.routineNotSavedMobile': 'Logged, but the workout did not save',
  'workout.nameIt': 'Name it',
  'workout.logIt': 'Log it',
  'workout.sameAsShort': (when: string) => `↻ same as ${when}`,
  'workout.lastTime': (figure: string) => `last time ${figure}`,
  'workout.adjust': 'Adjust',
  'workout.setsDiffered': 'Sets differed',
  'workout.sameEverySet': 'Same every set',
  'workout.setsLabel': 'sets',
  'workout.searchExercises': 'Search — a name or a muscle',
  'workout.doneThese': 'You’ve done these',
  'workout.browseMuscle': 'Or browse by muscle',
  'workout.addNamed': (name: string) => `＋ Add “${name}”`,
  'workout.nothingMatches': 'Nothing matches that',
  'workout.otherLength': 'Other',
  'workout.minutesLabel': 'Minutes',

  'editor.anotherItemLabel': 'another item',

  'plan.cookTab': 'Cook',
  'plan.theWeek': 'The week',
  'plan.locked': 'Planning a week is part of Coach',
  'plan.planItTitle': '🗓  Plan it',
  'plan.wantsPlaceholderShort': 'Anything in mind? — “nothing with fish”',
  'plan.peopleUnit': 'people',
  'plan.minUnit': 'min',
  'plan.batchWhereItHelps': 'Batch where it helps',
  'plan.batchCooking': 'Batch cooking',
  'plan.planning': 'Planning…',
  'plan.dinnersTitle': '🍽  Dinners',
  'shopping.titleShort': '🧾  Shopping',
  'shopping.addSomethingElse': 'Add something else',

  'progress.openExerciseTab': 'Open the exercise tab',
  'quality.fillThemselvesIn': 'Tell the journal what you ate and they fill themselves in.',
  'quality.spentTail': (spent: string, plan: string, allowed: string) =>
    `${spent} — ${plan} includes ${allowed} a month.`,
  'quality.estimateNote': (tail: string) =>
    `These four are the model’s estimate, so only meals the journal logs carry them — typed, repeated and scanned ones leave them blank. ${tail}`,

  // ---- The store ----------------------------------------------------------
  'plans.spent': 'Your plan is spent',
  'plans.upgrade': 'Upgrade',
  'plans.seeWhatAdds': (plan: string) => `See what ${plan} adds`,
  'plans.remainingHint': (remaining: string) => `${remaining}. See the plans.`,
  'plans.hide': 'Hide',
  'plans.restored': 'Restored. Welcome back.',
  'plans.restoredShort': 'Restored.',
  'plans.noneFound': 'No subscription found on this store account.',
  'plans.keepItGoing': 'Keep it going.',
  'plans.yearly': 'Yearly',
  'plans.monthly': 'Monthly',
  'plans.oneMoment': 'One moment…',
  'plans.messagesHeading': 'MORE MESSAGES',
  'plans.messagesBody':
    'On top of what your plan gives you each month. Bought once, not a subscription — they keep until you use them.',
  'plans.messagesCount': (count: number) => `${count} messages`,
  'plans.messagesAdded': (count: number) => `${count} messages added.`,
  'plans.messagesOnTheWay': 'Paid. Your messages will appear in a moment.',
  'plans.messagesBuyHint': (count: number, price: string) => `Buy ${count} messages for ${price}`,
  'plans.scansHeading': 'MORE PHOTO SCANS',
  'plans.scansBody': 'Bought once, not a subscription. They keep until you use them.',
  'plans.scansCount': (count: number) => `${count} photo scans`,
  'plans.scansAdded': (count: number) => `${count} scans added.`,
  'plans.scansOnTheWay': 'Paid. Your scans will appear in a moment.',
  'plans.scansBuyHint': (count: number, price: string) =>
    `Buy ${count} photo scans for ${price}`,
  'plans.checkingStore': 'Checking the store…',
  'plans.alreadyPaid': 'Already paid? Restore it',
  'plans.restorePrompt': 'I would like to restore a transaction',
  'plans.paidNotShowing': 'Paid but not showing? Restore it',
  'plans.freeOnEvery': 'Free on every plan',
  'plans.billedYearly': 'Billed once a year',
  'plans.billedMonthly': 'Billed monthly',
  'plans.everythingInPlus': 'Everything in Plus',
  'plans.yourPlan': 'Your plan',
  'plans.aYear': 'a year',
  'plans.aMonth': 'a month',
  'plans.onFree': 'You’re on Free. Everything you type in stays free — these buy the parts that think.',
  'plans.onPlan': (plan: string) => `You’re on ${plan}.`,
  'plans.savePercent': (percent: string) => ` · save ${percent}%`,
  'plans.get': (plan: string) => `Get ${plan}`,
  'plans.nothingOnSale':
    'The store has nothing on sale for this app yet. Nothing is locked that wasn’t before — come back and it’ll be here.',
  'plans.noStore': 'This build can’t reach the store, so there’s nothing to buy from here yet.',
  'plans.restoreNote':
    'Re-reads this store account and puts back anything you have already bought. It never charges you again.',
  'plans.manage': 'Manage or cancel subscription',
  'plans.smallPrint': (billing: string) =>
    `${billing} through the store, and it renews until you stop it. Cancel any time from your store account — you keep what you paid for until the period ends.`,
  'plans.pendingLong':
    'The store has your payment and the plan is still on its way. It will unlock on its own — there is nothing to pay again.',
  'plans.pendingShort': 'The store has your payment. Your plan unlocks in a moment.',
  'plans.whatThatOpens': 'What that opens',
  'plans.startLogging': 'Start logging',
  'plans.backToJournal': 'Back to the journal',
  'plans.youreOnPlan': (plan: string) => `You’re on ${plan}.`,
  'plans.paymentReceived': 'Payment received.',
  'plans.manageOnStore': 'Manage or cancel it any time in Subscriptions on the store.',
  'plans.youreOn': 'You’re on',
  'plans.photoScans': 'Photo scans',
  'plans.unlimited': 'Unlimited',
  'plans.seeWhatIncludes': 'See what your plan includes',
  'plans.seeThePlans': 'See the plans',
  'plans.restorePurchase': 'Restore a purchase',
  'plans.planTitle': 'Plan',
  'plans.leftThisMonth': (left: string) => `${left} left this month`,
  'plans.plusBought': (bought: string) => ` · ${bought} bought`,
  'plans.leftEver': (left: string) => `${left} left`,
  'setup.tellingYouThings': 'Telling you things',
  'setup.emailFooterWithReview':
    'The weekly review arrives on Monday mornings. Emails about your account — a password change, a sign-in from a device we have not seen — are always sent.',
  'setup.emailFooter':
    'Emails about your account — a password change, a sign-in from a device we have not seen — are always sent.',
  'setup.confirmFirst': (email: string) =>
    `Until you confirm ${email}, a forgotten password cannot be reset — there would be no way to know the mailbox is yours.`,
  'setup.sendLinkAgain': 'Send the link again',
  'setup.weeklyReview': 'Weekly review',
  'setup.sendMeReview': 'Send me the weekly review',
  'setup.nudges': 'Nudges',
  'setup.sendMeNudges': 'Send me nudges',
  'setup.streaksAndGoals': 'Streaks and goals',
  'setup.tellMeStreaks': 'Tell me about streaks and goals',
  'setup.eveningRecap': 'Evening recap',
  'setup.eveningRecapHint':
    'Tonight’s calories and protein against tonight’s targets, at nine. Every day you have logged something — the one notification here that is not occasional.',
  'setup.sendMeRecap': 'Send me the evening recap',
  'setup.remindersTitle': 'Reminders on this phone',
  'setup.remindersFooter':
    'Set here, kept here. These need no account and no connection, they arrive whatever your plan is, and they do not follow you to a new phone.',
  'setup.logYourDay': 'Log your day',
  'setup.remindMeToLog': 'Remind me to log',
  'setup.at': 'At',
  'setup.reminderTime': 'Reminder time',
  'setup.weighIn': 'Weigh in',
  'setup.remindMeToWeigh': 'Remind me to weigh in',
  'setup.on': 'On',
  'setup.weighInDay': 'Weigh-in day',
  'setup.weighInTime': 'Weigh-in time',
  'setup.deleting': 'Deleting…',
  'setup.deleteEverything': 'Delete everything',
  'setup.deleteWarningBefore': 'This erases every meal, photo, weight and conversation on',
  'setup.deleteWarningAfter':
    ', on every device, and cannot be undone. Enter your password to confirm.',

  // ---- The words the app uses about money ---------------------------------
  //
  // Three rules run through all of it, and they survive translation or the
  // wall stops working: name the number, never end on the refusal, and no
  // urgency. See `lib/plan-copy.ts` for the argument.
  //
  // The tier *names* are deliberately not in here. "Plus" and "Coach" are what
  // the store charges for, and a screen that renames the thing the receipt
  // names is a support ticket.
  'meter.chat': (count: number) => w(count, { one: 'message', other: 'messages' }),
  'meter.photo': (count: number) => w(count, { one: 'photo scan', other: 'photo scans' }),
  'meter.pantryScan': (count: number) => w(count, { one: 'fridge scan', other: 'fridge scans' }),
  'meter.recipe': (count: number) => w(count, { one: 'recipe', other: 'recipes' }),
  'meter.mealPlan': (count: number) => w(count, { one: 'meal plan', other: 'meal plans' }),

  'tier.pitchFree': 'A complete food diary, offline and unmetered.',
  'tier.pitchPlus': 'The journal every day, and a weekly read on it.',
  'tier.pitchCoach': 'The kitchen too: cook from your fridge, plan the week.',

  'wall.notOnPlan': (plural: string) => `${plural} aren’t on your plan`,
  'wall.freeGrant': (count: number, noun: string) => `That’s your ${count} free ${noun}`,
  'wall.monthlyGrant': (count: number, noun: string) => `That’s all ${count} ${noun} this month`,
  'wall.comeBack': (when: string) => ` They come back ${when}.`,
  'wall.bodyChat': 'Typing a meal in yourself is unlimited, and always free — I’ll show you where.',
  'wall.bodyPhoto':
    'You can still type the meal in, repeat one you’ve had before, or scan its barcode. None of those are metered.',
  'wall.bodyPantryScan': 'Your kitchen list still works — you can add what’s in it by hand.',
  'wall.bodyRecipe':
    'Everything you’ve already cooked is still saved, and the recipe library is free to browse.',
  'wall.bodyMealPlan':
    'The week you last planned is still there, and you can still cook from a saved recipe.',
  'wall.remaining': (count: number, noun: string) => `${count} ${noun} left`,

  'tier.reviewAndNudge': 'A weekly review, and a nudge when you go quiet',
  'tier.review': 'A weekly review of how you ate',
  'tier.nudge': 'A nudge when you go quiet',
  'tier.countNoun': (count: number, noun: string) => `${count} ${noun}`,
  'tier.toTry': (list: string) => `${list}, to try`,
  'tier.aMonth': (list: string) => `${list} a month`,
  'tier.everythingIn': (plan: string) => `Everything in ${plan}`,

  'free.typing': 'Typing meals in, and correcting them',
  'free.repeat': 'Repeat a meal, and barcode scanning',
  'free.history': 'Your whole history, the ring, and the streak',
  'free.offline': 'Logging with no signal at all',

  'spent.everGrant': (count: number, noun: string) =>
    `Your ${count} free ${noun} ${count === 1 ? 'is' : 'are'} spent`,
  'spent.monthly': (count: number, noun: string) =>
    `This month’s ${count} ${noun} ${count === 1 ? 'is' : 'are'} spent`,

  // ---- Words the whole app uses -------------------------------------------
  // ---- Streaks and achievements. See STREAKS.md. ----
  'streak.logging': 'Logging streak',
  'streak.training': 'Training weeks',
  'streak.days': (count: number) => n(count, { one: 'day', other: 'days' }),
  'streak.weeks': (count: number) => n(count, { one: 'week', other: 'weeks' }),
  'streak.best': (count: number) => `best ${count}`,
  'streak.atRisk': 'Log today to keep it',
  'streak.weekProgress': (done: number, needed: number) => `${done} of ${needed} days this week`,
  'streak.weekMet': 'This week counts',
  'streak.weekBar': (needed: number) => `${needed} days a week keeps it going`,
  'streak.startTraining': 'Train three days this week to start a streak',
  'achievements.title': 'Achievements',
  'achievements.count': (done: number, total: number) => `${done} of ${total}`,
  'achievements.earnedOn': (date: string) => `Earned ${date}`,
  'achievements.group.streaks': 'Streaks',
  'achievements.group.training': 'Training',
  'achievements.group.firsts': 'Firsts',
  'achievements.group.totals': 'Totals',
  'badge.streak_7': 'Seven in a row',
  'badgeHow.streak_7': 'Log something seven days running.',
  'badge.streak_30': 'Thirty in a row',
  'badgeHow.streak_30': 'Log something thirty days running.',
  'badge.streak_100': 'A hundred in a row',
  'badgeHow.streak_100': 'Log something a hundred days running.',
  'badge.streak_365': 'A year unbroken',
  'badgeHow.streak_365': 'Log every single day for a year.',
  'badge.exercise_weeks_4': 'Four weeks training',
  'badgeHow.exercise_weeks_4': 'Three sessions a week, four weeks running.',
  'badge.exercise_weeks_12': 'Twelve weeks training',
  'badgeHow.exercise_weeks_12': 'Three sessions a week, twelve weeks running.',
  'badge.exercise_weeks_52': 'A year of training',
  'badgeHow.exercise_weeks_52': 'Three sessions a week for a whole year.',
  'badge.first_photo': 'First photo',
  'badgeHow.first_photo': 'Log a meal from a photograph.',
  'badge.first_barcode': 'First scan',
  'badgeHow.first_barcode': 'Scan a barcode.',
  'badge.first_workout': 'First session',
  'badgeHow.first_workout': 'Log a workout.',
  'badge.first_weigh_in': 'First weigh-in',
  'badgeHow.first_weigh_in': 'Record your weight.',
  'badge.days_100': 'A hundred days',
  'badgeHow.days_100': 'A hundred days logged, in any order.',
  'badge.days_365': 'A year of logging',
  'badgeHow.days_365': 'Three hundred and sixty-five days logged, in any order.',
  'badge.workouts_100': 'A hundred sessions',
  'badgeHow.workouts_100': 'A hundred days with training on them.',

  'widget.today': (label: string) => `${label} today`,
  'widget.of': (consumed: string, target: string) => `${consumed} of ${target} kcal`,
  'widget.tapToStart': 'Tap to start today',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.done': 'Done',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.offline': 'You’re offline. This will work again when you have signal.',
  'common.unexpected': 'Something went wrong. Try again.',
  'common.loading': 'Loading…',
  'common.today': 'Today',
  'common.yesterday': 'Yesterday',
} as const;
