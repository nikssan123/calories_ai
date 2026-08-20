'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthGate';
import { CostPanel } from '@/components/admin/CostPanel';
import { InboxPanel } from '@/components/admin/InboxPanel';
import { OverviewPanel } from '@/components/admin/OverviewPanel';
import { TablesPanel } from '@/components/admin/TablesPanel';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'cost', label: 'Cost' },
  { id: 'users', label: 'Accounts' },
  // Next to Accounts, because the two are used together: almost every message
  // that arrives is about an account on the tab beside it.
  { id: 'inbox', label: 'Inbox' },
  { id: 'data', label: 'Database' },
  { id: 'instance', label: 'Instance' },
] as const;

type Tab = (typeof TABS)[number]['id'];

/**
 * The admin panel.
 *
 * Cost leads rather than the instance summary, because the question this exists
 * to answer is the economics one — the row counts are context for it, not the
 * headline.
 *
 * The client-side redirect below is convenience, not security: every /admin
 * route on the API 404s for a non-admin, so a user who ignores this and loads
 * the page anyway gets an empty screen and a toast rather than data.
 */
export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('cost');

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/');
  }, [loading, isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-8 lg:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <h1 className="text-large-title">Admin</h1>
          <p className="text-footnote text-muted-foreground mt-1">
            Read-only across the database, plus the handful of account actions support needs.
          </p>
        </div>

        <div className="bg-muted flex gap-0.5 rounded-xl p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors',
                tab === entry.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'cost' && <CostPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'inbox' && <InboxPanel />}
        {tab === 'data' && <TablesPanel />}
        {tab === 'instance' && <OverviewPanel />}
      </div>
    </div>
  );
}
