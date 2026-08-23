import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { preparePhotoFromUri, type PreparedPhoto } from '@/lib/image';

/**
 * A photo shared into the app from somewhere else.
 *
 * The product's pitch is *say what you ate or photograph it*, and the photo half
 * used to begin with "first, open the app". Being in the share sheet moves the
 * app to where the photo already is: take it in the camera, share, pick Day So
 * Far, and land in the journal with it attached and the cursor waiting.
 *
 * Deliberately only a photo. A shared link or a PDF has no meaning here, and an
 * entry that appears in every share sheet for every file type is one people
 * learn to scroll past — so the intent filters ask for images and this ignores
 * anything else that arrives anyway.
 *
 * It stops at *attached*, not *sent*. The message is about somebody's meal and
 * putting one in the conversation without them is not the app's to do — the
 * same rule the barcode scanner already follows when a lookup misses.
 */

interface SharedPhoto {
  /** Waiting to be attached, or null. Cleared by whoever takes it. */
  pending: PreparedPhoto | null;
  /** Called by the composer once the photo is in it. */
  taken: () => void;
}

const SharedPhotoContext = createContext<SharedPhoto>({ pending: null, taken: () => {} });

export const useSharedPhoto = (): SharedPhoto => useContext(SharedPhotoContext);

/**
 * Sits inside the share-intent provider and turns whatever arrives into the
 * same `PreparedPhoto` the camera and the library produce — so everything
 * downstream is identical whether the photo came from a share sheet or from the
 * button in the composer.
 */
function Receiver({ children }: { children: React.ReactNode }) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const router = useRouter();
  const [pending, setPending] = useState<PreparedPhoto | null>(null);

  useEffect(() => {
    if (!hasShareIntent) return;
    const file = shareIntent.files?.[0];

    /*
     * Cleared immediately, before the await. The native module holds one share
     * at a time and re-announces it on every foreground until it is reset, so
     * leaving it set means the next return to the app re-attaches a photo
     * somebody has already sent.
     */
    resetShareIntent();

    if (!file || !file.mimeType?.startsWith('image/')) return;

    let cancelled = false;
    void preparePhotoFromUri(file.path, { width: file.width, height: file.height }).then(
      (photo) => {
        if (cancelled || !photo) return;
        setPending(photo);
        /*
         * The journal, because that is where the composer is. `navigate` rather
         * than `push`: a share can arrive when the app is already open on Cook,
         * and stacking a second journal behind the first would leave a back
         * gesture that goes nowhere anybody asked for.
         */
        router.navigate('/(tabs)');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  const value = useMemo<SharedPhoto>(
    () => ({ pending, taken: () => setPending(null) }),
    [pending],
  );

  return <SharedPhotoContext.Provider value={value}>{children}</SharedPhotoContext.Provider>;
}

/** Both halves, so the app mounts one thing. */
export function SharedPhotoRoot({ children }: { children: React.ReactNode }) {
  return (
    <ShareIntentProvider>
      <Receiver>{children}</Receiver>
    </ShareIntentProvider>
  );
}
