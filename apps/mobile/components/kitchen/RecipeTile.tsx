import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { listWords } from '@ct/shared/words';
import { Chunk } from '@/components/Chunk';
import { font, type as t, useColors } from '@/theme';

/**
 * One recipe, as something to choose between.
 *
 * The picture, what the dish actually is, what it costs against today, and the
 * line about your own kitchen that no recipe site could print. The method is
 * not here — choosing and cooking are different activities, and the recipe's
 * own screen is for the second one.
 *
 * On the web these sit in a grid two or three across. Here it is one column:
 * a tile narrowed to a third of a phone would have to drop the summary and the
 * kitchen line, which are the two things that make it worth choosing between.
 */
export function RecipeTile({
  title,
  summary,
  kcal,
  protein_g,
  servingLabel,
  photo,
  emoji,
  fitsToday,
  have,
  needs,
  minutes,
  steps,
  saved,
  onPress,
  onToggleSave,
}: {
  title: string;
  summary: string | null;
  /** Per serving, as the tile prints it. */
  kcal: number;
  protein_g: number;
  /** What one of them is: "per portion", "per 1/8 of recipe". */
  servingLabel: string;
  /**
   * Only the library has these. A generated recipe has never been cooked by
   * anybody, so there is nothing to photograph, and inventing a picture for it
   * would be the first thing in the app that was not true.
   */
  photo?: string | null;
  /** Stands in for the photograph, and is obviously not one. */
  emoji?: string;
  /** Whether one serving fits what is left of today. Omitted where unknown. */
  fitsToday?: boolean;
  /** Pantry items this would use — the sentence the tile most wants to say. */
  have?: string[];
  /** What you would have to go out for. */
  needs?: string[];
  minutes?: number | null;
  steps: number;
  saved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const colors = useColors();

  return (
    <Chunk
      contentStyle={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
        ) : (
          /* The honest stand-in. A flat band with one big glyph reads as a
             label, not as a photograph nobody took. */
          <View
            style={[
              styles.standIn,
              { backgroundColor: colors.mutedWash, borderBottomColor: colors.border },
            ]}
          >
            <Text style={styles.standInGlyph}>{emoji ?? '🍳'}</Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>

          {summary && (
            <Text numberOfLines={2} style={[t.body, styles.summary, { color: colors.mutedForeground }]}>
              {summary}
            </Text>
          )}

          {/* The figure, and then everything that qualifies it. */}
          <View style={styles.figureRow}>
            <Text style={[t.figure, styles.figure, { color: colors.foreground }]}>
              {Math.round(kcal)}
            </Text>
            <Text style={[t.footnote, styles.qualifier, { color: colors.mutedForeground }]}>
              kcal · {Math.round(protein_g)}g protein · {servingLabel}
            </Text>
          </View>

          <View style={styles.facts}>
            {fitsToday && (
              <View style={styles.fact}>
                <Svg width={13} height={13} viewBox="0 0 24 24">
                  <Path
                    d="M20 6 9 17l-5-5"
                    stroke={colors.caloriesText}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
                <Text style={[t.footnoteSemibold, { color: colors.caloriesText }]}>
                  Fits what&rsquo;s left of today
                </Text>
              </View>
            )}

            {have && have.length > 0 && (
              <Text numberOfLines={1} style={[t.footnote, { color: colors.caloriesText }]}>
                Uses your {listWords(have)}
              </Text>
            )}

            {needs && needs.length > 0 && (
              <Text numberOfLines={1} style={[t.footnote, { color: colors.fatText }]}>
                You&rsquo;d need {listWords(needs)}
              </Text>
            )}

            <View style={styles.meta}>
              {typeof minutes === 'number' && (
                <View style={styles.fact}>
                  <Clock color={colors.mutedForeground} />
                  <Text style={[t.footnote, { color: colors.mutedForeground }]}>{minutes} min</Text>
                </View>
              )}
              <View style={styles.fact}>
                <Svg width={11} height={11} viewBox="0 0 24 24">
                  <Polyline
                    points="20 6 9 17 4 12"
                    stroke={colors.mutedForeground}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
                <Text style={[t.footnote, { color: colors.mutedForeground }]}>
                  {steps} {steps === 1 ? 'step' : 'steps'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>

      {/*
        Outside the pressable rather than inside it. A button nested in another
        button is ambiguous to a screen reader and, on Android, hands the press
        to whichever one claimed the responder first.
      */}
      <Pressable
        onPress={onToggleSave}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? `Unsave ${title}` : `Save ${title}`}
        hitSlop={8}
        style={({ pressed }) => [
          styles.save,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Bookmark filled={saved} color={saved ? colors.caloriesText : colors.mutedForeground} />
      </Pressable>
    </Chunk>
  );
}

function Bookmark({ filled, color }: { filled: boolean; color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

function Clock({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 2, borderRadius: 24, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 16 / 10 },
  /*
   * A band rather than the photo's 16:10.
   *
   * The web gives the stand-in the photograph's exact shape so a photo-less
   * card keeps the grid's row rhythm. There is no row here — tiles stack one to
   * a phone — so the only thing the ratio still buys is 230 points of empty
   * paper around one glyph. A short band with a bigger glyph says the same
   * thing ("no photograph, here is what it is") in a third of the height.
   */
  standIn: {
    width: '100%',
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
  },
  standInGlyph: { fontSize: 56, lineHeight: 66, opacity: 0.9 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 6 },
  title: { fontFamily: font.display, fontSize: 17, lineHeight: 22 },
  summary: { lineHeight: 22 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  figure: { fontSize: 21, lineHeight: 26 },
  qualifier: { flexShrink: 1 },
  facts: { gap: 4, paddingTop: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  save: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
