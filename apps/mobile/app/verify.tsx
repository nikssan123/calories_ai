import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chunk } from '@/components/Chunk';
import { GlowButton } from '@/components/GlowButton';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Stage } from '@/components/onboarding/Stage';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { mergeKeptGuest } from '@/lib/guest-merge';
import { font, useColors, useType } from '@/theme';
import { useT } from '@/lib/i18n';
import { messageOf } from '@/lib/errors';

/**
 * The six digits that open the rest of the app.
 *
 * Not optional and not a nag. The API gates *every* route outside `/auth/`
 * behind a verified address and answers 403 to the rest, so an app that skipped
 * this would not degrade politely — it would render six empty screens and a
 * status bar stuck on its skeleton, which is exactly what it did before this
 * screen existed. There is nothing to browse past it, so it is a screen rather
 * than a banner.
 *
 * The code, not the link. A link opens a browser, and the account it has to
 * prove is signed in *here* — on the phone, in an app the browser cannot reach.
 * Six digits typed from the same email work without leaving the app at all.
 */
export default function VerifyScreen() {
  const t = useType();
  const tr = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, refresh, signOut } = useAuth();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.verifyEmailCode(code.trim());
      // The gate is server-side, so the only thing that opens the app is the
      // session's own view of itself. Re-read it rather than assuming.
      await refresh();
      // A guest that stepped aside for a new sign-up brings its journal once the address is proved.
      if (await mergeKeptGuest()) await refresh();
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <Stage />
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.mark}>
          <RingObject size={96} />
        </View>
        <Serif accessibilityRole="header" style={[t.hero, styles.title, { color: colors.foreground }]}>
          {tr('verify.checkEmail')}
        </Serif>
        <Text style={[t.body, styles.blurb, { color: colors.mutedForeground }]}>
          {profile?.email ? tr('verify.sentTo')(profile.email) : tr('verify.sentBlind')}
        </Text>

        <Chunk radius={18} style={styles.field}>
          <TextInput
            value={code}
            onChangeText={(next) => setCode(next.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="000000"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => void submit()}
            returnKeyType="go"
            style={[
              styles.input,
              { backgroundColor: colors.glassStrong, borderColor: colors.glassEdge, color: colors.foreground },
            ]}
          />
        </Chunk>

        {error && (
          <Text style={[t.footnoteSemibold, styles.message, { color: colors.destructive }]}>
            {error}
          </Text>
        )}
        {sent && !error && (
          <Text style={[t.footnoteSemibold, styles.message, { color: colors.caloriesText }]}>
            {sent}
          </Text>
        )}

        <GlowButton
          onPress={() => void submit()}
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

        {/* The way out, because the alternative is being stuck: someone who
            mistyped their address on the way in cannot reach the mailbox the
            code went to, and this screen is the whole app until they do. */}
        <Pressable onPress={() => void signOut()} accessibilityRole="button" hitSlop={8}>
          <Text style={[t.footnoteSemibold, styles.link, { color: colors.mutedForeground }]}>
            {tr('nav.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: 24, alignItems: 'stretch' },
  mark: { alignItems: 'flex-start', marginLeft: -18, marginBottom: -20 },
  title: { marginTop: 20 },
  blurb: { marginTop: 8, lineHeight: 26 },
  field: { marginTop: 28 },
  input: {
    height: 64,
    borderWidth: 1,
    borderRadius: 18,
    textAlign: 'center',
    fontFamily: font.serifMedium,
    fontSize: 32,
    letterSpacing: 10,
    paddingVertical: 0,
  },
  message: { marginTop: 12, textAlign: 'center' },
  submit: { marginTop: 20 },
  link: { textAlign: 'center', marginTop: 20 },
});
