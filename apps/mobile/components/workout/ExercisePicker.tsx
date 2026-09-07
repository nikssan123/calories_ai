import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ExerciseType, MuscleGroup } from '@ct/shared';
import {
  MUSCLE_GROUPS,
  byMuscleGroup,
  exerciseMatches,
  genericMuscleOf,
  muscleLabel,
} from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { haptics } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import { font, type as t, useColors } from '@/theme';
import { BodyFigure, BodyMap } from './BodyFigure';
import { EquipmentTag } from './EquipmentGlyph';

/**
 * Finding the exercise you did — including when you do not know its name.
 *
 * The list this replaced put a search box on top and fourteen muscle chips
 * under it, which assumes the way in is a word. For a lot of people it is not:
 * they know they trained biceps and they do not know, or do not care, that the
 * machine was called a preacher curl. A search box is a locked door to that
 * person, and the chips were the unlock hiding underneath it.
 *
 * So the order is by how often each is the answer, not by how much screen each
 * costs:
 *
 *   1. **What you have done before.** People repeat themselves. It rides on the
 *      `with_previous` read the card already makes, so it is free.
 *   2. **The body.** Tap an arm. No vocabulary at all, which was the complaint.
 *   3. **Search.** For somebody who knows the name — still first on screen,
 *      because a field you can ignore costs less than a field you have to reach.
 *
 * Two other changes carry most of the felt difference:
 *
 * **It multi-selects.** Every pick used to collapse the picker and push the
 * submit button further down the card, so four exercises was four round trips.
 * Tap four, tap Add.
 *
 * **A muscle is itself an answer.** Under every muscle, above its exercises,
 * sits the generic row — "Biceps work". Somebody who only knows that still gets
 * a real record with real sets rather than abandoning the card, and it stays
 * upgradeable, because it is an ordinary catalogue row. See GYM-CARD.md §3.
 */
