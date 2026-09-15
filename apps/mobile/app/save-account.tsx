import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ApiError } from '@ct/api-client';
import { TRIAL } from '@ct/shared';
import { Chunk, PressableChunk } from '@/components/Chunk';
import { GlowButton } from '@/components/GlowButton';
import { GoogleMark } from '@/components/GoogleMark';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Stage } from '@/components/onboarding/Stage';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { messageOf } from '@/lib/errors';
import { reachedStep } from '@/lib/funnel';
import { saveWithGoogle } from '@/lib/google';
import { useT } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';
import type { SaveReason } from '@/lib/save-account';
import { font, type as t, useColors, useType } from '@/theme';

/** Enough of an address to be worth sending; the server has the final word. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Saving a guest's account (GUEST-ACCOUNTS.md).
 *
 * A guest has been using the app with no identity: a row on the server and a
 * token on this phone. This screen puts an identity on that same row — Google,
 * or an address and a password confirmed by a six-digit code — so everything
 * logged so far stays exactly where it is. Proving the identity is also what
 * starts the seven-day trial, which is the reason given here, in the reader's
 * terms: the guest day is spent, and an account is what buys the week.
 *
 * Opened from a spent guest meter, from a purchase, and from the You tab. It can
 * always be closed: the ask blocks the AI, never the journal — typing a meal in
 * and scanning a barcode stay free either way.
 *
 * If the Google account or the address already has an account here, that is a
 * sign-in to it rather than a merge. The guest journal on this phone is not
 * poured into an account with its own history, and the screen says so.
 */
