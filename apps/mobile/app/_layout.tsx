import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
/*
 * The two italics exist for the journal alone: the model writes *emphasis* and
 * the markdown renderer has to draw it. `fontStyle: 'italic'` is the same empty
 * request as `fontWeight` — with no italic face loaded iOS quietly falls back to
 * the system font, so a stressed word changes typeface mid-sentence.
 */
import { Nunito_500Medium_Italic } from '@expo-google-fonts/nunito/500Medium_Italic';
import { Nunito_800ExtraBold_Italic } from '@expo-google-fonts/nunito/800ExtraBold_Italic';
import * as Notifications from 'expo-notifications';
import { ToastProvider } from '@/components/Toast';
import { SharedPhotoRoot } from '@/lib/share';
import { AuthProvider, useAuth } from '@/lib/auth';
import { EntitlementsProvider } from '@/lib/entitlements';
import { ThemePreferenceProvider, useThemePreference } from '@/lib/theme-preference';
import { paletteFor, ThemeContext, useColors } from '@/theme';
import { registerForPush } from '@/lib/push';
import { restoreReminders } from '@/lib/reminders';

/*
 * Held until the fonts are in and the session has resolved.
 *
 * Both matter for the same reason: the first frame is the one that sets whether
 * this looks like a finished app. A frame painted in the fallback face reflows
 * every heading a moment later, and a frame painted before `me()` answers shows
 * the sign-in screen to someone who is already signed in.
 */
void SplashScreen.preventAutoHideAsync();

