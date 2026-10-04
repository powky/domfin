#!/usr/bin/env bash
# Builds Domfin's engine (api/mobile) for iOS, devices and simulators, into
# ios/DomfinEngine.xcframework, with gomobile. Run it again when the API
# changes, then rebuild the app (npx expo run:ios).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"

# The repo's Go (./domfin setup) when there is one, and gomobile next to it.
if [ -x "$root/.tools/go/bin/go" ]; then PATH="$root/.tools/go/bin:$PATH"; fi
command -v go >/dev/null || { echo "Falta Go: corre ./domfin setup o instálalo." >&2; exit 1; }
export GOBIN="$root/.tools/bin"
PATH="$GOBIN:$PATH"
cd "$root/api"
go install tool # gomobile and gobind, at the version api/go.mod pins

rm -rf "$here/ios/DomfinEngine.xcframework"
gomobile bind -target=ios -iosversion=16.4 -trimpath -ldflags="-s -w" \
  -o "$here/ios/DomfinEngine.xcframework" ./mobile
echo "Listo: $here/ios/DomfinEngine.xcframework"
