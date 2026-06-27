// SVGO config for the ExoJS brand assets (site/public/brand/) and favicons.
// Keeps viewBox + currentColor + accessibility hooks; strips fixed dimensions
// so embedded SVGs scale to their box.
//
// Regenerate (see site/public/brand/README.md for the full recipe):
//   for f in <masters>/*.svg; do
//     npx svgo --multipass --config svgo.config.mjs -i "$f" -o "site/public/brand/$(basename "$f")"
//   done
// Favicons are rasterised from site/public/brand/mark-e-dot-dark.svg via
// ImageMagick (a 1024 master -> 512/192/180/96 PNGs + a 48/32/16 .ico).
export default {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          removeUnknownsAndDefaults: false,
        },
      },
    },
    'removeDimensions',
    'sortAttrs',
  ],
};
