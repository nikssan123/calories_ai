'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PhotoMediaType } from '@ct/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PHOTO_ACCEPT, preparePhoto, type PreparedPhoto, useHasCameraApp } from '@/lib/image';
import { cn } from '@/lib/utils';

export interface ComposerPayload {
  text: string;
  photoBase64?: string;
  photoMediaType?: PhotoMediaType;
  photoPreview?: string;
}

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (payload: ComposerPayload) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(
    null,
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hasCameraApp = useHasCameraApp();

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
    if (textRef.current) textRef.current.style.height = 'auto';
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    // Emptied straight away, so that re-picking the photo just removed still
    // fires a change, and so the two inputs never disagree about what is
    // attached. The `File` above survives it.
    input.value = '';
    if (!file) return;

    const prepared = await preparePhoto(file);
    // Mostly unreachable — Safari converts an iPhone's HEIC on the way out of
    // the picker — but dropping the file without a word would look like the
    // camera button is simply broken.
    if (!prepared) {
      toast.error("I can't read that image format — a JPEG or PNG will work.");
      return;
    }
    setPhoto(prepared);
  }

  const photoButton = (onClick?: () => void) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      aria-label="Add a photo"
      className="text-muted-foreground size-9 shrink-0 rounded-full"
    >
      <Camera size={22} strokeWidth={1.9} />
    </Button>
  );

  return (
    <div
      className={cn(
        // Phone: a translucent bar welded to the bottom edge of the screen, with
        // the conversation scrolling under its blur.
        'border-border max-lg:material px-3 py-2.5 max-lg:border-t',
        // Desktop: nothing is welded to anything. The bar floated in the middle
        // of the window trailing a hairline off into empty space, so from `lg`
        // up it stops pretending to be chrome and becomes a card of its own.
        'lg:bg-card lg:focus-within:border-ring lg:rounded-[1.75rem] lg:border lg:px-2.5 lg:py-2 lg:shadow-sm lg:transition-colors',
      )}
    >
      {photo && (
        <div className="relative mb-2 ml-11 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.dataUrl} alt="Selected meal" className="h-20 w-20 rounded-xl object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => setPhoto(null)}
            className="bg-foreground/70 text-background absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full backdrop-blur"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {hasCameraApp ? (
          // The camera and the library are two different intents, and a phone
          // cannot show both from one input: with `capture` it opens the camera
          // and nothing else, without it the picker it offers varies by phone.
          // So ask first, then open the input that does exactly that one thing.
          <DropdownMenu>
            <DropdownMenuTrigger render={photoButton()} />
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-auto min-w-44"
            >
              <DropdownMenuItem
                onClick={() => cameraRef.current?.click()}
                className="gap-2.5 px-2 py-2 text-[0.9375rem]"
              >
                <Camera />
                Take a photo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => libraryRef.current?.click()}
                className="gap-2.5 px-2 py-2 text-[0.9375rem]"
              >
                <ImageIcon />
                Choose a photo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          photoButton(() => libraryRef.current?.click())
        )}
        <input
          ref={cameraRef}
          type="file"
          accept={PHOTO_ACCEPT}
          // `environment` is the rear camera — the one pointed at the plate.
          capture="environment"
          onChange={(e) => void onPickFile(e)}
          className="hidden"
        />
        <input
          ref={libraryRef}
          type="file"
          accept={PHOTO_ACCEPT}
          /*
           * Deliberately no `capture` here: this is the half of the choice that
           * has to reach everything already on the phone — a meal photographed
           * earlier, a screenshot of a menu, a packet's nutrition label.
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
          className={cn(
            'border-input bg-card placeholder:text-muted-foreground focus:border-ring max-h-33 min-h-9 flex-1 resize-none rounded-[1.125rem] border px-3.5 py-[0.4375rem] text-base leading-6 outline-none disabled:opacity-60',
            // A bordered field inside the bordered desktop card is one box too
            // many; there, the card itself is the field and takes the focus ring.
            'lg:border-transparent lg:bg-transparent lg:px-1 lg:focus:border-transparent',
          )}
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
