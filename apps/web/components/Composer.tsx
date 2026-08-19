'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ComposerPayload {
  text: string;
  photoBase64?: string;
  photoMediaType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  photoPreview?: string;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

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

  function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const mediaType = ACCEPTED.find((t) => t === file.type);
    if (!mediaType) return;

    const reader = new FileReader();
    reader.onload = () => setPhoto({ dataUrl: String(reader.result), mediaType });
    reader.readAsDataURL(file);
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
          capture="environment"
          onChange={onPickFile}
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
