#!/usr/bin/env bash
# Fits a known merchant's logo (api/internal/merchants) to the app's circular
# avatars: `scripts/merchant-logo.sh <id> <image>` takes the icon the
# merchant publishes on its own site (its apple-touch-icon, the icons of its
# web manifest, a favicon.svg; PNG, JPG, WebP, ICO or SVG) and writes
# assets/merchants/<id>.png, 96 px. An app icon with a color background fills
# the circle; a mark on a transparent or white background goes on white, at
# 76% of the circle. Either way, it then writes the list the app reads
# (src/features/transactions/lib/merchantLogos.ts), which is all it does
# without arguments. Needs ImageMagick and rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/.."

size=96
dir=assets/merchants
list=src/features/transactions/lib/merchantLogos.ts
mkdir -p "$dir"

# fit ID IMAGE writes the merchant's avatar.
fit() {
  local id=$1 source=$2 work
  work=$(mktemp -d)
  trap 'rm -rf "$work"' RETURN

  # The image at its largest: SVGs drawn big, an ICO's biggest picture.
  case "$(printf '%s' "$source" | tr '[:upper:]' '[:lower:]')" in
  *.svg) rsvg-convert --width 512 --keep-aspect-ratio "$source" --output "$work/full.png" ;;
  *.ico)
    local biggest
    biggest=$(magick identify -format '%p %w\n' "$source" | sort -k2 -n | tail -1 | cut -d' ' -f1)
    magick "$source[$biggest]" "$work/full.png"
    ;;
  *) magick "$source[0]" "$work/full.png" ;;
  esac

  # Without its empty margin, what's near its corners tells which it is:
  # color in all four (a square, rounded or not, or a circle) fills the
  # circle, when it's about as tall as wide.
  magick "$work/full.png" -alpha set -bordercolor none -border 1 -fuzz 8% -trim +repage "$work/trimmed.png"
  local side point format='' filled=0 square
  for point in '0.16*w,0.16*h' '0.84*w,0.16*h' '0.16*w,0.84*h' '0.84*w,0.84*h'; do
    format+="%[fx:p{$point}.a > 0.9 && p{$point}.r + p{$point}.g + p{$point}.b < 2.7] "
  done
  for point in $(magick "$work/trimmed.png" -alpha set -format "$format" info:); do
    filled=$((filled + point))
  done
  square=$(magick "$work/trimmed.png" -format '%[fx:w/h > 0.85 && w/h < 1.18]' info:)
  side=$(magick "$work/trimmed.png" -format '%[fx:max(w,h)]' info:)
  if [ "$filled" = 4 ] && [ "$square" = 1 ]; then
    magick "$work/trimmed.png" -resize "${size}x${size}^" -gravity center -extent "${size}x${size}" "$work/out.png"
  else
    # A mark: without the light background that reaches its edges (a
    # gradient too, never what's inside the mark), on white.
    if [ "$filled" != 4 ]; then
      local background
      background=$(magick "$work/trimmed.png" -alpha set -format '%[pixel:p{0,0}]' info:)
      magick "$work/trimmed.png" -alpha set -bordercolor "$background" -border 1 -fuzz 12% -fill none \
        -draw 'color 0,0 floodfill' -shave 1x1 -trim +repage "$work/trimmed.png"
    fi
    local inner=$((size * 76 / 100))
    magick -size "${size}x${size}" xc:white \( "$work/trimmed.png" -resize "${inner}x${inner}" \) \
      -gravity center -composite "$work/out.png"
  fi
  magick "$work/out.png" -background white -alpha remove -alpha off -strip \
    -define png:exclude-chunks=date,time "$dir/$id.png"
  echo "$dir/$id.png (from ${side}px)"
}

if [ $# -eq 2 ]; then
  fit "$1" "$2"
elif [ $# -ne 0 ]; then
  echo "usage: scripts/merchant-logo.sh [<id> <image>]" >&2
  exit 2
fi

{
  echo "import type { ImageSourcePropType } from 'react-native';"
  echo
  echo '/**'
  echo " * The logos of domfin-api's known merchants (api/internal/merchants), by"
  echo ' * its id for them: the icon each one publishes on its site or for its app,'
  echo ' * fitted to a circle by scripts/merchant-logo.sh, which also writes this list.'
  echo ' */'
  echo 'export const merchantLogos: Readonly<Record<string, ImageSourcePropType>> = {'
  for file in "$dir"/*.png; do
    [ -e "$file" ] || continue
    id=$(basename "$file" .png)
    key=$id
    case "$id" in *[!a-z0-9]*) key="'$id'" ;; esac
    echo "  $key: require('../../../../assets/merchants/$id.png'),"
  done
  echo '};'
} >"$list"
echo "$list: $(find "$dir" -name '*.png' | wc -l | tr -d ' ') logos"
