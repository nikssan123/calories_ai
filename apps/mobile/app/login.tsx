import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { font, type as t, useColors } from '@/theme';

/**
 * Sign in, or create an account.
 *
 * Two things the web version does are deliberately absent. Google sign-in is a
 * chain of full-page navigations, which on a device means an auth session
 * browser and a redirect back through the app's scheme — real work, and none of
 * it shared with the web flow, so it is its own piece. And there is no
 * `?mode=signup` to read: nothing links here from a landing page, so the form
 * opens on sign-in unless the server says it has no accounts at all.
 */
export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { adoptSession, hasAccounts, signupAllowed, refresh, loading } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          })
        : await api.login({ email: email.trim(), password });

      // The token arrives in this response and nowhere else, so it is stored
      // before anything else can fire a request without it.
      await adoptSession(status);
      // …and the status is re-read, because signup answers before the profile
      // the rest of the app renders from exists.
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Logo size={52} />
          <Text style={[t.largeTitle, styles.title, { color: colors.foreground }]}>
            {signup ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={[t.body, { color: colors.mutedForeground }]}>
            {signup
              ? 'Then tell the journal a little about yourself and it will work out your targets.'
              : 'Sign in to pick up where you left off.'}
          </Text>
        </View>

        {signup && (
          <Field label="Name (optional)">
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

        <Field label="Email">
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

        <Field label="Password">
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
              {signup ? 'Create account' : 'Sign in'}
            </Text>
          )}
        </PressableChunk>

        {(signup || signupAllowed) && (
          <Text
            accessibilityRole="button"
            onPress={() => {
              setMode(signup ? 'signin' : 'signup');
              setError(null);
            }}
            style={[t.footnoteSemibold, styles.switch, { color: colors.mutedForeground }]}
          >
            {signup ? 'Already have an account? Sign in' : 'Create an account'}
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
  title: { marginTop: 10 },
  field: { gap: 6, marginBottom: 16 },
  input: { height: 44, paddingHorizontal: 14 },
  error: { marginBottom: 12 },
  submit: { marginTop: 8 },
  submitFace: { height: 48, alignItems: 'center', justifyContent: 'center' },
  submitLabel: { fontFamily: font.extrabold, fontSize: 16 },
  switch: { marginTop: 24, textAlign: 'center' },
});
