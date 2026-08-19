'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Shield } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityLevel, DaySummary, Goal, Profile, Sex } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** §10: short setup. Enough to establish a starting target, nothing more. */

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
        <p className="text-muted-foreground mt-1 text-[15px]">
          Enough to work out a starting target. It adjusts as real data comes in.
        </p>
      </div>

      {day && (
        <div className="bg-card rounded-2xl p-5 text-center">
          <p className="text-footnote text-muted-foreground">Your daily target</p>
          <p className="tnum mt-1 text-4xl font-semibold tracking-tight">
            {day.targets.kcal.toLocaleString()}
            <span className="text-muted-foreground ml-1.5 text-lg font-normal">kcal</span>
          </p>
          <div className="mt-3 flex justify-center gap-4 text-footnote">
            <MacroChip label="Protein" value={day.targets.protein_g} color="var(--protein)" />
            <MacroChip label="Carbs" value={day.targets.carbs_g} color="var(--carbs)" />
            <MacroChip label="Fat" value={day.targets.fat_g} color="var(--fat)" />
          </div>
        </div>
      )}

      <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
      <InsetGroup title="About you">
        <InsetRow>
          <span className="flex-1 text-[15px]">Name</span>
          <Input
            value={profile.display_name ?? ''}
            onChange={(e) => patch('display_name', e.target.value || null)}
            placeholder="Optional"
            className="h-8 w-40 border-0 bg-transparent p-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-[15px]">Sex</span>
          <Select
            value={profile.sex ?? ''}
            onValueChange={(v) => patch('sex', (v || null) as Sex | null)}
          >
            <SelectTrigger className="h-8 w-32 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent">
              <SelectValue placeholder="—">
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
          <span className="flex-1 text-[15px]">Date of birth</span>
          <Input
            type="date"
            value={profile.birth_date ?? ''}
            onChange={(e) => patch('birth_date', e.target.value || null)}
            className="h-8 w-40 border-0 bg-transparent p-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-[15px]">Height</span>
          <NumberField
            value={profile.height_cm}
            onChange={(v) => patch('height_cm', v)}
            unit="cm"
          />
        </InsetRow>

        <InsetRow>
          <span className="flex-1 text-[15px]">Target weight</span>
          <NumberField
            value={profile.target_weight_kg}
            onChange={(v) => patch('target_weight_kg', v)}
            unit="kg"
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
                  'rounded-xl py-2.5 text-sm font-medium transition-all active:scale-95',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground',
                )}
              >
                {GOAL_LABELS[goal]}
              </button>
            );
          })}
        </div>
        <InsetRow>
          <span className="flex-1 text-[15px]">Activity</span>
          <Select
            value={profile.activity_level ?? ''}
            onValueChange={(v) => patch('activity_level', (v || null) as ActivityLevel | null)}
          >
            <SelectTrigger className="h-8 max-w-[13rem] border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent">
              <SelectValue placeholder="—">
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
          <span className="shrink-0 text-[15px]">Time zone</span>
          <Input
            value={profile.timezone}
            onChange={(e) => patch('timezone', e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </InsetRow>
        <InsetRow>
          <span className="flex-1 text-[15px]">Day starts at</span>
          <Select
            value={String(profile.day_start_hour)}
            onValueChange={(v) => patch('day_start_hour', Number(v))}
          >
            <SelectTrigger className="h-8 w-24 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent">
              <SelectValue>
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

      <InsetGroup title="Account">
        <InsetRow>
          <span className="flex-1 text-[15px]">Signed in as</span>
          <span className="text-muted-foreground truncate text-[15px]">
            {profile.email ?? '—'}
          </span>
        </InsetRow>
        {/* The sidebar carries this from `lg` up; on a phone there is no
            sidebar, so the account group is where it can live. */}
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-3 text-[15px] text-[var(--calories)]"
          >
            <Shield size={16} /> Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-destructive w-full px-4 py-3 text-left text-[15px]"
        >
          Sign out
        </button>
      </InsetGroup>

      </div>

      <Button
        onClick={() => void save()}
        disabled={saving || !dirty}
        size="lg"
        className="h-12 w-full rounded-2xl text-[15px] font-semibold transition-transform active:scale-[0.98] lg:w-56"
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

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum font-medium">{value}g</span>
    </span>
  );
}

function NumberField({
  value,
  onChange,
  unit,
  step = '1',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
  step?: string;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <Input
        type="number"
        step={step}
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        // Without this, scrolling the page over a focused number input silently
        // edits the value.
        onWheel={(e) => e.currentTarget.blur()}
        className="tnum h-8 w-20 border-0 bg-transparent p-0 text-right text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <span className="text-muted-foreground text-footnote">{unit}</span>
    </span>
  );
}
