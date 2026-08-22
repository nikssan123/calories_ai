import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { ActivityLevel, DaySummary, Goal, Profile, Sex, UnitSystem } from '@ct/shared';
import {
  bodyWeightToKg,
  bodyWeightUnit,
  cmToFeetInches,
  feetInchesToCm,
  toBodyWeight,
  unitsOf,
} from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { DietRules } from '@/components/DietRules';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { NumberField, Picker, Sheet, TextField } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { font, type as t, useColors, withAlpha } from '@/theme';

/** §10: short setup. Enough to establish a starting target, nothing more. */

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, little exercise',
  light: 'Light exercise 1–3 days/week',
  moderate: 'Moderate exercise 3–5 days/week',
  active: 'Hard exercise 6–7 days/week',
  very_active: 'Physical job or twice-daily training',
};

/** Short forms for the collapsed row; the sheet shows the full description. */
const ACTIVITY_SHORT: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Light',
  moderate: 'Moderate',
  active: 'Active',
  very_active: 'Very active',
};

const SEX_LABELS: Record<Sex, string> = { male: 'Male', female: 'Female' };
const GOAL_LABELS: Record<Goal, string> = { lose: 'Lose', maintain: 'Maintain', gain: 'Gain' };
const UNIT_LABELS: Record<UnitSystem, string> = { metric: 'Metric', imperial: 'Imperial' };
/** What each one actually means, since "imperial" is a word and not a number. */
const UNIT_EXAMPLES: Record<UnitSystem, string> = {
  metric: 'kg · cm · km · g',
  imperial: 'lb · ft · mi · oz',
};

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut, adoptProfile } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, d] = await Promise.all([api.profile(), api.day()]);
        setProfile(p);
        setDay(d);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const units = unitsOf(profile);

  function patch<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        display_name: profile.display_name,
        sex: profile.sex,
        birth_date: profile.birth_date,
        height_cm: profile.height_cm,
        target_weight_kg: profile.target_weight_kg,
        activity_level: profile.activity_level,
        goal: profile.goal,
        timezone: profile.timezone,
        // Never null on the way out. Saving this screen is somebody looking at
        // the control and leaving it where it is, which is an answer.
        units: unitsOf(profile),
        day_start_hour: profile.day_start_hour,
      });
      setProfile(updated);
      // The rest of the app reads units and the name off the session's copy;
      // without this the journal keeps rendering kilos at someone who just
      // asked for pounds until the next launch.
      adoptProfile(updated);
      setDay(await api.day());
      setDirty(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top + 20 }]}>
        <Skeleton style={{ height: 40, width: 128, borderRadius: 12 }} />
        <Skeleton style={{ height: 192, borderRadius: 24 }} />
        {error && (
          <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{error}</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text style={[t.largeTitle, { color: colors.foreground }]}>You</Text>
        <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>
          Enough to work out a starting target. It adjusts as real data comes in.
        </Text>
      </View>

      {day && <TargetCard day={day} />}

      <InsetGroup title="About you">
        <InsetRow first>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Name</Text>
          <TextField
            value={profile.display_name ?? ''}
            onChangeText={(v) => patch('display_name', v || null)}
            placeholder="Optional"
            style={styles.wide}
          />
        </InsetRow>

        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Sex</Text>
          <Picker
            label="Sex"
            value={profile.sex}
            options={Object.keys(SEX_LABELS) as Sex[]}
            onChange={(v) => patch('sex', v)}
            render={(v) => SEX_LABELS[v]}
          />
        </InsetRow>

        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Date of birth</Text>
          <BirthDate value={profile.birth_date} onChange={(v) => patch('birth_date', v)} />
        </InsetRow>

        {/* Above the two fields it governs, so switching it visibly rewrites
            them rather than changing something further down that the eye has
            already left. */}
        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Units</Text>
          <View style={[styles.segment, { backgroundColor: colors.muted }]}>
            {(Object.keys(UNIT_LABELS) as UnitSystem[]).map((system) => {
              const active = units === system;
              return (
                <Pressable
                  key={system}
                  onPress={() => patch('units', system)}
                  accessibilityRole="button"
                  accessibilityLabel={`${UNIT_LABELS[system]} — ${UNIT_EXAMPLES[system]}`}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.segmentItem,
                    active ? { backgroundColor: colors.primary } : null,
                  ]}
                >
                  <Text
                    style={[
                      t.footnoteBold,
                      { color: active ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {UNIT_LABELS[system]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </InsetRow>

        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Height</Text>
          {units === 'imperial' ? (
            <HeightFeetInches value={profile.height_cm} onChange={(v) => patch('height_cm', v)} />
          ) : (
            <NumberField
              value={profile.height_cm}
              onChange={(v) => patch('height_cm', v)}
              unit="cm"
            />
          )}
        </InsetRow>

        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Target weight</Text>
          {/* Converted on the way in and back out on the way to the API, so the
              column stays kilograms whatever this field says. Typing 165 lb
              stores 74.8 kg; the number that comes back rounds to 165 again. */}
          <NumberField
            value={
              profile.target_weight_kg === null
                ? null
                : toBodyWeight(profile.target_weight_kg, units)
            }
            onChange={(v) =>
              patch('target_weight_kg', v === null ? null : bodyWeightToKg(v, units))
            }
            unit={bodyWeightUnit(units)}
            decimal
          />
        </InsetRow>
      </InsetGroup>

      <InsetGroup title="Goal">
        <View style={styles.goals}>
          {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => {
            const active = profile.goal === goal;
            return (
              <PressableChunk
                key={goal}
                depth={3}
                radius={24}
                color={active ? colors.caloriesDeep : undefined}
                onPress={() => patch('goal', goal)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={styles.flex}
                contentStyle={[
                  styles.goal,
                  active
                    ? { backgroundColor: colors.primary, borderColor: 'transparent' }
                    : { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.goalLabel,
                    { color: active ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {GOAL_LABELS[goal]}
                </Text>
              </PressableChunk>
            );
          })}
        </View>

        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Activity</Text>
          <Picker
            label="Activity"
            value={profile.activity_level}
            options={Object.keys(ACTIVITY_LABELS) as ActivityLevel[]}
            onChange={(v) => patch('activity_level', v)}
            render={(v, place) => (place === 'trigger' ? ACTIVITY_SHORT[v] : ACTIVITY_LABELS[v])}
          />
        </InsetRow>
      </InsetGroup>

      <InsetGroup
        title="Day"
        footer="Food eaten before the day starts counts toward the previous day — so a 1am snack lands on the evening it belongs to."
      >
        <InsetRow first>
          <Text style={[t.body, { color: colors.foreground }]}>Time zone</Text>
          <TextField
            value={profile.timezone}
            onChangeText={(v) => patch('timezone', v)}
            style={styles.flex}
          />
        </InsetRow>
        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Day starts at</Text>
          <Picker
            label="Day starts at"
            value={String(profile.day_start_hour)}
            options={Array.from({ length: 9 }, (_, i) => String(i))}
            onChange={(v) => patch('day_start_hour', Number(v))}
            render={(v) => `${v.padStart(2, '0')}:00`}
          />
        </InsetRow>
      </InsetGroup>

      <DietRules profile={profile} onChange={setProfile} onError={setError} />

      <EmailSettings profile={profile} onChange={setProfile} onError={setError} />

      <InsetGroup title="Account">
        <InsetRow first>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>Signed in as</Text>
          <Text numberOfLines={1} style={[t.body, { color: colors.mutedForeground }]}>
            {profile.email ?? '—'}
          </Text>
        </InsetRow>
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
      </InsetGroup>

      <DeleteAccount email={profile.email} onDeleted={() => void signOut()} onError={setError} />

      {error && (
        <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
          {error}
        </Text>
      )}

      <PressableChunk
        onPress={() => void save()}
        disabled={saving || !dirty}
        radius={24}
        color={colors.caloriesDeep}
        accessibilityRole="button"
        contentStyle={[styles.save, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.saveLabel, { color: colors.primaryForeground }]}>
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Text>
      </PressableChunk>
    </ScrollView>
  );
}

function TargetCard({ day }: { day: DaySummary }) {
  const colors = useColors();
  return (
    <InsetGroup>
      <View style={styles.target}>
        <Text style={[t.eyebrow, { color: colors.mutedForeground }]}>Your daily target</Text>
        <Text style={[t.figure, styles.targetFigure, { color: colors.foreground }]}>
          {day.targets.kcal.toLocaleString()}
          <Text style={[styles.targetUnit, { color: colors.mutedForeground }]}> kcal</Text>
        </Text>

        <View style={styles.chips}>
          <MacroChip label="Protein" value={day.targets.protein_g} color={colors.protein} />
          <MacroChip label="Carbs" value={day.targets.carbs_g} color={colors.carbs} />
          <MacroChip label="Fat" value={day.targets.fat_g} color={colors.fat} />
        </View>

        {/*
          Under the number, not tucked into a footer nobody reaches.

          A figure this size, presented alone, reads as a prescription. It is an
          average for a body of these dimensions and knows nothing about the
          person — which is exactly the sentence someone pregnant, or managing
          diabetes, needs to have read before treating it as an instruction.
        */}
        <Text style={[t.footnote, styles.disclaimer, { color: colors.mutedForeground }]}>
          A population average for someone your size, not medical advice. It is corrected from
          your own logged data after a fortnight. If you are pregnant or breastfeeding, or
          managing a condition like diabetes or kidney disease, get your number from a
          clinician and set it by hand here.
        </Text>
      </View>
    </InsetGroup>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={[t.footnoteSemibold, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[t.footnote, { fontFamily: font.display, color: colors.foreground }]}>
        {value}g
      </Text>
    </View>
  );
}

/**
 * The date, through the platform's own picker.
 *
 * The web hands this to `<input type="date">` and lets the browser draw it.
 * There is no equivalent to inherit here, so the native picker is opened
 * explicitly — inside the same sheet the `Picker` uses on iOS, where the
 * control is inline and needs somewhere to live, and as its own dialog on
 * Android, which supplies one.
 */
function BirthDate({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(`${value}T12:00:00Z`) : null;
  const shown = parsed
    ? parsed.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

  const picker = (
    <DateTimePicker
      value={parsed ?? new Date(1995, 0, 1)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      maximumDate={new Date()}
      onChange={(event, date) => {
        if (Platform.OS !== 'ios') setOpen(false);
        if (event.type === 'dismissed' || !date) return;
        // Local parts rather than toISOString: the picker hands back local
        // midnight, and in a negative offset that is the previous day in UTC.
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
          date.getDate(),
        ).padStart(2, '0')}`;
        onChange(iso);
      }}
    />
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Date of birth"
        style={({ pressed }) => [
          styles.dateField,
          { borderColor: colors.border, backgroundColor: colors.muted, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[t.bodySemibold, { color: value ? colors.foreground : colors.mutedForeground }]}>
          {shown}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Sheet open={open} title="Date of birth" onClose={() => setOpen(false)}>
          {picker}
        </Sheet>
      ) : (
        open && picker
      )}
    </>
  );
}

/**
 * Height in the two numbers people actually say it in.
 *
 * Two fields rather than one box parsing 5'10", because a free-text height has
 * to guess at every notation anyone might type — 5'10, 5 ft 10, 70" — and gets
 * one of them wrong for somebody. Two number fields have no notation to guess.
 */
function HeightFeetInches({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (cm: number | null) => void;
}) {
  const parts = value === null ? null : cmToFeetInches(value);

  const set = (feet: number | null, inches: number | null) => {
    if (feet === null && inches === null) return onChange(null);
    onChange(feetInchesToCm(feet ?? 0, inches ?? 0));
  };

  return (
    <View style={styles.height}>
      <NumberField
        value={parts?.feet ?? null}
        onChange={(feet) => set(feet, parts?.inches ?? 0)}
        unit="ft"
        style={styles.heightPart}
      />
      <NumberField
        value={parts?.inches ?? null}
        onChange={(inches) => set(parts?.feet ?? 0, inches)}
        unit="in"
        style={styles.heightPart}
      />
    </View>
  );
}

/**
 * What the product will and will not put in your inbox.
 *
 * The split between the two halves is the substance of it: the address is a
 * *capability* — an unconfirmed one means a forgotten password is unrecoverable,
 * worth saying plainly rather than badging quietly — while the weekly review is
 * a preference, and the only one there is. Emails about the account itself are
 * not listed as a choice because they are not one.
 */
function EmailSettings({
  profile,
  onChange,
  onError,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // No address means the pre-accounts placeholder row, which nothing can be
  // sent to and which has no preference worth showing.
  if (!profile.email) return null;

  async function resend() {
    setSending(true);
    try {
      const result = await api.resendVerification();
      setSent(result.message);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  /*
   * Saved on the spot rather than gathered up by the Save button at the bottom
   * of the screen. A switch reads as the change itself — the classic bug is
   * someone flipping it, navigating away, and being surprised by next Monday's
   * email. The optimistic flip is reverted if the write fails, so the control
   * never shows a state the server does not hold.
   */
  async function setPreference(
    field: 'notify_weekly_review' | 'notify_nudges',
    enabled: boolean,
  ) {
    const previous = profile[field];
    onChange({ ...profile, [field]: enabled });
    try {
      onChange(await api.updateProfile({ [field]: enabled }));
    } catch (e) {
      onChange({ ...profile, [field]: previous });
      onError((e as Error).message);
    }
  }

  const track = { false: colors.muted, true: colors.primary };

  return (
    <InsetGroup
      title="Email"
      footer={
        profile.notify_weekly_review
          ? 'The weekly review arrives on Monday mornings. Emails about your account — a password change, a sign-in from a device we have not seen — are always sent.'
          : 'Emails about your account — a password change, a sign-in from a device we have not seen — are always sent.'
      }
    >
      {profile.email_verified ? (
        <InsetRow first>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>
            Address confirmed
          </Text>
        </InsetRow>
      ) : (
        <View style={styles.unverified}>
          <Text style={[t.body, { color: colors.foreground }]}>Address not confirmed</Text>
          <Text style={[t.footnote, styles.hint, { color: colors.mutedForeground }]}>
            Until you confirm {profile.email}, a forgotten password cannot be reset — there would
            be no way to know the mailbox is yours.
          </Text>
          {sent ? (
            <Text style={[t.footnoteSemibold, { color: colors.caloriesText }]}>{sent}</Text>
          ) : (
            <PressableChunk
              depth={3}
              radius={999}
              onPress={() => void resend()}
              disabled={sending}
              accessibilityRole="button"
              style={styles.resendWrap}
              contentStyle={[
                styles.resend,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[t.footnoteBold, { color: colors.foreground }]}>
                {sending ? 'Sending…' : 'Send the link again'}
              </Text>
            </PressableChunk>
          )}
        </View>
      )}

      <InsetRow>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Weekly review</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            Last week, summarised, on Monday.
          </Text>
        </View>
        <Switch
          value={profile.notify_weekly_review}
          onValueChange={(v) => void setPreference('notify_weekly_review', v)}
          trackColor={track}
          accessibilityLabel="Email me the weekly review"
        />
      </InsetRow>

      {/* Off by default, unlike the review above, and the copy has to earn the
          flip rather than assume it. A nudge arrives because the app decided to
          say something, so the honest pitch is the ceiling. */}
      <InsetRow>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Nudges</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            At most one a week, when something in your log is worth a mention. They always
            appear in the journal; this emails them too.
          </Text>
        </View>
        <Switch
          value={profile.notify_nudges}
          onValueChange={(v) => void setPreference('notify_nudges', v)}
          trackColor={track}
          accessibilityLabel="Email me nudges"
        />
      </InsetRow>
    </InsetGroup>
  );
}

/**
 * Closing the account, from inside the product.
 *
 * Expanding in place rather than opening a dialog: a destructive confirmation is
 * the last place to put a focus trap, it costs a tap either way, and this shows
 * the consequences next to the button that carries them out. The password is the
 * real gate; the disclosure only stops the control being hit by accident.
 */
function DeleteAccount({
  email,
  onDeleted,
  onError,
}: {
  email: string | null;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (!email) return null;

  async function confirm() {
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      // Everything this session could read is gone, so dropping the token is
      // both the simplest correct next state and the only one that cannot show
      // stale data: the guard re-runs and lands on the sign-in screen.
      onDeleted();
    } catch (e) {
      onError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <InsetGroup title="Danger zone">
      {!open ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.destructive }]}>Delete account</Text>
        </Pressable>
      ) : (
        <View style={styles.danger}>
          <Text style={[t.footnote, styles.hint, { color: colors.mutedForeground }]}>
            This erases every meal, photo, weight and conversation on{' '}
            <Text style={{ fontFamily: font.extrabold, color: colors.foreground }}>{email}</Text>,
            on every device, and cannot be undone. Enter your password to confirm.
          </Text>

          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            align="left"
          />

          <View style={styles.dangerButtons}>
            <PressableChunk
              depth={0}
              radius={16}
              onPress={() => void confirm()}
              disabled={!password || deleting}
              accessibilityRole="button"
              style={styles.flex}
              contentStyle={[
                styles.dangerButton,
                {
                  backgroundColor: withAlpha(colors.destructive, 0.12),
                  borderColor: withAlpha(colors.destructive, 0.25),
                },
              ]}
            >
              <Text style={[t.bodyBold, { color: colors.destructive }]}>
                {deleting ? 'Deleting…' : 'Delete everything'}
              </Text>
            </PressableChunk>
            <Pressable
              onPress={() => {
                setOpen(false);
                setPassword('');
              }}
              disabled={deleting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[t.body, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, paddingHorizontal: 16, gap: 16 },
  page: { paddingHorizontal: 16, paddingBottom: 40, gap: 28 },
  blurb: { marginTop: 6 },
  label: { flex: 1 },
  wide: { width: 176 },
  centred: { textAlign: 'center' },
  target: { alignItems: 'center', padding: 20 },
  targetFigure: { fontSize: 44, lineHeight: 52, marginTop: 6 },
  targetUnit: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  disclaimer: { marginTop: 20, textAlign: 'center', lineHeight: 20 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 2 },
  segmentItem: {
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  height: { flexDirection: 'row', gap: 8 },
  heightPart: { width: 88 },
  dateField: {
    height: 40,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  goals: { flexDirection: 'row', gap: 8, padding: 8 },
  goal: {
    borderWidth: 2,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  goalLabel: { fontFamily: font.bold, fontSize: 14, lineHeight: 20 },
  rowButton: { paddingHorizontal: 16, paddingVertical: 14 },
  unverified: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  hint: { lineHeight: 20 },
  resendWrap: { alignSelf: 'flex-start' },
  resend: {
    height: 36,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  dangerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dangerButton: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancel: { paddingHorizontal: 16, paddingVertical: 12 },
  save: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
});
