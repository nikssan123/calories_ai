'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImageIcon, Loader2, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import {
  type BarcodeProduct,
  type ChatMessage,
  type UnitSystem,
  GRAMS_PER_OZ,
  SERVING_STEPS,
  formatMass,
  formatServings,
  massUnit,
} from '@ct/shared';
import { useUnits } from '@/lib/units';
import { api } from '@/lib/api';
import { canOpenCamera, decodeBarcode, decodeBarcodeFromFile } from '@/lib/barcode';
import { PHOTO_ACCEPT, preparePhoto, type PreparedPhoto } from '@/lib/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/**
 * Point at a packet; get a candidate.
 *
 * The one decision the whole feature rests on is that a scan never logs. A
 * barcode says what is in 100g of a product and nothing whatever about how much
 * of it somebody ate, so the card in the middle — where a person picks a
 * portion — is the feature rather than a step on the way to it. A scanner
 * without it logs the whole 500g jar of peanut butter as one snack.
 *
 * The second decision is what happens on a miss, which is the common case in a
 * real shop: most of a trolley is supermarket own-brands nobody has catalogued.
 * Every calorie app has a scanner and almost none of them has an answer for
 * that. This one does, and it is the answer the app already had — photograph
 * the nutrition panel and let the model read it.
 */

/** How often to try a frame. Faster than this is heat with no extra hit rate. */
const FRAME_MS = 220;

type Stage =
  | { at: 'scanning' }
  | { at: 'looking'; code: string }
  | { at: 'found'; product: BarcodeProduct }
  | { at: 'missed' };

