import { NextResponse } from 'next/server';

import { ANDROID_PACKAGE } from '@/lib/app-links';

/**
 * The Android half of the same claim. See the iOS association beside this one.
 *
 * The fingerprint is of the certificate the installed app was *signed* with, so
 * it is the upload key Play re-signs with — `eas credentials` prints it, and so
 * does the Play Console under Setup → App integrity. Get it wrong and Android
 * simply falls back to the browser, silently, which is why this 404s rather
 * than guessing when nothing is configured.
 *
 * Multiple fingerprints are allowed, comma-separated: a build signed locally
 * and one signed by Play are two different certificates, and during a migration
 * both are live.
 */
export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (fingerprints.length === 0) return new NextResponse('Not configured', { status: 404 });

  return NextResponse.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
