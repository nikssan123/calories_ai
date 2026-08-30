/*
 * The app's entry, which exists only because a widget has to be registered
 * before anything else runs.
 *
 * The launcher can ask for the widget while the app is not open, and the
 * headless task it starts needs a handler already registered by the time the
 * bundle finishes evaluating. Registering inside a screen — or anywhere in the
 * router's tree — would be too late, and would work in testing precisely
 * because the app was open.
 *
 * `require` for the router rather than a second `import`: imports are hoisted,
 * so an `import 'expo-router/entry'` below would run *before* the registration
 * above it, which is the kind of bug that only shows up on a cold widget draw.
 */
/*
 * First, and before the router: Hermes is missing three `Intl`
 * constructors the catalogues call, and a screen that formats on the way
 * up would reach them before a later import had installed them.
 */
import './lib/intl-polyfill';

import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widget/handler';

registerWidgetTaskHandler(widgetTaskHandler);

require('expo-router/entry');

/*
 * The iOS widgets, registered after the router because nothing waits on them.
 *
 * `createWidget` does not mount anything; it writes the layout — the compiled
 * string of the widget function — into the App Group, which is where the
 * extension reads it from. That has to have happened at least once before a
 * widget can draw anything at all, and it has to happen again after an update
 * that changed the tree, so it runs on every start rather than being kept.
 *
 * Unlike the Android handler above it is not on a deadline: no launcher is
 * waiting on a headless task, and the numbers arrive separately when the app
 * loads a day. So it goes last, where the cost of pulling in `@expo/ui` is
 * paid after the first screen has been asked for rather than before.
 */
if (require('react-native').Platform.OS === 'ios') {
  require('./widget/ios/Face');
}
