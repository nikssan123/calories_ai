import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as WebBrowser from 'expo-web-browser';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Lockup } from '@/components/Lockup';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { signInWithGoogle } from '@/lib/google';
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

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

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
    setMode(hasAccounts ? 'signin' : 'signup');
  }, [loading, hasAccounts]);

  const signup = mode === 'signup';

  async function submit() {
    setBusy(true);
    setError(null);
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
      // …and the status is re-read, because signup answers before the profile
      // the rest of the app renders from exists.
      await refresh();
    } catch (e) {
      setError(messageOf(e, tr));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setGoogle(true);
    setError(null);
    try {
      const status = await signInWithGoogle();
      // Null is "they closed it", which is a decision rather than a failure and
      // gets no message at all.
      if (!status) return;
      await adoptSession(status);
      await refresh();
    } catch (e) {
      setError(messageOf(e, tr));
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
      const result = await api.forgotPassword(address);
      setSent(result.message);
    } catch (e) {
      setError(messageOf(e, tr));
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
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
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
          <Lockup size={64} />
          <Text style={[t.largeTitle, styles.title, { color: colors.foreground }]}>
            {signup ? tr('auth.createAccountTitle') : tr('auth.signIn')}
          </Text>
          <Text style={[t.body, { color: colors.mutedForeground }]}>
            {signup
              ? tr('auth.createAccountSubtitle')
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
                { backgroundColor: colors.card, borderColor: colors.border },
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
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
              <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('auth.or')}</Text>
              <View style={[styles.rule, { backgroundColor: colors.border }]} />
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

        <Field label={tr('auth.password')}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={signup ? 'new-password' : 'current-password'}
            onSubmitEditing={() => void submit()}
            returnKeyType="go"
            style={[styles.input, t.body, { color: colors.foreground }]}
            placeholderTextColor={colors.mutedForeground}
          />
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

        <PressableChunk
          onPress={() => void submit()}
          disabled={busy || !email || password.length < 8}
          color={colors.caloriesDeep}
          radius={24}
          style={styles.submit}
          contentStyle={[styles.submitFace, { backgroundColor: colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.submitLabel, { color: colors.primaryForeground }]}>
              {signup ? tr('auth.createAccount') : tr('auth.signIn')}
            </Text>
          )}
        </PressableChunk>

        {/* Under the button that does the agreeing, and only on the screen where
            something is being agreed to. Both open in the browser sheet, which
            is where the store listings point at the same two documents. */}
        {signup && (
          <Text style={[t.footnote, styles.consent, { color: colors.mutedForeground }]}>
            By creating an account you agree to the{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL).catch(() => {})}
              style={{ color: colors.foreground, fontFamily: font.semibold }}
            >
              Terms
            </Text>{' '}
            and the{' '}
            <Text
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
              style={{ color: colors.foreground, fontFamily: font.semibold }}
            >
              Privacy Policy
            </Text>
            .
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

        {(signup || signupAllowed) && (
          <Text
            accessibilityRole="button"
            onPress={() => {
              setMode(signup ? 'signin' : 'signup');
              setError(null);
            }}
            style={[t.footnoteSemibold, styles.switch, { color: colors.mutedForeground }]}
          >
            {signup ? `${tr('auth.haveAccount')} ${tr('auth.signIn')}` : tr('auth.createAccount')}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Google's own "G", reproduced as their sign-in branding rules require: the
 * four-colour mark, unrecoloured and unaltered, beside the words "Continue with
 * Google". The paths are the same ones `apps/web/components/GoogleMark.tsx`
 * carries — a mark redrawn by hand for the second client would be a mark that
 * is subtly not Google's on one of them.
 */
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.964 10.71a5.41 5.41 0 0 1 0-3.42V4.958H.957a9 9 0 0 0 0 8.084l3.007-2.332z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </Svg>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[t.footnote, { color: colors.mutedForeground }]}>{label}</Text>
      <Chunk
        radius={18}
        contentStyle={{
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          height: 48,
          justifyContent: 'center',
        }}
      >
        {children}
      </Chunk>
    </View>
  );
}

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
  head: { marginBottom: 32, gap: 10 },
  google: { marginBottom: 24 },
  googleFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderWidth: 2,
  },
  googleLabel: { fontFamily: font.extrabold, fontSize: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  // `h-0.5 rounded-full` on the web: a rule with a shape, not a hairline.
  rule: { flex: 1, height: 2, borderRadius: 999 },
  title: { marginTop: 10 },
  field: { gap: 6, marginBottom: 16 },
  input: { height: 44, paddingHorizontal: 14 },
  error: { marginBottom: 12 },
  submit: { marginTop: 8 },
  submitFace: { height: 48, alignItems: 'center', justifyContent: 'center' },
  submitLabel: { fontFamily: font.extrabold, fontSize: 16 },
  switch: { marginTop: 24, textAlign: 'center' },
  // Closer to the button than the mode switch below it: this belongs to the
  // thing it sits under, not to the row of links at the foot of the screen.
  consent: { marginTop: 16, textAlign: 'center', lineHeight: 18 },
});
