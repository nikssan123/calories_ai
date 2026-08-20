'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { AUTH_BUTTON, AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';

/**
 * The end of the confirmation link.
 *
 * It spends the token on arrival rather than behind a "confirm" button. The
 * click on the link *was* the confirmation — asking someone to press a second
 * button to agree to what they already agreed to is a step that exists only to
 * make the page feel busy. The trade-off is that a mail scanner following links
 * can burn the token, which is survivable here: verification is not a gate, and
 * a fresh link is one tap away on the setup screen.
 */
export default function VerifyPage() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const { authenticated, refresh } = useAuth();
  // React runs effects twice in development; without this the second pass
  // spends an already-spent token and reports a failure on a success.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('failed');
      setMessage('That link is missing its confirmation code.');
      return;
    }

    void (async () => {
      try {
        const result = await api.verifyEmail(token);
        setMessage(result.message);
        setState('done');
        // The signed-in copy of the profile now says something untrue about
        // this account; ask for it again so the setup screen agrees.
        if (authenticated) await refresh();
      } catch (e) {
        setMessage((e as Error).message);
        setState('failed');
      }
    })();
  }, [authenticated, refresh]);

  if (state === 'working') {
    return <AuthScreen title="Confirming…" subtitle="One moment." />;
  }

  if (state === 'failed') {
    return (
      <AuthScreen
        title="That link didn't work"
        subtitle={message}
        footer={
          <>
            Already signed in? Open{' '}
            <Link href="/setup" className="text-foreground font-medium">
              your account settings
            </Link>{' '}
            to send a new one.
          </>
        }
      >
        <Button render={<Link href="/login" />} className={AUTH_BUTTON}>
          Sign in
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Email confirmed"
      subtitle={`${message} If you ever forget your password, we can now email you a way back in.`}
    >
      <Button render={<Link href={authenticated ? '/' : '/login'} />} className={AUTH_BUTTON}>
        {authenticated ? 'Back to the journal' : 'Sign in'}
      </Button>
    </AuthScreen>
  );
}
