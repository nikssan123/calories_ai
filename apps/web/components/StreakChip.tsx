'use client';

import Link from 'next/link';
import type { Streak } from '@ct/shared';
import { useT } from '@/lib/i18n';

/**
 * The logging run, under the ring that earns it. The web twin of the phone's
 * `StreakChip`, and the reasoning is in that file: small, not a card, and
 * silent below the fourth day, because "1 day streak" is a sentence about
 * having opened the app rather than an achievement.
 *
 * It is also the badge wall's door on the screen people actually open — four of
 * the fourteen badges are this exact run at 7, 30, 100 and 365 days, so the
 * flame is the honest place to ask what it gets you. Nothing marks it as a link
 * beyond the hover, deliberately: its first job is to be read.
 */
const WORTH_DRAWING = 4;

export function StreakChip({ streak, className = '' }: { streak: Streak; className?: string }) {
  const t = useT();

  if (streak.state === 'none' || streak.current < WORTH_DRAWING) return null;

  const atRisk = streak.state === 'at_risk';

  return (
    <Link
      href="/achievements"
      className={`hover:bg-muted/60 flex flex-col items-center gap-0.5 rounded-full px-2 py-0.5 transition-colors ${className}`}
    >
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
    </Link>
  );
}
