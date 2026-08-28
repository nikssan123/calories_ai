'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Achievement, AchievementFacts, AchievementKey } from '@ct/shared';
import { ACHIEVEMENT_GROUPS, ACHIEVEMENT_KEYS, achievementProgress, formatDay } from '@ct/shared';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { useLocale, useT, type StringKey } from '@/lib/i18n';

/**
 * The badge wall, and the one row on Progress that leads to it — the web twin
 * of the phone's `Achievements`, and the reasoning is in that file.
 *
 * In short: the wall used to be the fifth block on Progress, a grid of fourteen
 * emoji tiles under four charts. Progress is a screen of measurements plotted
 * against targets and a badge is not one, so it was the odd block out and it was
 * below the fold for everybody. A grid can also say only what exists, never how
 * close anything is — at day 22, "thirty in a row" and "a year unbroken" were
 * the same grey square. Rows on a screen of their own have the width for the
 * sentence and the bar.
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

/** The line on Progress: what has been won, the count, and the way through. */
export function AchievementsRow({ earned }: { earned: Achievement[] }) {
  const t = useT();

  // Newest first, so the row changes on the day a badge is won rather than
  // showing the same four firsts forever.
  const recent = [...earned].reverse().slice(0, 4);

  return (
    <InsetGroup title={t('achievements.title')}>
      <Link href="/achievements" className="active:bg-muted/60 block transition-colors">
        <InsetRow className="py-4">
          <div className="flex flex-1 items-center gap-1.5">
            {recent.length > 0 ? (
              recent.map((badge) => (
                <span key={badge.key} aria-hidden className="text-xl">
                  {GLYPH[badge.key]}
                </span>
              ))
            ) : (
              // Nothing earned yet, so the row leads with the first rung rather
              // than an empty space where the prizes go.
              <span className="text-muted-foreground text-body">
                {t(`badge.${ACHIEVEMENT_KEYS[0]}` as StringKey)}
              </span>
            )}
          </div>
          <span className="tnum text-muted-foreground text-footnote font-semibold">
            {t('achievements.count')(earned.length, ACHIEVEMENT_KEYS.length)}
          </span>
          <ChevronRight size={18} className="text-muted-foreground shrink-0" />
        </InsetRow>
      </Link>
    </InsetGroup>
  );
}

/**
 * The wall itself, grouped into its four families.
 *
 * Two columns from `lg` up, because a desktop that draws fourteen full-width
 * rows down a 1280px page is wasting the half of it the phone never had.
 */
export function AchievementWall({
  earned,
  facts,
}: {
  earned: Achievement[];
  facts: AchievementFacts;
}) {
  const t = useT();
  const earnedBy = new Map(earned.map((badge) => [badge.key, badge]));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {ACHIEVEMENT_GROUPS.map((group) => (
        <InsetGroup key={group.key} title={t(`achievements.group.${group.key}` as StringKey)}>
          {group.keys.map((key) => (
            <BadgeRow key={key} badgeKey={key} got={earnedBy.get(key)} facts={facts} />
          ))}
        </InsetGroup>
      ))}
    </div>
  );
}

/**
 * One badge, one row, everything visible.
 *
 * The old tile hid its explanation behind a click and showed one at a time under
 * the grid. A full-width row just says it, and German fits. Earned rows carry
 * the date and drop the bar — a bar to somewhere you have already arrived is
 * decoration; unearned rows carry the sentence that says how, and the bar
 * underneath when there is a number to count.
 */
function BadgeRow({
  badgeKey,
  got,
  facts,
}: {
  badgeKey: AchievementKey;
  got: Achievement | undefined;
  facts: AchievementFacts;
}) {
  const t = useT();
  const locale = useLocale();

  const toward = got ? null : achievementProgress(badgeKey, facts);

  return (
    <InsetRow className="items-start py-3">
      <span aria-hidden className={`text-2xl leading-8 ${got ? '' : 'opacity-30'}`}>
        {GLYPH[badgeKey]}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`font-bold ${got ? 'text-foreground' : 'text-muted-foreground'}`}>
          {t(`badge.${badgeKey}` as StringKey)}
        </p>

        <p className="text-muted-foreground text-footnote">
          {got
            ? t('achievements.earnedOn')(
                formatDay(got.local_date, locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              )
            : t(`badgeHow.${badgeKey}` as StringKey)}
        </p>

        {toward && (
          <div className="mt-2 flex items-center gap-2.5">
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  // A run of nothing still draws a sliver, so the bar reads as a
                  // bar rather than as an empty box somebody forgot to fill.
                  width: `${Math.max(2, (toward.current / toward.goal) * 100)}%`,
                  background: 'var(--calories-text)',
                }}
              />
            </div>
            <span className="tnum text-muted-foreground text-footnote font-semibold">
              {t('achievements.count')(toward.current, toward.goal)}
            </span>
          </div>
        )}
      </div>
    </InsetRow>
  );
}
