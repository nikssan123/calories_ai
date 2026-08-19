'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AdminOverview } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat, StatGrid } from './Stat';
import { bytes, compactNumber, timestamp } from './format';

/** What this deployment is and how much of it there is. */
export function OverviewPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [migrations, setMigrations] = useState<Array<{ name: string; applied_at: string }>>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [data, applied] = await Promise.all([api.admin.overview(), api.admin.migrations()]);
        setOverview(data);
        setMigrations(applied.migrations);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, []);

  if (!overview) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const { config, data, storage, users } = overview;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-title-2">Instance</h2>
        <p className="text-footnote text-muted-foreground mt-0.5">
          Everything this deployment currently holds.
        </p>
      </div>

      <StatGrid columns={4}>
        <Stat label="Accounts" value={users.total} hint={`${users.onboarded} onboarded`} />
        <Stat
          label="Active this week"
          value={users.active_7d}
          hint="Logged a meal, not just signed in"
          tone="accent"
        />
        <Stat
          label="Suspended"
          value={users.disabled}
          tone={users.disabled > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="Storage"
          value={bytes(storage.database_bytes + storage.uploads_bytes)}
          hint={`${bytes(storage.database_bytes)} database · ${bytes(storage.uploads_bytes)} photos`}
        />
      </StatGrid>

      <InsetGroup title="Rows">
        <div className="divide-border grid grid-cols-2 divide-x divide-y lg:grid-cols-3">
          <Stat label="Food entries" value={compactNumber(data.food_entries)} />
          <Stat label="Exercise" value={compactNumber(data.exercise_entries)} />
          <Stat label="Weigh-ins" value={compactNumber(data.weight_entries)} />
          <Stat label="Chat messages" value={compactNumber(data.chat_messages)} />
          <Stat label="Photos" value={compactNumber(data.photos)} />
          <Stat label="Weekly reviews" value={compactNumber(data.reviews)} />
        </div>
      </InsetGroup>

      <InsetGroup
        title="Configuration"
        footer={
          config.admin_source === 'first-account'
            ? 'ADMIN_EMAILS is unset, so the oldest account holds this panel. Set it in .env to name admins explicitly.'
            : 'Admins are named by ADMIN_EMAILS in .env.'
        }
      >
        <ConfigRow label="AI provider" value={config.provider} />
        <ConfigRow label="Credentials" value={config.auth} />
        <ConfigRow label="Sign-ups" value={config.signup_allowed ? 'Open' : 'Closed'} />
        <ConfigRow
          label="Secure cookies"
          value={config.secure_cookies ? 'On' : 'Off — plain HTTP only'}
        />
        {config.provider === 'openai' && (
          <ConfigRow
            label="Token pricing"
            value={
              config.openai_rate
                ? `$${config.openai_rate.input} in / $${config.openai_rate.output} out per MTok`
                : 'Unset — turns record tokens but no cost'
            }
          />
        )}
      </InsetGroup>

      <InsetGroup
        title="Migrations"
        footer="Schema and code ship together — migrations run when the API boots, so this is what the running image has actually applied."
      >
        {migrations.map((migration) => (
          <InsetRow key={migration.name}>
            <span className="flex-1 truncate text-[15px]">{migration.name}</span>
            <span className="text-muted-foreground text-footnote tnum">
              {timestamp(migration.applied_at)}
            </span>
          </InsetRow>
        ))}
      </InsetGroup>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <InsetRow>
      <span className="flex-1 text-[15px]">{label}</span>
      <span className="text-muted-foreground text-[15px]">{value}</span>
    </InsetRow>
  );
}
