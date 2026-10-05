package expo.modules.domfinengine

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Runs Domfin's engine (api/mobile, built with gomobile) inside the app:
// the same API as domfin-api, on a port of 127.0.0.1.
class DomfinEngineModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DomfinEngine")

    // Starts the engine, with its database in the app's files/Domfin, and
    // returns its port and the token its requests need. Again, the same.
    AsyncFunction("start") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val port = mobile.Mobile.start(File(context.filesDir, "Domfin").path)
      mapOf("port" to port, "token" to mobile.Mobile.token())
    }
  }
}
