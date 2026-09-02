import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { PhotoMediaType } from '@ct/shared';
import { Alert, Image, Linking } from 'react-native';
import { messagesFor } from '@/messages';
import { preferredLocale } from '@/lib/i18n';

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
 * Downscales where it helps, and re-encodes always.
 *
 * The bytes come from here rather than from the picker, and that is the whole
 * point of the arrangement. `base64: true` on the picker made iOS encode the
 * *original* — a 12MP HEIC, several megabytes of string — before this function
 * ever ran, and then threw all of it away for any photo above `MAX_EDGE`, which
 * is every photo a phone camera takes. On one tester's device that encode never
 * came back at all: the promise never settled, so the flag the composer sets
 * around it never cleared and both the attach and the microphone buttons stayed
 * dead until the app was restarted.
 *
 * So the picker is now asked only for a file, which is the cheap thing it is
 * good at, and the encode happens here on an image already cut down to the size
 * the vision model reads at.
 */
async function prepare(asset: Asset): Promise<PreparedPhoto | null> {
  const longest = Math.max(asset.width ?? 0, asset.height ?? 0);

  try {
    let context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    if (longest > MAX_EDGE) {
      const scale = MAX_EDGE / longest;
      context = context.resize({
        width: Math.round(asset.width * scale),
        height: Math.round(asset.height * scale),
      });
    }
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
  } catch {
    // A codec the native side cannot read, or an out-of-memory on a huge file.
  }

  // Null rather than an empty `base64,`. A photo with no bytes used to attach
  // exactly like a real one — thumbnail and all — and then fail at the far end
  // with nothing on screen to explain it, which reads as the app quietly losing
  // the meal. Refusing here is what lets the caller say so.
  return null;
}

/**
 * Says why the camera is not opening, on the one refusal that never resolves
 * itself.
 *
 * A cancelled prompt needs nothing said: the person just decided not to. But
 * iOS asks for the camera exactly once, and after a "Don't Allow" every later
 * request returns denied *without showing anything at all* — so a button that
 * silently does nothing is not a button anyone will press again, and there is
 * no way back to it from inside the app. `canAskAgain` is what separates the
 * two, and the settings link is the only thing that actually fixes it.
 */
function explainCameraBlocked(): void {
  const tr = messagesFor(preferredLocale());
  Alert.alert(tr['composer.cameraBlockedTitle'], tr['composer.cameraBlockedBody'], [
    { text: tr['composer.notNow'], style: 'cancel' },
    { text: tr['composer.openSettings'], onPress: () => void Linking.openSettings().catch(() => {}) },
  ]);
}

/**
 * `prepare`, for the two paths where a person is standing there watching.
 *
 * Choosing a photo and getting nothing back is the same silence as the blocked
 * camera above and wants the same treatment. Deliberately not used by
 * `preparePhotoFromUri`: a share arrives without anyone looking at this app,
 * and an alert over whatever they were doing instead is worse than the miss.
 */
async function prepareOrExplain(asset: Asset): Promise<PreparedPhoto | null> {
  const prepared = await prepare(asset);
  if (!prepared) Alert.alert(messagesFor(preferredLocale())['composer.photoUnreadable']);
  return prepared;
}

/** The rear camera — the one pointed at the plate. Null if declined or cancelled. */
export async function takePhoto(): Promise<PreparedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    if (!permission.canAskAgain) explainCameraBlocked();
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: JPEG_QUALITY,
    cameraType: ImagePicker.CameraType.back,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? prepareOrExplain(asset) : null;
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
    quality: JPEG_QUALITY,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? prepareOrExplain(asset) : null;
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
