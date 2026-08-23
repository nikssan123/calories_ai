import Constants from 'expo-constants';

/**
 * Where the documents that are not screens live.
 *
 * The policy and the terms are pages on the web app, not React Native views,
 * and deliberately so: there is one copy of each, it is the copy the App Store
 * and Play listings point at, and a second rendering in the app is a second
 * thing to forget to update. The app opens them in the system browser.
 *
 * Resolved the same way the API base is, and for the same reason — a phone in
 * development is not the machine running Next, so `localhost` is the handset.
 * `EXPO_PUBLIC_WEB_URL` overrides; otherwise a release build knows the real
 * hostname and a development build guesses the packager's, on the web port.
 */
function resolveWebUrl(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (!__DEV__) return 'https://daysofar.com';

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export const WEB_BASE_URL = resolveWebUrl();

export const PRIVACY_URL = `${WEB_BASE_URL}/privacy`;
export const TERMS_URL = `${WEB_BASE_URL}/terms`;

/** The address in both documents, and the one the support inbox receives on. */
export const SUPPORT_EMAIL = 'support@daysofar.com';
