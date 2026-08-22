import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Diet, Profile } from '@ct/shared';
import { DIETS } from '@ct/shared';
import { InsetGroup } from '@/components/InsetGroup';
import { api } from '@/lib/api';
import { font, type as t, useColors } from '@/theme';

/**
 * What the kitchen must never suggest.
 *
 * On the profile rather than in the recipe form, because it is true of every
 * meal this person will ever eat. Restating "no shellfish" each time you want
 * dinner ideas is the kind of small tax that ends with someone not using the
 * feature — and the one time they forget is the time it matters.
 *
 * It reaches the recipe prompt as a hard limit rather than a preference, and
 * saying so on screen is part of the deal: someone entering an allergy here is
 * trusting the answer, so the wording has to be honest about what it is worth.
 */

const LABELS: Record<Diet, string> = {
  none: 'No restriction',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
};

export function DietRules({
  profile,
  onChange,
  onError,
}: {
  profile: Profile;
  onChange: (next: Profile) => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState('');

  /*
   * Written on the spot rather than gathered by the Save button below, and
   * reverted if the write fails — a rule you tapped off should never come back
   * silently, and one that failed to save should never look saved.
   */
  async function save(patch: { diet?: Diet; avoids?: string[] }) {
    const previous = profile;
    onChange({ ...profile, ...patch });
    try {
      onChange(await api.updateProfile(patch));
    } catch (e) {
      onChange(previous);
      onError((e as Error).message);
    }
  }

  function addAvoid() {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitive, so "Pork" typed twice does not become two rules.
    if (profile.avoids.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    void save({ avoids: [...profile.avoids, value] });
    setDraft('');
  }

  return (
    <InsetGroup
      title="What you don't eat"
      footer="Applied to every recipe suggestion as a hard limit, not a preference. It does not change how the journal logs what you actually eat — tell it what you had and it records it."
    >
      <View style={styles.diets}>
        {DIETS.map((diet) => {
          const active = profile.diet === diet;
          return (
            <Pressable
              key={diet}
              onPress={() => void save({ diet })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.diet,
                {
                  backgroundColor: active ? colors.muted : colors.mutedWash,
                  borderColor: active ? colors.caloriesText : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[
                  t.footnote,
                  { color: active ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {LABELS[diet]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.avoids, { borderTopColor: colors.border }]}>
        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addAvoid}
            returnKeyType="done"
            placeholder="Anything else — an allergy, a dislike"
            placeholderTextColor={colors.mutedForeground}
            style={[
              t.body,
              styles.addInput,
              { backgroundColor: colors.mutedField, borderColor: colors.border, color: colors.foreground },
            ]}
          />
          <Pressable
            onPress={addAvoid}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add"
            style={({ pressed }) => [
              styles.add,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
                opacity: !draft.trim() ? 0.4 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M12 5v14M5 12h14"
                stroke={colors.mutedForeground}
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          </Pressable>
        </View>

        {profile.avoids.length > 0 && (
          <View style={styles.tags}>
            {profile.avoids.map((item) => (
              <Pressable
                key={item}
                onPress={() => void save({ avoids: profile.avoids.filter((a) => a !== item) })}
                accessibilityRole="button"
                accessibilityLabel={`Stop avoiding ${item}`}
                style={({ pressed }) => [
                  styles.tag,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.border,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>{item}</Text>
                <Svg width={12} height={12} viewBox="0 0 24 24">
                  <Path
                    d="M18 6 6 18M6 6l12 12"
                    stroke={colors.mutedForeground}
                    strokeWidth={3}
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  diets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 },
  diet: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  avoids: { borderTopWidth: 2, padding: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontFamily: font.medium,
  },
  add: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 2,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 4,
  },
});
