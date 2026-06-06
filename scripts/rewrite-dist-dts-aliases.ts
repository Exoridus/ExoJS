/**
 * Post-build step: rewrite `@/` path-alias imports in the emitted declaration
 * files under `dist/esm` to relative specifiers.
 *
 * Why this is needed: the bundled `.js` output already resolves `@/` (rollup +
 * @rollup/plugin-node-resolve), but @rollup/plugin-typescript emits the
 * declaration files with the original `@/` aliases verbatim. A consumer has no
 * `@/` mapping in its tsconfig, so those imports do not resolve and the type
 * inheritance chain collapses — e.g. `Graphics extends Container` (imported as
 * `@/rendering/Container`) resolves to nothing, so inherited members like
 * `setPosition`/`rotate` silently disappear from the public types. `tsc`
 * against the published package then reports `Property 'setPosition' does not
 * exist on type 'Graphics'`. `skipLibCheck` does NOT help: this is a module
 * resolution failure, not a declaration-checking error.
 *
 * The mapping is mechanical: `@/*` maps to `src/*` (tsconfig `paths`) and
 * `dist/esm` mirrors `src` (rollup `preserveModulesRoot: 'src'`), so `@/A/B`
 * lives at `dist/esm/A/B`. We emit extensionless relative specifiers to match
 * the relative re-exports tsc already emits in `dist/esm/index.d.ts`, which the
 * `bundler` module resolution used by the starter templates resolves directly.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ESM_DIR = resolve(import.meta.dirname, '..', 'dist', 'esm');

// Matches `from '@/<path>'` import/export clauses. The build only ever emits
// this single shape (verified: no double-quoted or inline `import('@/…')`).
const ALIAS_RE = /(from\s*')@\/([^']+)(')/g;

function collectDeclarations(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectDeclarations(full));
    else if (full.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** `@/A/B` → extensionless relative specifier from `fromFile` to `dist/esm/A/B`. */
function toRelativeSpecifier(fromFile: string, aliasPath: string): string {
  const target = join(ESM_DIR, aliasPath);
  let rel = relative(dirname(fromFile), target).replaceAll('\\', '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

const files = collectDeclarations(ESM_DIR);
let rewrittenFiles = 0;
let rewrittenSpecifiers = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  let fileCount = 0;
  const output = source.replace(ALIAS_RE, (_match, prefix: string, aliasPath: string, suffix: string) => {
    fileCount++;
    return `${prefix}${toRelativeSpecifier(file, aliasPath)}${suffix}`;
  });

  if (fileCount > 0) {
    writeFileSync(file, output);
    rewrittenFiles++;
    rewrittenSpecifiers += fileCount;
  }
}

console.log(`rewrite-dist-dts-aliases: rewrote ${rewrittenSpecifiers} '@/' specifier(s) across ${rewrittenFiles} declaration file(s).`);

if (rewrittenSpecifiers === 0) {
  // The declaration emit has always shipped `@/` aliases; zero rewrites means
  // the emit changed (or this step ran before the build) and needs review.
  console.warn("rewrite-dist-dts-aliases: no '@/' specifiers found — verify the declaration emit still aliases.");
}
