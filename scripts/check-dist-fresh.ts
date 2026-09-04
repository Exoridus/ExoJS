/**
 * Refuse to run a dist-consuming step against a stale build.
 *
 * The site build, the example smoke and the full-bundle export check all read
 * `dist/` (Core) and `packages/exojs-*\/dist/` (extensions) rather than the
 * sources. After a pull or a local edit those artifacts silently lag behind:
 * the site bundles an engine without the new export, the smoke reports a
 * black canvas with no error, the export check names a symbol the package
 * "does not export". Each of those wasted a diagnosis before this check
 * existed.
 *
 * Every build records a content hash of its source tree in its dist (see
 * `source-hash.ts`); a unit is stale when the hash of the sources on disk no
 * longer matches. A Core dist without a stamp is stale; a package that was
 * never built is left to the consuming step's own error. Set
 * `EXOJS_SKIP_DIST_CHECK=1` to bypass.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashSourceTree, readSourceStamp } from './source-hash.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface BuildUnit {
  readonly name: string;
  readonly sourceDir: string;
  readonly distDir: string;
}

const TOOLING_PACKAGES = new Set(['exojs-build', 'exojs-config', 'exojs-bench', 'exojs-examples']);

const units: BuildUnit[] = [{ name: '@codexo/exojs', sourceDir: join(root, 'src'), distDir: join(root, 'dist') }];

for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('exojs-')) continue;

  const dir = join(root, 'packages', entry.name);
  const sourceDir = join(dir, 'src');
  const distDir = join(dir, 'dist');

  // Only runtime extension packages build through the shared library pipeline;
  // tooling, config, the bench harness and the site own their outputs and are
  // never bundled by the checks.
  if (
    TOOLING_PACKAGES.has(entry.name) ||
    !existsSync(sourceDir) ||
    !existsSync(join(dir, 'tsconfig.build.json')) ||
    !existsSync(join(distDir, 'esm', 'index.js'))
  )
    continue;

  units.push({ name: `@codexo/${entry.name}`, sourceDir, distDir });
}

if (process.env['EXOJS_SKIP_DIST_CHECK'] === '1') {
  console.log('check-dist-fresh: skipped (EXOJS_SKIP_DIST_CHECK=1).');
  process.exit(0);
}

const stale: string[] = [];

for (const unit of units) {
  const recorded = readSourceStamp(unit.distDir);

  if (recorded === null) {
    stale.push(`${unit.name}: ${relative(root, unit.distDir)} carries no source stamp (built before stamps existed, or not at all)`);
  } else if (recorded !== hashSourceTree(unit.sourceDir)) {
    stale.push(`${unit.name}: ${relative(root, unit.sourceDir)} changed since ${relative(root, unit.distDir)} was built`);
  }
}

if (stale.length === 0) {
  console.log(`check-dist-fresh: ${units.length} build unit(s) up to date.`);
  process.exit(0);
}

console.error('check-dist-fresh: dist is older than its sources; the step you are about to run would use a stale build.\n');

for (const line of stale) console.error(`  - ${line}`);

console.error('\nRebuild with: pnpm build && pnpm -r --filter "@codexo/exojs-*" --filter "!@codexo/exojs-examples" build');
process.exit(1);
