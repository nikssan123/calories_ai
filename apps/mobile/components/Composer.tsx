import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import type { ChatMessage, PhotoMediaType } from '@ct/shared';
import { Material } from '@/components/Material';
import { Sheet } from '@/components/Field';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { PressableChunk } from '@/components/Chunk';
import { pickPhoto, takePhoto, type PreparedPhoto } from '@/lib/image';
import { font, type as t, useColors } from '@/theme';
import { useSharedPhoto } from '@/lib/share';

export interface ComposerPayload {
  text: string;
  photoBase64?: string;
  photoMediaType?: PhotoMediaType;
  /** The local file URI, so the sent bubble can show the photo immediately. */
  photoPreview?: string;
}

/**
 * The bar at the bottom: a sentence, or a photo, or both.
 *
 * The web's version welds itself to the bottom edge on a phone and becomes a
 * floating card from `lg` up. Only the first of those exists here, so this is
 * the phone half of that component and nothing else — translucent material,
 * hairline along the top, conversation scrolling underneath it.
 *
 * The barcode scanner is the one peer missing from the menu. On the web it is
 * `BarcodeDetector` with a `zxing-wasm` fallback, neither of which exists in
 * RN; it wants `expo-camera`'s native scanner, which is a rebuild rather than
 * a port and is its own piece of work.
 */
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
   * the conversation grows by that row and the day above it re-reads itself.
   */
  onLogged: (message: ChatMessage) => void;
  disabled: boolean;
}) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);

  /*
   * A photo shared in from another app lands here, in the same state the camera
   * button fills — so everything downstream, the preview and the send and the
   * bubble that follows, cannot tell the two apart.
   *
   * Attached and not sent. This is a message about somebody's meal, and putting
   * one in the conversation on their behalf is not the app's to do.
   */
  const { pending, taken } = useSharedPhoto();
  useEffect(() => {
    if (!pending) return;
    setPhoto(pending);
    taken();
  }, [pending, taken]);
  const [busy, setBusy] = useState(false);

  const canSend = (text.trim().length > 0 || photo !== null) && !disabled;

  function submit() {
    if (!canSend) return;
    onSend({
      // A photo on its own is a valid log — give the model a default instruction.
      text: text.trim() || "Here's what I'm eating — log it.",
      photoBase64: photo?.dataUrl,
      photoMediaType: photo?.mediaType,
      photoPreview: photo?.uri,
    });
    setText('');
    setPhoto(null);
  }

  /*
   * The camera and the library are two different intents, so the app asks which
   * before opening either — the same choice the web puts in a dropdown.
   *
   * One sheet on both platforms rather than `ActionSheetIOS` on one and a list
   * on the other. The native sheet is a better citizen on iOS in isolation, but
   * it is Apple's typeface, Apple's radii and Apple's greys, which means the
   * same question looks like two different apps depending on the phone — and
   * this app has a face of its own that it is the whole point to keep.
   */
  const [choosing, setChoosing] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function attach(source: 'camera' | 'library') {
    setChoosing(false);
    setBusy(true);
    try {
      const prepared = source === 'camera' ? await takePhoto() : await pickPhoto();
      if (prepared) setPhoto(prepared);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Material style={[styles.bar, { borderTopColor: colors.border }]}>
      {photo && (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: photo.uri }} style={styles.thumb} />
          <Pressable
            onPress={() => setPhoto(null)}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            hitSlop={8}
            style={[
              styles.remove,
              { backgroundColor: colors.foreground, borderColor: colors.card },
            ]}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path
                d="M18 6 6 18M6 6l12 12"
                stroke={colors.background}
                strokeWidth={3.2}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Pressable>
        </View>
      )}

      <View style={styles.row}>
        <Pressable
          onPress={() => setChoosing(true)}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          hitSlop={6}
          style={({ pressed }) => [styles.attach, { opacity: pressed || busy ? 0.5 : 1 }]}
        >
          <CameraGlyph color={colors.mutedForeground} />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Two eggs and toast…"
          placeholderTextColor={colors.mutedForeground}
          editable={!disabled}
          multiline
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.input,
              color: colors.foreground,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        />

        <PressableChunk
          // The default button depth. `size-10` on the web overrides the size
          // but not `--chunk-depth`, which stays at 4 — only the `sm` sizes
          // step it down to 3.
          depth={4}
          radius={999}
          color={colors.caloriesDeep}
          onPress={submit}
          // No press buzz. Sending is the one control in the app that is
          // answered rather than acted on: the reply streams back a moment
          // later and, if the turn logged something, `haptics.logged` fires
          // for it. A light impact on the way out only crowds that, and it
          // fires on every sentence — the thing this composer is for.
          haptic={false}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          // `disabled:opacity-30`, rather than the 0.5 a disabled chunk carries
          // by default. Nothing else in the app spends this long disabled — it
          // is the resting state of an empty composer — and at 0.5 it still
          // reads as a button waiting to be pressed.
          style={{ opacity: canSend ? 1 : 0.3 }}
          contentStyle={[styles.send, { backgroundColor: colors.primary }]}
        >
          <Svg width={21} height={21} viewBox="0 0 24 24">
            <Path
              d="M12 19V5M5 12l7-7 7 7"
              stroke={colors.primaryForeground}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </PressableChunk>
      </View>

      {/*
        The scanner sits here as a third peer rather than in a tab of its own,
        because a barcode is another way of saying what you ate — the same
        sentence, told to the phone in a different grammar.
      */}
      <Sheet open={choosing} title="Add a photo" onClose={() => setChoosing(false)}>
        {/*
          The one thing that most improves a photo estimate, said once, where it
          can still be acted on.

          Measured on 30 weighed plates: the model reads calorie *density* almost
          exactly right (1.00x) and the weight on the plate 36% too high, and
          that gap is what a size reference closes — with nothing in frame to
          judge against, there is no way to tell a side plate from a dinner
          plate, and every gram after that is a guess. Prompt changes took the
          error part of the way; the rest of it is in the photograph, so it has
          to be asked for here.

          Phrased as a tip rather than a requirement because a photo without a
          fork in it is still worth logging, and a sheet that reads like a
          checklist is one people stop opening.
        */}
        <Text style={[t.footnote, styles.hint, { color: colors.mutedForeground }]}>
          Tip: leave a fork, spoon or your hand in the shot — it tells us how big
          the plate is, which is the hardest part to guess.
        </Text>
        <Choice label="Take a photo" icon="camera" onPress={() => void attach('camera')} />
        <Choice label="Choose a photo" icon="image" onPress={() => void attach('library')} />
        <Choice
          label="Scan a barcode"
          icon="barcode"
          onPress={() => {
            setChoosing(false);
            setScanning(true);
          }}
        />
      </Sheet>

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onLogged={(message) => {
          setScanning(false);
          onLogged(message);
        }}
        onLabelPhoto={(prepared) => {
          setPhoto(prepared);
          setText((current) => current || 'This is the label — log what I ate off it.');
        }}
      />
    </Material>
  );
}

