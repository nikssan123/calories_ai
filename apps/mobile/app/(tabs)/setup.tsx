import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableChunk } from '@/components/Chunk';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { font, type as t, useColors } from '@/theme';

/**
 * A stub of the profile screen, carrying the one control that has to work
 * before anything else can be trusted: the way out.
 *
 * Signing in is only half of proving the session layer. A token that cannot be
 * dropped is a bug you find on somebody else's phone.
 */
export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <Logo size={44} />
      <Text style={[t.title2, styles.centred, { color: colors.foreground }]}>
        {profile?.display_name ?? 'You'}
      </Text>
      <Text style={[t.body, styles.centred, { color: colors.mutedForeground }]}>
        Targets, units, diet and the rest of setup are not ported yet — they are on
        daysofar.com.
      </Text>

      <PressableChunk
        onPress={() => void signOut()}
        radius={24}
        style={styles.button}
        contentStyle={{
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.border,
          paddingHorizontal: 24,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: font.extrabold, fontSize: 16, color: colors.foreground }}>
          Sign out
        </Text>
      </PressableChunk>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  centred: { textAlign: 'center' },
  button: { marginTop: 12 },
});