export function BarcodeScanner({
  open,
  onOpenChange,
  onLogged,
  onLabelPhoto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The entry landed, and the server wrote it into the conversation. Hands the
   * message up so the journal can grow by that row and re-read the day.
   */
  onLogged: (message: ChatMessage) => void;
  /**
   * The miss path. Hands a photograph of the nutrition panel back to whoever
   * opened this, which is the composer — so the fallback is not a second
   * feature but the meal-photo flow that already works, entered from here.
   */
  onLabelPhoto: (photo: PreparedPhoto) => void;
}) {
  const [stage, setStage] = useState<Stage>({ at: 'scanning' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stillRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [reading, setReading] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** Ask the API what the code is, and move to whichever card that implies. */
  const resolve = useCallback(
    async (code: string) => {
      setStage({ at: 'looking', code });
      try {
        setStage({ at: 'found', product: await api.barcode(code) });
      } catch (error) {
        const status = (error as { status?: number }).status;
        // A 404 is the miss and has its own screen. Anything else is a real
        // failure — and specifically not the miss, because "nobody has
        // catalogued that" would be a lie about an outage and would send
        // someone hunting for a product that is on the shelf.
        if (status === 404) setStage({ at: 'missed' });
        else {
          toast.error((error as Error).message);
          setStage({ at: 'scanning' });
        }
      }
    },
    [],
  );

  /*
   * The live scanner: a stream, and a loop reading frames off it.
   *
   * Torn down on every exit — closing the sheet, finding a code, a failure —
   * because a camera left running is a light on the back of someone's phone
   * and a battery draining behind a card they are reading.
   */
  useEffect(() => {
    if (!open || stage.at !== 'scanning') {
      stopCamera();
      return;
    }
    if (!canOpenCamera()) {
      setCameraFailed(true);
      return;
    }

    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        // `environment` is the rear camera, which is the one that can be
        // pointed at a packet while its owner looks at the screen.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (!live) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // iOS refuses to play an unmuted inline video, and a scanner has no
        // business with sound in the first place.
        await video.play();
        setCameraFailed(false);

        const step = async () => {
          if (!live) return;
          const code = await decodeBarcode(video);
          if (!live) return;
          if (code) {
            stopCamera();
            void resolve(code);
            return;
          }
          timer = setTimeout(() => void step(), FRAME_MS);
        };
        void step();
      } catch {
        // Permission refused, no camera, an iOS build being awkward in
        // standalone mode. All the same to us: the still-photo path below is
        // not a degraded mode, it is the same decode against a frame the
        // system camera captured instead of us.
        if (live) setCameraFailed(true);
      }
    })();

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      stopCamera();
    };
  }, [open, stage.at, stopCamera, resolve]);

  // Reopening starts a scan rather than resuming whatever was on screen when it
  // was last closed — a stale product card is a different packet.
  useEffect(() => {
    if (!open) {
      setStage({ at: 'scanning' });
      setCameraFailed(false);
    }
  }, [open]);

  /** Decode a photograph of the barcode, at full resolution. */
  async function onStill(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setReading(true);
    try {
      // Deliberately the untouched `File`. `preparePhoto` re-encodes at JPEG
      // q0.82 for the vision model, and thin parallel bars are exactly what
      // those artifacts eat first.
      const code = await decodeBarcodeFromFile(file);
      if (!code) {
        toast.error("I couldn't read a barcode in that — try filling more of the frame.");
        return;
      }
      await resolve(code);
    } finally {
      setReading(false);
    }
  }

  /** The miss path: a photo of the panel, handed to the journal. */
  async function onLabel(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const prepared = await preparePhoto(file);
    if (!prepared) {
      toast.error("I can't read that image format — a JPEG or PNG will work.");
      return;
    }
    onOpenChange(false);
    onLabelPhoto(prepared);
  }

  return (
    <>
      <input
        ref={stillRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => void onStill(e.currentTarget)}
      />
      <input
        ref={labelRef}
        type="file"
        accept={PHOTO_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => void onLabel(e.currentTarget)}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        {open && (
          <DialogContent
            title={stage.at === 'found' ? 'Is this it?' : 'Scan the packet'}
            description={
              stage.at === 'found'
                ? 'Say how much of it you had.'
                : 'Point at the barcode — the label comes back.'
            }
          >
            {stage.at === 'found' ? (
              <PortionCard
                product={stage.product}
                onLogged={(message) => {
                  onOpenChange(false);
                  onLogged(message);
                }}
                onRescan={() => setStage({ at: 'scanning' })}
              />
            ) : stage.at === 'missed' ? (
              <Missed
                onPhotograph={() => labelRef.current?.click()}
                onRescan={() => setStage({ at: 'scanning' })}
              />
            ) : (
              <div className="p-4">
                <div className="bg-muted border-border relative aspect-[4/3] overflow-hidden rounded-[var(--radius)] border-2">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className={cn(
                      'size-full object-cover',
                      (cameraFailed || stage.at === 'looking') && 'hidden',
                    )}
                  />

                  {(cameraFailed || stage.at === 'looking') && (
                    <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                      {stage.at === 'looking' ? (
                        <>
                          <Loader2 size={22} className="animate-spin" />
                          <p className="text-footnote tnum">{stage.code}</p>
                        </>
                      ) : (
                        <>
                          <ScanBarcode size={26} />
                          <p className="text-footnote">
                            No camera here — photograph the barcode instead and I&rsquo;ll read it
                            off the picture.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* A window rather than a full-frame free-for-all: people aim
                      at what is outlined, and a barcode filling the middle
                      third decodes several frames sooner than one in a corner. */}
                  {!cameraFailed && stage.at === 'scanning' && (
                    <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                  )}
                </div>

                <Button
                  variant="secondary"
                  disabled={reading || stage.at === 'looking'}
                  onClick={() => stillRef.current?.click()}
                  className="mt-3 h-11 w-full gap-2 rounded-full"
                >
                  {reading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  {reading ? 'Reading it…' : 'Photograph it instead'}
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/**
 * The middle pill and the "Weigh it" stepper, per measurement system.
 *
 * Two tables rather than a conversion, because these are not the same numbers
 * in different clothes. Grams step by 5 because that is what a kitchen scale
 * does; ounces step by a half because a half ounce is the finest graduation
 * most American scales show, and 5 g steps rendered in ounces would be a
 * stepper whose every press produces a new decimal.
 *
 * But the steps are for nudging — the figure between them is typed. A scale
 * reading 137 g should not have to be talked down to 135, and thirteen presses
 * to get from 100 g to 165 g is not portion control, it is a tax on being
 * accurate. So the bounds below are the API's own rather than tidier ones: a
 * number somebody typed and watched get silently clamped is a wrong number
 * logged, which is the one thing this card exists to prevent.
 */
const BASIS: Record<
  UnitSystem,
  {
    /** What the pill says, and what the figures beside it are quoted per. */
    label: string;
    grams: number;
    /** One step-unit in grams, so the stepper can hold ounces and log grams. */
    gramsPerStepUnit: number;
    weighDefault: number;
    weighMin: number;
    weighMax: number;
    weighStep: number;
    /** Digits a typed figure keeps. Grams are whole; ounces go to a tenth. */
    weighDecimals: number;
  }
> = {
  metric: {
    label: '100 g',
    grams: 100,
    gramsPerStepUnit: 1,
    weighDefault: 100,
    weighMin: 1,
    weighMax: 5000,
    weighStep: 5,
    weighDecimals: 0,
  },
  imperial: {
    label: '1 oz',
    grams: GRAMS_PER_OZ,
    gramsPerStepUnit: GRAMS_PER_OZ,
    // Four ounces is a small plated portion — the same place 100 g sits.
    weighDefault: 4,
    weighMin: 0.1,
    weighMax: 176,
    weighStep: 0.5,
    weighDecimals: 1,
  },
};

/**
 * The gap between "what this is" and "what you ate", made explicit.
 *
 * Three choices and no more. A serving when the label named one, the basis
 * every figure here is quoted in, and a number for everyone whose lunch was
 * neither. A slider would imply a precision nobody has about the amount of
 * cereal in a bowl.
 *
 * The middle pill is where the data's nationality shows. Both catalogues
 * normalise to per-100 g and the cache stores that, but 100 g is a European
 * convention: the American equivalent is the ounce, which is what a deli
 * counter and a recipe both use. So the pill reads "1 oz" and the arithmetic
 * underneath is unchanged — everything still resolves to grams before the
 * request leaves the browser, and the API never learns any of this happened.
 */
function PortionCard({
  product,
  onLogged,
  onRescan,
}: {
  product: BarcodeProduct;
  onLogged: (message: ChatMessage) => void;
  onRescan: () => void;
}) {
  const units = useUnits();
  const basis = BASIS[units];

  // Defaults to the serving when the label gave one, and to the basis amount
  // when it did not — never to a guess dressed up as a serving.
  const [mode, setMode] = useState<'serving' | 'hundred' | 'custom'>(
    product.serving_g === null ? 'hundred' : 'serving',
  );
  const [servings, setServings] = useState(1);
  // Held in whichever unit the stepper is showing, not in grams, so that
  // stepping never lands on a number the display has to round away.
  const [weighed, setWeighed] = useState(basis.weighDefault);
  const [logging, setLogging] = useState(false);

  const eatenGrams =
    mode === 'serving'
      ? servings * (product.serving_g ?? basis.grams)
      : mode === 'hundred'
        ? basis.grams
        : weighed * basis.gramsPerStepUnit;
  const share = eatenGrams / 100;

  // What goes on the first pill, and what goes under the row.
  //
  // A pill is a third of a card that is a phone wide — about ten characters —
  // and the label on it comes from a crowd: "30 g", but also "1 serving (2
  // biscuits, 25 g)". The long ones used to run out of their own pill and
  // across the one beside them. So the pill gets the weight, which is short by
  // construction and is the number the arithmetic below is done in anyway, and
  // the words the label actually used get a line to themselves underneath,
  // where they have the width of the card and can wrap.
  const servingDesc = product.serving_desc?.trim() || null;
  const servingGrams = formatMass(product.serving_g ?? 0, units);
  const servingPill = servingDesc && servingDesc.length <= 10 ? servingDesc : servingGrams;
  const servingNote =
    servingDesc === null
      ? null
      : servingPill === servingDesc
        ? `${servingGrams} a serving`
        : servingDesc;

  async function log() {
    setLogging(true);
    try {
      // Servings are sent as servings rather than converted here, so that the
      // entry reads back as the decision the user made rather than as the
      // arithmetic that followed from it.
      const { entry, message } = await api.logBarcode(
        product.barcode,
        mode === 'serving' ? { servings } : { grams: eatenGrams },
      );
      toast.success(`Logged ${entry.description} — ${Math.round(entry.kcal)} kcal`);
      onLogged(message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-3.5 p-4">
      <div>
        {product.brand && <p className="text-eyebrow text-muted-foreground">{product.brand}</p>}
        <h3 className="font-[family-name:var(--font-display)] text-[18px] leading-snug font-extrabold">
          {product.name}
        </h3>
      </div>

      <div className="text-footnote text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-figure text-foreground">
          {Math.round(product.kcal_100g * share)} kcal
        </span>
        <Macro label="P" value={product.protein_100g * share} color="var(--protein)" />
        <Macro label="C" value={product.carbs_100g * share} color="var(--carbs)" />
        <Macro label="F" value={product.fat_100g * share} color="var(--fat)" />
        <span className="tnum">{formatMass(eatenGrams, units)}</span>
      </div>

      <ToggleGroup
        value={[mode]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === 'serving' || next === 'hundred' || next === 'custom') setMode(next);
        }}
        className="bg-muted w-full rounded-full p-0.5"
      >
        {product.serving_g !== null && (
          <ToggleGroupItem
            value="serving"
            className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-9 min-w-0 flex-1 rounded-full px-2 text-footnote font-bold transition-colors"
          >
            <span className="truncate">{servingPill}</span>
          </ToggleGroupItem>
        )}
        <ToggleGroupItem
          value="hundred"
          className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-9 min-w-0 flex-1 rounded-full px-2 text-footnote font-bold transition-colors"
        >
          <span className="truncate">{basis.label}</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="custom"
          className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-9 min-w-0 flex-1 rounded-full px-2 text-footnote font-bold transition-colors"
        >
          <span className="truncate">Weigh it</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === 'serving' && (
        <Stepper
          label="servings"
          note={servingNote}
          value={servings}
          onChange={setServings}
          ladder={SERVING_STEPS}
          format={formatServings}
        />
      )}
      {mode === 'custom' && (
        <Stepper
          label="weighed"
          suffix={massUnit(units)}
          value={weighed}
          onChange={setWeighed}
          min={basis.weighMin}
          max={basis.weighMax}
          step={basis.weighStep}
          decimals={basis.weighDecimals}
        />
      )}

      <Button
        onClick={() => void log()}
        disabled={logging}
        className="h-11 w-full gap-2 rounded-full"
      >
        {logging && <Loader2 size={15} className="animate-spin" />}
        {logging ? 'Logging…' : `I ate this · ${Math.round(product.kcal_100g * share)} kcal`}
      </Button>

      <div className="text-footnote text-muted-foreground flex items-center justify-between gap-3">
        {/*
          Required by ODbL wherever the data is shown, and honest besides: these
          are crowd-sourced numbers, and someone looking at a figure that seems
          wrong deserves to know where it came from and to be able to go and fix
          it at the source.
        */}
        {product.source_url ? (
          <a
            href={product.source_url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline underline-offset-2"
          >
            {product.source === 'off' ? 'Data from Open Food Facts' : 'Data from USDA FoodData Central'}
          </a>
        ) : (
          <span>{product.source === 'off' ? 'Data from Open Food Facts' : 'Data from USDA'}</span>
        )}
        <button
          type="button"
          onClick={onRescan}
          className="hover:text-foreground shrink-0 font-semibold"
        >
          Wrong packet?
        </button>
      </div>
    </div>
  );
}

/**
 * The screen worth building carefully.
 *
 * This is the difference between a scanner that works on branded cereal and one
 * that works in a real shop. Nobody has catalogued the own-brand oat milk, and
 * dead-ending here — which is what almost every calorie app does — is what
 * teaches people the scanner is unreliable and to stop reaching for it.
 */
function Missed({
  onPhotograph,
  onRescan,
}: {
  onPhotograph: () => void;
  onRescan: () => void;
}) {
  return (
    <div className="space-y-3.5 p-4">
      <div className="text-center">
        <span aria-hidden className="mb-2 block text-[36px] leading-none">
          🔎
        </span>
        <h3 className="text-body font-semibold">Couldn&rsquo;t find it</h3>
        <p className="text-muted-foreground mt-1 text-body leading-snug">
          Nobody has catalogued that one yet — plenty of own-brands never are. Snap the nutrition
          panel instead and I&rsquo;ll read it off the label.
        </p>
      </div>

      <Button onClick={onPhotograph} className="h-11 w-full gap-2 rounded-full">
        <ImageIcon size={16} />
        Photograph the label
      </Button>
      <Button
        variant="secondary"
        onClick={onRescan}
        className="h-11 w-full gap-2 rounded-full"
      >
        <ScanBarcode size={16} />
        Scan a different packet
      </Button>
    </div>
  );
}

/**
 * A stepper, because a phone keyboard over a camera sheet is a bad time — and
 * a figure you can type into, because sometimes it is exactly what you want.
 *
 * Two ways of moving, for two kinds of quantity. Grams are linear and step by a
 * fixed amount. Servings walk a `ladder` of the fractions people eat packets in
 * — a fixed step can only ever offer multiples of itself, which is how a picker
 * ends up unable to say three quarters of a bar.
 *
 * The linear one is also an input. Anyone weighing their food has a number
 * already — off a scale, off the packet — and arriving at it five grams at a
 * time is the sort of small friction that ends with people rounding to whatever
 * the buttons can reach. The ladder stays a plain figure: a keyboard has no way
 * to say ⅔ of a bar, so typing there could only ever produce a worse answer
 * than the rung beside it.
 *
 * Typing commits on every keystroke rather than on blur, so the calorie figure
 * above moves as the digits land — and so a "137" still sitting in a focused
 * field cannot be logged as the 100 it replaced. Blur only tidies: rounds to
 * the unit's precision and lifts anything below the floor.
 */
function Stepper({
  label,
  suffix,
  note,
  value,
  onChange,
  min,
  max,
  step,
  decimals,
  ladder,
  format,
}: {
  label: string;
  /** Unit shown after the figure, when the figure has one. */
  suffix?: string;
  /** What the serving on the pill actually was, in the label's own words. */
  note?: string | null;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Digits a typed figure keeps, once it settles. */
  decimals?: number;
  /** Ascending amounts to move between, instead of a fixed step. */
  ladder?: number[];
  format?: (value: number) => string;
}) {
  const rung = ladder ? nearestRung(ladder, value) : -1;

  /*
   * What is in the field while it is being typed in, which is not always a
   * number: "1", "13", "137" all pass through on the way to a weight, and "1."
   * is a legitimate thing to be halfway through writing. Held as the string the
   * user is looking at so the field never rewrites itself under the cursor.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const atMin = ladder ? rung === 0 : value <= (min ?? 0);
  const atMax = ladder ? rung === ladder.length - 1 : value >= (max ?? Infinity);

  const settle = (raw: number) => {
    const factor = 10 ** (decimals ?? 0);
    const rounded = Math.round(raw * factor) / factor;
    return Math.min(max ?? Infinity, Math.max(min ?? 0, rounded));
  };

  const move = (delta: number) => {
    if (ladder) {
      const next = Math.min(ladder.length - 1, Math.max(0, rung + Math.sign(delta)));
      onChange(ladder[next] ?? value);
      return;
    }
    // Plain addition rather than a snap to the nearest multiple: 137 g + 5 is
    // 142, not 140. A press means "a bit more", and quietly discarding the
    // precision someone just typed in order to land on a rounder number is
    // exactly the behaviour they typed to get away from.
    //
    // The draft goes, though: it is what the field is *showing*, and a step
    // that moved the total while "137" sat on unchanged in the box would be
    // two different answers on screen at once.
    setDraft(null);
    onChange(settle(value + delta));
  };

  const shown = draft ?? String(settle(value));

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-body">How much did you have?</p>
        {note && <p className="text-footnote text-muted-foreground mt-0.5">{note}</p>}
      </div>
      <div className="bg-muted border-border flex shrink-0 items-center rounded-full border-2">
        <button
          type="button"
          onClick={() => move(-(step ?? 1))}
          disabled={atMin}
          aria-label="Less"
          className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full text-lg font-bold disabled:opacity-40"
        >
          −
        </button>
        {ladder ? (
          <span className="text-figure w-16 text-center text-body tnum" aria-live="polite">
            {format ? format(value) : value % 1 === 0 ? value : value.toFixed(1)}
          </span>
        ) : (
          /*
            Bordered rather than bare. The figure has always been typable and
            people stepped to it five grams at a time anyway, because a number
            sitting between two buttons reads as the stepper's readout — the
            same lesson every other field in the app already carries.
          */
          <span className="border-input bg-card focus-within:border-ring flex h-8 w-[5.5rem] items-center justify-center gap-1 rounded-full border-2 px-2">
            <input
              // Not `type="number"`: its spinners are a second, worse stepper
              // beside this one, and a scroll wheel over a focused one changes
              // the amount. `inputMode` gets the numeric keypad regardless.
              type="text"
              inputMode="decimal"
              aria-label={suffix ? `How much did you have, in ${suffix}` : label}
              value={shown}
              onChange={(e) => {
                const text = e.currentTarget.value;
                setDraft(text);
                const parsed = Number(text.replace(',', '.'));
                if (Number.isFinite(parsed) && parsed > 0) {
                  onChange(Math.min(max ?? Infinity, parsed));
                }
              }}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                setDraft(null);
                onChange(settle(value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="text-figure w-11 bg-transparent text-right text-body tnum outline-none"
            />
            <span className="text-muted-foreground text-footnote">{suffix ?? ''}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => move(step ?? 1)}
          disabled={atMax}
          aria-label="More"
          className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full text-lg font-bold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Which rung the ladder is standing on. Nearest rather than exact, because ⅓
 * is 0.333… and an equality test against it is a coin flip.
 */
function nearestRung(ladder: number[], value: number): number {
  let best = 0;
  let closest = Infinity;
  ladder.forEach((candidate, index) => {
    const gap = Math.abs(candidate - value);
    if (gap < closest) {
      closest = gap;
      best = index;
    }
  });
  return best;
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="tnum inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {Math.round(value)}g {label}
    </span>
  );
}
