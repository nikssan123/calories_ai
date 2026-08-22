'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Check, Mail, Shield } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityLevel, DaySummary, Goal, Profile, Sex, UnitSystem } from '@ct/shared';
import {
  bodyWeightToKg,
  bodyWeightUnit,
  cmToFeetInches,
  feetInchesToCm,
  toBodyWeight,
  unitsOf,
} from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DietRules } from '@/components/kitchen/DietRules';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** §10: short setup. Enough to establish a starting target, nothing more. */

/*
 * Every editable value in these rows wears the same shell.
 *
 * They used to be transparent and borderless, which looked tidy on a mockup and
 * was unusable in practice: an empty height field rendered as the word "cm"
 * floating in white space with nothing to say it could be typed into. A field
 * has to look like a field. This is the quietest treatment that still does.
 */
const FIELD =
  'h-10 rounded-full border-2 border-border bg-muted px-3.5 text-body font-semibold shadow-none ' +
  'transition-colors duration-[var(--dur-quick)] hover:bg-secondary';

/** Inputs keep their own focus ring; wrappers get it via focus-within. */
const FIELD_INPUT = `${FIELD} text-right focus-visible:ring-2 focus-visible:ring-ring`;

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, little exercise',
  light: 'Light exercise 1–3 days/week',
  moderate: 'Moderate exercise 3–5 days/week',
  active: 'Hard exercise 6–7 days/week',
  very_active: 'Physical job or twice-daily training',
};

const SEX_LABELS: Record<Sex, string> = { male: 'Male', female: 'Female' };

/** Short forms for the collapsed row; the menu shows the full description. */
const ACTIVITY_SHORT: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Light',
  moderate: 'Moderate',
  active: 'Active',
  very_active: 'Very active',
};

const UNIT_LABELS: Record<UnitSystem, string> = {
  metric: 'Metric',
  imperial: 'Imperial',
};

/** What each one actually means, since "imperial" is a word and not a number. */
const UNIT_EXAMPLES: Record<UnitSystem, string> = {
  metric: 'kg · cm · km · g',
  imperial: 'lb · ft · mi · oz',
};

const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose',
  maintain: 'Maintain',
  gain: 'Gain',
};

