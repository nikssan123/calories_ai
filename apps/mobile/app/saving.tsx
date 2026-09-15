import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlowButton } from '@/components/GlowButton';
import { useAuth } from '@/lib/auth';
import { RingObject } from '@/components/RingObject';
import { Serif } from '@/components/Serif';
import { Stage } from '@/components/onboarding/Stage';
import { useOnboarding } from '@/lib/onboarding';
import { useT } from '@/lib/i18n';
import { column, type as t, useColors, useType } from '@/theme';

/**
 * The second between a new account and its first screen.
 *
 * A plan answered before sign-up is written to the account the moment the
 * account can take it (`lib/onboarding.tsx`), and for that second the gate has
 * nothing true to show: the tabs would draw a target computed before the
 * profile landed, and setup would ask questions that are already answered. So
 * it shows this — the same ring the walk opened on, and a sentence saying what
 * is happening. On a cold launch the splash covers the same wait and this is
 * never seen.
 */
export default function SavingScreen() {
  const colors = useColors();
  const type = useType();
  const tr = useT();
  const { saving, planWaiting, guestError, retryGuest, draft, saveDraft, chooseSignIn } = useOnboarding();
  const { authenticated } = useAuth();
  /* The guest session for a finished walk is still being made (GUEST-ACCOUNTS.md). */
  const starting = !authenticated && planWaiting;

  /*
   * The guest session could not be made. Offline is a retry. A refusal — too
   * many new accounts from this connection, or sign-ups closed — is the same
   * answer on every retry, so it offers the two ways out that do not need a new
   * account: signing in to an existing one, and going back to the answers. Both
   * are here for offline too, so nobody is ever held on a screen with one button
   * that cannot work.
   */
  if (starting && guestError) {
    return (
      <View style={styles.flex}>
        <Stage />
        <View style={[styles.centre, column]} accessibilityLiveRegion="polite">
          <RingObject size={150} />
          <Text style={[t.bodyBold, styles.centred, { color: colors.foreground }]}>
            {guestError === 'refused' ? tr('guest.startRefused') : tr('common.offline')}
          </Text>
          {guestError === 'offline' && <GlowButton label={tr('ob.retry')} onPress={retryGuest} />}
          <Pressable onPress={() => chooseSignIn(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={[t.footnoteSemibold, styles.link, { color: colors.foreground }]}>{tr('ob.haveAccount')}</Text>
          </Pressable>
          {draft && (
            <Pressable
              onPress={() => void saveDraft({ ...draft, completed_at: null })}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[t.footnoteSemibold, styles.link, { color: colors.mutedForeground }]}>
                {tr('auth.changeAnswers')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stage />
      <View style={[styles.centre, column]} accessibilityLiveRegion="polite">
        <RingObject size={150} />
        <Serif style={[type.hero, styles.centred, { color: colors.foreground }]}>
          {saving || starting ? tr('saving.title') : tr('saving.welcomeBack')}
        </Serif>
        {(saving || starting) && (
          <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>{tr('saving.body')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  centred: { textAlign: 'center' },
  link: { textAlign: 'center', marginTop: 8 },
});
