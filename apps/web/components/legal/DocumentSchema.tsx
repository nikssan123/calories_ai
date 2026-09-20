import { documentSchema, jsonLd } from '@/lib/schema';

/**
 * The JSON-LD for one document page, as a server component.
 *
 * A server component and not part of `<LegalPage>` itself, which opens with
 * `'use client'`. `ORIGIN` is read from `APP_URL`, which carries no
 * `NEXT_PUBLIC_` prefix and is therefore `undefined` in a browser bundle — built
 * inside a client component it would serialise one set of URLs on the server and
 * another after hydration, which is a mismatch warning at best and wrong
 * structured data at worst.
 *
 * So the six pages each render this beside their `<LegalPage>` rather than
 * through it. One line per page, and the data stays on the server.
 */
export function DocumentSchema(props: Parameters<typeof documentSchema>[0]) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(documentSchema(props)) }}
    />
  );
}
