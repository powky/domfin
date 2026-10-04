# Domfin's engine (api/mobile) inside the iOS app. build.sh compiles it from
# api/ into DomfinEngine.xcframework, which isn't in git: here if it's
# missing, and on every build before compiling, when the Go code changed.
build = File.join(__dir__, '..', 'build.sh')
unless File.exist?(File.join(__dir__, 'DomfinEngine.xcframework', 'Info.plist'))
  system(build) or raise 'No se pudo compilar el motor de Domfin (modules/domfin-engine/build.sh)'
end

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
  # CocoaPods copies the framework's slice before this phase runs: after
  # building, it copies it again.
  s.script_phase = {
    :name => 'Build Domfin engine',
    :script => '"${PODS_TARGET_SRCROOT}/../build.sh" && "${PODS_ROOT}/Target Support Files/ExpoDomfinEngine/ExpoDomfinEngine-xcframeworks.sh"',
    :execution_position => :before_compile,
    :always_out_of_date => '1'
  }

  s.source_files = '*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
