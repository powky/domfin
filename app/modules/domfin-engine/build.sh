#!/usr/bin/env bash
# Builds Domfin's engine (api/mobile) with gomobile, for iOS (`build.sh ios`,
# the default: ios/DomfinEngine.xcframework) or Android (`build.sh android
# [abis]`: android/libs/domfin-engine.jar and its native libraries in
# android/src/main/jniLibs, for the comma-separated ABIs, arm64-v8a and
# x86_64 if none). The app's build runs it (the pod for iOS,
# android/build.gradle for Android, with the app's own ABIs), so the app
# always carries the engine of the Go code next to it: when nothing in api/
# changed, it does nothing.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
platform="${1:-ios}"
abis="${2:-arm64-v8a,x86_64}"

case "$platform" in
  ios) stamp="$here/ios/DomfinEngine.xcframework/Info.plist" ;;
  android) stamp="$here/android/libs/abis" ;;
  *) echo "error: build.sh ios|android [abis]" >&2; exit 2 ;;
esac
changed="$(find "$root/api" \( -name '*.go' -o -name go.mod -o -name go.sum \) -newer "$stamp" -print -quit 2>/dev/null || echo api)"
# Android also rebuilds when the app asks for other ABIs.
if [ "$platform" = android ] && [ "$(cat "$stamp" 2>/dev/null)" != "$abis" ]; then changed=abis; fi
if [ -f "$stamp" ] && [ -z "$changed" ]; then
  echo "El motor de Domfin para $platform ya estaba al día."
  exit 0
fi

# Xcode and Gradle run this with a short PATH: look for Go where it usually
# is, the repo's own (./domfin setup) first.
PATH="$root/.tools/go/bin:$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin"
command -v go >/dev/null || { echo "error: falta Go para compilar el motor de Domfin: corre ./domfin setup o instálalo." >&2; exit 1; }
gobin="$root/.tools/bin"
cd "$root/api"

# A clean environment: Xcode's (SDKROOT, ARCHS…) and Gradle's would get in
# gomobile's way.
run() {
  env -i HOME="$HOME" PATH="$gobin:$PATH" GOBIN="$gobin" LANG=en_US.UTF-8 \
    ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-}" "$@"
}
run go install tool # gomobile and gobind, at the version api/go.mod pins

if [ "$platform" = ios ]; then
  rm -rf "$here/ios/DomfinEngine.xcframework"
  run gomobile bind -target=ios -iosversion=16.4 -trimpath -ldflags="-s -w" \
    -o "$here/ios/DomfinEngine.xcframework" ./mobile
  echo "Listo: el motor de Domfin para iOS quedó en ios/DomfinEngine.xcframework"
  exit 0
fi

# Android: one gomobile target per ABI the app is built for. The .aar is
# unpacked into a jar and native libraries, which an Expo module can carry (a
# library can't depend on a local .aar).
targets=""
for abi in ${abis//,/ }; do
  case "$abi" in
    armeabi-v7a) target=android/arm ;;
    arm64-v8a) target=android/arm64 ;;
    x86) target=android/386 ;;
    x86_64) target=android/amd64 ;;
    *) echo "error: ABI desconocida: $abi" >&2; exit 2 ;;
  esac
  targets="${targets:+$targets,}$target"
done
ndk="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/ndk/*/ 2>/dev/null | sort -V | tail -1)"
[ -n "${ANDROID_NDK_HOME:-}" ] || ANDROID_NDK_HOME="${ndk%/}"
[ -n "$ANDROID_NDK_HOME" ] || { echo "error: falta el NDK de Android (Android Studio → SDK Manager → NDK)." >&2; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
run gomobile bind -target="$targets" -androidapi 24 -trimpath -ldflags="-s -w" \
  -o "$work/engine.aar" ./mobile
(cd "$work" && unzip -q engine.aar -d aar)
rm -rf "$here/android/libs" "$here/android/src/main/jniLibs"
mkdir -p "$here/android/libs" "$here/android/src/main"
cp -R "$work/aar/jni" "$here/android/src/main/jniLibs"
cp "$work/aar/classes.jar" "$here/android/libs/domfin-engine.jar"
echo "$abis" >"$here/android/libs/abis"
echo "Listo: el motor de Domfin para Android ($abis) quedó en android/libs y android/src/main/jniLibs"