export default function SaveAccountScreen() {
  const type = useType();
  const tr = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reason: rawReason } = useLocalSearchParams<{ reason?: string }>();
  const reason: SaveReason =
    rawReason === 'guest_limit' || rawReason === 'purchase' || rawReason === 'first_log' ? rawReason : 'you';
  const { profile, googleEnabled, adoptSession, refresh, signOut } = useAuth();
  const { chooseSignIn } = useOnboarding();

  /* The row this screen was opened for, so a different one coming back reads as a switch. */
  const guestId = useRef(profile?.id ?? null);
  const awaitingCode = Boolean(profile?.guest && profile.email && !profile.email_verified);

  /*
   * An account that is already saved lands on the done state rather than a form
   * whose submit would be refused — a stale "Save your account" button left in
   * the journal from before saving is the usual way here.
   */
  const alreadySaved = profile !== null && !profile.guest;
  const [step, setStep] = useState<'form' | 'code' | 'done' | 'switched'>(
    alreadySaved ? 'done' : awaitingCode ? 'code' : 'form',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortPassword, setShortPassword] = useState(false);
  const [taken, setTaken] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!alreadySaved) reachedStep('save_prompt');
    // Once, for how the screen was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perDay = Math.round(TRIAL.chat / TRIAL.days);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  function saved() {
    reachedStep('account');
    setStep('done');
  }

  async function withGoogle() {
    setGoogle(true);
    setError(null);
    try {
      const status = await saveWithGoogle();
      if (!status) return;
      await adoptSession(status);
      if (status.profile && status.profile.id !== guestId.current) {
        setStep('switched');
      } else {
        saved();
      }
    } catch (e) {
      setError(e instanceof ApiError ? tr('auth.googleFailed') : messageOf(e, tr));
    } finally {
      setGoogle(false);
    }
  }

  async function claim() {
    setError(null);
    setTaken(false);
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError(tr('auth.invalidEmail'));
      return;
    }
    if (password.length < 8) {
      setShortPassword(true);
      return;
    }
    setBusy(true);
    try {
      const status = await api.claim({
        email: email.trim(),
        password,
        display_name: name.trim() || null,
      });
      if (status.profile) await adoptSession(status);
      setStep('code');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.body as { code?: string } | undefined)?.code === 'EMAIL_TAKEN') {
        setTaken(true);
      } else if (e instanceof ApiError && e.status === 429) {
        setError(tr('auth.tooManyTries'));
      } else if (e instanceof ApiError && e.status === 400) {
        setError(/email/i.test(e.message) ? tr('auth.invalidEmail') : tr('auth.passwordHint'));
      } else {
        setError(messageOf(e, tr));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyEmailCode(code.trim());
      await refresh();
      saved();
    } catch (e) {
      setError(messageOf(e, tr));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await api.resendVerification();
      setSent(tr('verify.codeSent'));
    } catch (e) {
      setError(messageOf(e, tr));
    } finally {
      setBusy(false);
    }
  }

  /*
   * Signing in to the account that already owns the address. The guest session
   * ends and the sign-in screen takes over; the journal on this phone stays with
   * the guest row, which is what the line above the button says.
   */
  async function signInInstead() {
    chooseSignIn(true);
    await signOut();
  }

  const title =
    step === 'done'
      ? tr('save.doneTitle')
      : step === 'switched'
        ? tr('save.switchedTitle')
        : step === 'code'
          ? tr('verify.checkEmail')
          : reason === 'guest_limit'
            ? tr('save.titleGuestLimit')
            : reason === 'purchase'
              ? tr('save.titlePurchase')
              : tr('save.title');

  const blurb =
    step === 'done'
      ? tr('save.doneBody')(TRIAL.days)
      : step === 'switched'
        ? tr('save.switchedBody')
        : step === 'code'
          ? tr('verify.sentTo')(profile?.email ?? email)
          : reason === 'purchase'
            ? tr('save.purchaseBody')
            : tr('save.trialBody')(TRIAL.days, perDay);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stage />
      <View style={[styles.closeRow, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={tr('save.later')}
          hitSlop={12}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.5 : 1 }]}
        >
          {/* lucide `x`, on lucide's 24-unit grid. */}
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M18 6L6 18M6 6l12 12"
              stroke={colors.mutedForeground}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mark}>
          <RingObject size={88} />
        </View>
        <Serif accessibilityRole="header" style={[type.hero, styles.title, { color: colors.foreground }]}>
          {title}
        </Serif>
        <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>{blurb}</Text>
        {step === 'form' && reason !== 'purchase' && (
          <Text style={[t.footnote, styles.free, { color: colors.mutedForeground }]}>{tr('save.stillFree')}</Text>
        )}

        {(step === 'done' || step === 'switched') && (
          <GlowButton label={tr('save.continue')} onPress={close} style={styles.submit} />
        )}

        {step === 'form' && (
          <>
            {googleEnabled && (
              <View style={styles.google}>
                <PressableChunk
                  onPress={() => void withGoogle()}
                  disabled={google || busy}
                  radius={24}
                  accessibilityRole="button"
                  contentStyle={[styles.googleFace, { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge }]}
                >
                  {google ? (
                    <ActivityIndicator color={colors.foreground} />
                  ) : (
                    <>
                      <GoogleMark />
                      <Text style={[styles.googleLabel, { color: colors.foreground }]}>{tr('auth.continueWithGoogle')}</Text>
                    </>
                  )}
                </PressableChunk>
                <View style={styles.orRow}>
                  <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
                  <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('auth.or')}</Text>
                  <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
                </View>
              </View>
            )}

            <Field label={tr('auth.nameOptional')}>
              <TextInput
                value={name}
                onChangeText={setName}
                autoComplete="name"
                autoCapitalize="words"
                style={[styles.input, t.body, { color: colors.foreground }]}
              />
            </Field>
            <Field label={tr('auth.email')}>
              <TextInput
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  setTaken(false);
                }}
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, t.body, { color: colors.foreground }]}
              />
            </Field>
            <Field label={tr('auth.password')} hint={tr('auth.passwordHint')} hintAlarm={shortPassword}>
              <TextInput
                value={password}
                onChangeText={(next) => {
                  setPassword(next);
                  if (next.length >= 8) setShortPassword(false);
                }}
                secureTextEntry
                autoComplete="new-password"
                onSubmitEditing={() => void claim()}
                returnKeyType="go"
                style={[styles.input, t.body, { color: colors.foreground }]}
              />
            </Field>

            {taken && (
              <View style={styles.taken}>
                <Text style={[t.footnoteSemibold, { color: colors.destructive }]}>{tr('auth.emailTaken')}</Text>
                <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('save.signInWarning')}</Text>
                <Pressable onPress={() => void signInInstead()} accessibilityRole="button" hitSlop={8}>
                  <Text style={[t.footnoteSemibold, { color: colors.foreground }]}>{tr('save.signInInstead')}</Text>
                </Pressable>
              </View>
            )}
            {error && <Text style={[t.footnoteSemibold, styles.message, { color: colors.destructive }]}>{error}</Text>}

            <GlowButton
              onPress={() => void claim()}
              disabled={!email || !password}
              busy={busy}
              style={styles.submit}
              label={tr('save.saveButton')}
            />
          </>
        )}

        {step === 'code' && (
          <>
            <Chunk radius={18} style={styles.codeField}>
              <TextInput
                value={code}
                onChangeText={(next) => setCode(next.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => void confirm()}
                returnKeyType="go"
                style={[
                  styles.codeInput,
                  { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge, color: colors.foreground },
                ]}
              />
            </Chunk>
            {error && <Text style={[t.footnoteSemibold, styles.message, { color: colors.destructive }]}>{error}</Text>}
            {sent && !error && (
              <Text style={[t.footnoteSemibold, styles.message, { color: colors.caloriesText }]}>{sent}</Text>
            )}
            <GlowButton
              onPress={() => void confirm()}
              disabled={code.length < 6}
              busy={busy}
              style={styles.submit}
              label={tr('verify.confirm')}
            />
            <Pressable onPress={() => void resend()} disabled={busy} accessibilityRole="button" hitSlop={8}>
              <Text style={[t.footnoteSemibold, styles.link, { color: colors.mutedForeground }]}>
                {tr('verify.sendAgain')}
              </Text>
            </Pressable>
            {/* A mistyped address is a dead end without this: back to the form, which keeps what was typed. */}
            <Pressable onPress={() => setStep('form')} accessibilityRole="button" hitSlop={8}>
              <Text style={[t.footnoteSemibold, styles.link, { color: colors.mutedForeground }]}>
                {tr('save.changeEmail')}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A labelled field on its own ledge — the sign-in form's, with the same optional hint under it. */
function Field({
  label,
  hint,
  hintAlarm = false,
  children,
}: {
  label: string;
  hint?: string;
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  closeRow: { alignItems: 'flex-end', paddingHorizontal: 16 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, maxWidth: 420, width: '100%', alignSelf: 'center' },
  mark: { alignItems: 'flex-start', marginLeft: -16, marginBottom: -16 },
  title: { marginTop: 10 },
  blurb: { marginTop: 8, lineHeight: 26 },
  free: { marginTop: 8 },
  google: { marginTop: 24, marginBottom: 20 },
  googleFace: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48, borderWidth: 1 },
  googleLabel: { fontFamily: font.extrabold, fontSize: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  rule: { flex: 1, height: 1, borderRadius: 999 },
  field: { gap: 6, marginBottom: 14 },
  input: { height: 44, paddingHorizontal: 14 },
  taken: { gap: 4, marginBottom: 12 },
  message: { marginTop: 4, marginBottom: 8, textAlign: 'center' },
  submit: { marginTop: 16 },
  codeField: { marginTop: 24 },
  codeInput: {
    height: 64,
    borderWidth: 1,
    borderRadius: 18,
    textAlign: 'center',
    fontFamily: font.serifMedium,
    fontSize: 32,
    letterSpacing: 10,
    paddingVertical: 0,
  },
  link: { textAlign: 'center', marginTop: 20 },
});
