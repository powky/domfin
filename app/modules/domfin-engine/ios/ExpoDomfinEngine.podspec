# Domfin's engine (api/mobile) inside the iOS app. DomfinEngine.xcframework
# isn't in git: build.sh makes it with gomobile.
Pod::Spec.new do |s|
  s.name           = 'ExpoDomfinEngine'
  s.version        = '0.1.0'
  s.summary        = "Runs Domfin's engine inside the app"
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Domfin'
  s.homepage       = 'https://github.com/powky/domfin'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/powky/domfin.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.vendored_frameworks = 'DomfinEngine.xcframework'
  # Go's TLS checks certificates (BCRD, GitHub) with the system's.
  s.frameworks = 'Security', 'CoreFoundation'

  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
