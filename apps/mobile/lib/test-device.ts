import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Whether this install is running on one of Google's test devices.
 *
 * Every upload to Play is walked by robots before a person sees it — the
 * pre-launch report on Firebase Test Lab, then review. They tap through the
 * whole first run, so the 1.6.0 upload arrived as four guest accounts from Los
 * Angeles and Sydney and a full funnel's worth of pings, all within two minutes
 * and none of them anybody. The funnel is where the product is steered from,
 * and a column of robots reads exactly like a good day.
 *
 * So a test device marks its funnel pings `internal` (`lib/funnel.ts`) and
 * never measures anything for Google Ads (`lib/analytics.ts`), which would
 * otherwise learn to bid for more of Google's own robots.
 *
 * Android only, through the local `modules/test-lab` module: Test Lab sets the
 * system setting `firebase.test.lab` on every device it drives. Read once — it
 * cannot change while the app is running — and false wherever the module is
 * missing, which is iOS and any dev client built before it existed.
 */
const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<{ isTestLab(): boolean }>('TestLab')
    : null;

let cached: boolean | undefined;

export function isTestDevice(): boolean {
  if (cached === undefined) {
    try {
      cached = native?.isTestLab() ?? false;
    } catch {
      cached = false;
    }
  }
  return cached;
}
