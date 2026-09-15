#!/usr/bin/env bash
# Regenerate all PWA/iOS/favicon image assets from icons/icon.svg.
# Requires: rsvg-convert, ImageMagick (magick). Run from the repo root.
set -euo pipefail

cd "$(dirname "$0")/.."

SVG="icons/icon.svg"

rsvg-convert -w 192 -h 192 "$SVG" -o icons/icon-192.png
rsvg-convert -w 512 -h 512 "$SVG" -o icons/icon-512.png

# Maskable: artwork at 80% (410px) centered on a 512 black canvas.
rsvg-convert -w 410 -h 410 "$SVG" -o icons/.icon-maskable-tmp.png
magick icons/.icon-maskable-tmp.png -gravity center -background black -extent 512x512 icons/icon-maskable-512.png
rm icons/.icon-maskable-tmp.png

# Apple touch icon: 180x180, opaque (no alpha); iOS rounds corners itself.
rsvg-convert -w 180 -h 180 "$SVG" -o icons/.apple-tmp.png
magick icons/.apple-tmp.png -background black -flatten icons/apple-touch-icon.png
rm icons/.apple-tmp.png

rsvg-convert -w 32 -h 32 "$SVG" -o icons/favicon-32.png
rsvg-convert -w 16 -h 16 "$SVG" -o icons/favicon-16.png

# favicon.ico at repo root with 16/32/48 px layers.
rsvg-convert -w 48 -h 48 "$SVG" -o icons/.favicon-48-tmp.png
magick icons/favicon-16.png icons/favicon-32.png icons/.favicon-48-tmp.png favicon.ico
rm icons/.favicon-48-tmp.png
