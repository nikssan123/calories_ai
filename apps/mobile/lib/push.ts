import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '@/lib/api';

/**
 * Getting this phone an address, and giving it back.
 *
 * The switches on the You screen have existed since the beginning and have only
 * ever meant email. On a phone that is the wrong channel for a nudge — the
 * switch is somebody saying yes to being *told* something, and answering that
 * with an email answers a different question. This is the half that makes the
 * yes mean what it says.
 *
 * Everything here answers rather than throws. A notification is the least
 * important thing happening in any launch that arranges one, and a phone that
 * cannot be registered — no permission, no network, a simulator that has no
 * push service at all — is not a reason for the app to do anything differently.
 */

/**
 * The last token this process minted.
 *
 * Held so that signing out can give up the right address without asking the OS
 * for it again — which would need a permission that signing out is a perfectly
 * good reason to have just revoked.
 */
let current: string | null = null;

/**
 * Foreground behaviour.
 *
 * A nudge that arrives while its subject is on screen should still be seen: the
 * journal is a long scroll and the notification may well be about a day the
 * reader is not looking at. It does not steal focus, it just appears.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

/**
 * Asks for permission and hands the resulting address to the server.
 *
 * Returns what happened rather than a boolean, because the two failures are
 * different sentences: somebody who said no is a settled state, and a phone
 * that could not reach the relay is worth trying again on the next launch.
 *
 * **Never asks unprompted.** `requestPermissions` is false on the path taken at
 * launch, so a returning reader who already granted it is re-registered
 * silently and one who has not is left alone. The ask belongs to the moment
 * somebody turns a switch on, where it is an answer to something they just did
 * rather than a modal in the way of the app they opened.
 */
export async function registerForPush(
  { requestPermissions = false }: { requestPermissions?: boolean } = {},
): Promise<'registered' | 'denied' | 'unavailable'> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    if (!granted) {
      if (!requestPermissions) return 'denied';
      /*
       * `canAskAgain` is the difference between "not yet" and "no". Asking
       * again once the OS has stopped showing the dialog resolves instantly to
       * denied, which would read to the caller as the person having just said
       * no rather than months ago in Settings.
       */
      if (!existing.canAskAgain) return 'denied';
      granted = (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return 'denied';
    }

    /*
     * Android delivers nothing without a channel, and silently: the push
     * arrives, the system finds no channel to put it in, and it is dropped
     * without an error anywhere. Created before the first token rather than
     * before the first send, since there is no later moment we are guaranteed
     * to reach.
     */
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Day So Far',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    });
    current = token;
    await api.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return 'registered';
  } catch {
    /*
     * A simulator with no push service, a build with no project id, a relay
     * that is down. All of them mean the same thing to a caller — there is no
     * address today — and none of them is worth a message to the reader, who
     * did not ask for one and cannot act on any of it.
     */
    return 'unavailable';
  }
}

/**
 * Gives this phone's address up.
 *
 * Called on sign-out, and it matters more than tidiness: the token belongs to
 * the *device*, not the account, so one left registered would keep delivering
 * the previous person's nudges into the next person's pocket.
 */
export async function forgetPush(): Promise<void> {
  const token = current;
  if (!token) return;
  current = null;
  await api.forgetDevice(token).catch(() => {});
}
