/**
 * The floor under every birth-date wheel.
 *
 * Not decoration, and not an opinion about age. `@react-native-community/
 * datetimepicker` installs a clamping listener on Android the moment *either*
 * bound is given, and the minimum it clamps against when none was passed is
 * zero — the epoch. A picker carrying only a `maximumDate` therefore springs
 * every pick before 1 January 1970 straight back to it: the year wheel scrolls
 * down to 1900 quite happily and then refuses to leave the seventies, which
 * reads as a broken app to anyone born before Apollo. Passing the bound
 * explicitly is what restores the platform's own default.
 *
 * 1900 rather than a hundred years back from today, because this is the wheel's
 * floor and not the app's judgement: `AGE` in onboarding is where an
 * implausible birthday gets its sentence, and that check has to stay reachable.
 */
export const BIRTH_DATE_FLOOR = new Date(1900, 0, 1);
