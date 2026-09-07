import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDay } from '@ct/shared';
import { TextField } from '@/components/Field';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { useCoachLink } from '@/lib/coach';
import { useEntitlements } from '@/lib/entitlements';
import { messageOf } from '@/lib/errors';
import { useLocale, useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';

/**
 * The section under Settings that owns the link. See COACH.md §7.
 *
 * Two shapes. With nobody coaching: a field for a code, which leads to the
 * accept screen rather than accepting here — the screen names the coach and
 * lists the scope, and a code typed into a settings row must not skip that.
 * With a coach: who, since when, the three toggles, and the way out.
 *
 * Stopping confirms in place, the way deleting the account does, rather than
 * in a dialog: the consequence is written next to the button that carries it
 * out, and there is no focus trap over a screen full of other switches.
 */
export function CoachSettings() {
  const { status, link, setScope, revoke } = useCoachLink();
  const { refresh: refreshEntitlements } = useEntitlements();
  const colors = useColors();
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nothing drawn until the server has answered once: a "shared with nobody"
  // section that turns into "shared with Maria" a second later is a lie twice.
  if (!status) return null;

  if (!link) {
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (
      <InsetGroup title={tr('coach.title')} footer={tr('coach.footerNone')}>
        <InsetRow first>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>{tr('coach.enterCode')}</Text>
          <TextField
            value={code}
            onChangeText={setCode}
            placeholder={tr('coach.codePlaceholder')}
            style={styles.codeField}
          />
        </InsetRow>
        <Pressable
          onPress={() => router.push(`/c/${clean}`)}
          disabled={clean.length !== 8}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.rowButton,
            { borderTopColor: colors.border, opacity: pressed || clean.length !== 8 ? 0.5 : 1 },
          ]}
        >
          <Text style={[t.body, { color: colors.caloriesText }]}>{tr('coach.continue')}</Text>
        </Pressable>
      </InsetGroup>
    );
  }

  const name = link.coach.display_name ?? tr('coach.yourCoachCapital');

  async function toggle(key: 'meals' | 'weight' | 'metrics', value: boolean) {
    try {
      await setScope({ [key]: value });
    } catch (e) {
      toast.error(messageOf(e, tr));
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await revoke();
      // The seat went with the link; the plan row above has to say so.
      await refreshEntitlements();
      toast.message(tr('coach.stopped'));
    } catch (e) {
      toast.error(messageOf(e, tr));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <InsetGroup title={tr('coach.title')} footer={tr('coach.footerLinked')(name)}>
      <InsetRow first>
        <View style={styles.who}>
          <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('coach.sharedWith')(name)}</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            {[link.coach.business_name, tr('coach.since')(formatDay(link.accepted_at.slice(0, 10), locale))]
              .filter(Boolean)
              .join(' · ')}
            {link.seat === 'plus' ? ` · ${tr('coach.seatPlus')}` : ''}
          </Text>
        </View>
      </InsetRow>

      <ScopeRow
        label={tr('coach.scopeMeals')}
        hint={tr('coach.scopeMealsHint')}
        value={link.scope.meals}
        onChange={(value) => void toggle('meals', value)}
      />
      <ScopeRow
        label={tr('coach.scopeWeight')}
        hint={tr('coach.scopeWeightHint')}
        value={link.scope.weight}
        onChange={(value) => void toggle('weight', value)}
      />
      <ScopeRow
        label={tr('coach.scopeMetrics')}
        hint={tr('coach.scopeMetricsHint')}
        value={link.scope.metrics}
        onChange={(value) => void toggle('metrics', value)}
      />

      {confirming ? (
        <View style={[styles.confirm, { borderTopColor: colors.border }]}>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('coach.stopConfirm')(name)}</Text>
          <View style={styles.confirmButtons}>
            <Pressable
              onPress={() => void stop()}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: colors.destructive, opacity: pressed || busy ? 0.6 : 1 },
              ]}
            >
              <Text style={[t.bodyBold, { color: colors.destructiveForeground }]}>{tr('coach.stop')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirming(false)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.confirmButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[t.bodyBold, { color: colors.foreground }]}>{tr('coach.keep')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowButton, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.destructive }]}>{tr('coach.stopSharing')}</Text>
        </Pressable>
      )}
    </InsetGroup>
  );
}

function ScopeRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const colors = useColors();
  return (
    <InsetRow>
      <View style={styles.who}>
        <Text style={[t.body, { color: colors.foreground }]}>{label}</Text>
        <Text style={[t.footnote, { color: colors.mutedForeground }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </InsetRow>
  );
}

const styles = StyleSheet.create({
  label: { flex: 1 },
  who: { flex: 1, gap: 2 },
  codeField: { minWidth: 132 },
  rowButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 2,
  },
  confirm: { padding: 16, gap: 12, borderTopWidth: 2 },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 14,
  },
});
