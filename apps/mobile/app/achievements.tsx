import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Progress } from '@ct/shared';
import { ACHIEVEMENT_KEYS } from '@ct/shared';
import { AchievementWall } from '@/components/Achievements';
import { Skeleton } from '@/components/Skeleton';
import { ScreenGround, ScreenHeader } from '@/components/ScreenHeader';
import { useSky } from '@/components/Sky';
import { Glossy } from '@/components/icons/Glossy';
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
  const sky = useSky();

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
    <ScreenGround>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 32 }]}
      >
        <ScreenHeader
          title={tr('achievements.title')}
          trailing={
            progress && (
              <View style={[styles.count, { backgroundColor: sky.inkLight ? 'rgba(255,255,255,0.12)' : colors.glassStrong, boxShadow: `inset 0px 1px 0px ${colors.glassEdge}` }]}>
                <Glossy name="medal" size={16} />
                <Text style={[t.footnoteBold, t.tnum, { color: sky.inkLight ? colors.skyInk : colors.foreground }]}>
                  {tr('achievements.count')(progress.achievements.length, ACHIEVEMENT_KEYS.length)}
                </Text>
              </View>
            )
          }
        />

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
    </ScreenGround>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 16, gap: 20 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingLeft: 8, paddingRight: 12, height: 32 },
  loading: { gap: 20 },
  block: { height: 220, borderRadius: 24 },
  centred: { textAlign: 'center' },
});
