import { useEffect, useMemo } from 'react';
import { useColorScheme, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
/*
 * Imported one face per subpath rather than from the package root.
 *
 * Both root modules `require()` every weight they ship — Nunito alone is
 * sixteen files with the italics — at module scope, so a single named import
 * from there drags all of them into the bundle. Eight faces are used; the deep
 * paths are what make the app carry eight.
 */
import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { AuthProvider, useAuth } from '@/lib/auth';
import { paletteFor, ThemeContext, type Scheme } from '@/theme';

/*
 * Held until the fonts are in and the session has resolved.
 *
 * Both matter for the same reason: the first frame is the one that sets whether
 * this looks like a finished app. A frame painted in the fallback face reflows
 * every heading a moment later, and a frame painted before `me()` answers shows
 * the sign-in screen to someone who is already signed in.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  /*
   * Every weight is a face. RN does not synthesise weights across a family, so
   * `fontWeight: '800'` on its own silently renders regular — and this type
   * scale leans on 800 for every heading and every figure in the app. The list
   * is the type scale in `theme/typography.ts`, and the two must stay in step.
   */
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
  });

  // A font that will not load is not a reason to show nothing forever. The
  // system rounded stack is a near neighbour of both faces, so failing open
  // costs some of the personality and none of the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Themed />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Themed() {
  /*
   * The OS setting, for now. The web has an in-app override on top of it
   * (`ThemeSync`/`ThemeToggle`); when that is ported it resolves here, which is
   * why every component reads the palette from context rather than calling
   * `useColorScheme` for itself.
   */
  const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => ({ scheme, colors: paletteFor(scheme) }), [scheme]);

  return (
    <ThemeContext.Provider value={theme}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Gate />
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * The one redirect a native app needs.
 *
 * The web's gate defends a URL bar: it has to hold unauthenticated visitors on
 * public routes and keep an unverified account at `/verify`, because anyone can
 * type any address. Nothing here is reachable by typing, so the only question
 * is whether there is a session — and the answer moves exactly one boundary,
 * between `login` and the tabs.
 */
function Gate() {
  const { authenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const onLogin = segments[0] === 'login';

  useEffect(() => {
    if (loading) return;
    if (!authenticated && !onLogin) {
      router.replace('/login');
      return;
    }
    if (authenticated && onLogin) {
      router.replace('/today');
      return;
    }
    // Only once we are on the screen we belong on. Hiding it before the
    // redirect lands shows a frame of the tab bar to someone who is about to be
    // sent to the sign-in form.
    void SplashScreen.hideAsync();
  }, [authenticated, loading, onLogin, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // The shell paints its own ground; the default white flashes through
        // every push on a dark theme.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
    </Stack>
  );
}
