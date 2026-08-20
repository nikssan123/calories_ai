'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Mail, Paperclip, RefreshCw, Reply, Undo2, User } from 'lucide-react';
import { toast } from 'sonner';
import type { SupportEmail } from '@ct/shared';
import { api } from '@/lib/api';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { timestamp } from './format';
import { cn } from '@/lib/utils';

/**
 * What people have written in.
 *
 * A reading pane, not a mail client. The only action is "I've dealt with this",
 * because replying belongs in the mail app that already does threading, drafts,
 * signatures and search — and the reply link below hands the whole thing over
 * to it, pre-addressed, rather than reimplementing any of that here badly.
 *
 * The body is shown as plain text even when the sender sent HTML. This is a
 * screen for reading messages from strangers: rendering their markup would mean
 * loading whatever they linked to, in an admin session, which is the exact
 * shape of attack a support inbox invites.
 */
export function InboxPanel() {
  const [emails, setEmails] = useState<SupportEmail[] | null>(null);
  const [unhandled, setUnhandled] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const inbox = await api.admin.support();
      setEmails(inbox.emails);
      setUnhandled(inbox.unhandled);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(email: SupportEmail) {
    setBusy(email.id);
    try {
      await api.admin.setSupportHandled(email.id, email.handled_at === null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!emails) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <InsetGroup
        title="Support inbox"
        trailing={
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </Button>
        }
        footer={
          emails.length === 0
            ? 'Mail sent to the support address appears here. Nothing has arrived yet.'
            : `${unhandled} waiting of ${emails.length} shown. Marking one handled keeps it — an inbox that forgets is a liability.`
        }
      >
        {emails.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2.5 px-4 py-8 text-[15px]">
            <Mail size={17} /> No messages.
          </div>
        ) : (
          emails.map((email) => {
            const expanded = open === email.id;
            return (
              <div key={email.id}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : email.id)}
                  aria-expanded={expanded}
                  className="w-full px-4 py-3.5 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    {/* The one thing worth colour: whether it still needs an answer. */}
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        email.handled_at === null ? 'bg-[var(--calories)]' : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[15px] font-medium">
                          {email.from_name ?? email.from_email}
                        </span>
                        {email.user_id && (
                          <span className="text-footnote text-[var(--calories-text)] flex shrink-0 items-center gap-1">
                            <User size={11} /> account
                          </span>
                        )}
                        {email.attachments > 0 && (
                          <span className="text-footnote text-muted-foreground flex shrink-0 items-center gap-1">
                            <Paperclip size={11} /> {email.attachments}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground block truncate text-[13px]">
                        {email.subject ?? '(no subject)'}
                      </span>
                    </span>
                    <span className="text-footnote text-muted-foreground tnum shrink-0">
                      {timestamp(email.received_at)}
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-border space-y-3 border-t px-4 py-3.5">
                    <dl className="text-[13px]">
                      <Row label="From">
                        {email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email}
                      </Row>
                      <Row label="To">{email.to_email}</Row>
                      {email.user_id && (
                        <Row label="Account">{email.user_name ?? email.from_email}</Row>
                      )}
                      {email.handled_at && <Row label="Handled">{timestamp(email.handled_at)}</Row>}
                    </dl>

                    {email.body_error ? (
                      <p className="text-destructive text-[13px]">
                        The body could not be fetched: {email.body_error}
                      </p>
                    ) : (
                      <pre className="bg-muted/60 max-h-96 overflow-auto rounded-xl p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                        {email.text_body ?? htmlToText(email.html_body) ?? '(empty message)'}
                      </pre>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" render={<a href={replyHref(email)} />}>
                        <Reply size={14} /> Reply
                      </Button>
                      <Button
                        variant={email.handled_at === null ? 'default' : 'ghost'}
                        size="sm"
                        disabled={busy === email.id}
                        onClick={() => void toggle(email)}
                      >
                        {email.handled_at === null ? (
                          <>
                            <CircleCheck size={14} /> Mark handled
                          </>
                        ) : (
                          <>
                            <Undo2 size={14} /> Reopen
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </InsetGroup>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5">
      <dt className="text-muted-foreground w-20 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/**
 * Hands the reply to the operating system's mail client, pre-addressed and with
 * the subject already threaded. `Re:` is not added twice — a reply to a reply
 * would otherwise accumulate them.
 */
function replyHref(email: SupportEmail): string {
  const subject = email.subject ?? '';
  const threaded = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  return `mailto:${encodeURIComponent(email.from_email)}?subject=${encodeURIComponent(threaded)}`;
}

/**
 * A readable fallback when the sender sent HTML and no plain-text part.
 *
 * Crude on purpose: it strips tags rather than rendering them, because the
 * whole point is that nothing a stranger wrote gets parsed as markup inside an
 * admin session. Anything it mangles is still legible enough to answer, and the
 * real message is one click away in a mail client if it is not.
 */
function htmlToText(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