export function ExercisePicker({
  types,
  chosen,
  onAdd,
  onDefine,
}: {
  /** Null while the catalogue is still loading. */
  types: ExerciseType[] | null;
  /** Type ids already in the session, which are not offered again. */
  chosen: Set<string | null>;
  /** Every exercise ticked, in the order they were ticked. */
  onAdd: (types: ExerciseType[]) => void;
  /** Teaches the app a new one and adds it. Absent to hide the offer. */
  onDefine?: (name: string) => void;
}) {
  const colors = useColors();
  const tr = useT();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  /** Ticked but not yet added, by type id, in tick order. */
  const [picked, setPicked] = useState<string[]>([]);

  const available = useMemo(
    () => (types ?? []).filter((type) => !chosen.has(type.id)),
    [types, chosen],
  );

  /*
   * The generic rows, held apart from the named ones everywhere below.
   *
   * They must never appear in a muscle's exercise list beside real movements —
   * "Biceps work" sorted alphabetically between "Barbell curl" and "Cable curl"
   * reads as a fifteenth exercise rather than as the way out of naming one.
   */
  const generics = useMemo(() => {
    const found = new Map<MuscleGroup, ExerciseType>();
    for (const type of available) {
      const group = genericMuscleOf(type);
      if (group !== null) found.set(group, type);
    }
    return found;
  }, [available]);

  const named = useMemo(
    () => available.filter((type) => genericMuscleOf(type) === null),
    [available],
  );

  /*
   * Whether this catalogue has a body to be pointed at. Every sport and every
   * run has an empty `muscles`, so a body map over football and swimming would
   * be a control that filters nothing.
   */
  const hasMuscles = named.some((type) => type.muscles.length > 0);
  const searching = query.trim().length > 0;

  const shown = useMemo(() => {
    if (searching) return named.filter((type) => exerciseMatches(type, query));
    if (!hasMuscles) return named;
    if (muscle) return named.filter((type) => type.muscles[0] === muscle);
    return [];
  }, [named, query, searching, hasMuscles, muscle]);

  /* Their own history first, and only when nothing narrower has been asked. */
  const recents = useMemo(
    () => (searching || muscle ? [] : named.filter((type) => type.previous.length > 0).slice(0, 6)),
    [named, searching, muscle],
  );

  /**
   * The generic rows a search should turn up.
   *
   * Typing "biceps" has to offer the muscle itself, and offer it *first* —
   * somebody typing a body part rather than an exercise is very often the
   * person this row exists for.
   */
  const genericHits = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return MUSCLE_GROUPS.filter((m) => muscleLabel(m).toLowerCase().startsWith(q))
      .map((m) => generics.get(m))
      .filter((type): type is ExerciseType => type !== undefined);
  }, [searching, query, generics]);

  const groups = useMemo(() => byMuscleGroup(shown), [shown]);
  const muscles = useMemo(() => {
    const seen: MuscleGroup[] = [];
    for (const { muscle: key } of byMuscleGroup(named)) {
      if (key !== null) seen.push(key);
    }
    return seen;
  }, [named]);

  /*
   * The offer to invent one, and the two things that switch it off: an empty
   * box has no name in it to add, and a catalogue that already contains what
   * they typed does not need a second copy under the same name.
   */
  const typed = query.trim();
  const exact = (types ?? []).some((type) => type.name.toLowerCase() === typed.toLowerCase());
  const offerDefine = onDefine !== undefined && typed.length > 1 && !exact;

  const byId = useMemo(() => new Map(available.map((type) => [type.id, type])), [available]);

  function toggle(type: ExerciseType) {
    haptics.press();
    setPicked((prev) =>
      prev.includes(type.id) ? prev.filter((id) => id !== type.id) : [...prev, type.id],
    );
  }

  function commit() {
    const types = picked.map((id) => byId.get(id)).filter((t): t is ExerciseType => t !== undefined);
    if (types.length === 0) return;
    haptics.press();
    setPicked([]);
    onAdd(types);
  }

  if (types === null) {
    return (
      <Text style={[t.footnote, styles.pad, { color: colors.mutedForeground }]}>
        {tr('common.loading')}
      </Text>
    );
  }

  const row = (type: ExerciseType, subtitle: string, generic: boolean) => (
    <Row
      key={type.id}
      type={type}
      subtitle={subtitle}
      generic={generic}
      on={picked.includes(type.id)}
      onPress={() => toggle(type)}
    />
  );

  /** "3 × 10 @ 60 kg" is the card's job; here the muscles are the useful line. */
  const muscleLine = (type: ExerciseType) => type.muscles.map(muscleLabel).join(' · ');

  return (
    <View style={styles.fill}>
      <View style={[styles.head, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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

        {/* The way back out of a muscle, and the label saying where you are. */}
        {muscle !== null && !searching && (
          <Pressable
            onPress={() => {
              haptics.press();
              setMuscle(null);
            }}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [
              styles.back,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[t.footnoteSemibold, { color: colors.primaryForeground }]}>
              {tr('workout.backToBody')(muscleLabel(muscle))}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {recents.length > 0 && (
          <>
            <Heading>{tr('workout.doneThese')}</Heading>
            {recents.map((type) => row(type, muscleLine(type), false))}
          </>
        )}

        {/*
          The front door. Only drawn when there is a body to point at, and only
          while nothing narrower has been asked — once you are inside a muscle,
          the list is the answer and the map would just be pushing it down.
        */}
        {hasMuscles && !searching && muscle === null && (
          <View style={styles.mapBlock}>
            <Heading>{tr('workout.pointAtIt')}</Heading>
            <BodyMap
              active={null}
              width={300}
              onPick={(next) => {
                haptics.press();
                setMuscle(next);
              }}
            />
            {/* Two equal halves rather than a fixed gap, so the captions stay
                under their own figure whatever width the map is drawn at. */}
            <View style={styles.views}>
              <Text style={[styles.viewLabel, { color: colors.mutedForeground }]}>
                {tr('workout.front')}
              </Text>
              <Text style={[styles.viewLabel, { color: colors.mutedForeground }]}>
                {tr('workout.back')}
              </Text>
            </View>

            {/*
              The same filter in words. Not a fallback nobody uses — it is the
              path a screen reader takes, and the one for anybody who would
              rather read "Hamstrings" than find the back of a thigh.
            */}
            {/* `flexGrow: 0` or a horizontal ScrollView inside a column that has
                spare height stretches to fill it, and the chips grow into
                lozenges the height of the screen. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chips}
            >
              {muscles.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    haptics.press();
                    setMuscle(key);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>
                    {muscleLabel(key)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* A muscle chosen: the muscle itself is the first thing offered. */}
        {muscle !== null && !searching && generics.has(muscle) && (
          <>
            {row(generics.get(muscle)!, tr('workout.anyExercise'), true)}
            <Heading>{tr('workout.orNameIt')}</Heading>
          </>
        )}

        {genericHits.map((type) => row(type, tr('workout.anyExercise'), true))}

        {groups.map(({ muscle: key, types: list }) => (
          <View key={key ?? 'other'}>
            {/* No heading over an ungrouped list: "Football, Tennis, Volleyball"
                does not belong under a body part, and a heading reading "Other"
                over the entire sport catalogue would say nothing at all. */}
            {key !== null && searching && <Heading>{muscleLabel(key)}</Heading>}
            {list.map((type) => row(type, muscleLine(type), false))}
          </View>
        ))}

        {searching && shown.length === 0 && genericHits.length === 0 && !offerDefine && (
          <Text style={[t.footnote, styles.pad, { color: colors.mutedForeground }]}>
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
      </ScrollView>

      <View style={[styles.foot, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <PressableChunk
          depth={3}
          radius={999}
          color={colors.caloriesDeep}
          onPress={commit}
          disabled={picked.length === 0}
          accessibilityRole="button"
          style={{ opacity: picked.length === 0 ? 0.4 : 1 }}
          contentStyle={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[t.footnoteBold, { color: colors.primaryForeground }]}>
            {picked.length === 0
              ? tr('common.add')
              : tr('workout.addCount')(String(picked.length))}
          </Text>
        </PressableChunk>
      </View>
    </View>
  );
}

function Heading({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.heading, { color: colors.mutedForeground }]}>{children}</Text>;
}

/**
 * One offer: the body it works, its name, and what you pick up.
 *
 * A row rather than a chip, which the flat list of two hundred could not be.
 * The icon needs vertical room to read at all, and the second line — the kit,
 * or the muscles — is the half of the identity the name does not carry.
 */
function Row({
  type,
  subtitle,
  generic,
  on,
  onPress,
}: {
  type: ExerciseType;
  subtitle: string;
  generic: boolean;
  on: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${type.name}. ${subtitle}`}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          backgroundColor: generic ? colors.mutedField : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <BodyFigure muscles={type.muscles} size={generic ? 30 : 26} />
      <View style={styles.rowText}>
        <Text
          style={[generic ? styles.genericName : t.bodySemibold, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {type.muscles.length === 0 ? `${type.emoji} ${type.name}` : type.name}
        </Text>
        <View style={styles.rowTags}>
          {type.equipment !== null && <EquipmentTag kit={type.equipment} />}
          {subtitle.length > 0 && (
            <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      <View
        style={[
          styles.tick,
          {
            borderColor: on ? 'transparent' : colors.border,
            backgroundColor: on ? colors.primary : 'transparent',
          },
        ]}
      >
        {on && <Text style={[styles.tickMark, { color: colors.primaryForeground }]}>✓</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingVertical: 18 },
  head: { borderBottomWidth: 2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 10 },
  search: {
    height: 40,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  back: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  // `flexGrow` so the body map can centre itself in whatever is left. An
  // account with history fills this space with its recents; a new one does not,
  // and a map pinned to the top of an empty screen reads as a failed load.
  list: { paddingBottom: 16, flexGrow: 1 },
  heading: {
    fontFamily: font.bold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  mapBlock: { paddingBottom: 8, flexGrow: 1, justifyContent: 'center' },
  views: { flexDirection: 'row', alignSelf: 'center', width: 300, marginTop: 2 },
  viewLabel: { flex: 1, textAlign: 'center', fontFamily: font.bold, fontSize: 10, letterSpacing: 1 },
  chipScroll: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  add: { alignSelf: 'flex-start', borderStyle: 'dashed', marginHorizontal: 16, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  genericName: { fontFamily: font.display, fontSize: 16, lineHeight: 21 },
  sub: { fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, flexShrink: 1 },
  tick: { width: 22, height: 22, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickMark: { fontSize: 12, lineHeight: 16, fontFamily: font.bold },
  foot: { borderTopWidth: 2, paddingHorizontal: 16, paddingVertical: 12 },
  addButton: { alignItems: 'center', paddingVertical: 11 },
});
