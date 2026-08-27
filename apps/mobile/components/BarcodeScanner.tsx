import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { BarcodeProduct, ChatMessage, UnitSystem } from '@ct/shared';
import { GRAMS_PER_OZ, SERVING_STEPS, formatMass, formatServings, massUnit } from '@ct/shared';
import { ApiError } from '@ct/api-client';
import { PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { pickPhoto, takePhoto, type PreparedPhoto } from '@/lib/image';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';

/**
 * A packet, read off its barcode.
 *
 * The web does this with `BarcodeDetector` and a `zxing-wasm` fallback, neither
 * of which exists here — so the decoding is a rebuild on `expo-camera`'s native
 * scanner rather than a port. What is not a rebuild is the shape of the flow,
 * which is the part that was designed: scan, look up, and then a portion picker
 * that never guesses how much you ate.
 *
 * The miss is the interesting state. Roughly a fifth of shelves are own-brands
 * nobody has catalogued, and a scanner that says "not found" and stops has
 * failed the person holding the packet — the label is right there, and the
 * journal can read it. So a miss offers the label photo rather than an apology.
 */

/**
 * How long a barcode counts as already read.
 *
 * Long enough to cover a packet still sitting in frame while the confirmation
 * is on screen, short enough that pointing away and back is a rescan rather
 * than a wait.
 */
const REPEAT_MS = 2500;

/**
 * A packet on its way into a message, rather than into the log.
 *
 * The amount is optional and its absence is the normal case: somebody who has
 * already written "half a tin of beans" has said how much, and a picker that
 * insists on hearing it again is asking twice. It is here when they set it
 * deliberately, and then it outranks the sentence.
 */
export interface Scan {
  product: BarcodeProduct;
  grams?: number;
  servings?: number;
}

/** Either way of saying how much, as the picker hands it back. */
type Portioned = { grams?: number; servings?: number };

type Stage =
  | { at: 'scanning' }
  | { at: 'looking'; code: string }
  | { at: 'found'; product: BarcodeProduct }
  | { at: 'missed' };

export function BarcodeScanner({
  open,
  onClose,
  onLogged,
  onLabelPhoto,
  attaching,
  attachedCount,
  onAttach,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The entry landed, and the server wrote it into the conversation. Hands the
   * message up so the journal can grow by that row and re-read the day.
   */
  onLogged: (message: ChatMessage) => void;
  /**
   * A miss hands the label photo back to the composer rather than dead-ending.
   * The user still presses send: this is a message about their meal, and
   * putting one in the conversation without them is not the app's to do.
   */
  onLabelPhoto: (photo: PreparedPhoto) => void;
  /**
   * Whether there are words in the composer waiting for these packets.
   *
   * The one piece of state that decides what a scan *is*. Mid-sentence, a
   * packet is a component of something being described, so it goes straight
   * into the message and the camera stays up. With an empty composer there is
   * no sentence for it to be part of, so it is the meal itself and gets the
   * picker it has always had — which is also the free path, since a scan
   * logged on its own never troubles a model.
   *
   * Not hidden state: they typed it, a moment ago, on the screen underneath.
   */
  attaching: boolean;
  /** How many are already on the message, for the tally along the bottom. */
  attachedCount: number;
  onAttach: (scan: Scan) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>({ at: 'scanning' });
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  /*
   * The packet that just landed, held on screen long enough to be read.
   *
   * The whole point of scanning without a sheet is that nothing stops, which
   * leaves nothing to confirm that anything happened either — the buzz says
   * "I have it" and the viewfinder looks identical afterwards. So the name
   * comes back for a couple of seconds, which is the smallest thing that can
   * distinguish "read the tortillas" from "read the tortillas twice".
   */
  const [caught, setCaught] = useState<string | null>(null);
  const fading = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((name: string) => {
    setCaught(name);
    if (fading.current) clearTimeout(fading.current);
    fading.current = setTimeout(() => setCaught(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (fading.current) clearTimeout(fading.current);
    },
    [],
  );

  /*
   * The native scanner fires continuously while a code is in frame — several
   * times a second, on every frame that decodes. Without this the first read
   * would start a lookup and the next twenty would start twenty more.
   */
  const claimed = useRef(false);

  /*
   * The code that already landed, and when it was last seen.
   *
   * `claimed` only covers the lookup itself. Mid-sentence the camera never
   * stops, so the instant a packet is attached the guard drops and the same
   * barcode — still in frame, still decoding several times a second — is read
   * again, and again. The composer refuses the duplicate chip, so nothing on
   * screen moves and the loop is invisible; the lookups behind it are not, and
   * thirty inside a minute is the burst limit spent and "too many requests"
   * shown to somebody who scanned one thing.
   *
   * The window refreshes on every suppressed read, so it measures time out of
   * frame rather than time since the read: a packet held up while its owner
   * checks the tally cannot re-fire underneath them. Point away and back to
   * scan the same product again on purpose.
   */
  const settled = useRef<{ code: string; at: number } | null>(null);

  const onScanned = useCallback(async (code: string) => {
    if (claimed.current) return;
    const last = settled.current;
    if (last && last.code === code && Date.now() - last.at < REPEAT_MS) {
      last.at = Date.now();
      return;
    }
    claimed.current = true;
    settled.current = { code, at: Date.now() };
    /*
     * Here rather than after the lookup: this is the instant the frame
     * resolved, and it is the instant the user is waiting on. They are holding
     * a tin at an angle that makes the screen hard to read, so the buzz is
     * doing the job the screen cannot — "stop moving, I have it". What the
     * product turns out to be is a second question, answered a moment later
     * by the sheet.
     */
    haptics.captured();

    setStage({ at: 'looking', code });
    try {
      const product = await api.barcode(code);
      /*
       * Mid-sentence: into the message, and the camera never leaves. Somebody
       * assembling a burrito out of three packets is holding all three, and a
       * sheet between each pair of scans is three dismissals for a meal they
       * have already described in words.
       *
       * No portion goes with it. The sentence carries the amount, and the chip
       * can be tapped later by anyone who weighed it.
       */
      if (attaching) {
        onAttach({ product });
        flash(product.brand ? `${product.brand} ${product.name}` : product.name);
        // The lookup spent part of the window. Restart it from the hand-off,
        // which is the moment the camera goes live again.
        settled.current = { code, at: Date.now() };
        claimed.current = false;
        setStage({ at: 'scanning' });
        return;
      }
      setStage({ at: 'found', product });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setStage({ at: 'missed' });
      } else {
        setError((e as Error).message);
        setStage({ at: 'scanning' });
        claimed.current = false;
      }
    }
  }, [attaching, onAttach, flash]);

  function rescan() {
    claimed.current = false;
    // Asked for, so the packet in frame is fair game again even if it is the
    // one that just failed.
    settled.current = null;
    setError(null);
    setStage({ at: 'scanning' });
  }

  function close() {
    claimed.current = false;
    settled.current = null;
    setStage({ at: 'scanning' });
    setError(null);
    setCaught(null);
    onClose();
  }

  /** A packet the picker settled an amount for. Deliberate, so the sheet ends. */
  function attach(product: BarcodeProduct, portion: Portioned) {
    onAttach({ product, ...portion });
    haptics.logged();
    close();
  }

  /**
   * The meal *is* the packet. Unchanged, and unchanged on purpose: this is the
   * path that reaches the journal without a model in it, and putting a paid
   * turn in front of every scan of a cereal box is the thing that would be
   * quietly lost by routing everything through the composer.
   */
  async function logIt(product: BarcodeProduct, portion: Portioned) {
    setLogging(true);
    try {
      const { message } = await api.logBarcode(product.barcode, portion);
      haptics.logged();
      onLogged(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLogging(false);
    }
  }

  async function labelPhoto(source: 'camera' | 'library') {
    const prepared = source === 'camera' ? await takePhoto() : await pickPhoto();
    if (!prepared) return;
    close();
    onLabelPhoto(prepared);
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={close}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.bar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('barcode.title')}</Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M18 6 6 18M6 6l12 12"
                stroke={colors.mutedForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Pressable>
        </View>

        {stage.at === 'scanning' || stage.at === 'looking' ? (
          <View style={[styles.viewfinder, permission?.granted && styles.live]}>
            {permission?.granted ? (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{
                    // The formats actually printed on food. Narrowing the list
                    // is what stops a QR code on the back of the packet being
                    // read as the product.
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
                  }}
                  onBarcodeScanned={({ data }) => void onScanned(data)}
                />
                {/* A window rather than instructions: where to put the packet is
                    a shape, and a sentence about it is a sentence to read while
                    holding a tin. */}
                <View style={styles.window} pointerEvents="none" />
                <View style={styles.hint} pointerEvents="none">
                  <Text style={[t.footnoteSemibold, styles.hintText]}>
                    {stage.at === 'looking' ? tr('barcode.lookingUp') : tr('barcode.pointAtBarcode')}
                  </Text>
                </View>
                {caught && (
                  <View
                    style={[styles.caught, { backgroundColor: colors.card, borderColor: colors.border }]}
                    pointerEvents="none"
                  >
                    <View style={[styles.tick, { backgroundColor: colors.primary }]}>
                      <Svg width={12} height={12} viewBox="0 0 24 24">
                        <Path
                          d="M5 13l4 4L19 7"
                          stroke={colors.primaryForeground}
                          strokeWidth={3.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[t.footnoteSemibold, styles.caughtName, { color: colors.foreground }]}
                    >
                      {tr('barcode.added')(caught)}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.permission}>
                <Text style={styles.mascot}>📷</Text>
                <Text style={[t.body, styles.centred, { color: colors.foreground }]}>
                  {permission === null
                    ? tr('barcode.checkingCamera')
                    : tr('barcode.needsCamera')}
                </Text>
                {permission !== null && !permission.granted && (
                  <>
                    <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
                      Nothing is uploaded — the code is read on the phone.
                    </Text>
                    <PressableChunk
                      radius={999}
                      color={colors.caloriesDeep}
                      onPress={() => void requestPermission()}
                      accessibilityRole="button"
                      style={styles.permissionButton}
                      contentStyle={[styles.button, { backgroundColor: colors.primary }]}
                    >
                      <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
                        Allow the camera
                      </Text>
                    </PressableChunk>
                  </>
                )}
              </View>
            )}
          </View>
        ) : stage.at === 'found' ? (
          <Portion
            product={stage.product}
            primary={{
              label: tr('barcode.iAteThis'),
              onPress: (portion) => void logIt(stage.product, portion),
            }}
            /*
             * Offered even here, where the composer was empty when the camera
             * opened. Somebody who scans first and types after has not done
             * anything wrong, and a sheet whose only exit logs the packet as a
             * meal of its own would make them undo it to say what it went into.
             */
            secondary={{
              label: tr('barcode.addToMessage'),
              onPress: (portion) => attach(stage.product, portion),
            }}
            onRescan={rescan}
            busy={logging}
            busyLabel={tr('recipe.logging')}
          />
        ) : (
          <Missed onLabelPhoto={labelPhoto} onRescan={rescan} />
        )}

        {/*
          The running total, and the way out.

          Only while the camera is up, and only mid-sentence: a scan that ends
          in the picker has its own buttons, and a tally under them would be a
          second answer to "what happens now". Here there is no sheet to end
          the flow, so something has to say how many landed and where the door
          is — the count is also the only correction available for a packet
          scanned twice, since it is what makes the second one visible.
        */}
        {attaching && (stage.at === 'scanning' || stage.at === 'looking') && (
          <View
            style={[
              styles.tally,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + 14,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[t.footnoteSemibold, styles.tallyText, { color: colors.mutedForeground }]}
            >
              {attachedCount === 0
                ? tr('barcode.nothingAddedYet')
                : tr('barcode.addedToMessage')(attachedCount)}
            </Text>
            <PressableChunk
              radius={999}
              color={colors.caloriesDeep}
              onPress={close}
              accessibilityRole="button"
              contentStyle={[styles.done, { backgroundColor: colors.primary }]}
            >
              <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
                {tr('common.done')}
              </Text>
            </PressableChunk>
          </View>
        )}

        {error && (
          <Text style={[t.footnoteSemibold, styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
      </View>
    </Modal>
  );
}

/**
 * What every figure on the card is quoted against, and how the third pill moves.
 *
 * Both catalogues normalise to per-100 g and the cache stores that, but 100 g
 * is a European convention: the American equivalent is the ounce, which is what
 * a deli counter and a recipe both use. So the pill reads "1 oz" and the
 * arithmetic underneath is unchanged — it still resolves to grams before the
 * request leaves the phone, and the API never learns any of this happened.
 *
 * The weighed amounts are two tables rather than a conversion, because they are
 * not the same numbers in different clothes. Grams step by 5 because that is
 * what a kitchen scale does; ounces step by a half because a half ounce is the
 * finest graduation most American scales show, and 5 g steps rendered in ounces
 * would be a stepper whose every press produces a new decimal. Neither step is
 * how you *arrive* at 137 g — the field is, and holding a step is — so both stay
 * the size of "a bit more" rather than shrinking to something that could cross
 * the range one press at a time. The bounds are the API's own rather than tidier
 * ones: a figure somebody typed and watched get silently clamped is a wrong
 * number logged.
 */
const BASIS: Record<
  UnitSystem,
  {
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
 * How much of it was eaten.
 *
 * Never guessed. The packet says what the food is; only a person can say how
 * much of it they had, and a scanner that logs "one serving" because that is
 * the easiest thing to assume is the failure mode this whole app exists to
 * avoid — a wrong number is trusted, a missing one is not.
 *
 * Which is also why there are three pills and not two. Somebody who put their
 * lunch on a scale knows it was 137 g, and a card that can only offer them a
 * serving or a flat 100 g is asking them to round an exact number into a wrong
 * one. So "Weigh it" takes the figure directly — typed, with the steps beside
 * it for nudging rather than for arriving.
 *
 * The servings walk `SERVING_STEPS` rather than stepping by a fixed half, for
 * the same reason and in the other direction: half a tin, a third of a pizza,
 * three quarters of a bar are the answers people actually give, and a fixed
 * step can only ever offer multiples of itself. Nothing on a half-serving
 * ladder can say a third at all.
 */
function Portion({
  product,
  primary,
  secondary,
  onRescan,
  busy,
  busyLabel,
  initial,
}: {
  product: BarcodeProduct;
  primary: PortionAction;
  secondary?: PortionAction;
  onRescan?: () => void;
  busy?: boolean;
  busyLabel?: string;
  /** An amount already settled, for a chip being amended rather than a new scan. */
  initial?: Portioned;
}) {
  const colors = useColors();
  const tr = useT();
  const units = useUnits();
  const basis = BASIS[units];
  /*
   * Opened on whichever pill the amount is already expressed in, so that
   * amending a chip starts from the answer rather than from the default. A
   * sheet that reopened on "1 serving" after somebody typed 137g would be
   * offering to lose their number.
   */
  const [mode, setMode] = useState<'serving' | 'hundred' | 'custom'>(
    initial?.servings !== undefined && product.serving_g !== null
      ? 'serving'
      : initial?.grams !== undefined
        ? 'custom'
        : product.serving_g === null
          ? 'hundred'
          : 'serving',
  );
  const [servings, setServings] = useState(initial?.servings ?? 1);
  const rung = nearestRung(servings);
  /*
   * Held in whichever unit the stepper is showing rather than in grams, so that
   * stepping never lands on a number the display has to round away — and beside
   * it, whatever is in the field mid-typing, which is not always a number: "1",
   * "13", "137" all pass through on the way to a weight, and "1." is a
   * legitimate thing to be halfway through writing.
   */
  const [weighed, setWeighed] = useState(
    initial?.grams === undefined ? basis.weighDefault : initial.grams / basis.gramsPerStepUnit,
  );
  const [draft, setDraft] = useState<string | null>(null);

  /** Rounded to the unit's precision and inside the API's bounds. */
  const settle = (raw: number) => {
    const factor = 10 ** basis.weighDecimals;
    const rounded = Math.round(raw * factor) / factor;
    return Math.min(basis.weighMax, Math.max(basis.weighMin, rounded));
  };

  /*
   * A step off a typed figure. The field keeps a `draft` while it is focused
   * and the keypad does not go away when a step is pressed, so without dropping
   * it here a "137" would stay on screen while the total below moved to 142.
   */
  const nudge = (direction: 1 | -1) => {
    setDraft(null);
    setWeighed((w) => settle(w + direction * basis.weighStep));
  };

  const eatenGrams =
    mode === 'serving'
      ? servings * (product.serving_g ?? basis.grams)
      : mode === 'hundred'
        ? basis.grams
        : weighed * basis.gramsPerStepUnit;
  const share = eatenGrams / 100;

  /*
   * Servings stay servings rather than being converted here, so that whatever
   * receives this — the log, or a chip on a message — reads back as the
   * decision the user made rather than as the arithmetic that followed from it.
   */
  const portion: Portioned = mode === 'serving' ? { servings } : { grams: eatenGrams };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      {/* `handled` so that the first tap on "I ate this" logs, rather than
          being swallowed dismissing the keypad the weight was typed on. */}
      <ScrollView contentContainerStyle={styles.product} keyboardShouldPersistTaps="handled">
        <View>
          {product.brand && (
            <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{product.brand}</Text>
          )}
          <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
          <Text style={[t.footnote, styles.basis, { color: colors.mutedForeground }]}>
            {Math.round((product.kcal_100g * basis.grams) / 100)} kcal ·{' '}
            {Math.round((product.protein_100g * basis.grams) / 100)}g protein per {basis.label}
          </Text>
        </View>

        <View style={styles.modes}>
          {product.serving_g !== null && (
            <Mode
              on={mode === 'serving'}
              onPress={() => setMode('serving')}
              label={product.serving_desc?.trim() && product.serving_desc.trim().length <= 10
                ? product.serving_desc.trim()
                : formatMass(product.serving_g, units)}
            />
          )}
          <Mode on={mode === 'hundred'} onPress={() => setMode('hundred')} label={basis.label} />
          <Mode on={mode === 'custom'} onPress={() => setMode('custom')} label={tr('barcode.weighIt')} />
        </View>

        {mode === 'serving' && (
          <View style={styles.stepper}>
            <Text style={[t.body, { color: colors.foreground }]}>{tr('barcode.howMany')}</Text>
            <View style={[styles.steps, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Step
                sign="minus"
                disabled={rung === 0}
                onStep={() => setServings((s) => climb(s, -1))}
              />
              <Text style={[t.figure, styles.count, { color: colors.foreground }]}>
                {formatServings(servings)}
              </Text>
              <Step
                sign="plus"
                disabled={rung === SERVING_STEPS.length - 1}
                onStep={() => setServings((s) => climb(s, 1))}
              />
            </View>
          </View>
        )}

        {mode === 'custom' && (
          <View style={styles.stepper}>
            <View style={styles.stepperLabel}>
              <Text style={[t.body, { color: colors.foreground }]}>{tr('barcode.howMuch')}</Text>
              {/* The field was already typable and nobody found it: a bare
                  figure between two buttons reads as the stepper's readout, so
                  people pressed + until they got close and logged that. */}
              <Text style={[t.footnote, styles.typeHint, { color: colors.mutedForeground }]}>
                Tap the figure to type it
              </Text>
            </View>
            <View style={[styles.steps, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Step
                sign="minus"
                disabled={weighed <= basis.weighMin}
                onStep={() => nudge(-1)}
              />
              <View style={[styles.typed, { backgroundColor: colors.card, borderColor: colors.input }]}>
                <TextInput
                  value={draft ?? String(settle(weighed))}
                  /*
                   * Committed on every keystroke rather than on blur, so the
                   * total below moves as the digits land — and so a "137" still
                   * sitting in a focused field cannot be logged as the 100 it
                   * replaced. Blur only tidies.
                   */
                  onChangeText={(text) => {
                    setDraft(text);
                    const parsed = Number(text.replace(',', '.'));
                    if (Number.isFinite(parsed) && parsed > 0) {
                      setWeighed(Math.min(basis.weighMax, parsed));
                    }
                  }}
                  onBlur={() => {
                    setDraft(null);
                    setWeighed((w) => settle(w));
                  }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel={`How much did you have, in ${massUnit(units)}`}
                  style={[styles.typedInput, { color: colors.foreground, fontFamily: font.display }]}
                />
                <Text style={[t.footnote, { color: colors.mutedForeground }]}>{massUnit(units)}</Text>
              </View>
              <Step
                sign="plus"
                disabled={weighed >= basis.weighMax}
                onStep={() => nudge(1)}
              />
            </View>
          </View>
        )}

        <View style={[styles.total, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[t.figure, styles.totalFigure, { color: colors.foreground }]}>
            {Math.round(product.kcal_100g * share)}
          </Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            kcal · {Math.round(product.protein_100g * share)}g protein ·{' '}
            {formatMass(eatenGrams, units)}
          </Text>
        </View>

        <PressableChunk
          radius={999}
          color={colors.caloriesDeep}
          onPress={() => primary.onPress(portion)}
          disabled={busy}
          accessibilityRole="button"
          contentStyle={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
            {busy && busyLabel ? busyLabel : primary.label}
          </Text>
        </PressableChunk>

        {secondary && (
          <PressableChunk
            radius={999}
            onPress={() => secondary.onPress(portion)}
            disabled={busy}
            accessibilityRole="button"
            contentStyle={[
              styles.button,
              styles.outlined,
              { backgroundColor: colors.card, borderColor: colors.input },
            ]}
          >
            <Text style={[t.bodyBold, { color: colors.foreground }]}>{secondary.label}</Text>
          </PressableChunk>
        )}

        {onRescan && (
          <Pressable onPress={onRescan} accessibilityRole="button" hitSlop={8}>
            <Text style={[t.footnoteSemibold, styles.centred, { color: colors.mutedForeground }]}>
              {tr('barcode.scanAnother')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The picker on its own, for a chip somebody wants to be exact about.
 *
 * The same component the scanner shows, reached from the other end: there, a
 * packet has just been read and the question is what to do with it; here it is
 * already on the message and the only question left is how much. So there is no
 * camera, no "scan another", and one button.
 *
 * Keyed on the scan so that opening it for a second chip remounts rather than
 * inheriting the first one's stepper — `Portion` seeds its state once, which is
 * exactly right for a fresh scan and exactly wrong for a sheet reopened over a
 * different product.
 */
export function PortionSheet({
  scan,
  onClose,
  onPick,
}: {
  scan: Scan | null;
  onClose: () => void;
  onPick: (portion: Portioned) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={scan !== null} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.bar, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('barcode.howMuch')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M18 6 6 18M6 6l12 12"
                stroke={colors.mutedForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Pressable>
        </View>

        {scan && (
          <Portion
            key={scan.product.barcode}
            product={scan.product}
            initial={{ grams: scan.grams, servings: scan.servings }}
            primary={{
              label: tr('barcode.setTheAmount'),
              onPress: (portion) => {
                onPick(portion);
                onClose();
              },
            }}
          />
        )}
      </View>
    </Modal>
  );
}

/** One of the picker's buttons: what it says, and what it does with the amount. */
interface PortionAction {
  label: string;
  onPress: (portion: Portioned) => void;
}

/**
 * A packet nobody has catalogued.
 *
 * Not an apology. The label is in the user's hand and the journal can read it,
 * so the useful next step is the camera — the same one the composer uses, with
 * a sentence saying what the photo is.
 */
function Missed({
  onLabelPhoto,
  onRescan,
}: {
  onLabelPhoto: (source: 'camera' | 'library') => Promise<void>;
  onRescan: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  return (
    <View style={styles.missed}>
      <Text style={styles.mascot}>🔍</Text>
      <Text style={[t.body, styles.centred, { color: colors.foreground }]}>
        That one isn&rsquo;t catalogued.
      </Text>
      <Text style={[t.footnote, styles.centred, { color: colors.mutedForeground }]}>
        Own-brands often aren&rsquo;t. Photograph the nutrition label instead and the journal
        will read it.
      </Text>

      <PressableChunk
        radius={999}
        color={colors.caloriesDeep}
        onPress={() => void onLabelPhoto('camera')}
        accessibilityRole="button"
        style={styles.missedButton}
        contentStyle={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
          Photograph the label
        </Text>
      </PressableChunk>

      <Pressable onPress={onRescan} accessibilityRole="button" hitSlop={8}>
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{tr('barcode.scanAnother')}</Text>
      </Pressable>
    </View>
  );
}

function Mode({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const colors = useColors();
  const tr = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        styles.mode,
        {
          backgroundColor: on ? colors.primary : colors.muted,
          borderColor: on ? 'transparent' : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={[styles.modeLabel, { color: on ? colors.primaryForeground : colors.mutedForeground }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One press of a stepper, and — held down — a run of them.
 *
 * Five grams is the right size for "a bit more" and the wrong size for crossing
 * sixty of them to reach what the scale said, which was eight presses and the
 * reason people gave up and logged a round number instead. Holding the button
 * runs the same step on a repeat, so the far end of the range costs a finger
 * held down rather than a count of taps.
 *
 * The repeat is armed on touch-down but only starts after a pause, because a
 * `Pressable` inside a `ScrollView` sees touch-down before the scroll is
 * recognised. A flick past a stepper cancels the press well inside that pause,
 * which is what keeps scrolling the sheet from moving the number.
 */
function Step({
  sign,
  disabled,
  onStep,
}: {
  sign: 'minus' | 'plus';
  disabled?: boolean;
  onStep: () => void;
}) {
  const colors = useColors();
  const tr = useT();
  const armed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Whether the hold already moved the number, so the release does not again. */
  const repeated = useRef(false);

  const stop = useCallback(() => {
    if (armed.current) clearTimeout(armed.current);
    if (running.current) clearInterval(running.current);
    armed.current = null;
    running.current = null;
  }, []);

  /*
   * Two ways a hold can end without a finger lifting: the sheet closes under
   * it, and the value reaches the end of its range, which disables the button
   * mid-press and takes the touch — and its `onPressOut` — with it. Either one
   * would leave the repeat ticking on its own.
   */
  useEffect(() => {
    if (disabled) stop();
    return stop;
  }, [disabled, stop]);

  const step = () => {
    // The faintest one there is: this fires ten times a second under a hold.
    haptics.selected();
    onStep();
  };

  return (
    <Pressable
      onPress={() => {
        if (repeated.current) {
          repeated.current = false;
          return;
        }
        step();
      }}
      onPressIn={() => {
        repeated.current = false;
        armed.current = setTimeout(() => {
          running.current = setInterval(() => {
            repeated.current = true;
            step();
          }, 90);
        }, 400);
      }}
      onPressOut={stop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={sign === 'plus' ? tr('recipe.more') : tr('recipe.less')}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.step,
        { opacity: disabled ? 0.35 : pressed ? 0.5 : 1 },
      ]}
    >
      <Svg width={15} height={15} viewBox="0 0 24 24">
        <Path
          d={sign === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'}
          stroke={colors.mutedForeground}
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

/**
 * Which rung the serving ladder is standing on. Nearest rather than exact,
 * because a third is 0.333… and an equality test against it is a coin flip.
 */
function nearestRung(value: number): number {
  let best = 0;
  let closest = Infinity;
  SERVING_STEPS.forEach((candidate, index) => {
    const gap = Math.abs(candidate - value);
    if (gap < closest) {
      closest = gap;
      best = index;
    }
  });
  return best;
}

/** One rung up or down, stopping at the ends rather than wrapping. */
function climb(value: number, direction: 1 | -1): number {
  const next = Math.min(SERVING_STEPS.length - 1, Math.max(0, nearestRung(value) + direction));
  return SERVING_STEPS[next] ?? value;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* Black only behind a running camera. The permission panel is page furniture,
     and on a black backdrop its themed text was brown-on-black in light mode. */
  live: { backgroundColor: '#000' },
  window: {
    width: '72%',
    aspectRatio: 1.6,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  hint: { position: 'absolute', bottom: 48 },
  hintText: { color: '#fff' },
  /* Above the hint rather than over the window: the packet in frame is the
     thing being aimed, and a card across it would cover what it is confirming. */
  caught: {
    position: 'absolute',
    bottom: 84,
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 14,
  },
  tick: { width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  caughtName: { flexShrink: 1 },
  tally: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tallyText: { flexShrink: 1 },
  done: {
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permission: { alignSelf: 'stretch', padding: 32, gap: 12, alignItems: 'center' },
  permissionButton: { alignSelf: 'stretch', marginTop: 12 },
  centred: { textAlign: 'center' },
  product: { padding: 20, gap: 16 },
  productName: { fontFamily: font.display, fontSize: 18, lineHeight: 24, marginTop: 4 },
  basis: { marginTop: 6 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  modeLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepperLabel: { flexShrink: 1 },
  typeHint: { marginTop: 2 },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 999,
    flexShrink: 0,
  },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  count: { width: 44, textAlign: 'center', fontSize: 16, lineHeight: 24 },
  /* Its own inset pill inside the stepper, because a bare figure between two
     buttons is a readout. `Field` learned the same thing: a field has to look
     like a field or nobody types in it. */
  typed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 30,
    marginVertical: 3,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  typedInput: {
    minWidth: 40,
    textAlign: 'right',
    fontSize: 16,
    lineHeight: 20,
    paddingVertical: 0,
  },
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalFigure: { fontSize: 28, lineHeight: 36 },
  button: {
    height: 48,
    borderRadius: 999,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The border eats two of the 48, which is what keeps a filled button and an
     outlined one the same height standing next to each other. */
  outlined: { height: 48, borderWidth: 2 },
  missed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  mascot: { fontSize: 40, lineHeight: 48 },
  missedButton: { alignSelf: 'stretch', marginTop: 12 },
  error: { textAlign: 'center', padding: 16 },
});
