/**
 * The three `Intl` constructors Hermes does not have.
 *
 * Hermes implements `Intl` on Android by delegating to the platform's ICU, and
 * it wires up exactly three of them — `Collator`, `DateTimeFormat` and
 * `NumberFormat`. `PluralRules`, `ListFormat` and `RelativeTimeFormat` are not
 * bound at all, so `new Intl.PluralRules('bg')` is a `TypeError` on device and
 * every screen that renders a counted noun goes down with it.
 *
 * Nothing catches that in CI, and that is the part worth remembering: the
 * catalogue smoke test runs under Node, the web app runs under V8, and both
 * have full ICU. The only runtime missing these is the one the phone uses, so
 * the first thing that ever exercised the gap was opening Progress on a
 * handset.
 *
 * Imported for its side effects, first thing in `index.js`, before the router's
 * entry pulls in anything that might format on the way up.
 *
 * `/polyfill` rather than `/polyfill-force`: each one installs itself only if
 * the runtime lacks it, so this is inert on a Hermes build that grows them
 * later and inert under Node when a test imports a screen.
 *
 * The data is loaded per language rather than through `.../locale-data` whole,
 * which would pull in every locale CLDR knows and is most of a megabyte. Adding
 * a language to `LOCALES` means adding its three lines here — the catalogue
 * smoke test cannot see this file, so nothing else will remind you.
 *
 * `en-GB` is here because `intlLocale()` maps our `'en'` to it, and only two of
 * the three ship it: plural categories do not vary between English regions, so
 * CLDR emits no `en-GB` for `PluralRules` and the matcher falls back to `en`.
 */
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';

import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/bg';
import '@formatjs/intl-pluralrules/locale-data/de';
import '@formatjs/intl-pluralrules/locale-data/es';
import '@formatjs/intl-pluralrules/locale-data/fr';

import '@formatjs/intl-listformat/polyfill.js';
import '@formatjs/intl-listformat/locale-data/en';
import '@formatjs/intl-listformat/locale-data/en-GB';
import '@formatjs/intl-listformat/locale-data/bg';
import '@formatjs/intl-listformat/locale-data/de';
import '@formatjs/intl-listformat/locale-data/es';
import '@formatjs/intl-listformat/locale-data/fr';

import '@formatjs/intl-relativetimeformat/polyfill.js';
import '@formatjs/intl-relativetimeformat/locale-data/en';
import '@formatjs/intl-relativetimeformat/locale-data/en-GB';
import '@formatjs/intl-relativetimeformat/locale-data/bg';
import '@formatjs/intl-relativetimeformat/locale-data/de';
import '@formatjs/intl-relativetimeformat/locale-data/es';
import '@formatjs/intl-relativetimeformat/locale-data/fr';
