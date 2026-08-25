'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, ImageIcon, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatMessage, PhotoMediaType, ScannedAttachment, UnitSystem } from '@ct/shared';
import { formatMass, formatServings } from '@ct/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PHOTO_ACCEPT, preparePhoto, type PreparedPhoto, useHasCameraApp } from '@/lib/image';
import { BarcodeScanner, PortionDialog, type Scan } from '@/components/BarcodeScanner';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export interface ComposerPayload {
  text: string;
  photoBase64?: string;
  photoMediaType?: PhotoMediaType;
  photoPreview?: string;
  /**
   * Packets scanned into this message, as codes rather than as panels.
   *
   * The figures are deliberately left behind: the API looks each code up in the
   * same cache the scanner just read, so nothing the browser believes about a
   * product can become nutrition. What travels is only what a person did —
   * which packets, and how much of each, where they said.
   */
  scanned?: ScannedAttachment[];
}

export function Composer({
  onSend,
  onLogged,
  disabled,
}: {
  onSend: (payload: ComposerPayload) => void;
  /**
   * Something was logged without going through the conversation — a scanned
   * packet. The server writes it into the journal itself and hands back the
   * message, so this carries it up rather than only saying that it happened:
   * the conversation grows by that row and the day beside it re-reads itself.
   */
  onLogged: (message: ChatMessage) => void;
  disabled: boolean;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<Scan[]>([]);
  /** Which chip's amount is being set, if any. */
  const [amending, setAmending] = useState<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const hasCameraApp = useHasCameraApp();

  const canSend = (text.trim().length > 0 || photo !== null || scanned.length > 0) && !disabled;

  /*
   * Whether a scan should join the message or become one.
   *
   * Words already written, or packets already attached, mean a message is being
   * assembled and the next scan is a component of it. An empty composer means
   * there is no sentence for a packet to be part of, so it gets the picker and
   * the free path to the journal that has always been behind it.
   */
  const attaching = text.trim().length > 0 || scanned.length > 0;

  function submit() {
    if (!canSend) return;
    onSend({
      // A photo on its own is a valid log — give the model a default instruction.
      text: text.trim() || "Here's what I'm eating — log it.",
      photoBase64: photo?.dataUrl,
      photoMediaType: photo?.mediaType,
      photoPreview: photo?.dataUrl,
      scanned:
        scanned.length > 0
          ? scanned.map((scan) => ({
              barcode: scan.product.barcode,
              grams: scan.grams,
              servings: scan.servings,
            }))
          : undefined,
    });
    setText('');
    setPhoto(null);
    setScanned([]);
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
      aria-label={t('composer.addPhoto')}
      className="text-muted-foreground size-10 shrink-0 rounded-full"
    >
      <Camera size={22} strokeWidth={2.2} />
    </Button>
  );

  return (
    <div
      className={cn(
        // Phone: a translucent bar welded to the bottom edge of the screen, with
        // the conversation scrolling under its blur.
        'border-border max-lg:material px-3 py-2.5 max-lg:border-t-2',
        // Desktop: nothing is welded to anything. The bar floated in the middle
        // of the window trailing a hairline off into empty space, so from `lg`
        // up it stops pretending to be chrome and becomes a card of its own.
        'lg:bg-card lg:border-border lg:focus-within:border-ring lg:chunk lg:rounded-[1.75rem] lg:border-2 lg:px-2.5 lg:py-2 lg:transition-colors',
      )}
    >
      {photo && (
        <div className="relative mb-2 ml-11 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.dataUrl}
            alt={t('composer.selectedMeal')}
            className="border-border chunk h-20 w-20 rounded-2xl border-2 object-cover"
          />
          <button
            type="button"
            aria-label={t('composer.removePhoto')}
            onClick={() => setPhoto(null)}
            className="bg-foreground text-background border-card absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border-2"
          >
            <X size={13} strokeWidth={3.2} />
          </button>
        </div>
      )}

      {/*
        Inset to the same 11 the photo thumbnail uses, so the chips line up
        under the field rather than under the camera button — they belong to the
        sentence, and the eye should read them as part of it.

        A column rather than a wrapping row: a brand and a product name is
        rarely short enough for two to share a line, and pills that wrap
        mid-name look like they broke rather than like they stacked.
      */}
      {scanned.length > 0 && (
        <div className="mb-2 ml-11 flex flex-col items-start gap-2">
          {scanned.map((scan, index) => (
            <Chip
              key={scan.product.barcode}
              scan={scan}
              onPress={() => setAmending(index)}
              onRemove={() => setScanned((held) => held.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/*
          The camera and the library are two different intents, and a phone
          cannot show both from one input: with `capture` it opens the camera
          and nothing else, without it the picker it offers varies by phone.
          So ask first, then open the input that does exactly that one thing.

          The scanner sits here as a third peer rather than in a tab of its own,
          because a barcode is another way of saying what you ate — the same
          sentence, told to the phone in a different grammar. On a desktop the
          two photo entries collapse into one and this menu still earns its
          keep, which is why it is no longer conditional on having a camera app.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger render={photoButton()} />
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-auto min-w-44"
          >
            {/*
              The one thing that most improves a photo estimate, said where it
              can still be acted on. Kept identical in wording to the mobile
              sheet — the same advice phrased two ways reads as two different
              rules.

              Measured on 30 weighed plates: the model reads calorie *density*
              almost exactly right (1.00x) and the weight on the plate 36% too
              high. A size reference is what closes that gap — with nothing in
              frame to judge against there is no telling a side plate from a
              dinner plate, and every gram after that is a guess.
            */}
            <p className="text-muted-foreground max-w-56 px-2 pt-1.5 pb-2 text-[0.8125rem] leading-snug">
              Tip: leave a fork, spoon or your hand in the shot — it tells us how big
              the plate is, which is the hardest part to guess.
            </p>
            {hasCameraApp && (
              <DropdownMenuItem
                onClick={() => cameraRef.current?.click()}
                className="gap-2.5 px-2 py-2 text-[0.9375rem]"
              >
                <Camera />
                {t('composer.takePhoto')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => libraryRef.current?.click()}
              className="gap-2.5 px-2 py-2 text-[0.9375rem]"
            >
              <ImageIcon />
              {t('composer.choosePhoto')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setScanning(true)}
              className="gap-2.5 px-2 py-2 text-[0.9375rem]"
            >
              <ScanBarcode />
              {t('composer.scanBarcode')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          placeholder={t('composer.placeholder')}
          disabled={disabled}
          className={cn(
            'border-input bg-card placeholder:text-muted-foreground focus:border-ring max-h-33 min-h-10 flex-1 resize-none rounded-[1.25rem] border-2 px-4 py-[0.5rem] text-base leading-6 font-medium outline-none disabled:opacity-60',
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
          aria-label={t('composer.send')}
          // The default variant already brings the ledge and the press; all
          // this adds is the shape and a deeper travel to suit the size.
          className="size-10 shrink-0 rounded-full disabled:opacity-30"
        >
          <ArrowUp size={21} strokeWidth={3} />
        </Button>
      </div>

      <BarcodeScanner
        open={scanning}
        onOpenChange={setScanning}
        onLogged={onLogged}
        /*
         * A miss lands here rather than dead-ending in the sheet: the label
         * photo is attached to the composer exactly as if it had been picked
         * from the camera, with a sentence saying what it is. The user still
         * presses send, because this is a message about their meal and putting
         * one in the conversation without them is not the app's to do.
         */
        onLabelPhoto={(prepared) => {
          setPhoto(prepared);
          setText((current) => current || t('composer.labelHint'));
          textRef.current?.focus();
        }}
        attaching={attaching}
        attachedCount={scanned.length}
        /*
         * A packet already on the message is not added twice.
         *
         * Two tins of the same beans is a thing people eat, and it is a thing
         * they say in words — the chip answers "what", never "how many". So a
         * repeat is far more likely a second read of the tin still in frame,
         * and a silent no-op is the right answer to it. The scanner toasts the
         * name either way, which is true: it did read it.
         */
        onAttach={(scan) =>
          setScanned((held) =>
            held.some((one) => one.product.barcode === scan.product.barcode)
              ? held
              : [...held, scan],
          )
        }
      />

      <PortionDialog
        scan={amending === null ? null : (scanned[amending] ?? null)}
        onOpenChange={(next) => {
          if (!next) setAmending(null);
        }}
        onPick={(portion) =>
          setScanned((held) =>
            held.map((one, i) => (i === amending ? { product: one.product, ...portion } : one)),
          )
        }
      />
    </div>
  );
}

/**
 * One scanned packet, sitting on the message.
 *
 * Two targets in one pill, which is the only fiddly part of it: the body opens
 * the picker and the cross removes it. The cross gets its own filled circle for
 * that reason — a chip that deleted itself when somebody meant to correct the
 * amount would be the worst failure available here, since the packet is usually
 * back in the cupboard by then.
 *
 * The amount is shown only when there is one. A chip reading "· 30 g" earned it
 * on the picker; a bare name means the sentence is carrying the amount, which
 * is the normal case and needs no apology.
 */
function Chip({
  scan,
  onPress,
  onRemove,
}: {
  scan: Scan;
  onPress: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const units = useUnits();
  const name = scan.product.brand
    ? `${scan.product.brand} ${scan.product.name}`
    : scan.product.name;
  const amount = amountLabel(scan, units);

  return (
    <div className="border-input bg-card flex max-w-full items-center gap-2 rounded-full border-2 py-[0.3125rem] pr-1.5 pl-3">
      <button
        type="button"
        onClick={onPress}
        aria-label={t('composer.setAmountFor')(name)}
        className="flex min-w-0 items-center gap-2 hover:opacity-60"
      >
        <ScanBarcode size={14} strokeWidth={2} className="text-muted-foreground shrink-0" />
        <span className="text-footnote truncate font-semibold">
          {name}
          {amount !== null && <span className="text-muted-foreground font-medium">{` · ${amount}`}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('composer.removeScan')(name)}
        className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full hover:opacity-60"
      >
        <X size={10} strokeWidth={3.2} />
      </button>
    </div>
  );
}

/**
 * How much of it, in the reader's own units — or nothing at all, when the
 * sentence is the one carrying the amount.
 */
function amountLabel(scan: Scan, units: UnitSystem): string | null {
  if (scan.grams !== undefined) return formatMass(scan.grams, units);
  if (scan.servings !== undefined) return formatServings(scan.servings);
  return null;
}
