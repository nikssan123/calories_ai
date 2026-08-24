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

/**
 * Where a library recipe's photograph lives.
 *
 * `image_path` arrives from the API as a root-relative `/recipes/<slug>.jpg`,
 * and the 99 files it names are static assets of the *web* app — Next serves
 * them out of `apps/web/public`. The browser therefore resolves the path
 * against its own origin and is right by accident; a phone has no origin, so
 * the join has to be spelled out, and joining it to the API base (which is what
 * `api.photoUrl` does, correctly, for the signed chat-photo paths the API
 * itself serves) asks a Fastify server for a file it has never had.
 *
 * A generated recipe has no photograph at all, and passes null straight
 * through to the tile's stand-in.
 */
export function recipeImageUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  return /^https?:\/\//.test(imagePath) ? imagePath : `${WEB_BASE_URL}${imagePath}`;
}

/** The address in both documents, and the one the support inbox receives on. */
export const SUPPORT_EMAIL = 'support@daysofar.com';
