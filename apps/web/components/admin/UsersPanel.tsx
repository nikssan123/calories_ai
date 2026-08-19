'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, CircleCheck, KeyRound, LogOut, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser } from '@ct/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { InsetGroup } from '@/components/InsetGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Cell, DataTable } from './DataTable';
import { timestamp, usd } from './format';
import { cn } from '@/lib/utils';

/**
 * Accounts, and the handful of things support actually gets asked to do:
 * "I'm locked out", "someone's using my login", "close my account".
 *
 * The two destructive actions type-to-confirm rather than using a browser
 * `confirm()`, partly because a modal dialog would block the browser tooling
 * this panel is otherwise inspectable with, and partly because retyping an
 * email address is a better speed bump than clicking OK.
 */
export function UsersPanel() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    try {
      setUsers((await api.admin.users()).users);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every action funnels through here so one place owns the busy flag and reload. */
  async function run(user: AdminUser, label: string, action: () => Promise<unknown>) {
    setBusy(user.id);
    try {
      await action();
      toast.success(`${label} — ${user.email}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!users) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-title-2">Accounts</h2>
          <p className="text-footnote text-muted-foreground mt-0.5">
            {users.length} account{users.length === 1 ? '' : 's'}, oldest first.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      <DataTable
        columns={['Account', 'Status', 'Entries', 'Messages', 'AI cost', 'Last entry', 'Actions']}
      >
        {users.map((user) => {
          const isSelf = user.id === profile?.id;
          const disabled = user.disabled_at !== null;
          return (
            <tr key={user.id} className={cn(disabled && 'opacity-60', busy === user.id && 'opacity-50')}>
              <Cell>
                <span className="font-medium">{user.email}</span>
                {isSelf && <span className="text-muted-foreground ml-2 text-[12px]">(you)</span>}
                <span className="text-muted-foreground block text-[12px]">
                  {user.display_name ?? '—'} · {user.timezone} · joined {timestamp(user.created_at).slice(0, 10)}
                </span>
              </Cell>
              <Cell>
                {disabled ? (
                  <span className="text-[var(--fat)]">Suspended</span>
                ) : user.is_setup_complete ? (
                  <span className="text-[var(--protein)]">Onboarded</span>
                ) : (
                  <span className="text-muted-foreground">In setup</span>
                )}
              </Cell>
              <Cell className="tnum">{user.food_entries}</Cell>
              <Cell className="tnum">{user.chat_messages}</Cell>
              <Cell className="tnum">
                {usd(user.ai_cost_usd)}
                <span className="text-muted-foreground block text-[12px]">
                  {user.ai_turns} turns
                </span>
              </Cell>
              <Cell className="text-muted-foreground">{timestamp(user.last_entry_at)}</Cell>
              <Cell>
                <div className="flex flex-wrap gap-1">
                  <IconAction
                    title="Sign out everywhere"
                    onClick={() =>
                      void run(user, 'Sessions revoked', () => api.admin.signOutUser(user.id))
                    }
                  >
                    <LogOut size={15} />
                  </IconAction>
                  <IconAction
                    title="Set a new password"
                    onClick={() => {
                      setResetting(user);
                      setNewPassword('');
                    }}
                  >
                    <KeyRound size={15} />
                  </IconAction>
                  <IconAction
                    title="Generate this week's review"
                    onClick={() =>
                      void run(user, 'Review generated', () => api.admin.runReview(user.id))
                    }
                  >
                    <Wand2 size={15} />
                  </IconAction>
                  <IconAction
                    title="Re-run the adaptive target pass"
                    onClick={() =>
                      void run(user, 'Adaptive pass run', () => api.admin.runAdaptive(user.id))
                    }
                  >
                    <RefreshCw size={15} />
                  </IconAction>
                  {!isSelf && (
                    <>
                      <IconAction
                        title={disabled ? 'Restore this account' : 'Suspend this account'}
                        onClick={() =>
                          void run(user, disabled ? 'Restored' : 'Suspended', () =>
                            api.admin.setDisabled(user.id, !disabled),
                          )
                        }
                      >
                        {disabled ? <CircleCheck size={15} /> : <Ban size={15} />}
                      </IconAction>
                      <IconAction
                        title="Delete this account"
                        destructive
                        onClick={() => {
                          setConfirming(user);
                          setConfirmText('');
                        }}
                      >
                        <Trash2 size={15} />
                      </IconAction>
                    </>
                  )}
                </div>
              </Cell>
            </tr>
          );
        })}
      </DataTable>

      {resetting && (
        <InsetGroup
          title={`New password for ${resetting.email}`}
          footer="Setting a password also revokes every existing session — the usual reason to reset one is that the old one is compromised."
        >
          <form
            className="flex flex-col gap-3 p-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const user = resetting;
              const password = newPassword;
              setResetting(null);
              void run(user, 'Password reset', () => api.admin.resetPassword(user.id, password));
            }}
          >
            <Input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={newPassword.length < 8}>
                Set password
              </Button>
              <Button type="button" variant="secondary" onClick={() => setResetting(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </InsetGroup>
      )}

      {confirming && (
        <InsetGroup
          title="Delete account"
          footer="Meals, messages, photos and weigh-ins go with it. The AI cost history does not — deleting an account must not retroactively change what the product costs to run."
        >
          <form
            className="flex flex-col gap-3 p-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const user = confirming;
              setConfirming(null);
              void run(user, 'Account deleted', () =>
                api.admin.deleteUser(user.id, user.email ?? ''),
              );
            }}
          >
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={`Type ${confirming.email} to confirm`}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="destructive"
                disabled={confirmText.trim().toLowerCase() !== (confirming.email ?? '').toLowerCase()}
              >
                Delete permanently
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </InsetGroup>
      )}
    </div>
  );
}

function IconAction({
  title,
  onClick,
  destructive,
  children,
}: {
  title: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'hover:bg-muted rounded-md p-1.5 transition-colors',
        destructive ? 'text-[var(--fat)]' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