export default function SetupPage() {
  const { isAdmin, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [p, d] = await Promise.all([api.profile(), api.day()]);
        setProfile(p);
        setDay(d);
      } catch (e) {
        toast.error((e as Error).message);
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
      setDay(await api.day());
      setDirty(false);
      toast.success('Saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto min-h-0 w-full max-w-4xl flex-1 space-y-4 overflow-y-auto px-4 pt-5 lg:px-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-7">
      <div>
        <h1 className="text-large-title">You</h1>
        <p className="text-muted-foreground mt-1.5 text-body font-medium">
          Enough to work out a starting target. It adjusts as real data comes in.
        </p>
      </div>

      {day && (
        <div className="bg-card border-border chunk rounded-[var(--radius)] border-2 p-5 text-center">
          <p className="text-eyebrow text-muted-foreground">Your daily target</p>
          <p className="text-figure mt-1.5 text-[2.75rem] leading-none">
            {day.targets.kcal.toLocaleString()}
            <span className="text-muted-foreground ml-1.5 text-lg font-bold">kcal</span>
          </p>
          <div className="text-footnote mt-4 flex flex-wrap justify-center gap-2">
            <MacroChip label="Protein" value={day.targets.protein_g} color="var(--protein)" />
            <MacroChip label="Carbs" value={day.targets.carbs_g} color="var(--carbs)" />
            <MacroChip label="Fat" value={day.targets.fat_g} color="var(--fat)" />
          </div>

          {/*
            * Under the number, not tucked into a footer nobody reaches.
            *
            * A figure this size, presented alone, reads as a prescription. It is
            * an average for a body of these dimensions, and it does not know
            * anything about the person — which is exactly the sentence someone
            * pregnant, or managing diabetes, needs to have read before they
            * start treating it as an instruction.
            */}
          <p className="text-footnote text-muted-foreground mx-auto mt-5 max-w-md font-medium">
            A population average for someone your size, not medical advice. It is corrected from
            your own logged data after a fortnight. If you are pregnant or breastfeeding, or
            managing a condition like diabetes or kidney disease, get your number from a
            clinician and set it by hand here.
          </p>
        </div>
      )}

      <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
      <InsetGroup title="About you">
        <InsetRow>
          <span className="flex-1 text-body">Name</span>
          <Input
            value={profile.display_name ?? ''}
            onChange={(e) => patch('display_name', e.target.value || null)}
            placeholder="Optional"
            className={cn(FIELD_INPUT, 'w-44')}
          />
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-body">Sex</span>
          <Select
            value={profile.sex ?? ''}
            onValueChange={(v) => patch('sex', (v || null) as Sex | null)}
          >
            <SelectTrigger className={cn(FIELD, 'w-auto gap-2 pr-2.5')}>
              {/* Without flex-none the value stretches to fill the trigger and
                  strands itself in the middle of the row. */}
              <SelectValue placeholder="—" className="flex-none">
                {(value) => SEX_LABELS[value as Sex] ?? '—'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SEX_LABELS) as Sex[]).map((sex) => (
                <SelectItem key={sex} value={sex}>
                  {SEX_LABELS[sex]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-body">Date of birth</span>
          <Input
            type="date"
            value={profile.birth_date ?? ''}
            onChange={(e) => patch('birth_date', e.target.value || null)}
            // The native picker is drawn by the browser, not by us; it reads
            // `color-scheme` off <html>, which <ThemeSync> now sets.
            className={cn(FIELD_INPUT, 'w-44')}
          />
        </InsetRow>

        {/*
          * Above the two fields it governs, so switching it visibly rewrites
          * them rather than changing something further down the page that the
          * eye has already left.
          */}
        <InsetRow>
          <span className="flex-1 text-body">Units</span>
          <ToggleGroup
            value={[units]}
            onValueChange={(values) => {
              const next = values[0];
              if (next === 'metric' || next === 'imperial') patch('units', next);
            }}
            className="bg-muted rounded-full p-0.5"
          >
            {(Object.keys(UNIT_LABELS) as UnitSystem[]).map((system) => (
              <ToggleGroupItem
                key={system}
                value={system}
                aria-label={`${UNIT_LABELS[system]} — ${UNIT_EXAMPLES[system]}`}
                className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground text-muted-foreground h-9 rounded-full px-3.5 text-footnote font-bold transition-colors"
              >
                {UNIT_LABELS[system]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-body">Height</span>
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
          <span className="flex-1 text-body">Target weight</span>
          {/*
            * Converted on the way in and back out on the way to the API, so the
            * column stays kilograms whatever this field says. Typing 165 lb
            * stores 74.8 kg; the number that comes back rounds to 165 again.
            */}
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
            step="0.1"
          />
        </InsetRow>
      </InsetGroup>

      <InsetGroup title="Goal">
        <div className="grid grid-cols-3 gap-2 p-2">
          {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => {
            const active = profile.goal === goal;
            return (
              <button
                key={goal}
                type="button"
                onClick={() => patch('goal', goal)}
                className={cn(
                  'chunk-press rounded-2xl border-2 py-2.5 text-sm font-bold [--chunk-depth:3px]',
                  active
                    ? 'bg-primary text-primary-foreground border-transparent [--chunk-color:var(--calories-deep)]'
                    : 'bg-muted text-muted-foreground border-border hover:text-foreground',
                )}
              >
                {GOAL_LABELS[goal]}
              </button>
            );
          })}
        </div>
        <InsetRow>
          <span className="flex-1 text-body">Activity</span>
          <Select
            value={profile.activity_level ?? ''}
            onValueChange={(v) => patch('activity_level', (v || null) as ActivityLevel | null)}
          >
            <SelectTrigger className={cn(FIELD, 'w-auto gap-2 pr-2.5')}>
              <SelectValue placeholder="—" className="flex-none">
                {(value) => ACTIVITY_SHORT[value as ActivityLevel] ?? '—'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                <SelectItem key={level} value={level}>
                  {ACTIVITY_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InsetRow>
      </InsetGroup>

      <InsetGroup
        title="Day"
        footer="Food eaten before the day starts counts toward the previous day — so a 1am snack lands on the evening it belongs to."
      >
        <InsetRow>
          <span className="shrink-0 text-body">Time zone</span>
          <Input
            value={profile.timezone}
            onChange={(e) => patch('timezone', e.target.value)}
            className={cn(FIELD_INPUT, 'min-w-0 flex-1')}
          />
        </InsetRow>
        <InsetRow>
          <span className="flex-1 text-body">Day starts at</span>
          <Select
            value={String(profile.day_start_hour)}
            onValueChange={(v) => patch('day_start_hour', Number(v))}
          >
            <SelectTrigger className={cn(FIELD, 'tnum w-auto gap-2 pr-2.5')}>
              <SelectValue className="flex-none">
                {(value) => `${String(value).padStart(2, '0')}:00`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 9 }, (_, i) => i).map((hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {String(hour).padStart(2, '0')}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InsetRow>
      </InsetGroup>

      <DietRules profile={profile} onChange={setProfile} />

      <InsetGroup title="Appearance" footer="System follows your device, including its light and dark schedule.">
        <div className="p-3">
          <ThemeToggle />
        </div>
      </InsetGroup>

      <EmailSettings profile={profile} onChange={setProfile} />

      <InsetGroup title="Account">
        <InsetRow>
          <span className="flex-1 text-body">Signed in as</span>
          <span className="text-muted-foreground truncate text-body">
            {profile.email ?? '—'}
          </span>
        </InsetRow>
        {/* The sidebar carries this from `lg` up; on a phone there is no
            sidebar, so the account group is where it can live. */}
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-3 text-body text-[var(--calories-text)]"
          >
            <Shield size={16} /> Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-destructive w-full px-4 py-3 text-left text-body"
        >
          Sign out
        </button>
      </InsetGroup>

      <DeleteAccount email={profile.email} />

      </div>

      <Button
        onClick={() => void save()}
        disabled={saving || !dirty}
        size="lg"
        className="h-12 w-full rounded-2xl text-body font-semibold transition-transform active:scale-[0.98] lg:w-56"
      >
        {saving ? 'Saving…' : dirty ? 'Save' : (
          <>
            <Check size={17} /> Saved
          </>
        )}
      </Button>
      </div>
    </div>
  );
}

/**
 * What the product will and will not put in your inbox.
 *
 * Two rows, and the split between them is the substance of the section: the
 * address is a *capability* — an unconfirmed one means a forgotten password is
 * unrecoverable, which is worth saying plainly rather than badging quietly —
 * while the weekly review is a preference, and the only one there is. Emails
 * about the account itself are not listed as a choice because they are not one,
 * and a switch that pretends otherwise is worse than no switch.
 */
function EmailSettings({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
}) {
  const [sending, setSending] = useState(false);

  // No address means the pre-accounts placeholder row, which nothing can be
  // sent to and which has no preference worth showing.
  if (!profile.email) return null;

  async function resend() {
    setSending(true);
    try {
      const result = await api.resendVerification();
      toast.success(result.message);
    } catch (e) {
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
    }
  }

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
        <InsetRow>
          <BadgeCheck size={17} className="text-[var(--calories-text)]" />
          <span className="flex-1 text-body">Address confirmed</span>
        </InsetRow>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Mail size={17} className="text-muted-foreground" />
            <span className="flex-1 text-body">Address not confirmed</span>
          </div>
          <p className="text-muted-foreground text-[13px] leading-relaxed font-medium">
            Until you confirm {profile.email}, a forgotten password cannot be reset — there would
            be no way to know the mailbox is yours.
          </p>
          <Button
            variant="outline"
            onClick={() => void resend()}
            disabled={sending}
            className="h-9 self-start rounded-full text-[13px]"
          >
            {sending ? 'Sending…' : 'Send the link again'}
          </Button>
        </div>
      )}

      <InsetRow>
        <div className="flex-1">
          <p className="text-body">Weekly review</p>
          <p className="text-muted-foreground text-[13px] font-medium">
            Last week, summarised, on Monday.
          </p>
        </div>
        <Switch
          checked={profile.notify_weekly_review}
          onCheckedChange={(checked) => void setPreference('notify_weekly_review', checked)}
          aria-label="Email me the weekly review"
        />
      </InsetRow>

      {/*
        * Off by default, unlike the review above, and the copy has to earn the
        * flip rather than assume it. A nudge arrives because the app decided to
        * say something, so the honest pitch is the ceiling — at most one, and
        * only when there is something to say.
        */}
      <InsetRow>
        <div className="flex-1">
          <p className="text-body">Nudges</p>
          <p className="text-muted-foreground text-[13px] font-medium">
            At most one a week, when something in your log is worth a mention. They always
            appear in the journal; this emails them too.
          </p>
        </div>
        <Switch
          checked={profile.notify_nudges}
          onCheckedChange={(checked) => void setPreference('notify_nudges', checked)}
          aria-label="Email me nudges"
        />
      </InsetRow>
    </InsetGroup>
  );
}

/**
 * Closing the account, from inside the product.
 *
 * Deliberately not a modal: the app has no dialog primitive, and a destructive
 * confirmation is the last place to introduce one — a focus trap that misbehaves
 * on a phone would sit between someone and their own data. Expanding in place
 * costs a tap, shows the consequences next to the button, and cannot trap
 * anything.
 *
 * The password field is the real gate; the disclosure is only there so the
 * control cannot be hit by accident.
 */
function DeleteAccount({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      // Everything this session could read is gone, so a reload is both the
      // simplest correct next state and the only one that cannot show stale
      // data: AuthGate re-runs, finds no session, and lands on /login.
      window.location.replace('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the account.');
      setDeleting(false);
    }
  }

  if (!email) return null;

  return (
    <InsetGroup title="Danger zone">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-destructive w-full px-4 py-3 text-left text-body"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <p className="text-muted-foreground text-[13px] leading-relaxed font-medium">
            This erases every meal, photo, weight and conversation on{' '}
            <span className="text-foreground font-extrabold">{email}</span>, on every device, and
            cannot be undone. Enter your password to confirm.
          </p>
          <Input
            type="password"
            value={password}
            autoFocus
            placeholder="Password"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password) void confirm();
            }}
            className={FIELD}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={!password || deleting}
              onClick={() => void confirm()}
              className="flex-1"
            >
              {deleting ? 'Deleting…' : 'Delete everything'}
            </Button>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setPassword('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </InsetGroup>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="bg-muted border-border flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground font-semibold">{label}</span>
      <span className="text-figure">{value}g</span>
    </span>
  );
}

/**
 * Height in the two numbers people actually say it in.
 *
 * Two fields rather than one text box parsing 5'10", because a free-text height
 * has to guess at every notation anyone might type — 5'10, 5 ft 10, 70" — and
 * gets one of them wrong for somebody. Two number inputs have no notation to
 * guess at.
 *
 * Feet is deliberately not clamped and inches only rolls over on the way out:
 * typing 5 then 13 is a keystroke away from 6 then 1, and snapping the field
 * out from under the caret mid-edit is worse than briefly showing "5 ft 13".
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
    <div className="flex gap-2">
      <NumberField
        value={parts?.feet ?? null}
        onChange={(feet) => set(feet, parts?.inches ?? 0)}
        unit="ft"
        className="w-[5.5rem]"
      />
      <NumberField
        value={parts?.inches ?? null}
        onChange={(inches) => set(parts?.feet ?? 0, inches)}
        unit="in"
        className="w-[5.5rem]"
      />
    </div>
  );
}

function NumberField({
  value,
  onChange,
  unit,
  step = '1',
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  step?: string;
  /** Narrower when two of these share a row, as feet and inches do. */
  className?: string;
}) {
  // The unit sits inside the field rather than beside it, so an empty value
  // still shows something shaped like an input instead of a stray "cm".
  //
  // A <label> rather than a <span>: the pill has padding and a unit in it, and
  // clicking either of those should put the caret in the field the way it does
  // on every other input. Wrapping is what buys that, with no id to keep unique.
  //
  // items-center, not items-baseline. Baseline is the tempting choice for a
  // value beside its unit, but baseline-aligned flex items are packed to the
  // *start* of the cross axis — in a fixed-height pill that lifts the whole
  // group to the top and the number sits high in the field. The two sizes are
  // close enough that centring reads as aligned anyway.
  return (
    <label
      className={cn(
        FIELD,
        'focus-within:ring-ring inline-flex w-32 cursor-text items-center justify-end gap-1.5 focus-within:ring-2',
        className,
      )}
    >
      <Input
        type="number"
        step={step}
        inputMode="decimal"
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        // Without this, scrolling the page over a focused number input silently
        // edits the value.
        onWheel={(e) => e.currentTarget.blur()}
        className="text-figure h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-body shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <span className="text-muted-foreground text-footnote shrink-0">{unit}</span>
    </label>
  );
}