function Choice({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'camera' | 'image' | 'barcode';
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.choice,
        { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {icon === 'camera' ? (
        <CameraGlyph color={colors.foreground} size={18} />
      ) : icon === 'barcode' ? (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M3 5v14M6 5v14M10 5v14M14 5v11M18 5v14M21 5v14"
            stroke={colors.foreground}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      ) : (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Rect
            x={3}
            y={3}
            width={18}
            height={18}
            rx={2}
            stroke={colors.foreground}
            strokeWidth={2}
            fill="none"
          />
          <Circle cx={8.5} cy={8.5} r={1.5} stroke={colors.foreground} strokeWidth={2} fill="none" />
          <Polyline
            points="21 15 16 10 5 21"
            stroke={colors.foreground}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      )}
      <Text style={[t.body, { fontFamily: font.semibold, color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function CameraGlyph({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4l-1.5-2Z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={12} cy={13} r={3.5} stroke={color} strokeWidth={2.2} fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // `px-3 py-2.5` — both halves of the `py`, or the bar sits flush on the tab
  // bar below it and the field looks welded to the wrong edge.
  bar: { borderTopWidth: 2, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attach: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 40,
    // `max-h-33` on the web — about four lines, after which it scrolls rather
    // than eating the conversation it belongs to.
    maxHeight: 132,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  send: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  thumbWrap: { width: 80, marginLeft: 44, marginBottom: 8 },
  thumb: { width: 80, height: 80, borderRadius: 16 },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  // No top border: it sits above the first Choice, which draws its own, and two
  // rules stacked would read as an empty row between the title and the list.
  hint: {
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
});
