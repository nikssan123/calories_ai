'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { Progress } from '@ct/shared';
import { ACHIEVEMENT_KEYS } from '@ct/shared';
import { AchievementWall } from '@/components/Achievements';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/**
 * The wall, on its own — the web twin of the phone's `app/achievements.tsx`.
 *
 * It used to be the fifth block on Progress, under four charts. Progress plots
 * measurements against targets and a badge is not a measurement, so it was both
 * the odd block out and below the fold. Here the rows have the width for the
 * sentence that says how a badge is won and the bar that says how far off it is.
 *
 * Reads `progress` rather than an endpoint of its own: the badges and the
 * counters behind them already travel on that payload, and a second endpoint
 * returning a subset of the first would be two answers to one question.
 */
export default function AchievementsPage() {
  const t = useT();
  const [progress, setProgress] = useState<Progress | null>(null);

  const load = useCallback(async () => {
    try {
      // The shortest window the API offers. Nothing here is windowed — badges
      // and their counters read against the whole history — so this asks for
      // the cheapest series the endpoint will build.
      setProgress(await api.progress(14));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/progress"
            aria-label={t('progress.title')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
          >
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-large-title flex-1">{t('achievements.title')}</h1>
          {progress && (
            <span className="tnum text-muted-foreground text-footnote font-semibold">
              {t('achievements.count')(progress.achievements.length, ACHIEVEMENT_KEYS.length)}
            </span>
          )}
        </div>

        {!progress ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-[var(--radius)]" />
            <Skeleton className="h-64 rounded-[var(--radius)]" />
          </div>
        ) : (
          <AchievementWall earned={progress.achievements} facts={progress.achievement_facts} />
        )}
      </div>
    </div>
  );
}
