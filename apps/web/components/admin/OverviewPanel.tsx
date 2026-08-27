'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { AdminOverview, TableSummary } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat, StatGrid } from './Stat';
import { bytes, compactNumber, timestamp } from './format';

/** What this deployment is and how much of it there is. */
export function OverviewPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [migrations, setMigrations] = useState<Array<{ name: string; applied_at: string }>>([]);
  const [tables, setTables] = useState<TableSummary[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [data, applied, browsable] = await Promise.all([
          api.admin.overview(),
          api.admin.migrations(),
          api.admin.tables(),
        ]);
        setOverview(data);
        setMigrations(applied.migrations);
        setTables(browsable.tables);
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

  const { config, data, runtime, storage, users } = overview;
  // Biggest first, and only the ones with something in them — a list of forty
  // tables where thirty are empty is a list nobody reads to the end.
  const largest = [...tables]
    .filter((table) => table.rows > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);

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
        <div className="divide-border grid grid-cols-2 divide-x-2 divide-y-2 lg:grid-cols-3">
          <Stat label="Food entries" value={compactNumber(data.food_entries)} />
          <Stat label="Exercise" value={compactNumber(data.exercise_entries)} />
          <Stat label="Weigh-ins" value={compactNumber(data.weight_entries)} />
          <Stat label="Chat messages" value={compactNumber(data.chat_messages)} />
          <Stat label="Photos" value={compactNumber(data.photos)} />
          <Stat label="Weekly reviews" value={compactNumber(data.reviews)} />
          <Stat label="Recipes" value={compactNumber(data.recipes)} />
          <Stat label="Routines" value={compactNumber(data.routines)} />
          <Stat label="Push tokens" value={compactNumber(data.push_tokens)} hint="Per install" />
        </div>
      </InsetGroup>

      <InsetGroup
        title="Largest tables"
        footer="Rows and total size including indexes. The Database tab opens any of them."
      >
        {largest.map((table) => (
          <InsetRow key={table.name}>
            <span className="flex-1 truncate font-mono text-[13px]">{table.name}</span>
            <span className="text-muted-foreground text-footnote tnum">
              {compactNumber(table.rows)} rows
            </span>
            <span className="text-footnote tnum w-20 text-right font-semibold">
              {bytes(table.bytes)}
            </span>
          </InsetRow>
        ))}
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
        <ConfigRow
          label="Photo storage"
          value={
            config.photo_storage === 'local-disk'
              ? 'Local disk — one replica only'
              : config.photo_storage.replace(/^bucket:/, 'Bucket ')
          }
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
        title="Runtime"
        footer="Read from the process and the server rather than from the repo — this is what the last restart actually picked up."
      >
        <ConfigRow label="Node" value={runtime.node} />
        <ConfigRow label="Postgres" value={runtime.postgres} />
        <ConfigRow label="NODE_ENV" value={runtime.env} />
        <ConfigRow label="Uptime" value={uptime(runtime.uptime_s)} />
      </InsetGroup>

      <InsetGroup
        title="Migrations"
        footer="Schema and code ship together — migrations run when the API boots, so this is what the running image has actually applied."
      >
        {migrations.map((migration) => (
          <InsetRow key={migration.name}>
            <span className="flex-1 truncate text-body">{migration.name}</span>
            <span className="text-muted-foreground text-footnote tnum">
              {timestamp(migration.applied_at)}
            </span>
          </InsetRow>
        ))}
      </InsetGroup>
    </div>
  );
}

/** Coarse on purpose: what matters is "since when", not the seconds. */
function uptime(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <InsetRow>
      <span className="flex-1 text-body">{label}</span>
      <span className="text-muted-foreground text-body">{value}</span>
    </InsetRow>
  );
}
