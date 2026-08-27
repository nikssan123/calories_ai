'use client';

import { useState } from 'react';
import type { Achievement, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_KEYS, formatDay } from '@ct/shared';
import { useLocale, useT, type StringKey } from '@/lib/i18n';

/**
 * The badge wall — the web twin of the phone's `Achievements`.
 *
 * Every cell is drawn, earned or not: a badge nobody can see is a surprise
 * rather than a goal, and a grid of surprises teaches nothing about what the app
 * rewards. Unearned glyphs keep their own picture at low opacity instead of
 * becoming a padlock, because the silhouette is itself the hint.
 */
const GLYPH: Record<AchievementKey, string> = {
  streak_7: '🔥',
  streak_30: '🌟',
  streak_100: '💯',
  streak_365: '👑',
  exercise_weeks_4: '🏋️',
  exercise_weeks_12: '🏆',
  exercise_weeks_52: '🥇',
  first_photo: '📷',
  first_barcode: '📦',
  first_workout: '💪',
  first_weigh_in: '⚖️',
  days_100: '📅',
  days_365: '🗓️',
  workouts_100: '🎽',
};

export function Achievements({
  earned,
  className = '',
}: {
  earned: Achievement[];
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<AchievementKey | null>(null);

  const earnedBy = new Map(earned.map((a) => [a.key, a]));

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-foreground font-bold">{t('achievements.title')}</h2>
        <p className="tnum text-muted-foreground text-footnote font-semibold">
          {t('achievements.count')(earnedBy.size, ACHIEVEMENT_KEYS.length)}
        </p>
      </div>

      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {ACHIEVEMENT_KEYS.map((key) => {
          const got = earnedBy.get(key);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setOpen((current) => (current === key ? null : key))}
                aria-pressed={open === key}
                aria-label={t(`badge.${key}` as StringKey)}
                title={t(`badgeHow.${key}` as StringKey)}
                className={`flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 transition-colors ${
                  got ? 'bg-accent' : 'bg-muted/60'
                } ${open === key ? 'border-foreground' : 'border-border'}`}
              >
                <span aria-hidden className={`text-xl ${got ? '' : 'opacity-30'}`}>
                  {GLYPH[key]}
                </span>
                <span
                  className={`text-center text-[10px] leading-[13px] font-semibold ${
                    got ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t(`badge.${key}` as StringKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* One explanation at a time, under the grid. A tile big enough to hold a
          sentence in five languages is not a tile four across, and German needs
          the room. */}
      {open && (
        <div className="bg-muted/40 flex flex-col gap-1 rounded-xl p-3">
          <p className="text-foreground text-footnote font-semibold">
            {t(`badgeHow.${open}` as StringKey)}
          </p>
          {earnedBy.get(open) && (
            <p className="text-muted-foreground text-xs font-semibold">
              {t('achievements.earnedOn')(
                formatDay(earnedBy.get(open)!.local_date, locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
