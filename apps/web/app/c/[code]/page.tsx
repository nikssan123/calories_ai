'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { StoreLinks } from '@/components/landing/StoreLinks';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * An invite link, opened on whatever the client had in their hand.
 *
 * The page's whole job is to get the code into the app: the button is the
 * app's own scheme, the code is shown large enough to type across two devices,
 * and the store links are for the client who has not installed it yet. Nothing
 * here needs a session, and nothing here says anything about the coach beyond
 * that one exists — the accept screen in the app names them, after the client
 * has chosen to look.
 */
export default function InvitePage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const shown = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <Logo size={52} className="mb-5" />
        <h1 className="text-large-title">Your coach invited you</h1>
        <p className="text-body text-muted-foreground mt-2">
          Accept it in the Day So Far app to share your log with them. You choose what they see, and
          you can stop any time from Settings.
        </p>

        <div className="bg-card border-border chunk mt-8 rounded-2xl border-2 p-5 text-center">
          <p className="text-eyebrow text-muted-foreground">Your code</p>
          <p className="tnum mt-1 font-[family-name:var(--font-display)] text-[34px] font-extrabold tracking-[0.12em]">
            {shown || '—'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shown);
                toast.success('Code copied');
              } catch {
                /* the code is on the screen either way */
              }
            }}
          >
            <Copy size={14} /> Copy code
          </Button>
        </div>

        <a
          href={`daysofar://c/${code}`}
          className={cn(buttonVariants({ size: 'lg' }), 'mt-6 h-12 w-full rounded-2xl text-base font-extrabold')}
        >
          Open in the app
        </a>
        <p className="text-footnote text-muted-foreground mt-3 text-center">
          Or open the app, go to Settings, and enter the code under Coach.
        </p>

        <p className="text-footnote text-muted-foreground mt-10 text-center">Do not have the app yet?</p>
        <StoreLinks className="mt-2" />

        <p className="text-footnote text-muted-foreground mt-10 text-center">
          Coaching someone yourself?{' '}
          <Link href="/login?coach=1" className="text-foreground font-semibold underline underline-offset-2">
            Sign in as a coach
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
