#!/usr/bin/env bash
# Draws the app's icons from its logo (LogoMark in src/components/brand/Logo.tsx:
# a white D with a peak for its hole, on an orange square with rounded corners,
# 32 units wide): the iOS icon, Android's adaptive and monochrome layers, the
# splash image and the favicon. Run it again when the logo changes. Needs
# rsvg-convert (librsvg) and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/../assets"

orange='#E8622C' # palette.orange[500], the logo's color (colors.brand.mark)
letter='M10.1 7.5H16a8.5 8.5 0 0 1 0 17h-5.9a1.6 1.6 0 0 1-1.6-1.6V9.1a1.6 1.6 0 0 1 1.6-1.6ZM12.8 19.58a.8.8 0 0 0 .73 1.12h6.14a.8.8 0 0 0 .73-1.12l-3.07-6.93a.8.8 0 0 0-1.46 0Z'
square="<rect width=\"32\" height=\"32\" rx=\"8\" fill=\"$orange\"/>"
white="<path d=\"$letter\" fill-rule=\"evenodd\" fill=\"#FFFFFF\"/>"

# draw FILE SIZE VIEWBOX SHAPES renders the shapes, square, at SIZE pixels.
draw() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>' "$3" "$4" |
    rsvg-convert --width "$2" --height "$2" --output "$1"
}

# iOS, and Android before adaptive icons: orange to the edges (the system
# rounds the corners) and the D as big as in the logo. No transparency.
draw icon.png 1024 '0 0 32 32' "<rect width=\"32\" height=\"32\" fill=\"$orange\"/>$white"
magick icon.png -alpha off -define png:exclude-chunks=date,time icon.png

# Android's layers are 108 dp, of which the middle 72 show and the middle 66
# never get cut: the logo's 32 units take the 72 dp that show, and the D
# reaches 24 dp from the center, inside the 33 of the safe zone. The
# background is backgroundColor in app.json.
draw android-icon-foreground.png 1024 '-8 -8 48 48' "$white"
# Android 13 tints this one to the user's theme: only its shape counts.
draw android-icon-monochrome.png 1024 '-8 -8 48 48' "$white"

# The splash: the logo as in the app, on the app's background (app.json).
# Android 12 crops it to the circle in its middle two thirds, 20 units from
# the center here: the square's corners reach 19.3.
draw splash-icon.png 1024 '-14 -14 60 60' "$square$white"

# The browser tab.
draw favicon.png 48 '0 0 32 32' "$square$white"
