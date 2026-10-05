/**
 * Optimises the SVG brand masters into the web copies served from
 * `public/brand/`.
 *
 * Keeps `viewBox`, `currentColor` and the accessibility hooks, and strips fixed
 * dimensions so an embedded SVG scales to the box it is placed in. Favicons are
 * rasterised from the optimised dark mark separately; see `public/brand/README.md`.
 *
 * Usage: `pnpm brand:optimize <masters-dir> [--out <dir>]`
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { type Config, optimize } from 'svgo';

const SITE_ROOT = resolve(import.meta.dirname, '..');

const BRAND_SVGO_CONFIG: Config = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeUnknownsAndDefaults: false,
        },
      },
    },
    'removeDimensions',
    'sortAttrs',
  ],
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string', default: resolve(SITE_ROOT, 'public/brand') } },
});

const [mastersArgument] = positionals;

if (mastersArgument === undefined) {
  console.error('Usage: pnpm brand:optimize <masters-dir> [--out <dir>]');
  process.exit(1);
}

const mastersDirectory = resolve(mastersArgument);
const outputDirectory = resolve(values.out);
const masters = (await readdir(mastersDirectory)).filter(name => name.endsWith('.svg')).sort();

if (masters.length === 0) {
  console.error(`No .svg files found in ${mastersDirectory}.`);
  process.exit(1);
}

await mkdir(outputDirectory, { recursive: true });

for (const master of masters) {
  const source = await readFile(resolve(mastersDirectory, master), 'utf8');
  const { data } = optimize(source, { ...BRAND_SVGO_CONFIG, path: master });

  await writeFile(resolve(outputDirectory, basename(master)), data);
  console.log(`[brand:optimize] ${master}: ${source.length} -> ${data.length} bytes`);
}
