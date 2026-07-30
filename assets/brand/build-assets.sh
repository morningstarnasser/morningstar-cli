#!/usr/bin/env bash
set -euo pipefail

brand_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$brand_dir"

command -v magick >/dev/null
python3 generate-wordmarks.py

mkdir -p png proof
for size in 16 32 48 64 128 256 512 1024; do
  magick -background none -density 384 favicon.svg -resize "${size}x${size}" "png/logo-${size}.png"
done

magick png/logo-16.png png/logo-32.png png/logo-48.png favicon.ico
magick -background none -density 384 favicon.svg -resize 180x180 apple-touch-icon.png
magick -background none -density 384 favicon.svg -resize 192x192 icon-192.png
magick -background none -density 384 favicon.svg -resize 512x512 icon-512.png

magick -size 1200x630 "xc:#11100E" \
  \( +size -background none -density 384 wordmark-dark.svg -resize 760x180 \) \
  -gravity center -composite og-logo.png

magick -size 360x280 "xc:#F7F1E7" \
  \( +size -background none -density 384 logo-light.svg -resize 176x176 \) \
  -gravity center -composite proof/light.png
magick -size 360x280 "xc:#11100E" \
  \( +size -background none -density 384 logo-dark.svg -resize 176x176 \) \
  -gravity center -composite proof/dark.png
magick -size 360x280 "xc:#FFFFFF" \
  \( +size -background none -density 384 logo-mono.svg -resize 176x176 \) \
  -gravity center -composite proof/mono.png
magick -size 360x280 "xc:#11100E" \
  \( +size -background none -density 384 wordmark-dark.svg -resize 320x90 \) \
  -gravity center -composite proof/wordmark-dark.png
magick -size 360x280 "xc:#F7F1E7" \
  \( +size -background none -density 384 wordmark-light.svg -resize 320x90 \) \
  -gravity center -composite proof/wordmark-light.png
magick montage proof/light.png proof/dark.png proof/mono.png \
  proof/wordmark-light.png proof/wordmark-dark.png \
  -background "#D7D0C5" -geometry +14+14 -tile 3x2 proof/contact-sheet.png

magick -size 420x180 "xc:#F7F1E7" \
  png/logo-16.png -geometry +34+74 -composite \
  png/logo-32.png -geometry +100+66 -composite \
  png/logo-64.png -geometry +190+50 -composite \
  png/logo-16.png -filter point -resize 128x128 -geometry +282+26 -composite \
  proof/micro-scale.png
