import { createApiClient } from '@ct/api-client';
import { preferredLocale } from '@/lib/i18n';

/**
 * Browser-side client. Points at the Next proxy, which adds the API token.
 * The RN app will construct the same client with the real API URL and a token
 * from secure storage.
 *
 * `locale` is what the page is drawn in, read per request because somebody can
 * change it without reloading. It answers for an account whose column is still
 * null — the fridge scanner and the recipe writer have no sentence of their own
 * to read a language off. See `SPOKEN_LOCALE_HEADER`.
 */
export const api = createApiClient({ baseUrl: '/api', locale: preferredLocale });
