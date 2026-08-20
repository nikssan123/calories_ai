'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { AUTH_BUTTON, AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';

/**
 * The end of the "turn off weekly emails" link.
 *
 * It acts on arrival, with no confirmation step. Someone who has clicked
 * unsubscribe has already decided, and a page that answers with "are you sure?"
 * is a page that gets closed in favour of the button marked spam — which costs
 * the sending domain far more than one lost subscriber.
 *
 * The signature in the URL is what authorises it, so this works from a mail
 * client on a device that has never signed in here.
 */
export default function UnsubscribePage() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const { authenticated, refresh } = useAuth();
  // Effects run twice in development; the request is harmless to repeat, but
  // the second answer would overwrite the first for no reason.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const user = params.get('u');
    const signature = params.get('s');
    if (!user || !signature) {
      setState('failed');
      setMessage('That unsubscribe link is incomplete.');
      return;
    }

    void (async () => {
      try {
        const result = await api.unsubscribe(user, signature);
        setMessage(result.message);
        setState('done');
        if (authenticated) await refresh();
      } catch (e) {
        setMessage((e as Error).message);
        setState('failed');
      }
    })();
  }, [authenticated, refresh]);

  if (state === 'working') {
    return <AuthScreen title="Unsubscribing…" subtitle="One moment." />;
  }

  if (state === 'failed') {
    return (
      <AuthScreen
        title="That link didn't work"
        subtitle={`${message} You can also turn the weekly email off from your account settings.`}
      >
        <Button render={<Link href="/setup" />} className={AUTH_BUTTON}>
          Open settings
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Unsubscribed"
      subtitle={message}
      footer={
        <>
          Changed your mind? Turn it back on in{' '}
          <Link href="/setup" className="text-foreground font-medium">
            your account settings
          </Link>
          .
        </>
      }
    >
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        Emails about your account itself — a password change, a sign-in from a new device — will
        still be sent. Those are not something to unsubscribe from.
      </p>
    </AuthScreen>
  );
}
