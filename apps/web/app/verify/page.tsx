'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { AUTH_BUTTON, AUTH_FIELD, AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';

/**
 * The gate a new account passes through.
 *
 * Two ways in, and which one you get depends on how you arrived. A `?token=`
 * in the URL means the link in the email was clicked, so it is spent on arrival
 * — the click *was* the confirmation, and a second button to agree to what you
 * already agreed to exists only to make the page look busy. Otherwise this is
 * someone who signed up on a laptop and is reading the email on a phone, and
 * what they want is a field to type six digits into.
 */
export default function VerifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read off `location` rather than through `useSearchParams`, which would
    // need a Suspense boundary around the whole screen to read one value.
    setToken(new URLSearchParams(window.location.search).get('token'));
    setReady(true);
  }, []);

  if (!ready) return null;
  return token ? <SpendLink token={token} /> : <EnterCode />;
}

/** Arrived from the link. Nothing to ask; just do it. */
function SpendLink({ token }: { token: string }) {
  const t = useT();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const { authenticated, refresh } = useAuth();
  // Effects run twice in development; without this the second pass spends an
  // already-spent token and reports a failure on a success.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const result = await api.verifyEmail(token);
        setMessage(result.message);
        setState('done');
        // The signed-in copy of the profile now says something untrue about
        // this account; ask for it again so the gate lets go.
        if (authenticated) await refresh();
      } catch (e) {
        setMessage((e as Error).message);
        setState('failed');
      }
    })();
  }, [token, authenticated, refresh]);

  if (state === 'working')
    return <AuthScreen title={t('verify.confirming')} subtitle={t('verify.oneMoment')} />;

  if (state === 'failed') {
    return (
      <AuthScreen
        title={t('verify.linkFailed')}
        subtitle={`${message} You can enter the code from the email instead.`}
      >
        <Button render={<Link href="/verify" />} className={AUTH_BUTTON}>
          {t('verify.enterCode')}
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t('verify.confirmed')} subtitle={message}>
      <Button render={<Link href={authenticated ? '/' : '/login'} />} className={AUTH_BUTTON}>
        {authenticated ? t('verify.startJournal') : t('auth.signIn')}
      </Button>
    </AuthScreen>
  );
}

/** The gate proper: signed in, address unproved, six digits to go. */
function EnterCode() {
  const t = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const { authenticated, profile, refresh, signOut } = useAuth();
  const router = useRouter();

  // No session means the code cannot be checked against anything — six digits
  // are only meaningful against the one account that was issued them.
  if (!authenticated) {
    return (
      <AuthScreen
        title={t('verify.checkInbox')}
        subtitle={t('verify.signInFirst')}
      >
        <Button render={<Link href="/login" />} className={AUTH_BUTTON}>
          Sign in
        </Button>
      </AuthScreen>
    );
  }

  if (profile?.email_verified) {
    return (
      <AuthScreen title={t('verify.alreadyConfirmed')} subtitle={t('verify.readyMessage')}>
        <Button render={<Link href="/" />} className={AUTH_BUTTON}>
          Start your journal
        </Button>
      </AuthScreen>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.verifyEmailCode(code);
      await refresh();
      router.replace('/');
    } catch (e) {
      // The API says how many tries are left; pass it straight through rather
      // than inventing a friendlier message that hides the count.
      toast.error((e as Error).message);
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      const result = await api.resendVerification();
      toast.success(result.message);
      setCode('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen
      title={t('verify.title')}
      subtitle={
        <>
          We sent a six-digit code to{' '}
          <span className="text-foreground font-medium">{profile?.email}</span>. Enter it to
          finish setting up your account.
        </>
      }
      footer={
        <>
          Wrong address?{' '}
          <button type="button" onClick={() => void signOut()} className="text-foreground font-medium">
            {t('verify.signOutAndRestart')}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          autoFocus
          // `one-time-code` is what lets iOS and Android offer the code from the
          // notification, which turns this screen into a single tap.
          autoComplete="one-time-code"
          inputMode="numeric"
          placeholder="123456"
          aria-label={t('verify.sixDigitCode')}
          className={`${AUTH_FIELD} text-center font-mono text-2xl tracking-[0.4em]`}
        />
        <Button type="submit" disabled={busy || code.length !== 6} className={AUTH_BUTTON}>
          {busy ? t('verify.confirming') : t('verify.confirm')}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => void resend()}
        disabled={resending}
        className="text-muted-foreground mt-4 w-full text-center text-sm"
      >
        {resending ? t('verify.sending') : t('verify.sendNewCode')}
      </button>
    </AuthScreen>
  );
}
