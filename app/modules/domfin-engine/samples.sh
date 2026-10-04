#!/usr/bin/env bash
# Puts made-up statements in the Files app of the open iOS simulator, in
# On My iPhone > Domfin, to import them in the app: a card, a scanned savings
# account (it goes through the OCR), a loan and a certificate.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
if [ -x "$root/.tools/go/bin/go" ]; then PATH="$root/.tools/go/bin:$PATH"; fi
command -v go >/dev/null || { echo "Falta Go: corre ./domfin setup o instálalo." >&2; exit 1; }

udid="$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1 || true)"
if [ -z "$udid" ]; then
  echo "No hay un simulador abierto: arranca la app con npx expo run:ios." >&2
  exit 1
fi

# On My iPhone is the storage of Files' own group.
storage=""
for group in "$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Containers/Shared/AppGroup"/*/; do
  meta="$group.com.apple.mobile_container_manager.metadata.plist"
  if [ "$(plutil -extract MCMMetadataIdentifier raw "$meta" 2>/dev/null)" = group.com.apple.FileProvider.LocalStorage ]; then
    storage="${group}File Provider Storage"
  fi
done
if [ -z "$storage" ]; then
  echo "Abre la app Archivos del simulador una vez y vuelve a correr esto." >&2
  exit 1
fi

mkdir -p "$storage/Domfin"
(cd "$root/api" && DOMFIN_SAMPLES="$storage/Domfin" go test ./mobile -run TestWriteSamples -count=1 >/dev/null)
echo "Listo: Archivos > En mi iPhone > Domfin tiene 4 estados de ejemplo."
