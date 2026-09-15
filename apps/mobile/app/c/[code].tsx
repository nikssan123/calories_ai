import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CoachInvitePreview } from '@ct/shared';
import Svg, { Path } from 'react-native-svg';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { ScreenGround, ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { initialsOf, useCoachLink } from '@/lib/coach';
import { useEntitlements } from '@/lib/entitlements';
import { messageOf } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { type as t, tint, useColors, useType } from '@/theme';

/**
 * The accept screen. See COACH.md §3 and §7.
 *
 * Reached by the invite link — `daysofar.com/c/<code>` and the app's own
 * scheme both land here — and by typing the code under Settings. It names the
 * coach, lists what will and will not be shared, and only then offers the
 * button. The list is the consent, so it is written in full rather than
 * summarised behind a "learn more".
 */
export default function AcceptInviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const toast = useToast();
  const { link, accept } = useCoachLink();
  const { refresh: refreshEntitlements } = useEntitlements();
  const [preview, setPreview] = useState<CoachInvitePreview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.myCoach
      .preview(code)
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch((e) => {
        if (!cancelled) setFailed(messageOf(e, tr));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function leave() {
    if (router.canGoBack()) router.back();
    // Home, which is the journal — where a coach's comments will turn up.
    else router.replace('/');
  }

  async function agree() {
    setBusy(true);
    try {
      const status = await accept(code);
      await refreshEntitlements();
      haptics.logged();
      toast.success(tr('coach.accepted')(status.link?.coach.display_name ?? tr('coach.yourCoachCapital')));
      router.replace('/');
    } catch (e) {
      toast.error(messageOf(e, tr));
    } finally {
      setBusy(false);
    }
  }

  const name = preview?.coach?.display_name ?? tr('coach.yourCoachCapital');
  const problem =
    failed ??
    (preview && !preview.valid
      ? preview.reason === 'expired'
        ? tr('coach.expired')
        : preview.reason === 'used'
          ? tr('coach.used')
          : tr('coach.invalid')
      : link
        ? tr('coach.alreadyLinked')(link.coach.display_name ?? tr('coach.yourCoachCapital'))
        : null);

  return (
    <ScreenGround>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* A decision rather than a place, so no way back but its own buttons —
            the same entrance as the paywall, under the hour's light. */}
        <ScreenHeader
          back={false}
          align="center"
          inset={24}
          skyHeight={380}
          title={!preview && !failed ? undefined : tr('coach.inviteTitle')(name)}
          subtitle={preview?.coach?.business_name ?? undefined}
          top={
            !preview && !failed ? (
              <View style={styles.loading}>
                <Skeleton style={styles.loadingAvatar} />
                <Skeleton style={styles.loadingTitle} />
              </View>
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.glassStrong,
                    boxShadow: `${colors.shadow}, inset 0px 1px 0px ${colors.glassEdge}`,
                  },
                ]}
              >
                <Text style={[type.title2, { color: colors.foreground }]}>
                  {initialsOf(preview?.coach?.display_name ?? null)}
                </Text>
              </View>
            )
          }
        />

        {problem ? (
          <Text style={[t.body, styles.problem, { color: colors.destructive }]}>{problem}</Text>
        ) : (
          <Chunk contentStyle={[styles.scope, { backgroundColor: colors.card, borderColor: colors.hairline }]}>
            <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{tr('coach.willSee')}</Text>
            <Line tick text={tr('coach.seeMeals')} />
            <Line tick text={tr('coach.seeTotals')} />
            <Line tick text={tr('coach.seeWeight')} />
            <Line tick text={tr('coach.seeDays')} />
            <View style={[styles.divider, { backgroundColor: colors.hairline }]} />
            <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{tr('coach.wontSee')}</Text>
            <Line text={tr('coach.notChat')} />
            <Line text={tr('coach.notMetrics')} />
            <Line text={tr('coach.notEmail')} />
          </Chunk>
        )}

        <View style={styles.buttons}>
          {!problem && preview?.valid && (
            <PressableChunk
              onPress={() => void agree()}
              disabled={busy}
              color={colors.calories}
              radius={999}
              contentStyle={[styles.button, { backgroundColor: colors.primary, experimental_backgroundImage: colors.primaryRamp }]}
            >
              <Text style={[t.bodyBold, { color: colors.primaryForeground }]}>{tr('coach.accept')}</Text>
            </PressableChunk>
          )}
          <Pressable onPress={leave} accessibilityRole="button" style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[t.bodyBold, { color: colors.mutedForeground }]}>{problem ? tr('coach.close') : tr('coach.notNow')}</Text>
          </Pressable>
          {!problem && (
            <Text style={[t.footnote, styles.canStop, { color: colors.mutedForeground }]}>{tr('coach.canStop')}</Text>
          )}
        </View>
      </ScrollView>
    </ScreenGround>
  );
}

function Line({ tick, text }: { tick?: boolean; text: string }) {
  const colors = useColors();
  const ink = tick ? colors.caloriesText : colors.destructive;
  return (
    <View style={styles.line}>
      <View style={[styles.mark, { backgroundColor: tint(tick ? colors.calories : colors.destructive, 0.14) }]}>
        <Svg width={11} height={11} viewBox="0 0 24 24">
          <Path
            d={tick ? 'M20 6 9 17l-5-5' : 'M18 6 6 18M6 6l12 12'}
            stroke={ink}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
      <Text style={[t.body, styles.lineText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 18, flexGrow: 1 },
  loading: { alignItems: 'center', gap: 12 },
  loadingAvatar: { width: 72, height: 72, borderRadius: 36 },
  loadingTitle: { width: 220, height: 28, borderRadius: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  problem: { textAlign: 'center', marginTop: 8 },
  scope: { gap: 10, borderWidth: 1, borderRadius: 24, padding: 18 },
  divider: { height: 1, marginVertical: 6 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  lineText: { flex: 1 },
  buttons: { marginTop: 'auto', gap: 10, paddingTop: 16 },
  button: { alignItems: 'center', paddingVertical: 15, borderRadius: 999 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  canStop: { textAlign: 'center' },
});
