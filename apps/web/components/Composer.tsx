'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface ComposerPayload {
  text: string;
  photoBase64?: string;
  photoMediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  photoPreview?: string;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Long edge to downscale to before upload. A phone camera produces a 12MP file
 * that base64s to several megabytes, and the upload is the fragile half of the
 * turn: it goes up a phone uplink, and the connection has to survive both it and
 * the agent's reply. The vision model reads a photo at 2576px on the long edge,
 * so everything above this is paid for twice — once on the wire, once in the
 * model's own downscale — and buys no accuracy on portion sizes.
 */
const MAX_EDGE = 2576;
const JPEG_QUALITY = 0.82;

/**
 * Re-encodes an oversized photo, and falls back to the untouched file whenever
 * the browser cannot: an unreadable image here would mean no meal logged, and
 * sending too many bytes is far better than sending none.
 */
async function prepare(
  file: File,
): Promise<{ dataUrl: string; mediaType: (typeof ACCEPTED)[number] } | null> {
  const mediaType = ACCEPTED.find((t) => t === file.type);
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

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });
}

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (payload: ComposerPayload) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; mediaType: (typeof ACCEPTED)[number] } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canSend = (text.trim().length > 0 || photo !== null) && !disabled;

  function submit() {
    if (!canSend) return;
    onSend({
      // A photo on its own is a valid log — give the model a default instruction.
      text: text.trim() || "Here's what I'm eating — log it.",
      photoBase64: photo?.dataUrl,
      photoMediaType: photo?.mediaType,
      photoPreview: photo?.dataUrl,
    });
    setText('');
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
    if (textRef.current) textRef.current.style.height = 'auto';
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const prepared = await prepare(file);
    // Mostly unreachable — Safari converts an iPhone's HEIC on the way out of
    // the picker — but dropping the file without a word would look like the
    // camera button is simply broken.
    if (!prepared) {
      toast.error('That image format is not supported. Try a JPEG or PNG.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setPhoto(prepared);
  }

  return (
    <div className="material border-border border-t px-3 py-2.5">
      {photo && (
        <div className="relative mb-2 ml-11 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="Selected meal" className="h-20 w-20 rounded-xl object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => {
              setPhoto(null);
              if (fileRef.current) fileRef.current.value = '';
            }}
            className="bg-foreground/70 text-background absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full backdrop-blur"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Add a photo"
          className="text-muted-foreground size-9 shrink-0 rounded-full"
        >
          <Camera size={22} strokeWidth={1.9} />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(',')}
          /*
           * Deliberately no `capture`: it forces the camera and hides everything
           * else, so a meal already photographed — or a screenshot of a menu, or
           * a packet's nutrition label — could not be logged at all. Without it
           * the phone offers its own picker, camera included.
           */
          onChange={(e) => void onPickFile(e)}
          className="hidden"
        />

        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Two eggs and toast…"
          disabled={disabled}
          className="border-input bg-card placeholder:text-muted-foreground focus:border-ring max-h-33 min-h-9 flex-1 resize-none rounded-[1.125rem] border px-3.5 py-[0.4375rem] text-base leading-6 outline-none disabled:opacity-60"
        />

        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="size-9 shrink-0 rounded-full transition-transform active:scale-90 disabled:opacity-30"
        >
          <ArrowUp size={20} strokeWidth={2.6} />
        </Button>
      </div>
    </div>
  );
}
