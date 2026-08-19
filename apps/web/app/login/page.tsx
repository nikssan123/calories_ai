'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthGate';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(true);
  const router = useRouter();
  const { refresh } = useAuth();

  useEffect(() => {
    void (async () => {
      try {
        const status = await api.me();
        setSignupAllowed(status.signup_allowed);
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
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <Logo size={46} className="mb-5" />
        <h1 className="text-large-title">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {mode === 'signup'
            ? 'Then tell the journal a little about yourself and it will work out your targets.'
            : 'Sign in to pick up where you left off.'}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-footnote text-muted-foreground">
              Name (optional)
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="bg-card h-12 rounded-xl border-0 text-[15px]"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-footnote text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="bg-card h-12 rounded-xl border-0 text-[15px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-footnote text-muted-foreground">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="bg-card h-12 rounded-xl border-0 text-[15px]"
          />
          {mode === 'signup' && (
            <p className="text-footnote text-muted-foreground">At least 8 characters.</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={busy || !email || password.length < 8}
          className="h-12 w-full rounded-2xl text-[15px] font-semibold"
        >
          {busy ? 'Just a moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {(signupAllowed || mode === 'signup') && (
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'signup' ? 'signin' : 'signup'))}
          className="text-muted-foreground mt-6 text-center text-sm"
        >
          {mode === 'signup' ? (
            <>
              Already have an account? <span className="text-foreground font-medium">Sign in</span>
            </>
          ) : (
            <>
              New here? <span className="text-foreground font-medium">Create an account</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
