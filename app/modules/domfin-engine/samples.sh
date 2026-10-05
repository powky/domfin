#!/usr/bin/env bash
# Puts made-up statements where the app's picker finds them: a card, a
# scanned savings account (it goes through the OCR), a loan and a
# certificate. `samples.sh` (or `samples.sh ios`) leaves them in the Files
# app of the open iOS simulator, in On My iPhone > Domfin; `samples.sh
# android`, in Download/Domfin of the open Android emulator or phone.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
if [ -x "$root/.tools/go/bin/go" ]; then PATH="$root/.tools/go/bin:$PATH"; fi
command -v go >/dev/null || { echo "Falta Go: corre ./domfin setup o instálalo." >&2; exit 1; }

write_samples() {
  mkdir -p "$1"
  (cd "$root/api" && DOMFIN_SAMPLES="$1" go test ./mobile -run TestWriteSamples -count=1 >/dev/null)
}

if [ "${1:-ios}" = android ]; then
  adb="$(command -v adb || echo "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb")"
  [ -x "$adb" ] || { echo "Falta adb: instala Android Studio." >&2; exit 1; }
  [ -n "$("$adb" devices | sed 1d | grep -w device || true)" ] || {
    echo "No hay un Android conectado: abre un emulador o conecta el teléfono." >&2
    exit 1
  }
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  write_samples "$work"
  "$adb" shell mkdir -p /sdcard/Download/Domfin
  "$adb" push -q "$work/." /sdcard/Download/Domfin/
  # The file picker lists what the media index knows about: update it.
  "$adb" shell content call --method scan_volume --uri content://media --arg external_primary >/dev/null 2>&1 || true
  echo "Listo: Download/Domfin tiene 4 estados de ejemplo."
  exit 0
fi

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

write_samples "$storage/Domfin"
echo "Listo: Archivos > En mi iPhone > Domfin tiene 4 estados de ejemplo."
