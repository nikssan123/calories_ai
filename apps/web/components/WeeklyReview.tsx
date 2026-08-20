'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AdaptiveProposal, WeeklyReview as Review } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';

/**
 * Last week, and what it did to the target.
 *
 * The point of showing the adaptive proposal even when it cannot act is that an
 * unexplained calorie target is one people ignore. If the number is about to
 * move, they should be able to see it coming; if it is stuck, they should know
 * what it is waiting for.
 */
export function WeeklyReview() {
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
    <InsetGroup title={review ? 'Last week' : 'Weekly review'}>
      {review ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-footnote text-muted-foreground">
            {formatRange(review.week_start, review.week_end)}
          </p>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">{review.content}</p>
          {change?.eligible && <TargetChange proposal={change} tense="past" />}
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <p className="text-[15px]">
            Every Monday morning you'll get a short read on the week — what the numbers
            actually showed, and whether your target needs to move.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void writeNow()}
            disabled={writing}
            className="h-9 gap-1.5 rounded-full px-4"
          >
            <Sparkles size={15} />
            {writing ? 'Writing…' : 'Write one now'}
          </Button>
        </div>
      )}

      {adaptive && !adaptive.eligible && (
        <div className="border-border bg-muted/40 border-t px-4 py-3">
          <p className="text-footnote text-muted-foreground">
            <span className="text-foreground font-medium">
              Target {adaptive.current.kcal.toLocaleString()} kcal.
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
  return (
    <div className="bg-muted/50 rounded-xl px-3 py-2.5">
      <div className="tnum flex items-center gap-2 text-[15px] font-medium">
        <span className="text-muted-foreground">{proposal.current.kcal.toLocaleString()}</span>
        <ArrowRight size={14} className="text-muted-foreground" />
        <span className="text-[var(--calories-text)]">{proposal.proposed.kcal.toLocaleString()} kcal</span>
      </div>
      <p className="text-footnote text-muted-foreground mt-1">
        {tense === 'future' ? 'Next review will apply this. ' : ''}
        {proposal.explanation}
      </p>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const format = (iso: string, withMonth: boolean) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: withMonth ? 'long' : undefined,
      timeZone: 'UTC',
    });
  };
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${format(start, !sameMonth)} – ${format(end, true)}`;
}
