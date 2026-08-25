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
