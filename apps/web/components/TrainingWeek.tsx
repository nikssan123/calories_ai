'use client';

import type { Streak, TrainingWeek as Week } from '@ct/shared';
import { addDays, WEEK_ORDER, weekdayName } from '@ct/shared';
import { useLocale, useT } from '@/lib/i18n';

/**
 * The training week as seven cells rather than as a fraction — the web twin of
 * the phone's `TrainingWeek`.
 *
 * The argument is there in full: "3 weeks" only resolves on Sunday, which is
 * too late to act on and too vague to feel like anything on a Wednesday. Seven
 * dots say how far along the week is and which days it was, and those are
 * different messages.
 */
export function TrainingWeek({
  week,
  streak,
  className = '',
}: {
  week: Week;
  streak: Streak;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();

  const trained = new Set(week.days);
  const met = week.days.length >= week.needed;

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <ol className="flex gap-2.5">
        {WEEK_ORDER.map((weekday, index) => {
          // `WEEK_ORDER` is Monday-first, so the index is the offset from this
          // week's own Monday.
          const done = trained.has(addDays(week.week_start, index));
          return (
            <li key={weekday} className="flex flex-col items-center gap-1">
              <span
                className={`block size-4.5 rounded-full border-2 ${
                  done ? 'bg-exercise border-exercise' : 'bg-muted/60 border-border'
                }`}
              />
              <span className="text-muted-foreground text-[11px] leading-[14px] font-semibold">
                {weekdayName(weekday, locale, 'narrow')}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-muted-foreground text-footnote font-semibold">
        {met ? t('streak.weekMet') : t('streak.weekProgress')(week.days.length, week.needed)}
      </p>

      {/* A zero-week run drawn as "0 weeks" is a scoreboard telling somebody
          they are losing. The hint says what the bar is instead. */}
      {streak.current > 0 ? (
        <p className="tnum text-foreground text-footnote font-extrabold">
          <span aria-hidden>🏋️ </span>
          {streak.current} {t('streak.weeks')(streak.current)}
          {streak.best > streak.current && (
            <span className="text-muted-foreground ml-2 font-semibold">
              {t('streak.best')(streak.best)}
            </span>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground text-center text-xs font-semibold">
          {t('streak.startTraining')}
        </p>
      )}
    </div>
  );
}
