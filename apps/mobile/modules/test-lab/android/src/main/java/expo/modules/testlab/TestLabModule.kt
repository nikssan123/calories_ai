package expo.modules.testlab

import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Whether this phone is one of Google's test devices — see `lib/test-device.ts`.
 *
 * Firebase Test Lab, which also runs Play's pre-launch report and review
 * robots, sets the system setting `firebase.test.lab` to "true" on every device
 * it drives. Google documents it as the way for an app to tell.
 */
class TestLabModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TestLab")

    Function("isTestLab") {
      val context = appContext.reactContext ?: return@Function false
      Settings.System.getString(context.contentResolver, "firebase.test.lab") == "true"
    }
  }
}
