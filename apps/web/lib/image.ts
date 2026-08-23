'use client';

import { useEffect, useState } from 'react';
import type { PhotoMediaType } from '@ct/shared';
import { PHOTO_MEDIA_TYPES } from '@ct/shared';

/**
 * Getting a photo off a phone and onto the API.
 *
 * Shared by the two places that take one — the journal's meal photo and the
 * kitchen's fridge scan — because the numbers below are tuned to the vision
 * model rather than to either screen, and a second copy would drift from the
 * first the moment one of them was adjusted.
 */

export interface PreparedPhoto {
  dataUrl: string;
  mediaType: PhotoMediaType;
}

/**
 * Long edge to downscale to before upload. A phone camera produces a 12MP file
 * that base64s to several megabytes, and the upload is the fragile half: it goes
 * up a phone uplink, and the connection has to survive both it and the model's
 * reply. The vision model reads a photo at 2576px on the long edge, so
 * everything above this is paid for twice — once on the wire, once in the
 * model's own downscale — and buys no accuracy.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.82;

/**
 * Re-encodes an oversized photo, and falls back to the untouched file whenever
 * the browser cannot: an unreadable image here would mean nothing logged and
 * nothing scanned, and sending too many bytes is far better than sending none.
 *
 * Null when the file is not an image type the API accepts.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto | null> {
  const mediaType = PHOTO_MEDIA_TYPES.find((t) => t === file.type);
  if (!mediaType) return null;

  try {
    // `from-image` applies the EXIF rotation that phones rely on; without it a
    // portrait photo reaches the model on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale < 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), mediaType: 'image/jpeg' };
        }
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // No createImageBitmap, a codec the canvas cannot read, a tainted canvas.
  }

  return { dataUrl: await readDataUrl(file), mediaType };
}

export function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("I couldn't read that photo — mind trying again?"));
    reader.readAsDataURL(file);
  });
}

/**
 * Whether the device has a camera app to hand the photo off to. Only a phone or
 * a tablet does: a desktop browser ignores `capture` and opens the same file
 * dialog either way, so offering the choice there would be two menu items that
 * do the same thing. Starts false so the server-rendered markup is the plain
 * button, and settles on the first client effect.
 */
export function useHasCameraApp() {
  const [hasCameraApp, setHasCameraApp] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const apply = () => setHasCameraApp(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return hasCameraApp;
}

/** The `accept` attribute for a photo input, from the one list of formats. */
export const PHOTO_ACCEPT = PHOTO_MEDIA_TYPES.join(',');

/**
 * The prepared data URL as bytes, for uploading straight to the bucket.
 *
 * `fetch` on a `data:` URL is the browser's own decoder — shorter than hand
 * rolling atob/Uint8Array, and it gets the media type right without being told.
 */
export async function asBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
