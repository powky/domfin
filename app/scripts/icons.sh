#!/usr/bin/env bash
# Draws the app's icons from its logo (LogoMark in src/components/brand/Logo.tsx:
# an orange circle with a white sail, 32 units wide): the iOS icon, Android's
# adaptive and monochrome layers, the splash image and the favicon. Run it
# again when the logo changes. Needs rsvg-convert (librsvg) and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/../assets"

orange='#E8622C' # palette.orange[500], the app's accent
sail='M7 22.5c3.2-.2 5.6-1.3 7.4-3.4 2-2.4 2.8-5.6 3.1-10.1 2.4 2.6 4.5 6.5 5.1 10.2.3 1.3.9 2.5 2.4 3.3H7Z'
circle="<circle cx=\"16\" cy=\"16\" r=\"16\" fill=\"$orange\"/>"
white="<path d=\"$sail\" fill=\"#FFFFFF\"/>"

# draw FILE SIZE VIEWBOX SHAPES renders the shapes, square, at SIZE pixels.
draw() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>' "$3" "$4" |
    rsvg-convert --width "$2" --height "$2" --output "$1"
}

# iOS, and Android before adaptive icons: orange to the edges (the system
# rounds the corners) and the sail as big as in the logo. No transparency.
draw icon.png 1024 '0 0 32 32' "<rect width=\"32\" height=\"32\" fill=\"$orange\"/>$white"
magick icon.png -alpha off icon.png

# Android's layers are 108 dp, of which the middle 72 show and the middle 66
# never get cut: the logo's 32 units take the 72 dp that show, and the sail
# reaches 25 dp from the center, inside the 33 of the safe zone. The
# background is backgroundColor in app.json.
draw android-icon-foreground.png 1024 '-8 -8 48 48' "$white"
# Android 13 tints this one to the user's theme: only its shape counts.
draw android-icon-monochrome.png 1024 '-8 -8 48 48' "$white"

# The splash: the logo as in the app, on the app's background (app.json),
# within the middle two thirds, the circle Android 12 crops it to.
draw splash-icon.png 1024 '-8 -8 48 48' "$circle$white"

# The browser tab.
draw favicon.png 48 '0 0 32 32' "$circle$white"
