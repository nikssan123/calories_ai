'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthGate';
import { ContentPanel } from '@/components/admin/ContentPanel';
import { CostPanel } from '@/components/admin/CostPanel';
import { FunnelPanel } from '@/components/admin/FunnelPanel';
import { InboxPanel } from '@/components/admin/InboxPanel';
import { OverviewPanel } from '@/components/admin/OverviewPanel';
import { SocialPanel } from '@/components/admin/SocialPanel';
import { SubscriptionsPanel } from '@/components/admin/SubscriptionsPanel';
import { TablesPanel } from '@/components/admin/TablesPanel';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'cost', label: 'Cost' },
  // Beside Cost, because the two are the same question from opposite ends: what
  // a turn costs to serve against what anybody pays for it.
  { id: 'billing', label: 'Billing' },
  // Before Accounts: it is the question of how many accounts there should have been.
  { id: 'funnel', label: 'Funnel' },
  { id: 'users', label: 'Accounts' },
  // Next to Accounts, because the two are used together: almost every message
  // that arrives is about an account on the tab beside it.
  { id: 'inbox', label: 'Inbox' },
  { id: 'content', label: 'Blog' },
  // Beside Blog because both are content, and apart from it because they share
  // nothing else: that one writes prose in thirteen languages, this one decides
  // whether an image is good enough to post.
  { id: 'social', label: 'Social' },
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

        {/* Nine labels do not divide a phone into nine readable buttons, so on
            a narrow screen the strip scrolls sideways at a legible size instead
            of squeezing. From `sm` up there is room to share it out evenly. */}
        <div className="bg-card border-hairline chunk-sm flex gap-1 overflow-x-auto rounded-full border p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-2 text-[14px] font-bold whitespace-nowrap transition-colors max-sm:shrink-0 sm:flex-1 sm:px-3 sm:py-1.5',
                tab === entry.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'cost' && <CostPanel />}
        {tab === 'billing' && <SubscriptionsPanel />}
        {tab === 'funnel' && <FunnelPanel />}
        {tab === 'users' && <UsersPanel />}
        {tab === 'inbox' && <InboxPanel />}
        {tab === 'content' && <ContentPanel />}
        {tab === 'social' && <SocialPanel />}
        {tab === 'data' && <TablesPanel />}
        {tab === 'instance' && <OverviewPanel />}
      </div>
    </div>
  );
}
