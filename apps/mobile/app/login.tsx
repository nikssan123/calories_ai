import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { ApiError } from '@ct/api-client';
import { calculateTargets, formatNumber } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Glyph } from '@/components/Glyph';
import { GlowButton } from '@/components/GlowButton';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Stage } from '@/components/onboarding/Stage';
import { useOnboarding } from '@/lib/onboarding';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { reachedStep } from '@/lib/funnel';
import { signInWithGoogle } from '@/lib/google';
import { GoogleMark } from '@/components/GoogleMark';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { font, type as t, useColors, useType } from '@/theme';
import { LanguagePicker } from '@/components/LanguagePicker';
import { preferredLocale, setPreferredLocale, useLocale, useT } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

/**
 * Sign in, or create an account.
 *
 * One thing the web version does is deliberately absent: there is no
 * `?mode=signup` to read, because nothing links here from a landing page. The
 * form opens on sign-in unless the server says it has no accounts at all.
 *
 * Google sign-in *is* here, and it is the one control on this screen that does
 * not talk to the API directly — it hands off to the system's auth browser and
 * comes back through the app's own URL scheme. See `lib/google.ts`.
 */
export default function LoginScreen() {
  const colors = useColors();
  const t = useType();
  const tr = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { adoptSession, googleEnabled, hasAccounts, signupAllowed, refresh, loading } = useAuth();
  const { draft, planWaiting, signingIn, chooseSignIn, saveDraft } = useOnboarding();
  /*
   * The plan this sign-up is saving, when there is one. Worked out again from
   * the draft rather than carried across, because it is pure and cheap and the
   * draft is the thing that will actually be uploaded.
   */
  const planKcal = useMemo(
    () => (planWaiting && draft ? calculateTargets(draft).kcal : null),
    [planWaiting, draft],
  );

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [shortPassword, setShortPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  /*
   * Off on every mount, and never remembered.
   *
   * A revealed password is a decision about the room somebody is standing in,
   * not a preference — the person who showed it once on their own sofa is the
   * same person signing in on a train the next morning. Persisting it would
   * quietly turn a deliberate act into the default, which is the one thing a
   * password field must not do.
   */
  const [revealed, setRevealed] = useState(false);

  /*
   * Only a server with no accounts at all opens on "create account"; otherwise a
   * returning user lands on the sign-in form.
   *
   * Decided once, and only after the status has actually arrived. This screen
   * mounts behind the splash while `me()` is still in flight, and `hasAccounts`
   * reads false until it lands — so a version of this that only ever flipped
   * *toward* signup pinned every launch to "Create your account" against a
   * server full of accounts, with nothing to flip it back. Deciding once also
   * keeps a later `refresh()` from swapping the form out from under someone who
   * is halfway through typing into it.
   */
  const decided = useRef(false);
  useEffect(() => {
    if (loading || decided.current) return;
    decided.current = true;
    /*
     * Onboarding runs before this screen now, so how somebody arrived says which
     * form they want: a finished plan came to be saved, "I already have an
     * account" came to sign in. Only a launch that is neither falls back to
     * asking whether the server has any accounts.
     */
    // "I already have an account" wins over a plan waiting to be saved: it is what
    // they just asked for, from the welcome screen or from a refused guest start.
    setMode(signingIn ? 'signin' : planWaiting ? 'signup' : hasAccounts ? 'signin' : 'signup');
  }, [loading, hasAccounts, planWaiting, signingIn]);

  const signup = mode === 'signup';

  async function submit() {
    setError(null);
    /*
     * Checked here, in words, rather than by a button that will not press.
     * The button used to stay grey until the password reached eight characters
     * and said nothing about why — and a six-character password is the one most
     * people type first. The sign-up form is the last step of a paid install,
     * and a dead button with no reason on it is where those installs ended.
     */
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError(tr('auth.invalidEmail'));
      return;
    }
    if (signup && password.length < 8) {
      // The rule is already written under the field; it turns red rather than
      // being said a second time underneath itself.
      setShortPassword(true);
      return;
    }
    setBusy(true);
    // Sign-ups that carry a plan are the end of the first-run funnel; a sign-in,
    // or an account made without walking the questions, is not part of it.
    const fromWalk = signup && planWaiting;
    if (fromWalk) reachedStep('signup_email');
    try {
      const status = signup
        ? await api.signup({
            email: email.trim(),
            password,
            display_name: name.trim() || null,
            // Sent so the very first day boundary is right without asking.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            /*
             * And the language, for the same kind of reason. The confirmation
             * email goes out during this request — before there is a profile
             * for anybody to read a preference off — so without this the first
             * thing a Bulgarian speaker hears from the app is in English.
             */
            locale: preferredLocale(),
          })
        : await api.login({ email: email.trim(), password });

      // The token arrives in this response and nowhere else, so it is stored
      // before anything else can fire a request without it.
      await adoptSession(status);
      if (fromWalk) reachedStep('account');
      // …and the status is re-read, because signup answers before the profile
      // the rest of the app renders from exists.
      await refresh();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The server's refusals, in the reader's language.
   *
   * The API answers in English sentences written for a reader, which is right
   * for the web admin and wrong on a Bulgarian sign-up form — "Invalid email
   * address" in red under a page of Cyrillic reads as the app breaking. The
   * statuses on this screen are few and each means one thing, so they are
   * mapped here; anything else falls through to `messageOf`.
   */
  function authMessage(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 429) return tr('auth.tooManyTries');
      if (e.status === 409) return tr('auth.emailTaken');
      if (e.status === 401) return tr('auth.wrongPassword');
      if (e.status === 403) return /suspend/i.test(e.message) ? tr('auth.suspended') : tr('auth.signupsClosed');
      // Zod's own wording: "Invalid email address", or a length rule that never names the field.
      if (e.status === 400) return /email/i.test(e.message) ? tr('auth.invalidEmail') : tr('auth.passwordHint');
    }
    return messageOf(e, tr);
  }

  async function continueWithGoogle() {
    setGoogle(true);
    setError(null);
    const fromWalk = planWaiting;
    if (fromWalk) reachedStep('signup_google');
    try {
      const status = await signInWithGoogle();
      // Null is "they closed it", which is a decision rather than a failure and
      // gets no message at all.
      if (!status) return;
      await adoptSession(status);
      if (fromWalk) reachedStep('account');
      await refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.status === 403 ? tr('auth.suspended') : e.status === 429 ? tr('auth.tooManyTries') : tr('auth.googleFailed'));
      } else {
        setError(messageOf(e, tr));
      }
    } finally {
      setGoogle(false);
    }
  }

  /*
   * Asks for the link and stops there. Spending it happens on the web, because
   * the link goes to a mailbox and opens in a browser — but *asking* has to be
   * possible from here, or someone who forgot their password on a phone has no
   * way in at all and the sign-in screen is a dead end.
   */
  async function forgot() {
    const address = email.trim();
    if (!address) {
      setError(tr('auth.emailFirst'));
      return;
    }
    setForgetting(true);
    setError(null);
    try {
      await api.forgotPassword(address);
      setSent(tr('reset.linkSent'));
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setForgetting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      /*
       * `padding` on both. Android used to resize its own window away from the
       * keyboard and need nothing here; under edge-to-edge it spans the
       * keyboard instead, so the stale advice leaves the submit button beneath
       * it. Same fix as the journal's composer.
       */
      behavior="padding"
    >
      <Stage />
      {/*
        Held below the status bar rather than scrolling under it. With the
        padding inside the scroll, the language pill slid up beneath the clock
        and the battery the moment the form scrolled for the keyboard — a
        control drawn over the system's own text.
      */}
      <ScrollView
        style={{ marginTop: insets.top }}
        contentContainerStyle={[styles.scroll, { paddingTop: 32, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          * The first control on the first screen, and the earliest point the
          * app can be asked. It is pre-filled from the device's language, so
          * for most people it is already right and costs nothing but the
          * glance that confirms it — and it is the only picker that reaches
          * the confirmation email.
          */}
        <View style={styles.languageRow}>
          <LanguagePicker value={locale} onChange={setPreferredLocale} />
        </View>

        <View style={styles.head}>
          <View style={styles.mark}>
            <RingObject size={96} />
          </View>
          <Serif accessibilityRole="header" style={[t.hero, styles.title, { color: colors.foreground }]}>
            {signup ? (planKcal !== null ? tr('auth.savePlanTitle') : tr('auth.createAccountTitle')) : tr('auth.signIn')}
          </Serif>
          <Text style={[t.body, { color: colors.mutedForeground }]}>
            {signup
              ? planKcal !== null
                ? tr('auth.savePlanSubtitle')(formatNumber(planKcal, locale))
                : tr('auth.createAccountSubtitle')
              : tr('auth.signInSubtitle')}
          </Text>
        </View>

        {googleEnabled && (
          <View style={styles.google}>
            <PressableChunk
              onPress={() => void continueWithGoogle()}
              disabled={google || busy}
              radius={24}
              accessibilityRole="button"
              contentStyle={[
                styles.googleFace,
                { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge },
              ]}
            >
              {google ? (
                <ActivityIndicator color={colors.foreground} />
              ) : (
                <>
                  <GoogleMark />
                  <Text style={[styles.googleLabel, { color: colors.foreground }]}>
                    {tr('auth.continueWithGoogle')}
                  </Text>
                </>
              )}
            </PressableChunk>

            {/* The line that says "or", which is the whole reason it is here. */}
            <View style={styles.orRow}>
              <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('auth.or')}</Text>
              <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
            </View>
          </View>
        )}

        {signup && (
          <Field label={tr('auth.nameOptional')}>
            <TextInput
              value={name}
              onChangeText={setName}
              autoComplete="name"
              autoCapitalize="words"
              style={[styles.input, t.body, { color: colors.foreground }]}
              placeholderTextColor={colors.mutedForeground}
            />
          </Field>
        )}

        <Field label={tr('auth.email')}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, t.body, { color: colors.foreground }]}
            placeholderTextColor={colors.mutedForeground}
          />
        </Field>

        <Field
          label={tr('auth.password')}
          hint={signup ? tr('auth.passwordHint') : undefined}
          hintAlarm={shortPassword}
        >
          {/*
            The field and the control that reveals it, on one line.

            `autoComplete` is deliberately *not* varied with `revealed`: Android
            keys its autofill off that hint, and a value that changes under the
            password manager mid-form is how a saved credential stops being
            offered. The eye changes what is drawn, and nothing else about what
            this input is.
          */}
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                if (next.length >= 8) setShortPassword(false);
              }}
              secureTextEntry={!revealed}
              autoComplete={signup ? 'new-password' : 'current-password'}
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
              style={[styles.input, styles.passwordInput, t.body, { color: colors.foreground }]}
              placeholderTextColor={colors.mutedForeground}
            />
            <Pressable
              onPress={() => setRevealed((on) => !on)}
              accessibilityRole="button"
              /*
               * Labelled with what the tap will do, not with what the field is
               * currently doing. A screen reader announcing "password hidden"
               * describes the state its user cannot see anyway; "show password"
               * is the sentence that tells them what happens if they act.
               */
              accessibilityLabel={revealed ? tr('auth.hidePassword') : tr('auth.showPassword')}
              accessibilityState={{ selected: revealed }}
              hitSlop={10}
              style={({ pressed }) => [styles.reveal, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Glyph icon={revealed ? 'eye-off' : 'eye'} color={colors.mutedForeground} size={20} />
            </Pressable>
          </View>
        </Field>

        {/*
          The failure is shown in the form rather than as a toast. "That password
          is wrong" is about the field directly above it, and a message that
          floats in at the top of the screen and leaves again is the one piece of
          copy here nobody can go back and re-read.
        */}
        {error && (
          <Text style={[t.footnoteSemibold, styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        )}

        <GlowButton
          onPress={() => void submit()}
          disabled={!email || !password}
          busy={busy}
          style={styles.submit}
          label={signup ? tr('auth.createAccount') : tr('auth.signIn')}
        />

        {/* Under the button that does the agreeing, and only on the screen where
            something is being agreed to. Both open in the browser sheet, which
            is where the store listings point at the same two documents. */}
        {signup && (
          <Text style={[t.footnote, styles.consent, { color: colors.mutedForeground }]}>
            {tr('auth.agreeBefore')}{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
              style={{ color: colors.foreground, fontFamily: font.semibold }}
            >
              {tr('auth.terms')}
            </Text>{' '}
            {tr('auth.agreeAnd')}{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
              style={{ color: colors.foreground, fontFamily: font.semibold }}
            >
              {tr('auth.privacyPolicy')}
            </Text>
            {tr('auth.agreeAfter')}
          </Text>
        )}

        {sent && (
          <Text style={[t.footnoteSemibold, styles.switch, { color: colors.caloriesText }]}>
            {sent}
          </Text>
        )}

        {!signup && (
          <Text
            accessibilityRole="button"
            onPress={() => void forgot()}
            style={[t.footnoteSemibold, styles.switch, { color: colors.mutedForeground }]}
          >
            {forgetting ? tr('verify.sending') : tr('auth.forgotPassword')}
          </Text>
        )}

        {/*
          The way back into the questions from a plan waiting to be saved. The
          answers stay; marking the draft unfinished is all it takes for the gate
          to put the walk back in front of this form.
        */}
        {signup && planWaiting && draft && (
          <Text
            accessibilityRole="button"
            onPress={() => void saveDraft({ ...draft, completed_at: null })}
            style={[t.footnoteSemibold, styles.switch, { color: colors.mutedForeground }]}
          >
            {tr('auth.changeAnswers')}
          </Text>
        )}

        {(signup || signupAllowed) && (
          <Text
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              /*
               * An account is made at the end of a plan now, not from nothing.
               * Somebody on the sign-in form with no plan behind them is sent
               * back to build one; the questions end on this form again.
               */
              if (!signup && !planWaiting) {
                chooseSignIn(false);
                return;
              }
              setMode(signup ? 'signin' : 'signup');
            }}
            style={[t.footnoteSemibold, styles.switch, { color: colors.mutedForeground }]}
          >
            {signup
              ? `${tr('auth.haveAccount')} ${tr('auth.signIn')}`
              : planWaiting
                ? tr('auth.createAccount')
                : tr('auth.buildPlanFirst')}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A labelled field, on its own ledge.
 *
 * The outline and the ledge are not decoration: in a system where every other
 * surface has an edge you could pick up, a flat input is the one thing on the
 * screen that looks unfinished. The web spells this `AUTH_FIELD`; the shape is
 * the same one, built the way every raised surface is built here.
 */
function Field({
  label,
  hint,
  hintAlarm = false,
  children,
}: {
  label: string;
  hint?: string;
  /** The hint in the error colour: what the field needs, and it does not have it yet. */
  hintAlarm?: boolean;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{label}</Text>
      <Chunk
        radius={18}
        contentStyle={{
          backgroundColor: colors.glassStrong,
          borderWidth: 1,
          borderColor: colors.glassEdge,
          height: 48,
          justifyContent: 'center',
        }}
      >
        {children}
      </Chunk>
      {/* What the field needs, said before it is got wrong. */}
      {hint && (
        <Text
          style={[
            hintAlarm ? t.footnoteSemibold : t.footnote,
            { color: hintAlarm ? colors.destructive : colors.mutedForeground },
          ]}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Enough of an address to be worth sending; the server has the final word. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const styles = StyleSheet.create({
  languageRow: { alignItems: 'flex-end', marginBottom: 20 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  head: { marginBottom: 28, gap: 8 },
  mark: { alignItems: 'flex-start', marginLeft: -18, marginBottom: -20 },
  google: { marginBottom: 24 },
  googleFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderWidth: 1,
  },
  googleLabel: { fontFamily: font.extrabold, fontSize: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  // `h-0.5 rounded-full` on the web: a rule with a shape, not a hairline.
  rule: { flex: 1, height: 1, borderRadius: 999 },
  title: { marginTop: 10 },
  field: { gap: 6, marginBottom: 16 },
  input: { height: 44, paddingHorizontal: 14 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  // The row's right-hand padding belongs to the button, so that the tap target
  // reaches the edge of the field instead of stopping 14pt short of it.
  passwordInput: { flex: 1, paddingRight: 0 },
  reveal: { height: 44, justifyContent: 'center', paddingHorizontal: 14 },
  error: { marginBottom: 12 },
  submit: { marginTop: 8 },
  switch: { marginTop: 24, textAlign: 'center' },
  // Closer to the button than the mode switch below it: this belongs to the
  // thing it sits under, not to the row of links at the foot of the screen.
  consent: { marginTop: 16, textAlign: 'center', lineHeight: 18 },
});
