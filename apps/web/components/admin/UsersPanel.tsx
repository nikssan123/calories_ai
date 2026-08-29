'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CircleCheck,
  KeyRound,
  LogOut,
  RefreshCw,
  Trash2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
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
 *
 * Two shapes, on the same line `AppFrame` draws: below `lg` this is a phone, so
 * the rows stack into cards and every action carries its label. The table above
 * it is fine on a desktop and was quietly useless on a handset — seven columns
 * come to 966px inside a 380px box, which put the whole Actions column six
 * hundred pixels off the right edge of a scroller with nothing to say it
 * scrolled. The actions were never broken; they were off-screen, and the only
 * thing a thumb could reach was a row that does nothing when you tap it.
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

  /**
   * What one row can do, built once so the table and the cards cannot drift
   * apart — the bug this file just had was one layout being usable and the
   * other not, and two hand-maintained lists of six actions is how that
   * happens twice.
   */
  function actionsFor(user: AdminUser): Action[] {
    const suspended = user.disabled_at !== null;
    const actions: Action[] = [
      {
        key: 'sign-out',
        label: 'Sign out',
        title: 'Sign out everywhere',
        icon: LogOut,
        onClick: () => void run(user, 'Sessions revoked', () => api.admin.signOutUser(user.id)),
      },
      {
        key: 'password',
        label: 'Password',
        title: 'Set a new password',
        icon: KeyRound,
        onClick: () => {
          setResetting(user);
          setNewPassword('');
        },
      },
      {
        key: 'review',
        label: 'Review',
        title: "Generate this week's review",
        icon: Wand2,
        onClick: () => void run(user, 'Review generated', () => api.admin.runReview(user.id)),
      },
      {
        key: 'adaptive',
        label: 'Adaptive',
        title: 'Re-run the adaptive target pass',
        icon: RefreshCw,
        onClick: () => void run(user, 'Adaptive pass run', () => api.admin.runAdaptive(user.id)),
      },
    ];

    // Neither is offered on your own row: the API refuses both, and an action
    // that exists only to be turned down is worse than one that is not there.
    if (user.id !== profile?.id) {
      actions.push(
        {
          key: 'disabled',
          label: suspended ? 'Restore' : 'Suspend',
          title: suspended ? 'Restore this account' : 'Suspend this account',
          icon: suspended ? CircleCheck : Ban,
          onClick: () =>
            void run(user, suspended ? 'Restored' : 'Suspended', () =>
              api.admin.setDisabled(user.id, !suspended),
            ),
        },
        {
          key: 'delete',
          label: 'Delete',
          title: 'Delete this account',
          icon: Trash2,
          destructive: true,
          onClick: () => {
            setConfirming(user);
            setConfirmText('');
          },
        },
      );
    }
    return actions;
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

      <div className="space-y-3 lg:hidden">
        {users.map((user) => (
          <AccountCard
            key={user.id}
            user={user}
            isSelf={user.id === profile?.id}
            busy={busy === user.id}
            actions={actionsFor(user)}
          />
        ))}
      </div>

      <DataTable
        className="hidden lg:block"
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
                <Status user={user} />
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
                  {actionsFor(user).map(({ key, title, icon: Icon, destructive, onClick }) => (
                    <IconAction key={key} title={title} destructive={destructive} onClick={onClick}>
                      <Icon size={15} />
                    </IconAction>
                  ))}
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
            {/*
              * Focused on open, which on a phone is the half that matters: the
              * form appears below a list that is taller than the screen, and
              * without this, asking for it looks exactly like nothing
              * happening. Taking the caret scrolls it into view.
              */}
            <Input
              autoFocus
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
              autoFocus
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

/**
 * One thing a row can do. `label` is what the phone shows and `title` is what
 * the desktop's icon says on hover — the same action worded for the space it
 * has, rather than an icon column captioned in tooltips nobody can hover.
 */
interface Action {
  key: string;
  label: string;
  title: string;
  icon: LucideIcon;
  destructive?: boolean;
  onClick: () => void;
}

/**
 * One account as a card, for the widths where a seven-column table is a lie.
 *
 * The actions are a two-up grid of labelled buttons at `size="lg"` — 44px, the
 * floor for a thumb, against the 27px icon the table uses. Delete keeps the
 * destructive variant and still goes through type-to-confirm, so the one
 * irreversible action is neither the biggest target nor a single tap.
 */
function AccountCard({
  user,
  isSelf,
  busy,
  actions,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  actions: Action[];
}) {
  const suspended = user.disabled_at !== null;
  return (
    <div
      className={cn(
        'bg-card border-border chunk space-y-3 rounded-[var(--radius)] border-2 p-4',
        suspended && 'opacity-60',
        busy && 'opacity-50',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-body font-medium">
          {user.email}
          {isSelf && <span className="text-muted-foreground ml-2 text-[12px]">(you)</span>}
        </span>
        <Status user={user} />
      </div>

      <p className="text-muted-foreground text-[12px]">
        {user.display_name ?? '—'} · {user.timezone} · joined{' '}
        {timestamp(user.created_at).slice(0, 10)}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        <Fact label="Entries">{user.food_entries}</Fact>
        <Fact label="Messages">{user.chat_messages}</Fact>
        <Fact label="AI cost">
          {usd(user.ai_cost_usd)} <span className="text-muted-foreground">· {user.ai_turns} turns</span>
        </Fact>
        <Fact label="Last entry">{timestamp(user.last_entry_at)}</Fact>
      </dl>

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        {actions.map(({ key, label, icon: Icon, destructive, onClick }) => (
          <Button
            key={key}
            size="lg"
            variant={destructive ? 'destructive' : 'outline'}
            className="justify-start"
            onClick={onClick}
          >
            <Icon size={16} /> {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Onboarded, in setup, or suspended — worded the same in both layouts. */
function Status({ user }: { user: AdminUser }) {
  if (user.disabled_at !== null) return <span className="text-[var(--fat)]">Suspended</span>;
  if (user.is_setup_complete) return <span className="text-[var(--positive)]">Onboarded</span>;
  return <span className="text-muted-foreground">In setup</span>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="tnum">{children}</dd>
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
