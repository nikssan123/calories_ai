'use client';

import { formatDay, formatNumber } from '@ct/shared';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AdaptiveProposal, Locale, WeeklyReview as Review } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { useLocale, useT } from '@/lib/i18n';

/**
 * Last week, and what it did to the target.
 *
 * The point of showing the adaptive proposal even when it cannot act is that an
 * unexplained calorie target is one people ignore. If the number is about to
 * move, they should be able to see it coming; if it is stuck, they should know
 * what it is waiting for.
 */
export function WeeklyReview() {
  const locale = useLocale();
  const t = useT();
  const [review, setReview] = useState<Review | null>(null);
  const [adaptive, setAdaptive] = useState<AdaptiveProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    const [latest, proposal] = await Promise.allSettled([api.latestReview(), api.adaptiveTargets()]);
    // A 404 here is the ordinary state of a new account, not an error.
    setReview(latest.status === 'fulfilled' ? latest.value : null);
    setAdaptive(proposal.status === 'fulfilled' ? proposal.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function writeNow() {
    setWriting(true);
    try {
      setReview(await api.runReview());
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  if (loading) return null;

  // The target change reported by the review it came with, if it is still the
  // most recent one — otherwise the live proposal.
  const change = review?.stats.adaptive ?? adaptive;

  return (
    <InsetGroup title={review ? t('review.lastWeek') : t('review.title')}>
      {review ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-footnote text-muted-foreground font-bold">
            {formatRange(review.week_start, review.week_end, locale)}
          </p>
          <p className="text-body leading-relaxed whitespace-pre-line">{review.content}</p>
          {change?.eligible && <TargetChange proposal={change} tense="past" />}
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <p className="text-body font-medium">{t('review.pitch')}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void writeNow()}
            disabled={writing}
            className="h-9 gap-1.5 rounded-full px-4"
          >
            <Sparkles size={15} />
            {writing ? t('review.writing') : t('review.writeOne')}
          </Button>
        </div>
      )}

      {adaptive && !adaptive.eligible && (
        <div className="border-border bg-muted/40 border-t-2 px-4 py-3">
          <p className="text-footnote text-muted-foreground font-medium">
            <span className="text-foreground font-extrabold">
              {t('review.currentTarget')(formatNumber(adaptive.current.kcal, locale))}
            </span>{' '}
            {adaptive.explanation}
          </p>
        </div>
      )}

      {adaptive?.eligible && !review && <TargetChange proposal={adaptive} tense="future" />}
    </InsetGroup>
  );
}

function TargetChange({
  proposal,
  tense,
}: {
  proposal: AdaptiveProposal;
  tense: 'past' | 'future';
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="bg-muted border-border rounded-2xl border-2 px-3.5 py-3">
      <div className="tnum flex items-center gap-2 text-body font-bold">
        <span className="text-muted-foreground">{formatNumber(proposal.current.kcal, locale)}</span>
        <ArrowRight size={14} className="text-muted-foreground" />
        <span className="text-[var(--calories-text)]">
          {t('review.kcalUnit')(formatNumber(proposal.proposed.kcal, locale))}
        </span>
      </div>
      <p className="text-footnote text-muted-foreground mt-1.5 font-medium">
        {tense === 'future' ? t('review.willApply') : ''}
        {proposal.explanation}
      </p>
    </div>
  );
}

function formatRange(start: string, end: string, locale: Locale): string {
  // The month is named once when both ends share it — "18 – 22 August" — and
  // twice when they do not. Dropping it from the first half is what makes the
  // common case read as one range rather than two dates.
  const format = (iso: string, withMonth: boolean) =>
    formatDay(iso, locale, { day: 'numeric', ...(withMonth ? { month: 'long' } : {}) });
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(start, !sameMonth)} – ${format(end, true)}`;
}
