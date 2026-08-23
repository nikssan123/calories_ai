import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { PhotoMediaType } from '@ct/shared';
import { Image } from 'react-native';

/**
 * Getting a photo off the phone and onto the API.
 *
 * The web's version of this is a `<input type="file">` and a canvas; none of
 * that exists here, so the mechanism is a rebuild. The *numbers* are not — they
 * are tuned to the vision model rather than to either client, and are lifted
 * from `apps/web/lib/image.ts` deliberately rather than re-derived, because two
 * sets of them drifting apart would mean the same photo costing different bytes
 * depending on which app you logged it from.
 */

export interface PreparedPhoto {
  /** A `data:` URL. `photo_base64` on the API takes one of these or raw base64. */
  dataUrl: string;
  mediaType: PhotoMediaType;
  /** The local file URI, which is what an RN `<Image>` wants for the preview. */
  uri: string;
}

/**
 * Long edge to downscale to before upload. A phone camera produces a 12MP file
 * that base64s to several megabytes, and the upload is the fragile half: it
 * goes up a phone uplink, and the connection has to survive both it and the
 * model's reply. The vision model reads a photo at 2576px on the long edge, so
 * everything above this is paid for twice — once on the wire, once in the
 * model's own downscale — and buys no accuracy.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.82;

/** What the picker hands back, before we have done anything to it. */
type Asset = ImagePicker.ImagePickerAsset;

/**
 * Downscales and re-encodes, and falls back to the untouched asset whenever it
 * cannot: an unreadable image here means nothing logged, and sending too many
 * bytes is far better than sending none.
 */
async function prepare(asset: Asset): Promise<PreparedPhoto> {
  const longest = Math.max(asset.width, asset.height);

  try {
    if (longest > MAX_EDGE) {
      const scale = MAX_EDGE / longest;
      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri).resize({
        width: Math.round(asset.width * scale),
        height: Math.round(asset.height * scale),
      });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: JPEG_QUALITY,
        base64: true,
      });
      if (saved.base64) {
        return {
          dataUrl: `data:image/jpeg;base64,${saved.base64}`,
          mediaType: 'image/jpeg',
          uri: saved.uri,
        };
      }
    }
  } catch {
    // A codec the native side cannot read, or an out-of-memory on a huge file.
    // Fall through and send what the picker gave us.
  }

  return {
    // The picker is asked for base64 up front precisely so this path has
    // something to send: re-reading the file here would be a second failure
    // point in the branch that already exists because the first one failed.
    dataUrl: `data:${mediaTypeOf(asset)};base64,${asset.base64 ?? ''}`,
    mediaType: mediaTypeOf(asset),
    uri: asset.uri,
  };
}

/**
 * The API takes JPEG, PNG, WebP and GIF. A phone produces the first two and,
 * on iOS, HEIC — which `expo-image-picker` already transcodes to JPEG on the
 * way out, so it never reaches here. Anything unrecognised is called a JPEG
 * rather than rejected: the byte stream is whatever it is, and a wrong label on
 * a photo the model can still read beats refusing to send it.
 */
function mediaTypeOf(asset: Asset): PhotoMediaType {
  switch (asset.mimeType) {
    case 'image/png':
      return 'image/png';
    case 'image/webp':
      return 'image/webp';
    case 'image/gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

/** The rear camera — the one pointed at the plate. Null if declined or cancelled. */
export async function takePhoto(): Promise<PreparedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    base64: true,
    quality: JPEG_QUALITY,
    cameraType: ImagePicker.CameraType.back,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? prepare(asset) : null;
}

/**
 * Everything already on the phone — a meal photographed earlier, a screenshot
 * of a menu, a packet's label.
 *
 * No permission request: the modern picker runs out of process and hands back
 * only the one asset the user chose, so asking for the whole library first
 * would be requesting more than the app ever uses.
 */
export async function pickPhoto(): Promise<PreparedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    base64: true,
    quality: JPEG_QUALITY,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? prepare(asset) : null;
}

/**
 * The same treatment, for a photo that arrived from somewhere else.
 *
 * A share hands over a URI and, on a good day, the dimensions with it. `prepare`
 * needs both, so the fallback asks the image itself — which costs a decode, and
 * is still cheaper than uploading a 12MP original because a `width` came through
 * null.
 *
 * Returns null rather than throwing on anything it cannot read. A share sheet
 * can hand over a file that has already been cleaned up, a format nothing here
 * decodes, or a URI belonging to an app that has since been killed; none of
 * those is worth an error screen in front of somebody who was trying to log
 * their lunch.
 */
export async function preparePhotoFromUri(
  uri: string,
  size?: { width: number | null; height: number | null },
): Promise<PreparedPhoto | null> {
  try {
    const known =
      size && size.width !== null && size.height !== null
        ? { width: size.width, height: size.height }
        : await new Promise<{ width: number; height: number }>((resolve, reject) => {
            Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
          });
    return await prepare({ uri, ...known } as Asset);
  } catch {
    return null;
  }
}

/**
 * Put a photo the picker already wrote to disk into the bucket.
 *
 * `uploadAsync` streams the file the picker already wrote to disk, so the bytes
 * never enter JS — which is the version of this the web cannot have, since a
 * browser only ever had the image in memory. Failure returns null rather than
 * throwing: the caller falls back to `photo_base64`, which still logs the meal.
 * The cost of that fallback is that a bucket which has quietly stopped taking
 * writes looks fine from here, so the caller reports it instead of swallowing it.
 */
export async function uploadPhotoFile(
  uri: string,
  mediaType: PhotoMediaType,
  ticketUrl: string,
): Promise<boolean> {
  const result = await new File(uri).upload(ticketUrl, {
    httpMethod: 'PUT',
    headers: { 'content-type': mediaType },
  });
  // Resolves for any completed response, 4xx included, and rejects only when the
  // file cannot be read or the request never happened. So the status is the
  // thing to check, and the caller catches the rest.
  return result.status >= 200 && result.status < 300;
}
