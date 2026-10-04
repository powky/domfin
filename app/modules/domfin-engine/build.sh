#!/usr/bin/env bash
# Builds Domfin's engine (api/mobile) for iOS, devices and simulators, into
# ios/DomfinEngine.xcframework, with gomobile. The iOS build runs it before
# compiling the app (ExpoDomfinEngine.podspec), so the app always carries
# the engine of the Go code next to it: when nothing in api/ changed since
# the last time, it does nothing.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
framework="$here/ios/DomfinEngine.xcframework"

changed="$(find "$root/api" \( -name '*.go' -o -name go.mod -o -name go.sum \) -newer "$framework/Info.plist" -print -quit 2>/dev/null || echo api)"
if [ -f "$framework/Info.plist" ] && [ -z "$changed" ]; then
  echo "El motor de Domfin ya estaba al día."
  exit 0
fi

# Xcode runs this with a short PATH: look for Go where it usually is, the
# repo's own (./domfin setup) first.
PATH="$root/.tools/go/bin:$PATH:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin"
command -v go >/dev/null || { echo "error: falta Go para compilar el motor de Domfin: corre ./domfin setup o instálalo." >&2; exit 1; }
gobin="$root/.tools/bin"

# A clean environment: Xcode's (SDKROOT, ARCHS…) would get in gomobile's way.
cd "$root/api"
env -i HOME="$HOME" PATH="$gobin:$PATH" GOBIN="$gobin" LANG=en_US.UTF-8 \
  sh -c 'go install tool && rm -rf "$1" && gomobile bind -target=ios -iosversion=16.4 -trimpath -ldflags="-s -w" -o "$1" ./mobile' \
  _ "$framework"
echo "Listo: el motor de Domfin quedó en $framework"
