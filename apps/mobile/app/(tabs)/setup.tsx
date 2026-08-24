import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as WebBrowser from 'expo-web-browser';
import type { ActivityLevel, DaySummary, Goal, Profile, Sex, UnitSystem } from '@ct/shared';
import {
  bodyWeightToKg,
  bodyWeightUnit,
  cmToFeetInches,
  feetInchesToCm,
  meterLocked,
  meterRemaining,
  toBodyWeight,
  formatDay,
  localeOf,
  unitsOf,
} from '@ct/shared';
import { PressableChunk } from '@/components/Chunk';
import { DietRules } from '@/components/DietRules';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { NumberField, Picker, Sheet, TextField } from '@/components/Field';
import { Material } from '@/components/Material';
import { Skeleton } from '@/components/Skeleton';
import { Switch } from '@/components/Switch';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEntitlements } from '@/lib/entitlements';
import { billingAvailable, manageSubscription, restore } from '@/lib/billing';
import { meterNoun, TIER_NAMES, TIER_PITCHES } from '@/lib/plan-copy';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/links';
import { duration, font, type as t, useColors, useType, withAlpha } from '@/theme';
import { LanguagePicker } from '@/components/LanguagePicker';
import { setPreferredLocale, useLocale, useT, type StringKey } from '@/lib/i18n';
import { registerForPush } from '@/lib/push';
import { applyReminders, loadReminders, type ReminderSettings } from '@/lib/reminders';

/** §10: short setup. Enough to establish a starting target, nothing more. */

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, little exercise',
  light: 'Light exercise 1–3 days/week',
  moderate: 'Moderate exercise 3–5 days/week',
  active: 'Hard exercise 6–7 days/week',
  very_active: 'Physical job or twice-daily training',
};

/** Short forms for the collapsed row; the sheet shows the full description. */
const ACTIVITY_SHORT: Record<ActivityLevel, StringKey> = {
  sedentary: 'activity.sedentary',
  light: 'activity.light',
  moderate: 'activity.moderate',
  active: 'activity.active',
  very_active: 'activity.veryActive',
};

