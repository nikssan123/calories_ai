'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Diet, Profile } from '@ct/shared';
import { DIETS } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Input } from '@/components/ui/input';
import { useT, type StringKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * What the kitchen must never suggest.
 *
 * On the profile rather than in the recipe form, because it is true of every
 * meal this person will ever eat. Restating "no shellfish" each time you want
 * dinner ideas is the kind of small tax that ends with someone not using the
 * feature — and the one time they forget is the time it matters.
 *
 * It reaches the recipe prompt as a hard limit rather than a preference, and
 * saying so on screen is part of the deal: someone entering an allergy here is
 * trusting the answer, so the wording has to be honest about what it is worth.
 */

const LABEL_KEYS: Record<Diet, StringKey> = {
  none: 'diet.none',
  vegetarian: 'diet.vegetarian',
  vegan: 'diet.vegan',
  pescatarian: 'diet.pescatarian',
};

export function DietRules({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (next: Profile) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');

  async function save(patch: { diet?: Diet; avoids?: string[] }) {
    const previous = profile;
    onChange({ ...profile, ...patch });
    try {
      onChange(await api.updateProfile(patch));
    } catch (e) {
      onChange(previous);
      toast.error((e as Error).message);
    }
  }

  function addAvoid() {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitive, so "Pork" typed twice does not become two rules.
    if (profile.avoids.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    void save({ avoids: [...profile.avoids, value] });
    setDraft('');
  }

  return (
    <InsetGroup
      title={t('diet.title')}
      footer={t('diet.footer')}
    >
      <div className="flex flex-wrap gap-1.5 p-3">
        {DIETS.map((diet) => (
          <button
            key={diet}
            type="button"
            onClick={() => void save({ diet })}
            aria-pressed={profile.diet === diet}
            className={cn(
              'rounded-full px-3 py-1.5 text-footnote transition-colors',
              profile.diet === diet
                ? 'bg-muted text-foreground ring-1 ring-[var(--calories-text)]'
                : 'bg-muted/40 text-muted-foreground',
            )}
          >
            {t(LABEL_KEYS[diet])}
          </button>
        ))}
      </div>

      <div className="border-border border-t-2 p-3">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addAvoid();
            }}
            placeholder={t('diet.avoidPlaceholder')}
            className="bg-muted/60 border-border h-11 rounded-full border-2 px-4 text-body"
          />
          <button
            type="button"
            onClick={addAvoid}
            disabled={!draft.trim()}
            aria-label={t('common.add')}
            className="bg-muted border-border text-muted-foreground hover:text-foreground flex size-11 shrink-0 items-center justify-center rounded-full border-2 disabled:opacity-40"
          >
            <Plus size={18} />
          </button>
        </div>

        {profile.avoids.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profile.avoids.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => void save({ avoids: profile.avoids.filter((a) => a !== item) })}
                aria-label={t('diet.stopAvoiding')(item)}
                className="bg-muted border-border hover:bg-secondary text-footnote flex items-center gap-1.5 rounded-full border-2 py-1 pr-2 pl-3 font-semibold"
              >
                {item}
                <X size={12} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </InsetGroup>
  );
}
