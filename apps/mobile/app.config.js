/**
 * `app.json` holds the whole configuration; this file changes exactly one
 * field of it.
 *
 * `google-services.json` is deliberately not in the repository (see the root
 * `.gitignore`), so an EAS build never receives it as a file in the project
 * archive. It arrives instead as a file environment variable, which the
 * builder writes to a path of its choosing and hands over in
 * `GOOGLE_SERVICES_JSON`. Locally that variable is unset and the checked-out
 * copy beside this file is the right answer.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
