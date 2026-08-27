'use client';

import type { Streak } from '@ct/shared';
import { useT } from '@/lib/i18n';

/**
 * The logging run, under the ring that earns it. The web twin of the phone's
 * `StreakChip`, and the reasoning is in that file: small, not a card, and
 * silent below the fourth day, because "1 day streak" is a sentence about
 * having opened the app rather than an achievement.
 */
const WORTH_DRAWING = 4;

export function StreakChip({ streak, className = '' }: { streak: Streak; className?: string }) {
  const t = useT();

  if (streak.state === 'none' || streak.current < WORTH_DRAWING) return null;

  const atRisk = streak.state === 'at_risk';

  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <p className="flex items-center gap-1.5">
        <span aria-hidden>{atRisk ? '🕯️' : '🔥'}</span>
        {/* `streak.days` goes through `plural()`, which already puts the
            locale-formatted count in front of the noun. */}
        <span className="tnum text-foreground text-footnote font-extrabold">
          {t('streak.days')(streak.current)}
        </span>
        {/* Only once the record is genuinely behind them — "best 7" beside a
            live run of 7 reads as a bug. */}
        {streak.best > streak.current && (
          <span className="tnum text-muted-foreground text-footnote font-semibold">
            {t('streak.best')(streak.best)}
          </span>
        )}
      </p>
      {atRisk && (
        <p className="text-muted-foreground text-xs font-semibold">{t('streak.atRisk')}</p>
      )}
    </div>
  );
}
