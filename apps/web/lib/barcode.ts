'use client';

/**
 * Reading the stripes.
 *
 * Sibling of `lib/image.ts`, and for the same reason: both exist to turn a
 * camera into something the API can use, and both hold numbers tuned to a
 * decoder rather than to any one screen.
 *
 * Two implementations, chosen at runtime. `BarcodeDetector` is built into
 * Chrome and Android and costs nothing; Safari on iOS does not have it, and on
 * a food app that is not a rounding error, so the wasm decoder is lazily
 * imported for exactly the users who need it. Neither is the fallback for the
 * other's failures — they are the same function on different platforms.
 */

/** What a supermarket packet is printed in. Nothing else is worth scanning. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

/** The zxing spelling of the same list. */
const ZXING_FORMATS = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'];

/** Anything the browser can paint or hand to a decoder. */
export type DecodeSource = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | Blob;

interface BarcodeDetectorLike {
  detect(source: unknown): Promise<{ rawValue: string }[]>;
}

let detector: BarcodeDetectorLike | null | undefined;

/**
 * The native decoder, or null where there is not one.
 *
 * `getSupportedFormats` is consulted rather than trusting the constructor: a
 * browser can ship the API and support only QR codes, and a detector that
 * cannot read EAN-13 is worse than no detector at all, because it would sit in
 * front of the wasm one returning nothing forever.
 */
async function nativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (detector !== undefined) return detector;

  const Ctor = (globalThis as any).BarcodeDetector;
  let resolved: BarcodeDetectorLike | null = null;
  try {
    const supported: string[] = Ctor ? await Ctor.getSupportedFormats() : [];
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (formats.length > 0) resolved = new Ctor({ formats });
  } catch {
    resolved = null;
  }
  detector = resolved;
  return resolved;
}

/** Loaded once, on the first frame of the first scan, and only where needed. */
let zxing: Promise<typeof import('zxing-wasm/reader')> | null = null;

function loadZxing() {
  zxing ??= import('zxing-wasm/reader').then((module) => {
    // Served from our own origin rather than the library's default CDN — see
    // `scripts/copy-zxing.mjs`. Set before the first read, which is what
    // triggers the fetch.
    module.prepareZXingModule({
      overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? WASM_URL : path) },
    });
    return module;
  });
  return zxing;
}

const WASM_URL = '/zxing_reader.wasm';

/**
 * One attempt at one frame. Returns the digits, or null.
 *
 * Null is the ordinary answer and not an error: a live scanner calls this
 * several times a second and most frames are a blurry shelf. Everything that
 * throws inside is swallowed for that reason — a decoder that rejects on a bad
 * frame would tear down a scan that was about to succeed on the next one.
 */
export async function decodeBarcode(source: DecodeSource): Promise<string | null> {
  const native = await nativeDetector();
  if (native) {
    try {
      const [first] = await native.detect(source);
      return first?.rawValue ?? null;
    } catch {
      return null;
    }
  }

  try {
    const { readBarcodes } = await loadZxing();
    const input = source instanceof Blob ? source : await toImageData(source);
    if (!input) return null;

    const results = await readBarcodes(input, {
      formats: ZXING_FORMATS as never,
      // One product code, and the picture is a shelf: `tryHarder` is what makes
      // an off-axis packet held at arm's length read on the second frame rather
      // than the tenth, and the cost is milliseconds on a frame we are
      // throwing away anyway.
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });
    const hit = results.find((r) => r.isValid && r.text);
    return hit?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * A video frame as pixels the wasm decoder can read.
 *
 * Deliberately not re-encoded to JPEG on the way. `preparePhoto` compresses at
 * q0.82 for the vision model, and thin parallel bars are precisely what those
 * artifacts eat first — a photograph that decodes from the raw bitmap will fail
 * from the same photograph after a round trip through the encoder.
 */
async function toImageData(source: Exclude<DecodeSource, Blob>): Promise<ImageData | null> {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!width || !height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Decodes a barcode out of a still photograph.
 *
 * The path that always works. iOS Safari wants HTTPS and a user gesture before
 * it will open a camera stream, and has a history of being awkward about it in
 * standalone PWA mode — so when the live scanner cannot start, photographing
 * the packet is not a degraded mode, it is the same decode against a frame the
 * system camera app captured instead of us.
 *
 * The `File` goes in untouched, at full resolution, for the reason above.
 */
export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  const native = await nativeDetector();
  if (!native) return decodeBarcode(file);

  // `BarcodeDetector` takes a Blob directly in Chrome, but an ImageBitmap is
  // the shape every implementation accepts, and it applies the EXIF rotation a
  // phone photo carries — a barcode read sideways is not read at all.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      return await decodeBarcode(bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return decodeBarcode(file);
  }
}

/**
 * Whether a live camera stream is worth offering at all.
 *
 * A desktop browser with no camera, an insecure origin, and an iOS build that
 * refuses `getUserMedia` all land here — and in every one of those the honest
 * answer is to go straight to the still-photo path rather than open a sheet
 * that will fail.
 */
export function canOpenCamera(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    (window.isSecureContext || location.hostname === 'localhost')
  );
}
