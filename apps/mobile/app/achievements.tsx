import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import type { Progress } from '@ct/shared';
import { ACHIEVEMENT_KEYS } from '@ct/shared';
import { AchievementWall } from '@/components/Achievements';
import { Skeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { messageOf } from '@/lib/errors';

/**
 * The wall, on its own.
 *
 * It used to be the fifth block on Progress, under four charts. Progress is a
 * screen of measurements plotted against targets, and a badge is not a
 * measurement — it was the one thing there that could not be read off an axis,
 * and it was below the fold for everybody. Here it has the room to be a list of
 * rows instead of a grid of squares, which is the whole point: a row is wide
 * enough for the sentence that says how a badge is won and the bar that says
 * how far off it is.
 *
 * Loads `progress` rather than a wall-shaped endpoint of its own. The badges and
 * the counters behind them already travel on that payload, and a second endpoint
 * returning a subset of the first would be two answers to one question — and a
 * second place for the badge pass to have to run.
 */
export default function AchievementsScreen() {
  const colors = useColors();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // The shortest window the screen offers. Nothing drawn here is windowed —
      // badges and their counters are read against the whole history — so this
      // asks for the cheapest series the endpoint will build.
      setProgress(await api.progress(14));
      setError(null);
    } catch (e) {
      setError(messageOf(e, tr));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A badge can be earned by a meal logged on the tab behind this one, so the
  // wall refetches on the way back rather than showing what it saw on push.
  useRefreshOnReturn(load);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tr('progress.title')}
          hitSlop={8}
          style={({ pressed }) => [styles.chevron, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Polyline
              points="15 18 9 12 15 6"
              stroke={colors.mutedForeground}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
        <Text style={[t.largeTitle, styles.heading, { color: colors.foreground }]}>
          {tr('achievements.title')}
        </Text>
        {progress && (
          <Text style={[t.footnoteSemibold, t.tnum, { color: colors.mutedForeground }]}>
            {tr('achievements.count')(progress.achievements.length, ACHIEVEMENT_KEYS.length)}
          </Text>
        )}
      </View>

      {!progress ? (
        <View style={styles.loading}>
          <Skeleton style={styles.block} />
          <Skeleton style={styles.block} />
        </View>
      ) : (
        <AchievementWall earned={progress.achievements} facts={progress.achievement_facts} />
      )}

      {error && (
        <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, gap: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chevron: { padding: 4 },
  heading: { flex: 1 },
  loading: { gap: 20 },
  block: { height: 220, borderRadius: 24 },
  centred: { textAlign: 'center' },
});
