import DomfinEngine
import ExpoModulesCore

// Runs Domfin's engine (api/mobile, built with gomobile) inside the app:
// the same API as domfin-api, on a port of 127.0.0.1.
public class DomfinEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DomfinEngine")

    // Starts the engine, with its database in Application Support/Domfin,
    // and returns its port. Again, it returns the same port.
    AsyncFunction("start") { () -> Int in
      let support = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      let dataDir = support.appendingPathComponent("Domfin", isDirectory: true)
      var port = 0
      var error: NSError?
      guard MobileStart(dataDir.path, &port, &error) else {
        throw error ?? EngineDidNotStart()
      }
      return port
    }
  }
}

struct EngineDidNotStart: Error {}