const SEX_LABELS: Record<Sex, StringKey> = { male: 'sex.male', female: 'sex.female' };
const GOAL_LABELS: Record<Goal, StringKey> = {
  lose: 'goal.lose',
  maintain: 'goal.maintain',
  gain: 'goal.gain',
};
const UNIT_LABELS: Record<UnitSystem, StringKey> = {
  metric: 'units.metric',
  imperial: 'units.imperial',
};
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Kept apart from `error`, which belongs to whatever part of the screen
   * raised it — a profile that would not load, a deletion that failed. This one
   * is about the write the bar just attempted, and it is reported in the bar,
   * because that is where the person pressing Save is looking.
   */
  const [saveError, setSaveError] = useState<string | null>(null);

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

  /*
   * The receipt leaves on its own, and takes the bar with it. Without the timer
   * the strip would be a permanent fixture reading "Saved" — a line of chrome
   * across the foot of the screen saying that nothing needs doing, which is the
   * state the screen is in almost all of the time.
   */
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), SAVED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const units = unitsOf(profile);
  const locale = localeOf(profile);
  const t = useType();
  const tr = useT();

  function patch<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
    setSaved(false);
    setSaveError(null);
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
        locale: localeOf(profile),
        day_start_hour: profile.day_start_hour,
      });
      setProfile(updated);
      // The rest of the app reads units and the name off the session's copy;
      // without this the journal keeps rendering kilos at someone who just
      // asked for pounds until the next launch.
      adoptProfile(updated);
      setDay(await api.day());
      setDirty(false);
      setSaved(true);
      setSaveError(null);
    } catch (e) {
      setSaveError((e as Error).message);
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
    <View style={styles.flex}>
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
              render={(v) => tr(SEX_LABELS[v])}
            />
          </InsetRow>

          <InsetRow>
            <Text style={[t.body, styles.label, { color: colors.foreground }]}>Date of birth</Text>
            <BirthDate value={profile.birth_date} onChange={(v) => patch('birth_date', v)} />
          </InsetRow>

          {/* Above Units, and above the fields both of them rewrite. Language
              moves more of the screen than units does, so it goes first. */}
          <InsetRow>
            <Text style={[t.body, styles.label, { color: colors.foreground }]}>
              {tr('setup.language')}
            </Text>
            <LanguagePicker
              value={locale}
              onChange={(next) => {
                /*
                 * Two writes, deliberately. The profile is the durable answer
                 * and the one the server writes emails from; the stored
                 * preference is what the sign-in screen reads next time this
                 * device is signed out, which would otherwise still be showing
                 * whatever the device language was months ago.
                 */
                patch('locale', next);
                setPreferredLocale(next);
              }}
            />
          </InsetRow>

          {/* Above the two fields it governs, so switching it visibly rewrites
              them rather than changing something further down that the eye has
              already left. */}
          <InsetRow>
            <Text style={[t.body, styles.label, { color: colors.foreground }]}>
              {tr('setup.units')}
            </Text>
            <View style={[styles.segment, { backgroundColor: colors.muted }]}>
              {(Object.keys(UNIT_LABELS) as UnitSystem[]).map((system) => {
                const active = units === system;
                return (
                  <Pressable
                    key={system}
                    onPress={() => patch('units', system)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tr(UNIT_LABELS[system])} — ${UNIT_EXAMPLES[system]}`}
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
                      {tr(UNIT_LABELS[system])}
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
                    {tr(GOAL_LABELS[goal])}
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
              render={(v, place) => (place === 'trigger' ? tr(ACTIVITY_SHORT[v]) : ACTIVITY_LABELS[v])}
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

        <InsetGroup
          title="Appearance"
          footer="System follows your device, including its light and dark schedule."
        >
          <View style={styles.appearance}>
            <ThemeToggle />
          </View>
        </InsetGroup>

        <EmailSettings profile={profile} onChange={setProfile} onError={setError} />

        <PhoneReminders />

        <PlanSettings />

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

        {/* The store listings link to both of these, and the review that checks
            them expects to find them in the app too. Opened in the system browser
            rather than re-rendered here: one copy of each document, on the web. */}
        <InsetGroup title="About">
          <ExternalRow first label="Privacy policy" url={PRIVACY_URL} />
          <ExternalRow label="Terms of service" url={TERMS_URL} />
          <ExternalRow label="Contact support" url={`mailto:${SUPPORT_EMAIL}`} mail />
        </InsetGroup>

        <DeleteAccount email={profile.email} onDeleted={() => void signOut()} onError={setError} />

        {error && (
          <Text style={[t.footnoteSemibold, styles.centred, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
      </ScrollView>

      <SaveBar
        dirty={dirty}
        saving={saving}
        saved={saved}
        error={saveError}
        onSave={() => void save()}
      />
    </View>
  );
}

/** How long "Saved" stays up before the bar leaves. Long enough to read. */
const SAVED_LINGER_MS = 2200;

/**
 * The save control, pinned to the foot of the screen rather than parked at the
 * end of it.
 *
 * It used to be the last thing in the scroll, below Delete account. So changing
 * your units at the top of the screen did nothing anybody could see: the new
 * value sat in a control, the button that would commit it was two thumb-flicks
 * away, and the way most people found out was coming back later to a profile
 * that had not changed. Nothing said the change was being *held* rather than
 * kept.
 *
 * The bar arrives the moment something is unsaved and says so in words, so the
 * work outstanding and the button that finishes it are one object in one place.
 * It leaves again when there is nothing to do — after holding the receipt long
 * enough to be read, because here the bar *is* the receipt: a toast is for
 * something that has left the screen, and this has not.
 *
 * Above the tab bar rather than over it, so the six destinations stay reachable
 * with a change in hand. Leaving the screen does not discard anything — the
 * edits are still in state when the tab comes back.
 */
function SaveBar({
  dirty,
  saving,
  saved,
  error,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const colors = useColors();

  if (!dirty && !saving && !saved) return null;

  return (
    <Animated.View
      /*
       * `ReduceMotion.System`: the bar has no end state worth jumping to — it
       * is either there or it is not — so honouring the OS switch costs the
       * reader nothing.
       */
      entering={SlideInDown.duration(duration.quick).reduceMotion(ReduceMotion.System)}
      exiting={SlideOutDown.duration(duration.quick).reduceMotion(ReduceMotion.System)}
    >
      <Material style={[styles.bar, { borderTopColor: colors.border }]}>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            t.footnoteSemibold,
            styles.barStatus,
            { color: error ? colors.destructive : colors.mutedForeground },
          ]}
        >
          {saving ? 'Saving…' : (error ?? (dirty ? 'Unsaved changes' : 'Saved'))}
        </Text>
        <PressableChunk
          onPress={onSave}
          disabled={saving || !dirty}
          reserve
          radius={22}
          color={colors.caloriesDeep}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          contentStyle={[styles.save, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.saveLabel, { color: colors.primaryForeground }]}>Save</Text>
        </PressableChunk>
      </Material>
    </Animated.View>
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
 * The date, through the platform's own wheels but in the app's own sheet.
 *
 * The web hands this to `<input type="date">` and lets the browser draw it;
 * there is nothing to inherit here, so it is opened explicitly. `spinner` on
 * both platforms rather than letting Android put up its calendar dialog: the
 * wheels are the part that has to be native — they are the thing a thumb knows
 * how to use — and the frame around them is the part that should be this app's
 * on both, rather than Material's on one phone and nothing on the other.
 */
function BirthDate({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const colors = useColors();
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(`${value}T12:00:00Z`) : null;
  const shown = value
    ? formatDay(value, locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const picker = (
    <DateTimePicker
      value={parsed ?? new Date(1995, 0, 1)}
      mode="date"
      display="spinner"
      maximumDate={new Date()}
      onChange={(event, date) => {
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

      <Sheet open={open} title="Date of birth" onClose={() => setOpen(false)}>
        {picker}
      </Sheet>
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
/**
 * The plan, where somebody goes looking for it.
 *
 * Every other surface that mentions money in this app appears because something
 * was refused — the wall in the journal, the locked kitchen. That is the right
 * way round for a nudge and the wrong way round for a *fact*: "what am I on,
 * and how much of it is left" is a question people ask when nothing at all is
 * wrong, and an app that will only answer it by blocking them first is one that
 * feels like it is hiding the meter.
 *
 * So this is the calm version, and it is the only one that is always reachable.
 * It leads with what is left rather than with a price, which is also the order
 * that makes it useful to somebody who is already paying — the group every
 * other plan surface in the app has nothing to say to.
 */
function PlanSettings() {
  const colors = useColors();
  const router = useRouter();
  const { plan, allowances, refresh } = useEntitlements();
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /*
   * Only the meters this plan actually carries. A row reading "0 recipes left"
   * on a tier that never sold any is a list of what you do not have, which is
   * the tone this whole screen is trying not to take — the locked ones are the
   * paywall's subject, not the settings screen's.
   *
   * An unmetered account keeps its rows: they say "Unlimited" rather than a
   * count, which is the one thing this screen exists to tell somebody who is
   * not going to hit a wall.
   */
  const carried = allowances
    ? Object.values(allowances).filter((allowance) => !meterLocked(allowance))
    : [];

  async function restorePurchase() {
    setRestoring(true);
    setNote(null);
    try {
      setNote(
        (await restore(refresh))
          ? 'Restored.'
          : 'No subscription found on this store account.',
      );
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <InsetGroup title="Plan" footer={note ?? TIER_PITCHES[plan]}>
      <InsetRow first>
        <Text style={[t.body, styles.label, { color: colors.foreground }]}>You&apos;re on</Text>
        <Text style={[t.bodyBold, { color: colors.foreground }]}>{TIER_NAMES[plan]}</Text>
      </InsetRow>

      {carried.map((allowance) => {
        const left = meterRemaining(allowance);
        return (
          <InsetRow key={allowance.meter}>
            <Text style={[t.body, styles.label, { color: colors.mutedForeground }]}>
              {/* Sentence case off the plural, so the row reads "Photo scans"
                  rather than a label invented separately from the wall's. */}
              {sentence(meterNoun(allowance.meter, 2))}
            </Text>
            <Text style={[t.bodySemibold, t.tnum, { color: colors.foreground }]}>
              {allowance.unlimited
                ? 'Unlimited'
                : `${left} left${allowance.period === 'ever' ? '' : ' this month'}`}
            </Text>
          </InsetRow>
        );
      })}

      <Pressable
        onPress={() => router.push('/upgrade')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.rowButton, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[t.body, { color: colors.caloriesText }]}>
          {plan === 'coach' ? 'See what your plan includes' : 'See the plans'}
        </Text>
      </Pressable>

      {/* Only for somebody who has something to manage. On free it would open a
          store page listing nothing, which reads as a dead end rather than a
          control — and the row is the one somebody goes looking for when they
          want out, so it has to lead somewhere the first time. */}
      {billingAvailable && plan !== 'free' && (
        <Pressable
          onPress={() => void manageSubscription()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.mutedForeground }]}>
            Manage or cancel subscription
          </Text>
        </Pressable>
      )}

      {/* Both stores require a restore control, and it is the one thing on this
          screen that has to work for somebody who is already paying and cross.
          Named for the situation rather than the verb: "Restore a purchase" is
          the store's word for it, and somebody on a new phone wondering where
          their plan went does not necessarily recognise themselves in it. */}
      {billingAvailable && (
        <Pressable
          onPress={() => void restorePurchase()}
          disabled={restoring}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowButton, { opacity: pressed || restoring ? 0.6 : 1 }]}
        >
          <Text style={[t.body, { color: colors.mutedForeground }]}>
            {restoring ? 'Checking the store…' : 'Paid but not showing? Restore it'}
          </Text>
        </Pressable>
      )}
    </InsetGroup>
  );
}

/** "photo scans" -> "Photo scans". */
function sentence(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

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
    field:
      | 'notify_weekly_review'
      | 'notify_nudges'
      | 'notify_milestones'
      | 'notify_daily_recap',
    enabled: boolean,
  ) {
    const previous = profile[field];
    onChange({ ...profile, [field]: enabled });
    try {
      onChange(await api.updateProfile({ [field]: enabled }));
      /*
       * The one moment the permission dialog is honest.
       *
       * Asking at launch is asking someone to decide about notifications before
       * they have seen what the app sends; asking here is answering a question
       * they just asked out loud by flipping the switch. Only on the way on —
       * turning it off is not an occasion to ask for anything.
       *
       * Nothing is reported if they say no. The preference is still saved and
       * still honoured: the notification goes to their email instead, which is
       * where it went before any of this, and telling somebody off for
       * declining a dialog they were shown unprompted is not the app's place.
       */
      if (enabled) await registerForPush({ requestPermissions: true });
    } catch (e) {
      onChange({ ...profile, [field]: previous });
      onError((e as Error).message);
    }
  }

  return (
    <InsetGroup
      title="Telling you things"
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
          accessibilityLabel="Send me the weekly review"
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
            appear in the journal; this sends it to your phone as well — or to your email,
            if notifications are off.
          </Text>
        </View>
        <Switch
          value={profile.notify_nudges}
          onValueChange={(v) => void setPreference('notify_nudges', v)}
          accessibilityLabel="Send me nudges"
        />
      </InsetRow>

      {/* On by default, unlike the two above, and the copy says why it is
          allowed to be: there is no inbox behind it, so the only address it can
          reach is one this phone already volunteered. */}
      <InsetRow>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Streaks and goals</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            A run of logged days worth noticing, and the day the scale reaches the number you
            set. Rare by construction, and never emailed — these go to your phone or nowhere.
          </Text>
        </View>
        <Switch
          value={profile.notify_milestones}
          onValueChange={(v) => void setPreference('notify_milestones', v)}
          accessibilityLabel="Tell me about streaks and goals"
        />
      </InsetRow>

      {/* The only daily thing the app sends, which is the whole of the copy's
          job: somebody switching this on should know that is what they are
          agreeing to. */}
      <InsetRow>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Evening recap</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            Tonight's calories and protein against tonight's targets, at nine. Every day you
            have logged something — the one notification here that is not occasional.
          </Text>
        </View>
        <Switch
          value={profile.notify_daily_recap}
          onValueChange={(v) => void setPreference('notify_daily_recap', v)}
          accessibilityLabel="Send me the evening recap"
        />
      </InsetRow>
    </InsetGroup>
  );
}

/** Expo counts from Sunday. */
const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  '1': 'Sunday',
  '2': 'Monday',
  '3': 'Tuesday',
  '4': 'Wednesday',
  '5': 'Thursday',
  '6': 'Friday',
  '7': 'Saturday',
};

/**
 * The two alarms that never involve the server.
 *
 * Its own group rather than two more switches in "Telling you things", and the
 * separation is the honest one: everything in that group is a decision made in
 * a datacentre and delivered to an account. These are set on this phone, kept
 * on this phone, and fire whether or not there is a network, a session or a
 * subscription. Filing them together would invite the reasonable assumption
 * that turning one on somewhere else brings it with you, and it does not.
 *
 * There is nothing to save and no server to fail: `applyReminders` returns what
 * actually took effect — including a switch forced back off by a refused
 * permission — and the state is set from its answer rather than from the tap.
 */
function PhoneReminders() {
  const colors = useColors();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    void loadReminders().then(setSettings);
  }, []);

  async function update(next: ReminderSettings) {
    // Optimistic, then corrected. Scheduling asks the OS for a permission and
    // can take a beat behind a dialog, and a switch that waits for that reads
    // as a switch that did not register the tap.
    //
    // The tap is also what earns the dialog: `applyReminders` stays silent
    // unless it is told otherwise, so this is the only place that asks.
    setSettings(next);
    setSettings(await applyReminders(next, { requestPermissions: true }));
  }

  // Nothing until the stored settings land. A frame of both switches off, for
  // somebody who has had a reminder set for a month, is a lie worth avoiding.
  if (!settings) return null;

  return (
    <InsetGroup
      title="Reminders on this phone"
      footer="Set here, kept here. These need no account and no connection, they arrive whatever your plan is, and they do not follow you to a new phone."
    >
      <InsetRow first>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Log your day</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            A nudge from your own phone, at an hour you pick. It knows nothing about what you
            have logged — it is an alarm, not an opinion.
          </Text>
        </View>
        <Switch
          value={settings.log.enabled}
          onValueChange={(v) =>
            void update({ ...settings, log: { ...settings.log, enabled: v } })
          }
          accessibilityLabel="Remind me to log"
        />
      </InsetRow>

      {settings.log.enabled && (
        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>At</Text>
          <TimeField
            label="Reminder time"
            hour={settings.log.hour}
            minute={settings.log.minute}
            onChange={(hour, minute) => void update({ ...settings, log: { ...settings.log, hour, minute } })}
          />
        </InsetRow>
      )}

      <InsetRow>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>Weigh in</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>
            Once a week, before breakfast. Weighing daily measures yesterday's salt more than
            it measures you, which is why this one is not offered daily.
          </Text>
        </View>
        <Switch
          value={settings.weighIn.enabled}
          onValueChange={(v) =>
            void update({ ...settings, weighIn: { ...settings.weighIn, enabled: v } })
          }
          accessibilityLabel="Remind me to weigh in"
        />
      </InsetRow>

      {settings.weighIn.enabled && (
        <InsetRow>
          <Text style={[t.body, styles.label, { color: colors.foreground }]}>On</Text>
          <View style={styles.reminderWhen}>
            <Picker
              label="Weigh-in day"
              value={String(settings.weighIn.weekday)}
              options={WEEKDAYS}
              onChange={(v) =>
                void update({ ...settings, weighIn: { ...settings.weighIn, weekday: Number(v) } })
              }
              render={(v, place) =>
                place === 'sheet' ? WEEKDAY_LABELS[v]! : WEEKDAY_LABELS[v]!.slice(0, 3)
              }
            />
            <TimeField
              label="Weigh-in time"
              hour={settings.weighIn.hour}
              minute={settings.weighIn.minute}
              onChange={(hour, minute) =>
                void update({ ...settings, weighIn: { ...settings.weighIn, hour, minute } })
              }
            />
          </View>
        </InsetRow>
      )}
    </InsetGroup>
  );
}

/**
 * An hour and a minute, through the platform's own wheels.
 *
 * The same treatment `BirthDate` gets and for the same reason: the wheels are
 * the part a thumb already knows how to use, and the frame around them is the
 * part that should be this app's on both platforms rather than Material's on
 * one and nothing on the other.
 */
function TimeField({
  label,
  hour,
  minute,
  onChange,
}: {
  label: string;
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const shown = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.timeField,
          { borderColor: colors.border, backgroundColor: colors.muted, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[t.bodySemibold, { color: colors.foreground }]}>{shown}</Text>
      </Pressable>

      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        <DateTimePicker
          // Any date at all: only the clock face is read back out. The first of
          // January is chosen for being a day with no daylight-saving seam in
          // any zone this could be opened in.
          value={new Date(2000, 0, 1, hour, minute)}
          mode="time"
          display="spinner"
          onChange={(event, date) => {
            if (event.type === 'dismissed' || !date) return;
            onChange(date.getHours(), date.getMinutes());
          }}
        />
      </Sheet>
    </>
  );
}

/**
 * A settings row that leaves the app.
 *
 * The two documents open in the system browser sheet rather than a `Linking`
 * hand-off, which keeps the reader inside the app and one swipe from where they
 * were — App Review dislikes a policy link that ejects you into Safari, and so
 * does anybody reading one. `mailto:` cannot go through the sheet, so that one
 * still goes to `Linking`.
 */
function ExternalRow({
  label,
  url,
  mail,
  first,
}: {
  label: string;
  url: string;
  mail?: boolean;
  first?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        // Nothing to report if it fails: there is no error surface on a row
        // like this, and a device with no browser or no mail client is not a
        // state the settings screen can do anything about.
        void (mail ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url)).catch(() => {});
      }}
      style={({ pressed }) => [
        styles.rowButton,
        first ? null : { borderTopWidth: 2, borderTopColor: colors.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[t.body, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
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
    // A width, so an unset date is still shaped like something you can tap.
    // Hugging its content, an empty one collapsed to a stray dash in a tiny
    // oval — the exact failure the field treatment exists to prevent.
    minWidth: 140,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 14,
    alignItems: 'center',
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
  appearance: { padding: 12 },
  reminderWhen: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  timeField: {
    height: 40,
    // Wide enough for "20:00" plus the breathing room the date field has, so
    // the two read as the same control on the same screen.
    minWidth: 88,
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barStatus: { flex: 1 },
  save: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
});
