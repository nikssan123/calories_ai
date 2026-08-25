import type { Messages } from '@/lib/i18n';

/**
 * Spanish.
 *
 * Second person singular and informal — "tú", never "usted". Peninsular rather
 * than Latin American where the two diverge, which shows up mainly in
 * `meal.lunch`: "Comida" is the midday meal in Spain, "Almuerzo" in most of
 * Latin America. If this app finds an audience on the other side of the
 * Atlantic that is the first string to split, not the whole file.
 *
 * Opening punctuation is not optional: "¿Ya tienes cuenta?" needs its inverted
 * mark, and dropping it is the most common way Spanish written by non-speakers
 * gives itself away.
 */
export const es: Messages = {
  // ---- The tab bar and the sidebar ---------------------------------------
  //
  // Six words that have to survive being read a hundred times a day, in a
  // 60px-wide target. Length is a constraint here, not a preference.
  'nav.journal': 'Diario',
  'nav.today': 'Hoy',
  'nav.progress': 'Progreso',
  'nav.exercise': 'Ejercicio',
  'nav.cook': 'Cocina',
  'nav.you': 'Perfil',
  'nav.history': 'Historial',
  'nav.admin': 'Admin',
  'nav.signOut': 'Cerrar sesión',

  // ---- Today --------------------------------------------------------------
  'today.title': 'Hoy',
  'today.toGo': 'restantes',
  'today.over': 'de más',
  'today.burned': (kcal: string) => `+${kcal} quemadas`,
  'today.viewCalendar': 'Ver el calendario',
  'today.previousDay': 'Día anterior',
  'today.nextDay': 'Día siguiente',
  'today.nothingLogged': 'Aún no hay nada registrado.',
  'today.nothingLoggedHint': 'Dile al diario qué has comido.',
  'today.logAgain': 'Registrar otra vez',
  'today.weighed': 'Pesado',
  'today.weight': 'Peso',
  'today.exercise': 'Ejercicio',
  'today.roughEstimate': 'estimación aproximada',
  'today.changeHint': 'Para cambiarlo, dilo en el diario: «había más arroz».',

  'meal.breakfast': 'Desayuno',
  'meal.lunch': 'Comida',
  'meal.dinner': 'Cena',
  'meal.snack': 'Tentempiés',

  'macro.protein': 'Proteína',
  'macro.carbs': 'Carbohidratos',
  'macro.fat': 'Grasa',
  'macro.fiber': 'Fibra',

  // ---- History ------------------------------------------------------------
  'history.title': 'Historial',
  'history.thisMonth': 'Este mes',
  'history.previousMonth': 'Mes anterior',
  'history.nextMonth': 'Mes siguiente',
  'history.avgIntake': 'Media',
  'history.logged': 'Registrados',
  'history.exercise': 'Ejercicio',
  'history.onTarget': 'En el objetivo',
  'history.under': 'Por debajo',
  'history.over': 'Por encima',
  'history.noTarget': 'Sin objetivo',
  'history.openInToday': 'Abrir en Hoy →',

  // ---- The composer -------------------------------------------------------
  'composer.placeholder': 'Dos huevos y una tostada…',
  'composer.send': 'Enviar',
  'composer.addPhoto': 'Añadir una foto o escanear un envase',
  'composer.takePhoto': 'Hacer una foto',
  'composer.choosePhoto': 'Elegir una foto',
  'composer.scanBarcode': 'Escanear un código de barras',
  'composer.removePhoto': 'Quitar la foto',
  'composer.selectedMeal': 'Comida seleccionada',
  'composer.labelHint': 'Esta es la etiqueta: registra lo que he comido a partir de ella.',

  // ---- Setup / You --------------------------------------------------------
  'setup.title': 'Perfil',
  'setup.about': 'Sobre ti',
  'setup.account': 'Cuenta',
  'setup.appearance': 'Apariencia',
  'setup.dangerZone': 'Cuidado',
  'setup.displayName': 'Nombre',
  'setup.sex': 'Sexo',
  'setup.birthDate': 'Fecha de nacimiento',
  'setup.height': 'Altura',
  'setup.targetWeight': 'Peso objetivo',
  'setup.activity': 'Actividad',
  'setup.goal': 'Objetivo',
  'setup.units': 'Unidades',
  'setup.language': 'Idioma',
  'setup.dayStartsAt': 'El día empieza a las',
  'setup.timezone': 'Zona horaria',
  'setup.email': 'Correo',
  'setup.addressConfirmed': 'Dirección confirmada',
  'setup.addressNotConfirmed': 'Dirección sin confirmar',
  'setup.deleteAccount': 'Eliminar la cuenta',
  'setup.deleteFailed': 'No se ha podido eliminar la cuenta.',
  'setup.contactSupport': 'Contactar con soporte',
  'setup.save': 'Guardar',
  'setup.saving': 'Guardando…',
  'setup.saved': 'Guardado',

  // ---- Configuración sin terminar ------------------------------------------
  'setup.placeholder': 'Estas cifras son provisionales.',
  'setup.placeholderAction': 'Termina la configuración en el diario.',
  'setup.inProgress': 'Configurando — tu objetivo es provisional hasta que terminemos.',

  'sex.male': 'Hombre',
  'sex.female': 'Mujer',

  'goal.lose': 'Bajar',
  'goal.maintain': 'Mantener',
  'goal.gain': 'Subir',

  'activity.sedentary': 'Sedentario',
  'activity.light': 'Ligero',
  'activity.moderate': 'Moderado',
  'activity.active': 'Activo',
  'activity.veryActive': 'Muy activo',

  'units.metric': 'Métrico',
  'units.imperial': 'Imperial',

  'theme.system': 'Sistema',
  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',

  // ---- Signing in ---------------------------------------------------------
  'auth.signIn': 'Iniciar sesión',
  'auth.signInSubtitle': 'Inicia sesión y sigue donde lo dejaste.',
  'auth.createAccount': 'Crear cuenta',
  'auth.createAccountTitle': 'Crea tu cuenta',
  'auth.email': 'Correo',
  'auth.password': 'Contraseña',
  'auth.passwordHint': 'Mínimo 8 caracteres.',
  'auth.nameOptional': 'Nombre (opcional)',
  'auth.continueWithGoogle': 'Continuar con Google',
  'auth.forgotPassword': '¿Has olvidado la contraseña?',
  'auth.haveAccount': '¿Ya tienes cuenta?',
  'auth.newHere': '¿Eres nuevo?',
  'auth.signupsClosed': 'Este servidor no admite registros.',
  'auth.googleFailed': 'Google no ha podido iniciar tu sesión. Inténtalo otra vez o usa el correo y la contraseña.',
  'auth.genericFailure': 'Algo ha fallado al iniciar sesión. Inténtalo otra vez.',
  'auth.oneMoment': 'Un momento…',
  'auth.privacyPolicy': 'Política de privacidad',
  'auth.language': 'Idioma',

  // ---- Confirming an address ----------------------------------------------
  'verify.checkEmail': 'Mira tu correo',
  'verify.sentTo': (email: string) => `Hemos enviado seis dígitos a ${email}. Introdúcelos y ya estás dentro.`,
  'verify.sentBlind': 'Te hemos enviado seis dígitos. Introdúcelos y ya estás dentro.',
  'verify.title': 'Confirma tu correo',
  'verify.checkInbox': 'Mira tu bandeja de entrada',
  'verify.enterCode': 'Introduce el código',
  'verify.sixDigitCode': 'Código de seis dígitos',
  'verify.confirm': 'Confirmar',
  'verify.confirming': 'Confirmando…',
  'verify.confirmed': 'Correo confirmado',
  'verify.alreadyConfirmed': 'Ya está confirmado',
  'verify.readyMessage': 'Esta dirección está lista.',
  'verify.sendNewCode': 'Enviar un código nuevo',
  'verify.sending': 'Enviando…',
  'verify.startJournal': 'Empezar el diario',
  'verify.signInFirst': 'Inicia sesión primero y luego introduce el código que te hemos enviado.',
  'verify.signOutAndRestart': 'Cerrar sesión y empezar de nuevo',
  'verify.linkFailed': 'Ese enlace no ha funcionado',

  // ---- Words the whole app uses -------------------------------------------
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.done': 'Hecho',
  'common.add': 'Añadir',
  'common.edit': 'Editar',
  'common.close': 'Cerrar',
  'common.retry': 'Inténtalo otra vez',
  'common.loading': 'Cargando…',
  'common.today': 'Hoy',
  'common.yesterday': 'Ayer',
};
