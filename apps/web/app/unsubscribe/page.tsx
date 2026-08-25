'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { AUTH_BUTTON, AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';

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
  const t = useT();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const user = params.get('u');
    const signature = params.get('s');
    if (!user || !signature) {
      setState('failed');
      setMessage(t('unsubscribe.incompleteLink'));
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
  }, [authenticated, refresh, t]);

  if (state === 'working') {
    return <AuthScreen title={t('unsubscribe.working')} subtitle={t('unsubscribe.oneMoment')} />;
  }

  if (state === 'failed') {
    return (
      <AuthScreen
        title={t('verify.linkFailed')}
        subtitle={t('unsubscribe.failedSubtitle')(message)}
      >
        <Button render={<Link href="/setup" />} className={AUTH_BUTTON}>
          {t('unsubscribe.openSettings')}
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t('unsubscribe.done')}
      subtitle={message}
      footer={
        <>
          {t('unsubscribe.changedMind')}{' '}
          <Link href="/setup" className="text-foreground font-medium">
            {t('unsubscribe.yourSettings')}
          </Link>
          .
        </>
      }
    >
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        {t('unsubscribe.accountMailStays')}
      </p>
    </AuthScreen>
  );
}
