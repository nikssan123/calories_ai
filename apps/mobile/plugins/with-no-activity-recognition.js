const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Keeps `ACTIVITY_RECOGNITION` off the Android build, because Android does not
 * read steps.
 *
 * `expo-sensors` declares the permission in its own `AndroidManifest.xml`, so
 * merely installing it merges the permission into the app whether anything asks
 * for it or not. On iOS that is irrelevant — the pedometer there is Core Motion
 * and gated by `NSMotionUsageDescription` — but on Android it would put
 * "Physical activity" on the Play listing and into the data safety form for a
 * feature this build does not have.
 *
 * Android reads steps from Health Connect, under
 * `android.permission.health.READ_STEPS`, and never touches the raw step
 * sensor: `expo-sensors` cannot answer there anyway — `getStepCountAsync`
 * throws `NotSupportedException` and `watchStepCount` reports only steps since
 * the app was foregrounded. `expo-sensors` stays installed for iOS, where
 * `CMPedometer` is the whole implementation, and its manifest tags along.
 *
 * So the permission is stripped rather than inherited. Two health permissions
 * on the listing, one of which the app never exercises, is a worse answer to
 * Play's health declaration than one that matches the code exactly.
 *
 * `tools:node="remove"` rather than dropping the entry: the manifest merger
 * runs after this, and an entry deleted here is simply re-merged from the
 * library. The marker is what survives the merge and takes the library's copy
 * with it.
 */

const PERMISSION = 'android.permission.ACTIVITY_RECOGNITION';

module.exports = function withNoActivityRecognition(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    /* The merger only understands `tools:` if the namespace is declared, and a
     * managed project's manifest does not always carry it. */
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const permissions = (manifest['uses-permission'] ??= []);
    const existing = permissions.find((entry) => entry.$?.['android:name'] === PERMISSION);

    if (existing) existing.$['tools:node'] = 'remove';
    else permissions.push({ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } });

    return config;
  });
};
