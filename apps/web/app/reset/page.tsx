'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AUTH_BUTTON, AUTH_FIELD, AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';

/**
 * Both halves of a password reset, on one route.
 *
 * `/reset` asks for an address; `/reset?token=…` — the link in the email — asks
 * for a new password. One page rather than two because they are one errand, and
 * because the token deciding which half you see means the emailed link can
 * never land on the "which address?" form with the proof it needs sitting
 * unused in the URL bar.
 */
export default function ResetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read off `location` rather than through `useSearchParams`, which would
    // need a Suspense boundary around the whole screen to read one value.
    setToken(new URLSearchParams(window.location.search).get('token'));
    setReady(true);
  }, []);

  // Nothing at all until the token is known: rendering "what is your email?"
  // for a frame to someone who arrived with a link is a flash of the wrong screen.
  if (!ready) return null;
  return token ? <ChooseNewPassword token={token} /> : <RequestLink />;
}

/** Step one: ask for the link. */
function RequestLink() {
  const [email, setEmail] = useState('');
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.forgotPassword(email);
      // The server says the same thing for an address it has never seen, and so
      // does this screen. Anything else here would undo the point of that.
      setSent(true);
      toast.success(result.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthScreen
        title={t('reset.checkInbox')}
        subtitle={
          <>
            {t('reset.sentBefore')} <span className="text-foreground font-medium">{email}</span>{' '}
            {t('reset.sentAfter')}
          </>
        }
        footer={
          <>
            {t('reset.nothingArrived')}{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-foreground font-medium"
            >
              {t('reset.tryAnother')}
            </button>
          </>
        }
      >
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          {t('reset.spamHint')}
        </p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={t('reset.title')}
      subtitle={t('reset.subtitle')}
      footer={
        <>
          {t('reset.remembered')}{' '}
          <Link href="/login" className="text-foreground font-medium">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-footnote text-muted-foreground">
            {t('auth.email')}
          </Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={AUTH_FIELD}
          />
        </div>
        <Button type="submit" disabled={busy || !email} className={AUTH_BUTTON}>
          {busy ? t('verify.sending') : t('reset.emailMeALink')}
        </Button>
      </form>
    </AuthScreen>
  );
}

/** Step two: spend the link. */
function ChooseNewPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const t = useT();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.resetPassword(token, password);
      toast.success(result.message);
      // The reset signs every device out, including this one, and deliberately
      // does not sign the caller back in — typing the new password once at the
      // sign-in screen is what makes it stick.
      router.replace('/login');
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title={t('reset.chooseNew')}
      subtitle={t('reset.chooseNewSubtitle')}
      footer={
        <>
          {t('reset.linkExpired')}{' '}
          <Link href="/reset" className="text-foreground font-medium">
            {t('reset.askAnother')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-footnote text-muted-foreground">
            {t('reset.newPassword')}
          </Label>
          <Input
            id="password"
            type="password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={AUTH_FIELD}
          />
          <p className="text-footnote text-muted-foreground">{t('auth.passwordHint')}</p>
        </div>
        <Button type="submit" disabled={busy || password.length < 8} className={AUTH_BUTTON}>
          {busy ? t('setup.saving') : t('reset.savePassword')}
        </Button>
      </form>
    </AuthScreen>
  );
}
