import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { BarcodeProduct, FoodEntry } from '@ct/shared';
import { formatMass } from '@ct/shared';
import { ApiError } from '@ct/api-client';
import { PressableChunk } from '@/components/Chunk';
import { api } from '@/lib/api';
import { pickPhoto, takePhoto, type PreparedPhoto } from '@/lib/image';
import { useUnits } from '@/lib/units';
import { font, type as t, useColors } from '@/theme';

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
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (entry: FoodEntry) => void;
  /**
   * A miss hands the label photo back to the composer rather than dead-ending.
   * The user still presses send: this is a message about their meal, and
   * putting one in the conversation without them is not the app's to do.
   */
  onLabelPhoto: (photo: PreparedPhoto) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>({ at: 'scanning' });
  const [error, setError] = useState<string | null>(null);

  /*
   * The native scanner fires continuously while a code is in frame — several
   * times a second, on every frame that decodes. Without this the first read
   * would start a lookup and the next twenty would start twenty more.
   */
  const claimed = useRef(false);

  const onScanned = useCallback(async (code: string) => {
    if (claimed.current) return;
    claimed.current = true;

    setStage({ at: 'looking', code });
    try {
      setStage({ at: 'found', product: await api.barcode(code) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setStage({ at: 'missed' });
      } else {
        setError((e as Error).message);
        setStage({ at: 'scanning' });
        claimed.current = false;
      }
    }
  }, []);

  function rescan() {
    claimed.current = false;
    setError(null);
    setStage({ at: 'scanning' });
  }

  function close() {
    claimed.current = false;
    setStage({ at: 'scanning' });
    setError(null);
    onClose();
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
          <Text style={[t.bodyBold, { color: colors.foreground }]}>Scan a barcode</Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
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
          <View style={styles.viewfinder}>
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
                    {stage.at === 'looking' ? 'Looking it up…' : 'Point at the barcode'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.permission}>
                <Text style={[t.body, styles.centred, { color: colors.foreground }]}>
                  {permission === null
                    ? 'Checking the camera…'
                    : 'The scanner needs the camera. Nothing is uploaded — the code is read on the phone.'}
                </Text>
                {permission !== null && !permission.granted && (
                  <PressableChunk
                    radius={999}
                    color={colors.caloriesDeep}
                    onPress={() => void requestPermission()}
                    accessibilityRole="button"
                    contentStyle={[styles.button, { backgroundColor: colors.primary }]}
                  >
                    <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
                      Allow the camera
                    </Text>
                  </PressableChunk>
                )}
              </View>
            )}
          </View>
        ) : stage.at === 'found' ? (
          <Portion product={stage.product} onLogged={onLogged} onRescan={rescan} onError={setError} />
        ) : (
          <Missed onLabelPhoto={labelPhoto} onRescan={rescan} />
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
 * How much of it was eaten.
 *
 * Never guessed. The packet says what the food is; only a person can say how
 * much of it they had, and a scanner that logs "one serving" because that is
 * the easiest thing to assume is the failure mode this whole app exists to
 * avoid — a wrong number is trusted, a missing one is not.
 */
function Portion({
  product,
  onLogged,
  onRescan,
  onError,
}: {
  product: BarcodeProduct;
  onLogged: (entry: FoodEntry) => void;
  onRescan: () => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const units = useUnits();
  const [mode, setMode] = useState<'serving' | 'hundred'>(
    product.serving_g === null ? 'hundred' : 'serving',
  );
  const [servings, setServings] = useState(1);
  const [logging, setLogging] = useState(false);

  const eatenGrams =
    mode === 'serving' ? servings * (product.serving_g ?? 100) : 100;
  const share = eatenGrams / 100;

  async function log() {
    setLogging(true);
    try {
      // Servings are sent as servings rather than converted here, so the entry
      // reads back as the decision the user made rather than as the arithmetic
      // that followed from it.
      const entry = await api.logBarcode(
        product.barcode,
        mode === 'serving' ? { servings } : { grams: eatenGrams },
      );
      onLogged(entry);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLogging(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.product}>
      <View>
        {product.brand && (
          <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{product.brand}</Text>
        )}
        <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
        <Text style={[t.footnote, styles.per100, { color: colors.mutedForeground }]}>
          {Math.round(product.kcal_100g)} kcal · {Math.round(product.protein_100g)}g protein per
          100g
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
        <Mode on={mode === 'hundred'} onPress={() => setMode('hundred')} label="100 g" />
      </View>

      {mode === 'serving' && (
        <View style={styles.stepper}>
          <Text style={[t.body, { color: colors.foreground }]}>How many?</Text>
          <View style={[styles.steps, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Step sign="minus" onPress={() => setServings((s) => Math.max(0.5, s - 0.5))} />
            <Text style={[t.figure, styles.count, { color: colors.foreground }]}>{servings}</Text>
            <Step sign="plus" onPress={() => setServings((s) => Math.min(20, s + 0.5))} />
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
        onPress={() => void log()}
        disabled={logging}
        accessibilityRole="button"
        contentStyle={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>
          {logging ? 'Logging…' : 'I ate this'}
        </Text>
      </PressableChunk>

      <Pressable onPress={onRescan} accessibilityRole="button" hitSlop={8}>
        <Text style={[t.footnoteSemibold, styles.centred, { color: colors.mutedForeground }]}>
          Scan another
        </Text>
      </Pressable>
    </ScrollView>
  );
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
        <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>Scan another</Text>
      </Pressable>
    </View>
  );
}

function Mode({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const colors = useColors();
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

function Step({ sign, onPress }: { sign: 'minus' | 'plus'; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={sign === 'plus' ? 'More' : 'Less'}
      style={({ pressed }) => [styles.step, { opacity: pressed ? 0.5 : 1 }]}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  viewfinder: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  window: {
    width: '72%',
    aspectRatio: 1.6,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  hint: { position: 'absolute', bottom: 48 },
  hintText: { color: '#fff' },
  permission: { padding: 32, gap: 16, alignItems: 'center' },
  centred: { textAlign: 'center' },
  product: { padding: 20, gap: 16 },
  productName: { fontFamily: font.display, fontSize: 18, lineHeight: 24, marginTop: 4 },
  per100: { marginTop: 6 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  modeLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  steps: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 999 },
  step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  count: { width: 44, textAlign: 'center', fontSize: 16, lineHeight: 24 },
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
  button: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  missed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  mascot: { fontSize: 40, lineHeight: 48 },
  missedButton: { alignSelf: 'stretch', marginTop: 12 },
  error: { textAlign: 'center', padding: 16 },
});