const FILL = { flex: 1 } as const;

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
    Nunito_500Medium_Italic,
    Nunito_800ExtraBold_Italic,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
  });

  // A font that will not load is not a reason to show nothing forever. The
  // system rounded stack is a near neighbour of both faces, so failing open
  // costs some of the personality and none of the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    /*
     * Outermost, and it has to be: every gesture in the app is recognised
     * inside this view, and a `Swipeable` mounted outside one silently does
     * nothing on Android rather than failing loudly. It arrived late — the
     * library has been in the tree since Reanimated pulled it in, but nothing
     * asked it for a gesture until rows became swipeable.
     */
    <GestureHandlerRootView style={FILL}>
      <SafeAreaProvider>
        <ThemePreferenceProvider>
          <AuthProvider>
            {/*
              * Inside the session and outside the theme, because it is the
              * session it depends on: it fetches on sign-in, drops what it
              * holds on sign-out, and tells the store which account a purchase
              * belongs to. Nothing about it is visual.
              */}
            <EntitlementsProvider>
              <Themed />
            </EntitlementsProvider>
          </AuthProvider>
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Themed() {
  /*
   * The preference and the OS, resolved together in one place. This is why
   * every component reads its palette from context rather than calling
   * `useColorScheme` for itself: a component that asked the OS directly would
   * ignore an override, and the app would render two themes at once.
   */
  const { scheme } = useThemePreference();
  const theme = useMemo(() => ({ scheme, colors: paletteFor(scheme) }), [scheme]);

  return (
    <ThemeContext.Provider value={theme}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {/*
          * Inside the theme and outside the navigator, which is the only place
          * it works: a toast raised while a screen is being pushed must outlive
          * the screen that raised it, and one mounted per screen would go with
          * it. It draws over the stack rather than in it.
          */}
        <ToastProvider>
          {/*
            * Inside the toast and outside the navigator, like the toast itself.
            * A share can arrive while the app is signed out — the photo waits in
            * context, the guard sends the reader to the sign-in screen, and the
            * composer picks it up when the journal finally mounts.
            */}
          <SharedPhotoRoot>
            <Gate />
          </SharedPhotoRoot>
        </ToastProvider>
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * Two boundaries, not one.
 *
 * An earlier version of this reasoned that the web's gate exists to defend a
 * URL bar — anyone can type `/today` — and that since nothing here is reachable
 * by typing, the only question is whether there is a session. Half right, and
 * the wrong half was expensive: verification is not a URL concern at all. The
 * API refuses *every* route outside `/auth/` with a 403 until the address is
 * confirmed, so an app that walked an unverified account into the tabs showed
 * six blank screens and a status bar stuck on its skeleton. Found by signing a
 * fresh account in against the real server, which is the only place it shows.
 */
function Gate() {
  const { authenticated, emailVerified, loading } = useAuth();
  const colors = useColors();
  const router = useRouter();

  useEffect(() => {
    // Held until the session has resolved, so nobody sees a frame of the wrong
    // screen on the way to the right one.
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  /*
   * Re-register this phone's address once there is a session to attach it to.
   *
   * Silent by construction — `registerForPush` will not raise a permission
   * dialog unless it is asked to, and it is not asked to here. Somebody who
   * granted permission last week is quietly re-registered; somebody who never
   * did is left alone until they turn a switch on, which is the only moment
   * where the question is an answer to something they just did.
   *
   * Every launch rather than once, because a token is not permanent: a
   * reinstall or a restore from backup mints a new one, and the old address
   * fails in the only way that leaves no trace — the notification simply never
   * arrives.
   */
  useEffect(() => {
    if (authenticated && emailVerified) void registerForPush();
  }, [authenticated, emailVerified]);

  /*
   * And re-arm the alarms the reader set on this phone.
   *
   * Unconditional, unlike the registration above — no session, no address and
   * no verification, because none of them is involved: a local reminder is an
   * OS-level alarm with no account behind it, and gating it on a signed-in
   * session would silently stop reminding somebody whose token expired
   * overnight, which is the moment a reminder is most useful.
   */
  useEffect(() => {
    void restoreReminders();
  }, []);

  /*
   * Where a tap lands.
   *
   * The server puts a `route` in every notification's data, so this stays a
   * lookup rather than a switch that has to learn each kind: a weekly review
   * opens Progress, a nudge opens the journal it also appears in. Anything
   * unrecognised is left alone — opening the app at all is a reasonable answer
   * to a notification whose destination we cannot parse.
   */
  useEffect(() => {
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
    });
    return () => tap.remove();
  }, [router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /*
         * The ground, spelled out.
         *
         * React Navigation paints every scene with its own default theme —
         * a cool #f2f2f2 — over whatever is behind it. Leaving it alone put a
         * grey page under a cream tab bar and quietly cancelled the warmest
         * decision in the palette. `transparent` is not enough either: the card
         * still paints, so the colour has to be named.
         */
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/*
        * Declarative guards rather than a `router.replace` in an effect. The
        * imperative version dispatches into a navigator that has not finished
        * mounting on the first pass, which React reports as a state update on a
        * component that has not mounted yet — and it is a real race, not just a
        * warning: the tab bar gets a frame before the redirect lands.
        */}
      <Stack.Protected guard={authenticated && !emailVerified}>
        <Stack.Screen name="verify" />
      </Stack.Protected>

      <Stack.Protected guard={authenticated && emailVerified}>
        <Stack.Screen name="(tabs)" />
        {/*
          * History sits outside the tabs, as it does on the web: it is reached
          * from the date at the top of Today and nowhere else. A seventh tab
          * would put a calendar in the thumb's way all day for something used
          * once a week.
          */}
        <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
        {/* A recipe is a place you go from Cook and come back from, so it
            pushes rather than becoming a seventh tab. */}
        <Stack.Screen name="recipe/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="library/[slug]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="plan" options={{ animation: 'slide_from_right' }} />
        {/*
          * Reached from a wall in the journal, a locked kitchen and the plan row
          * in settings — three places, none of them a tab, which is what makes
          * it a pushed screen. `slide_from_bottom` rather than the horizontal
          * push the others use: it is asking for something rather than going
          * somewhere, and the vertical entrance is the one people already read
          * as "this is a decision you can back out of".
          */}
        <Stack.Screen name="upgrade" options={{ animation: 'slide_from_bottom' }} />
      </Stack.Protected>
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
