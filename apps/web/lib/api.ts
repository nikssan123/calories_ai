import { createApiClient } from '@ct/api-client';

/**
 * Browser-side client. Points at the Next proxy, which adds the API token.
 * The RN app will construct the same client with the real API URL and a token
 * from secure storage.
 */
export const api = createApiClient({ baseUrl: '/api' });
