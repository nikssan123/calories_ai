import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CoachInvitePreview } from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { initialsOf, useCoachLink } from '@/lib/coach';
import { useEntitlements } from '@/lib/entitlements';
import { messageOf } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { haptics } from '@/lib/haptics';
import { type as t, useColors } from '@/theme';

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
    else router.replace('/today');
  }

  async function agree() {
    setBusy(true);
    try {
      const status = await accept(code);
      await refreshEntitlements();
      haptics.logged();
      toast.success(tr('coach.accepted')(status.link?.coach.display_name ?? tr('coach.yourCoachCapital')));
      router.replace('/today');
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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      {!preview && !failed ? (
        <View style={styles.loading}>
          <Skeleton style={styles.loadingAvatar} />
          <Skeleton style={styles.loadingTitle} />
        </View>
      ) : (
        <>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <Text style={[t.title2, { color: colors.foreground }]}>{initialsOf(preview?.coach?.display_name ?? null)}</Text>
          </View>
          <Text style={[t.largeTitle, styles.title, { color: colors.foreground }]}>{tr('coach.inviteTitle')(name)}</Text>
          {preview?.coach?.business_name && (
            <Text style={[t.body, styles.business, { color: colors.mutedForeground }]}>{preview.coach.business_name}</Text>
          )}
        </>
      )}

      {problem ? (
        <Text style={[t.body, styles.problem, { color: colors.destructive }]}>{problem}</Text>
      ) : (
        <View style={styles.scope}>
          <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>{tr('coach.willSee')}</Text>
          <Line tick text={tr('coach.seeMeals')} />
          <Line tick text={tr('coach.seeTotals')} />
          <Line tick text={tr('coach.seeWeight')} />
          <Line tick text={tr('coach.seeDays')} />
          <Text style={[t.eyebrow, styles.eyebrowGap, { color: colors.mutedForeground }]}>{tr('coach.wontSee')}</Text>
          <Line text={tr('coach.notChat')} />
          <Line text={tr('coach.notMetrics')} />
          <Line text={tr('coach.notEmail')} />
        </View>
      )}

      <View style={styles.buttons}>
        {!problem && preview?.valid && (
          <PressableChunk
            onPress={() => void agree()}
            disabled={busy}
            color={colors.primary}
            contentStyle={[styles.button, { backgroundColor: colors.primary }]}
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
  );
}

function Line({ tick, text }: { tick?: boolean; text: string }) {
  const colors = useColors();
  return (
    <View style={styles.line}>
      <Text style={[t.bodyBold, { color: tick ? colors.caloriesText : colors.destructive, width: 18 }]}>
        {tick ? '✓' : '✕'}
      </Text>
      <Text style={[t.body, styles.lineText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, gap: 16, flexGrow: 1 },
  loading: { alignItems: 'center', gap: 12 },
  loadingAvatar: { width: 64, height: 64, borderRadius: 32 },
  loadingTitle: { width: 220, height: 28, borderRadius: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { textAlign: 'center' },
  business: { textAlign: 'center', marginTop: -8 },
  problem: { textAlign: 'center', marginTop: 8 },
  scope: { gap: 8, marginTop: 8 },
  eyebrowGap: { marginTop: 12 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineText: { flex: 1 },
  buttons: { marginTop: 'auto', gap: 10, paddingTop: 16 },
  button: { alignItems: 'center', paddingVertical: 14, borderRadius: 18 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  canStop: { textAlign: 'center' },
});
