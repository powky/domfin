#!/usr/bin/env bash
# Draws the app's icons from its logo (LogoMark in src/components/brand/Logo.tsx:
# a white D with a peak for its hole, on an orange square with rounded corners,
# 32 units wide): the iOS icon, Android's adaptive and monochrome layers, the
# splash image, and the web's favicon and home screen icons. Run it again when
# the logo changes. Needs rsvg-convert (librsvg) and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."

orange='#E8622C' # palette.orange[500], the logo's color (colors.brand.mark)
letter='M10.1 7.5H16a8.5 8.5 0 0 1 0 17h-5.9a1.6 1.6 0 0 1-1.6-1.6V9.1a1.6 1.6 0 0 1 1.6-1.6ZM12.8 19.58a.8.8 0 0 0 .73 1.12h6.14a.8.8 0 0 0 .73-1.12l-3.07-6.93a.8.8 0 0 0-1.46 0Z'
square="<rect width=\"32\" height=\"32\" rx=\"8\" fill=\"$orange\"/>"
full="<rect width=\"32\" height=\"32\" fill=\"$orange\"/>"
white="<path d=\"$letter\" fill-rule=\"evenodd\" fill=\"#FFFFFF\"/>"

# draw FILE SIZE VIEWBOX SHAPES renders the shapes, square, at SIZE pixels.
draw() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>' "$3" "$4" |
    rsvg-convert --width "$2" --height "$2" --output "$1"
}

# iOS, and Android before adaptive icons: orange to the edges (the system
# rounds the corners) and the D as big as in the logo. No transparency.
draw assets/icon.png 1024 '0 0 32 32' "$full$white"
magick assets/icon.png -alpha off -define png:exclude-chunks=date,time assets/icon.png

# Android's layers are 108 dp, of which the middle 72 show and the middle 66
# never get cut: the logo's 32 units take the 72 dp that show, and the D
# reaches 24 dp from the center, inside the 33 of the safe zone. The
# background is backgroundColor in app.json.
draw assets/android-icon-foreground.png 1024 '-8 -8 48 48' "$white"
# Android 13 tints this one to the user's theme: only its shape counts.
draw assets/android-icon-monochrome.png 1024 '-8 -8 48 48' "$white"

# The splash: the logo as in the app, on the app's background (app.json).
# Android 12 crops it to the circle in its middle two thirds, 20 units from
# the center here: the square's corners reach 19.3.
draw assets/splash-icon.png 1024 '-14 -14 60 60' "$square$white"

# The browser tab: 32 and 48 pixels from the logo, and 16 drawn on its own
# pixel grid, where the logo scaled down blurs (the D bigger, its stem two
# whole pixels wide).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
draw "$tmp/16.png" 16 '0 0 16 16' "<rect width=\"16\" height=\"16\" rx=\"3.5\" fill=\"$orange\"/><path d=\"M4 3h4.5a5 5 0 0 1 0 10H4ZM6 11h5L8.5 6Z\" fill-rule=\"evenodd\" fill=\"#FFFFFF\"/>"
draw "$tmp/32.png" 32 '0 0 32 32' "$square$white"
draw "$tmp/48.png" 48 '0 0 32 32' "$square$white"
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" public/favicon.ico

# A home screen or the Dock (Safari's "Add to Dock", installing from Chrome):
# iOS and macOS round the corners themselves, like the app's icon; the
# manifest's maskable one keeps the D inside the middle circle that every
# shape shows (12.8 units from the center; the D reaches 10.7).
draw public/apple-touch-icon.png 180 '0 0 32 32' "$full$white"
magick public/apple-touch-icon.png -alpha off -define png:exclude-chunks=date,time public/apple-touch-icon.png
draw public/icon-192.png 192 '0 0 32 32' "$square$white"
draw public/icon-512.png 512 '0 0 32 32' "$square$white"
draw public/icon-maskable.png 512 '0 0 32 32' "$full$white"
