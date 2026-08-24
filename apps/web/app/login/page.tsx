'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { GoogleMark } from '@/components/GoogleMark';
import { Logo } from '@/components/Logo';
import { LanguagePicker } from '@/components/LanguagePicker';
import { preferredLocale, setPreferredLocale, useLocale, useT } from '@/lib/i18n';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * What the API's callback puts in `?error=` when the Google handshake does not
 * end in a session, in words.
 *
 * The sentences live here rather than on the server for the reason every other
 * piece of copy does — but the mapping earns its keep in a second way: these
 * arrive by redirect, from a page nobody was looking at, so each one has to say
 * what happened *and* what to do next. "Try again" is doing real work.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  google: 'Google could not sign you in. Try again, or use your email and password.',
  google_unverified:
    'Google has not confirmed the address on that account, so it cannot be used to sign in here.',
  expired: 'That sign-in took too long. Start it again from this page.',
  state: 'That sign-in could not be verified. Start it again from this page.',
  closed: 'Sign-ups are closed on this server.',
  suspended: 'This account has been suspended.',
};

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  // Sent along to the API so a brand-new Google account starts its days in the
  // right place, exactly as the sign-up form's `timezone` field does. Empty
  // until the effect runs, which keeps the server-rendered href identical.
  const [timezone, setTimezone] = useState('');
  const router = useRouter();
  const { refresh } = useAuth();
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    // The landing page's primary CTA asks for the sign-up form by name. Read
    // straight off `location` rather than through `useSearchParams`, which
    // would need a Suspense boundary around the whole screen to say one word.
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'signup') setMode('signup');
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);

    /*
     * A failed Google sign-in comes back as a redirect carrying a reason, and
     * the reason is stripped from the URL as soon as it has been read: without
     * that, refreshing the page — the very first thing someone does after a
     * sign-in fails — replays the same complaint about something that is no
     * longer happening. Cancelling is not reported at all; a person who pressed
     * "cancel" knows what they did and is looking at the form they wanted.
     */
    const failure = params.get('error');
    if (failure) {
      if (failure !== 'cancelled') {
        toast.error(SIGN_IN_ERRORS[failure] ?? t('auth.genericFailure'));
      }
      params.delete('error');
      const rest = params.toString();
      window.history.replaceState(null, '', rest ? `/login?${rest}` : '/login');
    }

    void (async () => {
      try {
        const status = await api.me();
        setSignupAllowed(status.signup_allowed);
        setGoogleEnabled(status.google_enabled);
        // Only a server with no accounts at all opens on "create account";
        // otherwise a returning user lands on the sign-in form.
        if (!status.has_accounts) setMode('signup');
      } catch {
        /* the form still works; the submit will surface any real problem */
      }
    })();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'signup') {
        await api.signup({
          email,
          password,
          display_name: name || null,
          // Sent so the very first day boundary is right without asking.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          /*
           * The same answer the picker above is showing. It matters before the
           * account exists at all: the confirmation email goes out during this
           * request, before there is a profile for anybody to read a preference
           * off, so if this is not sent the first thing a Bulgarian speaker
           * receives from the app is in English.
           */
          locale: preferredLocale(),
        });
      } else {
        await api.login({ email, password });
      }
      await refresh();
      router.replace('/');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-12">
        {/*
          * Above everything, and the first control on the screen.
          *
          * This is the earliest point the app can be asked, and the only one
          * that reaches the confirmation email — so it is worth the space at
          * the top of the very first screen rather than being left for the
          * settings page to fix afterwards. It is pre-filled from
          * `navigator.language`, so for most people it is already right and
          * costs them nothing but the glance that confirms it.
          */}
        <div className="mb-6 flex justify-end">
          <LanguagePicker value={locale} onChange={setPreferredLocale} />
        </div>

        <div className="mb-8">
          <Logo size={52} className="mb-5" />
          <h1 className="text-large-title">
            {mode === 'signup' ? t('auth.createAccountTitle') : t('auth.signIn')}
          </h1>
          <p className="text-muted-foreground mt-2 text-body">
            {mode === 'signup'
              ? 'Then tell the journal a little about yourself and it will work out your targets.'
              : t('auth.signInSubtitle')}
          </p>
        </div>

        {googleEnabled && (
          <div className="mb-6">
            {/*
              * A link, not a button with an onClick. The whole handshake is a
              * chain of full-page navigations, and starting it with `fetch`
              * would ask the browser to follow a cross-origin redirect to
              * Google's consent screen inside an XHR — which it will not do.
              */}
            <a
              href={`/api/auth/google/start${timezone ? `?tz=${encodeURIComponent(timezone)}` : ''}`}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-12 w-full gap-2.5 rounded-2xl text-base font-extrabold',
              )}
            >
              <GoogleMark className="size-5" />
              {t('auth.continueWithGoogle')}
            </a>

            {/* The line that says "or", which is the whole reason it is here. */}
            <div className="mt-6 flex items-center gap-3">
              <span className="bg-border h-0.5 flex-1 rounded-full" />
              <span className="text-muted-foreground text-footnote">or</span>
              <span className="bg-border h-0.5 flex-1 rounded-full" />
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-footnote text-muted-foreground">
                {t('auth.nameOptional')}
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="bg-card border-border chunk h-12 rounded-[1.125rem] border-2 text-body"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-footnote text-muted-foreground">
              {t('auth.email')}
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="bg-card border-border chunk h-12 rounded-[1.125rem] border-2 text-body"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-footnote text-muted-foreground">
              {t('auth.password')}
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="bg-card border-border chunk h-12 rounded-[1.125rem] border-2 text-body"
            />
            {mode === 'signup' ? (
              <p className="text-footnote text-muted-foreground">{t('auth.passwordHint')}</p>
            ) : (
              // Under the field it belongs to, not buried at the bottom of the
              // screen: someone who needs this link is looking at the password
              // box wondering why it will not work.
              <div className="pt-0.5 text-right">
                <Link href="/reset" className="text-footnote text-muted-foreground">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={busy || !email || password.length < 8}
            className="h-12 w-full rounded-2xl text-base font-extrabold"
          >
            {busy ? t('auth.oneMoment') : mode === 'signup' ? t('auth.createAccount') : t('auth.signIn')}
          </Button>

          {/* Under the button that does the agreeing, and only on the screen
              where something is being agreed to. Signing in again is not a
              fresh acceptance of anything. */}
          {mode === 'signup' && (
            <p className="text-footnote text-muted-foreground text-center leading-relaxed">
              By creating an account you agree to the{' '}
              <Link href="/terms" className="text-foreground font-semibold underline underline-offset-2">
                Terms
              </Link>{' '}
              and the{' '}
              <Link href="/privacy" className="text-foreground font-semibold underline underline-offset-2">
                {t('auth.privacyPolicy')}
              </Link>
              .
            </p>
          )}
        </form>

        {(signupAllowed || mode === 'signup') && (
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'signup' ? 'signin' : 'signup'))}
            className="text-muted-foreground mt-6 text-center text-sm"
          >
            {mode === 'signup' ? (
              <>
                {t('auth.haveAccount')} <span className="text-foreground font-medium">{t('auth.signIn')}</span>
              </>
            ) : (
              <>
                {t('auth.newHere')} <span className="text-foreground font-medium">{t('auth.createAccount')}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
