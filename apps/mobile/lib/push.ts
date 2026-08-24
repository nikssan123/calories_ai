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
    if (Platform.OS === 'android') await ensureChannels();

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
 * The categories the server can send into, all created before the first token
 * exists — because there is no later moment we are guaranteed to reach, and an
 * Android push with no channel to land in is dropped silently, with the send
 * reported as a success.
 *
 * Four rather than one, and the split is the only notification control Android
 * gives a reader that is finer than the whole app. With a single channel,
 * somebody who has had enough of the nightly recap has exactly one way to stop
 * it: silence everything, including the warning that their subscription lapses
 * on Thursday. Each name below is what the notification *is*, not who sent it —
 * a category called "Day So Far", inside Day So Far, tells the reader nothing
 * on the one screen where they are choosing what to keep.
 *
 * Names and importance are set once per install and then owned by the reader:
 * Android ignores later changes to a channel that exists, which is the correct
 * behaviour and the reason to get these right the first time.
 */
async function ensureChannels(): Promise<void> {
  /*
   * `DEFAULT` throughout rather than `HIGH`: these make a sound and sit in the
   * shade, and none of them throws a banner over whatever the reader was doing.
   * The whole argument for putting any of this on a phone was that the switches
   * promise at most one a week — arriving louder than the email did would be
   * taking that back. The one exception lives in `reminders.ts`, where the
   * reader chose the hour themselves and an alarm they cannot see has failed.
   */
  const importance = Notifications.AndroidImportance.DEFAULT;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reviews and nudges',
    importance,
  });
  await Notifications.setNotificationChannelAsync('milestones', {
    name: 'Streaks and goals',
    importance,
  });
  await Notifications.setNotificationChannelAsync('recap', {
    name: 'Evening recap',
    importance,
  });
  await Notifications.setNotificationChannelAsync('account', {
    // Not a preference in the app, and it should not read as one here either.
    name: 'Your subscription',
    importance,
  });
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
