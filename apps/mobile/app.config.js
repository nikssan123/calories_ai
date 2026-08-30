/**
 * `app.json` holds the whole configuration; this file changes exactly one
 * field of it.
 *
 * `google-services.json` is deliberately not in the repository (see the root
 * `.gitignore`), so an EAS build never receives it as a file in the project
 * archive. It arrives instead as a file environment variable, which the
 * builder writes to a path of its choosing and hands over in
 * `GOOGLE_SERVICES_JSON`.
 *
 * There are three callers, not two, and the third is the one that bites:
 *
 * - **`expo start` / a dev build on this machine.** The variable is unset and
 *   the copy sitting beside this file is the right answer.
 * - **`eas build` in the cloud.** The variable is set by the builder.
 * - **`eas build --local`.** Neither. It copies the project into a temp
 *   directory *honouring .gitignore*, so the copy beside this file does not
 *   come along, and `GOOGLE_SERVICES_JSON` is an EAS-hosted value that a local
 *   run never sees. Prebuild then fails trying to copy a file that is not
 *   there, and — depending on how far the run gets — the failure surfaces from
 *   Gradle as a generic "unknown error", pointing nowhere near the cause.
 *
 * So a local build has to be handed the file explicitly, by absolute path:
 *
 *     GOOGLE_SERVICES_JSON=$PWD/google-services.json \
 *       npx eas-cli build --platform android --profile production --local
 *
 * It cannot live in `eas.json`: a relative path resolves inside the temp build
 * directory where the file is absent, and an absolute one is particular to
 * whichever machine is building.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
