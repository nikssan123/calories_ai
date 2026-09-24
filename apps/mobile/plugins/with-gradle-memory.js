const { withGradleProperties } = require('expo/config-plugins');

/**
 * Gives the Gradle daemon enough heap for R8 to shrink a release build.
 *
 * Expo's template sets `-Xmx2048m -XX:MaxMetaspaceSize=512m`, and that was
 * enough until Firebase Analytics joined the bundle (`lib/analytics.ts`): the
 * first production build with it died in `:app:minifyReleaseWithR8` with
 * `java.lang.OutOfMemoryError: Java heap space`, twenty minutes in and after
 * every other task had passed. Debug builds do not run R8, so only a store
 * build ever finds out.
 *
 * A plugin rather than an edit to `android/gradle.properties` for the reason
 * `with-androidx-work.js` gives: prebuild regenerates `android/` on every build.
 */

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = (config) =>
  withGradleProperties(config, (config) => {
    const props = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    config.modResults = props;
    return config;
  });
