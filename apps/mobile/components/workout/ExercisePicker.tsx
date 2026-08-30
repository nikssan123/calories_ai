import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExerciseType, MuscleGroup } from '@ct/shared';
import { byMuscleGroup, exerciseMatches, muscleLabel } from '@ct/shared';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';

/**
 * Finding the exercise you did.
 *
 * The list this replaced was twenty-five chips in one alphabetical run, and it
 * worked because twenty-five is a number you can read. The catalogue is now
 * about two hundred and twenty, which is not — so the list stops being the way
 * in and becomes something you ask a question of.
 *
 * Two ways in, because people arrive knowing two different things:
 *
 *   **Search**, for somebody who knows what they did. Matches the name, the
 *   aliases ("RDL", "OHP", "pulldown") and the muscle — which is the one that
 *   earns its keep, because somebody who cannot remember "Romanian deadlift"
 *   can always remember it is the one for the back of their legs, and typing
 *   "legs" has to reach it.
 *
 *   **Browse by muscle**, for somebody who does not. Fourteen chips, then that
 *   muscle's exercises. Two taps to anywhere in the catalogue, and it needs no
 *   vocabulary at all — which was the whole complaint.
 *
 * Above both, the exercises this account has actually done. It costs nothing
 * (it rides on the `with_previous` read the card already makes for its numbers)
 * and it is the answer most of the time, because people repeat themselves.
 *
 * And a miss is no longer a dead end: `＋ Add "landmine press"` teaches the app
 * the exercise on the spot. Until now the only way to do that was to mention it
 * in the chat, so somebody who could not find theirs inside the card had
 * nowhere to go from inside the card.
 */
export function ExercisePicker({
  types,
  chosen,
  onPick,
  onDefine,
}: {
  /** Null while the catalogue is still loading. */
  types: ExerciseType[] | null;
  /** Type ids already in the session, which are not offered again. */
  chosen: Set<string | null>;
  onPick: (type: ExerciseType) => void;
  /** Teaches the app a new one and adds it. Absent to hide the offer. */
  onDefine?: (name: string) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const available = useMemo(
    () => (types ?? []).filter((type) => !chosen.has(type.id)),
    [types, chosen],
  );

  /*
   * Whether this category has a body to be browsed by at all. Every sport and
   * every run has an empty `muscles`, so offering "Chest / Back / Legs" over a
   * list of football and swimming would be a control that filters nothing.
   */
  const hasMuscles = available.some((type) => type.muscles.length > 0);
  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    if (searching) return available.filter((type) => exerciseMatches(type, query));
    if (!hasMuscles) return available;
    if (muscle) return available.filter((type) => type.muscles[0] === muscle);
    return [];
  }, [available, query, searching, hasMuscles, muscle]);

  /* Their own history first, and only when nothing narrower has been asked. */
  const recents = useMemo(
    () =>
      searching || muscle
        ? []
        : available.filter((type) => type.previous.length > 0).slice(0, 12),
    [available, searching, muscle],
  );

  const groups = useMemo(() => byMuscleGroup(shown), [shown]);
  const muscles = useMemo(() => {
    const seen: MuscleGroup[] = [];
    for (const { muscle: key } of byMuscleGroup(available)) {
      if (key !== null) seen.push(key);
    }
    return seen;
  }, [available]);

  /*
   * The offer to invent one, and the two things that switch it off: an empty
   * box has no name in it to add, and a catalogue that already contains what
   * they typed does not need a second copy under the same name.
   */
  const typed = query.trim();
  const exact = (types ?? []).some((type) => type.name.toLowerCase() === typed.toLowerCase());
  const offerDefine = onDefine !== undefined && typed.length > 1 && !exact;

  if (types === null) {
    return <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('common.loading')}</Text>;
  }

  return (
    <View style={styles.stack}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr('workout.searchExercises')}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={tr('workout.searchExercises')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={[
          t.bodySemibold,
          styles.search,
          {
            backgroundColor: colors.mutedField,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
      />

      {recents.length > 0 && (
        <View style={styles.group}>
          <Text style={[styles.heading, { color: colors.mutedForeground }]}>
            {tr('workout.doneThese')}
          </Text>
          <View style={styles.chips}>
            {recents.map((type) => (
              <Chip key={type.id} type={type} onPick={onPick} tone="known" />
            ))}
          </View>
        </View>
      )}

      {/* The browse axis. Only drawn when there is a body to browse. */}
      {hasMuscles && !searching && (
        <View style={styles.group}>
          <Text style={[styles.heading, { color: colors.mutedForeground }]}>
            {tr('workout.browseMuscle')}
          </Text>
          <View style={styles.chips}>
            {muscles.map((key) => {
              const on = muscle === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    haptics.press();
                    setMuscle(on ? null : key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: on ? colors.primary : colors.muted,
                      borderColor: on ? 'transparent' : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      t.footnoteSemibold,
                      { color: on ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {muscleLabel(key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {groups.map(({ muscle: key, types: list }) => (
        <View key={key ?? 'other'} style={styles.group}>
          {/* No heading over an ungrouped list: "Football, Tennis, Volleyball"
              does not belong under a body part, and a heading reading "Other"
              over the entire sport catalogue would say nothing at all. */}
          {key !== null && searching && (
            <Text style={[styles.heading, { color: colors.mutedForeground }]}>
              {muscleLabel(key)}
            </Text>
          )}
          <View style={styles.chips}>
            {list.map((type) => (
              <Chip key={type.id} type={type} onPick={onPick} tone="plain" />
            ))}
          </View>
        </View>
      ))}

      {searching && shown.length === 0 && !offerDefine && (
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>
          {tr('workout.nothingMatches')}
        </Text>
      )}

      {offerDefine && (
        <Pressable
          onPress={() => {
            haptics.press();
            onDefine?.(typed);
            setQuery('');
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.chip,
            styles.add,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>
            {tr('workout.addNamed')(typed)}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Chip({
  type,
  onPick,
  tone,
}: {
  type: ExerciseType;
  onPick: (type: ExerciseType) => void;
  tone: 'known' | 'plain';
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        haptics.press();
        onPick(type);
      }}
      accessibilityRole="button"
      accessibilityLabel={type.name}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: colors.muted,
          // A hairline of the accent on anything they have done before. Not a
          // fill: these are still offers, and a filled chip in this app means
          // chosen.
          borderColor: tone === 'known' ? colors.primary : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
        {type.emoji} {type.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  search: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  group: { gap: 6 },
  heading: { fontFamily: font.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  add: { alignSelf: 'flex-start', borderStyle: 'dashed' },
});
