# ExoJS brand assets

Optimised SVG brand assets, served from `/ExoJS/brand/`. Masters are kept
outside the repo (design source); these are the SVGO-optimised web copies.

## Marks (icon)

| File | Use |
| --- | --- |
| `mark-e-dot.svg` | Default mark (transparent). |
| `mark-e-dot-dark.svg` | Contained on a dark rounded tile — the **favicon source** (the bare mark can vanish on light browser chrome). |
| `mark-e-dot-light.svg` | Contained on a light tile. |
| `mark-e-dot-mono.svg` | Single-colour (`currentColor`). |

## Wordmarks

| File | Use |
| --- | --- |
| `wordmark-exo-dot-js.svg` / `-mono.svg` | `exo.js` lockup. |
| `wordmark-ExoJS.svg` / `-mono.svg` | `ExoJS` lockup. |
| `wordmark-ExoJS-limeJS.svg` | `ExoJS` with the lime `JS`. |

## Favicons (generated, in `site/public/`)

`favicon.svg`, `favicon.ico` (48/32/16), `favicon-96x96.png`,
`apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` — all rasterised
from `mark-e-dot-dark.svg`. The `<link>` tags live in `site/src/layouts/AppShell.astro`;
the PWA `icon-192/512` are referenced (relative) from `site/public/site.webmanifest`.

## Regenerate

Optimise the SVGs (from the design masters) with the repo-root `svgo.config.mjs`:

```sh
for f in <masters>/*.svg; do
  npx svgo --multipass --config svgo.config.mjs -i "$f" -o "site/public/brand/$(basename "$f")"
done
```

Rasterise the favicons from the dark mark with ImageMagick (RSVG delegate):

```sh
magick -background none -density 1536 site/public/brand/mark-e-dot-dark.svg -resize 1024x1024 /tmp/icon-1024.png
magick /tmp/icon-1024.png -resize 512x512 site/public/icon-512.png
magick /tmp/icon-1024.png -resize 192x192 site/public/icon-192.png
magick /tmp/icon-1024.png -resize 180x180 site/public/apple-touch-icon.png
magick /tmp/icon-1024.png -resize 96x96   site/public/favicon-96x96.png
magick /tmp/icon-1024.png -define icon:auto-resize=48,32,16 site/public/favicon.ico
cp site/public/brand/mark-e-dot-dark.svg site/public/favicon.svg
```
