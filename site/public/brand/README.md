# ExoJS brand assets

Optimised SVG brand assets, served from `/ExoJS/brand/`. Masters are kept outside the repository; these are the SVGO-optimised web copies.

## Marks (icon)

| File                  | Use                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `mark-e-dot.svg`      | Default transparent mark.                                                                                  |
| `mark-e-dot-dark.svg` | Mark on a dark rounded tile and the favicon source; the bare mark can disappear against light browser UI. |
| `mark-e-dot-light.svg` | Mark on a light tile.                                                                                      |
| `mark-e-dot-mono.svg` | Single-colour mark using `currentColor`.                                                                   |

## Wordmarks

| File                                     | Use                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| `wordmark-exo-dot-js.svg` / `-mono.svg`  | `exo.js` lockup.                                     |
| `wordmark-ExoJS.svg` / `-mono.svg`       | `ExoJS` lockup; the default uses lime-colour `JS`.   |

## Favicons

Generated files live in `site/public/`: `favicon.svg`, `favicon.ico` (48/32/16), `favicon-96x96.png`, `apple-touch-icon.png` (180), `icon-192.png`, and `icon-512.png`. All are rasterised from `mark-e-dot-dark.svg`.

The corresponding `<link>` elements live in `site/src/layouts/AppShell.astro`. The PWA icons are referenced with relative paths from `site/public/site.webmanifest`.

## Regenerate

Optimise SVGs from the design masters with this directory's `svgo.config.js`:

```sh
for f in <masters>/*.svg; do
  npx svgo --multipass --config site/public/brand/svgo.config.js -i "$f" -o "site/public/brand/$(basename "$f")"
done
```

Rasterise the favicons from the dark mark with ImageMagick and its RSVG delegate. This PowerShell example keeps the intermediate image in the platform's temporary directory:

```powershell
$icon = Join-Path ([System.IO.Path]::GetTempPath()) 'exojs-icon-1024.png'

magick -background none -density 1536 site/public/brand/mark-e-dot-dark.svg -resize 1024x1024 $icon
magick $icon -resize 512x512 site/public/icon-512.png
magick $icon -resize 192x192 site/public/icon-192.png
magick $icon -resize 180x180 site/public/apple-touch-icon.png
magick $icon -resize 96x96 site/public/favicon-96x96.png
magick $icon -define icon:auto-resize=48,32,16 site/public/favicon.ico
Copy-Item site/public/brand/mark-e-dot-dark.svg site/public/favicon.svg

Remove-Item -LiteralPath $icon
```
