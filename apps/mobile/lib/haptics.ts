import * as Haptics from 'expo-haptics';

/**
 * The buzz.
 *
 * The design language is physical objects: a button sits on a ledge and the
 * press travels exactly the depth of that ledge and lands flush, which is a
 * key on a keyboard drawn in CSS. On a browser that is as far as the metaphor
 * can go. A phone is the one device that can finish it, and until now the app
 * looked physical and felt like nothing.
 *
 * Three intents, named for what happened rather than for how strong they are,
 * so the call sites read as events and the calibration stays in one file:
 *
 * - `press` — a chunky control went down. Light, because it fires constantly.
 * - `logged` — a number moved. The receipt for the app's whole purpose.
 * - `captured` — the camera got it. Medium, and the only one that fires while
 *   the user is not looking at the screen.
 *
 * Deliberately *not* gated on reduced motion. A haptic is not motion, and for
 * someone who has turned animation off it is more of the feedback rather than
 * less — the `useReducedMotion` contract says the spring is decoration and the
 * information underneath it must survive, which argues for the buzz. The OS
 * switch is the right place to turn these off, and both platforms have one.
 */

/**
 * Fire and forget.
 *
 * Every one of these returns a promise, and every one of them can reject —
 * no vibrator, a permission the OEM decided to want, a device in a mode that
 * refuses. None of that is worth failing a press over, and an unhandled
 * rejection in a press handler is a red screen in development for a buzz
 * nobody would have noticed was missing.
 */
function fire(run: () => Promise<void>) {
  void run().catch(() => {});
}

export const haptics = {
  /**
   * A chunky control went down.
   *
   * Fired from `onPress` rather than `onPressIn`, which is the one place this
   * departs from the obvious. `onPressIn` is where the *visual* sink starts,
   * and pairing the buzz with it is what a real key does — but a `Pressable`
   * inside a `ScrollView` gets `onPressIn` on touch-down, before the scroll
   * has been recognised, so every flick down a list would buzz on the way
   * past. iOS hides most of that behind `delaysContentTouches`; Android does
   * not, which would make it a platform split on the one thing this design
   * cannot afford to split on.
   *
   * `onPress` only ever fires for a tap somebody meant. For a normal press
   * that is under a tenth of a second after the sink begins, and a buzz that
   * is fractionally late is a far smaller error than one that fires when you
   * were only scrolling.
   */
  press: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /**
   * Something was logged: a meal, a weigh-in, a session, a cooked recipe.
   * The success notification rather than an impact, because this is the app
   * answering rather than the surface reacting.
   */
  logged: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /**
   * A barcode decoded.
   *
   * The one that earns its keep most: the scanner is silent at the exact
   * moment it succeeds, and the user is holding a tin at an angle that makes
   * the screen hard to read. Medium, because it has to carry through a hand
   * that is busy.
   */
  captured: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
