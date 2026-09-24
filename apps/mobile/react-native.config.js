/**
 * Firebase Analytics is Android-only for now — see `lib/analytics.ts`.
 *
 * On iOS the pods would need a `GoogleService-Info.plist` and
 * `useFrameworks: "static"`, and the second is a change to how every other pod
 * in the app is linked. Kept out of iOS autolinking until that is done on
 * purpose rather than as a side effect of a dependency.
 */
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/analytics': { platforms: { ios: null } },
  },
};
