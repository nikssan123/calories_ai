import type { LandingCopy } from './types';

/**
 * The landing page, in Spanish (Spain).
 *
 * "Tú", never "usted", like the app and the Play listing. Numbers follow the
 * app's own formatNumber for `es`: no separator in four-digit figures ("2100"),
 * decimal comma ("0,4 kg"). Dollar prices are written the way Spanish writes a
 * currency — amount first, then "€", with a no-break space so the two never
 * wrap apart; the same space goes before "%".
 */
export const es: LandingCopy = {
  meta: {
    title: 'Day So Far — contador de calorías: di lo que has comido',
    description:
      'Di lo que has comido con tus palabras: calorías, proteína, carbohidratos y grasa se suman solos. Sin base de datos ni cuarenta resultados de «pechuga de pollo».',
  },

  nav: {
    how: 'Cómo funciona',
    features: 'Funciones',
    pricing: 'Precios',
    faq: 'Preguntas',
    coaches: 'Para coaches',
    language: 'Idioma',
  },

  switcher: {
    suggest: 'Leer esta página en español',
    dismiss: 'No, gracias',
  },

  cta: {
    get: 'Descargar la app',
    iphone: 'Pronto en iPhone',
    seeHow: 'Ver cómo funciona',
    storeSoon: 'pronto',
  },

  hero: {
    title: 'Di lo que has comido.',
    lede: 'El contador de calorías con el que hablas. Escríbelo, dilo o hazle una foto, con tus propias palabras: las calorías, la proteína, los carbohidratos y la grasa se suman solos.',
    trust: 'Empieza gratis · Sin anuncios · Sin rastreadores',
  },

  demo: {
    logged: 'Ensalada de pollo con aguacate y un café con leche',
    loggedReply:
      'Apuntado como comida: una pechuga de pollo del tamaño de la palma de la mano, medio aguacate y un café con leche pequeño.',
    summary: 'Comida apuntada',
    description: 'Ensalada de pollo y café con leche',
    chicken: 'Pechuga de pollo',
    chickenBefore: '100 g',
    chickenAfter: '200 g',
    avocado: 'Aguacate',
    avocadoQuantity: 'medio',
    coffee: 'Café con leche',
    coffeeQuantity: 'pequeño',
    correction: 'llevaba el doble de pollo',
    correctionReply: 'Hecho: es la misma entrada, ahora con 200 g de pollo, y el día se ha actualizado con ella.',
    placeholder: 'Dos huevos y una tostada…',
    caption:
      'Una conversación con el diario. El desayuno y un tentempié ya están en el día; «ensalada de pollo con aguacate y un café con leche» se apunta como comida, con unas 550 calorías, y luego se corrige a doble de pollo: la misma entrada pasa a 715 y, con ella, se mueven el anillo, los macros y las barras de fibra, sodio, grasa saturada y azúcar.',
  },

  ways: {
    title: 'Cuatro formas de apuntar una comida. Ninguna es un formulario.',
    items: [
      {
        title: 'Escríbelo o dilo',
        body: '«Dos huevos, una tostada y un poco de queso». Escríbelo o dilo en voz alta. Y ya está.',
      },
      {
        title: 'Hazle una foto',
        body: 'Un plato, una carta, la etiqueta de un paquete. Te devuelve una estimación, y te avisa de que lo es.',
      },
      {
        title: 'Escanea el código de barras',
        body: 'Aparece la etiqueta y tú dices cuánto has tomado. ¿Nadie lo había escaneado antes? Hazle una foto a la etiqueta.',
      },
      {
        title: 'Pide lo de siempre',
        body: '«Mi desayuno de siempre» repite lo que comiste de verdad la última vez. Tu historial, no la base de datos de un desconocido.',
      },
    ],
  },

  corrections: {
    title: '¿Cambias de idea? La entrada cambia contigo.',
    body: '«Espera, que eran tres huevos». La comida que ya habías apuntado se corrige ahí mismo: ni se apunta dos veces ni te toca arreglarla a mano. Cada alimento se guarda por separado, así que al corregir los huevos el pan tostado se queda como estaba.',
    cardLabel: 'Desayuno · una entrada',
    eggs: 'Huevos',
    eggsBefore: '2',
    eggsAfter: '3',
    toast: 'Pan tostado',
    toastQuantity: '2 rebanadas',
    cheese: 'Queso manchego',
    cheeseQuantity: '30 g',
    total: 'Total',
  },

  homeCooking: {
    title: 'Hecho para la comida que no tiene código de barras.',
    body: 'Casi todos los contadores de calorías te hacen buscar en una base de datos, y esa base de datos no tiene ni idea de cómo se cocina en tu casa. Aquí lo describes como se lo contarías a un amigo, en cualquiera de trece idiomas, y la app se encarga del resto.',
    examples: [
      'Un plato de lentejas con chorizo',
      'Dos trozos de tortilla de patatas',
      '5 croquetas caseras de jamón',
      'Pisto con huevo frito, medio plato',
    ],
  },

  quality: {
    title: 'Dos días con las mismas calorías pueden ser días muy distintos.',
    body: '2100 calorías de lentejas no son lo mismo que 2100 calorías de patatas fritas de bolsa y un batido. Por eso cada comida lleva también su fibra, sodio, grasa saturada y azúcar, sacados de la misma frase y sin escribir nada más.',
    note: 'La fibra es un mínimo al que llegar; las otras tres, topes que no conviene pasar.',
  },

  target: {
    badge: 'Plus',
    title: 'Un objetivo que aprende lo que quemas de verdad.',
    body: 'Una calculadora lo adivina a partir de tu altura y tu peso. Tras un par de semanas apuntando comidas y pesándote, hay algo mejor en lo que basarse: lo que quemas *tú*. Cada lunes tu objetivo sigue a los datos, y un repaso breve te explica por qué.',
    reviewDates: '11–17 de agosto',
    reviewIntake:
      'Has comido una media de 2180 calorías con un objetivo de 2290, y la proteína se ha mantenido por encima de 150 g seis días de cada siete. Has bajado 0,4 kg en dos semanas.',
    reviewChange:
      'Hoy tu objetivo sube: has bajado al ritmo que querías comiendo menos de lo que te permitía, así que la cifra anterior se quedaba corta.',
    reviewBasis: 'A partir de 14 días apuntados y 6 pesajes. Tope: +200.',
    guardrailsTitle: 'Antes de mover nada',
    guardrails: [
      'Primero, al menos 10 días apuntados y 4 pesajes.',
      'Nunca más de 200 calorías de una vez, y menos si el registro ha tenido huecos.',
      'Una estimación muy alejada de lo que predice la fórmula se descarta, no se da por buena.',
      'Un objetivo que has fijado tú no se toca nunca.',
    ],
    more: 'Cómo se hacen las cuentas',
  },

  features: {
    title: 'Y todo lo demás que debe hacer un diario.',
    items: [
      {
        title: 'Funciona sin conexión',
        body: 'Apunta una comida en un avión o en un gimnasio en un sótano. Cuenta al momento y se sincroniza cuando vuelves a tener señal.',
      },
      {
        title: 'Widgets en la pantalla de inicio',
        body: 'Las calorías que te quedan y los pasos de hoy, sin abrir la app.',
      },
      {
        title: 'Pasos',
        body: 'Desde Health Connect en Android, o con el contador de pasos del propio iPhone.',
      },
      {
        title: 'Entrenamientos',
        body: 'Series y repeticiones que se rellenan con las de la última vez, entre 220 ejercicios y tus propias rutinas.',
      },
      {
        title: 'Recetas',
        body: 'Cerca de un centenar, ordenadas según lo que hay en tu cocina y lo que te queda del día.',
      },
      {
        title: 'Rachas y logros',
        body: 'Catorce logros por desbloquear, en todos los planes, también en Free.',
      },
      {
        title: 'El día acaba cuando te acuestas',
        body: 'Un tentempié a la una de la madrugada cuenta para la noche a la que pertenece. Pon la hora de corte donde de verdad acaba tu día.',
      },
      {
        title: 'El ejercicio se apunta, no se gasta',
        body: 'Una carrera aparece en tu día y en tus tendencias. Pero no infla a escondidas tu presupuesto de calorías.',
      },
      {
        title: 'Trece idiomas',
        body: 'Toda la app, del búlgaro al griego. Describe tus comidas en el idioma en el que piensas.',
      },
    ],
  },

  pricing: {
    title: 'El diario es gratis. Pensar cuesta un poco.',
    body: 'Apuntar una comida a mano y sumar el día ocurre en tu móvil, así que es gratis para siempre. Entender una frase o una foto necesita un modelo de IA, y esa es la parte que tiene un coste.',
    period: 'Periodo de facturación',
    monthly: 'Mensual',
    yearly: 'Anual',
    saving: '−12 %',
    recommended: 'Recomendado',
    plans: [
      {
        name: 'Free',
        monthly: 'Gratis',
        annual: 'Gratis',
        monthlyCadence: 'mientras quieras',
        annualCadence: 'mientras quieras',
        pitch: 'El diario completo, incluso en un avión.',
        allowance: [
          { figure: '10', unit: 'mensajes', period: 'al mes' },
          { figure: '1', unit: 'escaneo de foto', period: 'para probar' },
        ],
        points: [
          'Apuntar comidas a mano, repetirlas y escanear códigos de barras, sin límite',
          'Tu día, tu historial, tu peso y tus tendencias',
          'Widgets, entrenamientos, recetas, rachas y logros',
        ],
        cta: 'Empieza gratis',
      },
      {
        name: 'Plus',
        monthly: '9,99 €',
        annual: '104,99 €',
        monthlyCadence: 'al mes, cancela cuando quieras',
        annualCadence: 'al año: 8,75 € al mes',
        pitch: 'Cuéntaselo en vez de apuntarlo a mano.',
        allowance: [
          { figure: '90', unit: 'mensajes', period: 'al mes' },
          { figure: '8', unit: 'escaneos de foto', period: 'al mes' },
        ],
        points: [
          'Todo lo de Free',
          'Un repaso semanal de cómo te ha ido la semana de verdad',
          'Un objetivo que se ajusta a los datos',
          'Mensajes y escaneos de foto extra en packs, cuando los necesites',
        ],
        cta: 'Consigue Plus',
      },
      {
        name: 'Coach',
        monthly: '25,99 €',
        annual: '259,99 €',
        monthlyCadence: 'al mes, cancela cuando quieras',
        annualCadence: 'al año: 21,67 € al mes',
        pitch: 'Y te ayuda a decidir qué hay de cena.',
        allowance: [
          { figure: '180', unit: 'mensajes', period: 'al mes' },
          { figure: '25', unit: 'escaneos de foto', period: 'al mes' },
        ],
        points: [
          'Todo lo de Plus',
          '10 escaneos de nevera al mes, convertidos en recetas',
          '8 recetas al mes, escritas para lo que hay en tu cocina',
          '2 planes semanales de cenas al mes, con la lista de la compra',
        ],
        cta: 'Consigue Coach',
      },
    ],
    notes: [
      'Todas las cuentas empiezan en Free. No hay ninguna prueba que tengas que acordarte de cancelar.',
      'Tu cupo se recarga día a día en una ventana móvil de 30 días, así que no hay ninguna fecha de reinicio que esperar.',
      '¿Sin escaneos de foto? Los packs empiezan en 4,09 € por diez, no caducan y solo se usan cuando se acaban los del mes.',
      'Si dejas de pagar, vuelves a Free: tu diario y tu historial se quedan, con 10 mensajes al mes.',
    ],
    currency: 'Precios en euros. Google Play te muestra el precio exacto para tu país.',
  },

  faq: {
    title: 'Tus dudas, resueltas.',
    items: [
      {
        q: '¿Tengo que pesar la comida?',
        a: 'No. Describe las raciones como las dirías: «un plato hondo», «dos trozos». Las estimaciones se marcan como tales, y una cantidad pesada cuenta más cuando se ajusta tu objetivo.',
      },
      {
        q: '¿Cómo de preciso es?',
        a: 'Tanto como una estimación hecha con cuidado, y te avisa cuando está adivinando. Cómo lo ponemos a prueba, y en qué se equivoca, está explicado con todo detalle.',
      },
      {
        q: '¿Está para iPhone?',
        a: 'Ya está en Android. La app para iPhone está en revisión en el App Store, y el enlace aparecerá en esta página el mismo día que salga.',
      },
      {
        q: '¿Funciona sin internet?',
        a: 'Apuntar una comida a mano, repetir una y consultar tu día funcionan sin conexión, y se sincronizan cuando vuelves a conectarte. Las frases, las fotos y buscar códigos de barras necesitan conexión.',
      },
      {
        q: '¿En qué idiomas habla?',
        a: 'Inglés, búlgaro, alemán, español, francés, rumano, ucraniano, serbio, croata, checo, húngaro, griego y eslovaco. Sigue el idioma de tu móvil, y puedes cambiarlo cuando quieras.',
      },
      {
        q: '¿Qué pasa si me quedo sin mensajes?',
        a: 'El diario sigue funcionando: puedes seguir apuntando comidas a mano, repetirlas y escanear códigos de barras. Los mensajes se recargan día a día, o puedes pasarte a un plan superior.',
      },
      {
        q: '¿Cómo cancelo?',
        a: 'En Google Play, en Suscripciones, cuando quieras. Conservas lo que has pagado hasta que acabe el periodo, y después vuelves a Free.',
      },
      {
        q: '¿Vendéis mis datos?',
        a: 'No. Sin anuncios, sin analítica, sin rastreadores y sin vender nada a nadie. Qué se guarda, a quién llega y cuánto tiempo se conserva está todo en la política de privacidad.',
      },
      {
        q: 'Soy coach de nutrición. ¿Hay algo para mí?',
        a: 'Sí: un panel web para seguir el día a día de tus clientes, fijar sus objetivos y dejarles comentarios, con 30 días de prueba gratis. Es independiente del plan Coach de arriba.',
      },
    ],
    accuracyLink: 'Sobre la precisión',
    privacyLink: 'Leer la política de privacidad',
    coachLink: 'Abrir el panel para coaches',
  },

  privacy: {
    title: 'Lo que comes es cosa tuya.',
    body: 'Sin analítica, sin publicidad, nada que vender. Tus comidas son filas en una base de datos que existe para responder a una sola pregunta: qué has comido hoy.',
    link: 'Leer la política de privacidad',
  },

  closing: {
    title: 'Empieza por el desayuno.',
    body: 'Prepararlo lleva un minuto o dos: qué quieres conseguir, tu altura y tu peso, y cuánto te mueves. Con eso se calcula tu objetivo.',
  },

  footer: {
    howItWorks: 'Cómo funciona',
    accuracy: 'Precisión',
    blog: 'Blog',
    recipes: 'Recetas',
    about: 'Acerca de',
    privacy: 'Privacidad',
    terms: 'Términos',
    languages: 'Esta página en otros idiomas',
  },
};
