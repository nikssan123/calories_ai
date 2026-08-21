/**
 * Puts the barcode decoder's wasm where the browser can fetch it.
 *
 * zxing-wasm defaults to loading its binary from jsDelivr, which is the wrong
 * shape for this app twice over: a self-hosted deployment should not need a
 * third-party CDN to read a packet, and a phone in the aisle of a shop with one
 * bar of signal should be fetching from the origin it already has open.
 *
 * Copied at build time rather than committed, so the megabyte in `public/` is
 * always the binary belonging to the installed version. A checked-in copy would
 * be a dependency the lockfile does not know about, and it would go quietly
 * stale the first time anybody ran `pnpm up`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const destination = join(here, '..', 'public', 'zxing_reader.wasm');

await mkdir(dirname(destination), { recursive: true });
await copyFile(require.resolve('zxing-wasm/reader/zxing_reader.wasm'), destination);
console.log(`zxing_reader.wasm -> ${destination}`);
