'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BarChart3, CalendarClock, Film, Images } from 'lucide-react';
import { useAuth } from '@/components/AuthGate';
import { SocialPanel } from '@/components/admin/SocialPanel';
import { SocialQueueTab } from '@/components/admin/social/Queue';
import { SocialPublishedTab } from '@/components/admin/social/Published';
import { cn } from '@/lib/utils';

/**
 * The social screen.
 *
 * Its own route rather than a tab inside /admin, because it is the only part of
 * that panel you come to in order to *do* something rather than to read a
 * number — and deciding twenty posts inside a tab strip of nine other subjects
 * is the reason the queue filled up with work nobody had looked at.
 *
 * Four tabs, and the split is by the question you are answering:
 *
 *   Posts      is this carousel good enough      -> one card, yes or no
 *   Memes      is this video good enough         -> the same, for video
 *   Queue      is this going out at the right time
 *   Published  did last week's hooks work
 *
 * Posts and Memes are the same component with a media filter. They are two tabs
 * and not one stack because judging a fourteen-second video and a four-slide
 * carousel alternately means settling into neither.
 *
 * Deliberately short on words. The panel this replaces explained itself in
 * paragraphs beside every control, which reads as a manual rather than a tool;
 * the reasoning lives in these comments and in SOCIAL.md instead, where it does
 * not cost a glance every time.
 */

const TABS = [
  { id: 'posts', label: 'Posts', icon: Images },
  { id: 'memes', label: 'Memes', icon: Film },
  { id: 'queue', label: 'Queue', icon: CalendarClock },
  { id: 'published', label: 'Published', icon: BarChart3 },
] as const;

type Tab = (typeof TABS)[number]['id'];

export default function SocialScreen() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('posts');

  // Convenience, not security: every /admin route on the API 404s for a
  // non-admin, so ignoring this gets an empty screen rather than data.
  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/');
  }, [loading, isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/admin"
          className="text-muted-foreground hover:text-foreground -ml-1 p-1"
          aria-label="Back to admin"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-title3 font-bold">Social</h1>
      </div>

      {/* Sticky, because deciding is a scroll-and-tap loop and losing the tab
          strip at the bottom of a long queue means scrolling back up to switch. */}
      <nav
        className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 py-2 backdrop-blur"
        aria-label="Social sections"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-current={tab === entry.id ? 'page' : undefined}
              className={cn(
                'text-footnote flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-bold transition-colors',
                tab === entry.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-4" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      {/* Mounted per tab rather than hidden with CSS: each one reaches Buffer on
          mount, and keeping all four alive would make every tab switch three
          requests nobody asked for. */}
      {tab === 'posts' && <SocialPanel only="image" />}
      {tab === 'memes' && <SocialPanel only="video" />}
      {tab === 'queue' && <SocialQueueTab />}
      {tab === 'published' && <SocialPublishedTab />}
    </div>
  );
}
