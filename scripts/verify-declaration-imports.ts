/**
 * Fails when a published `.d.ts` imports a module a consumer cannot resolve.
 *
 * The shader and worklet imports (`.vert`, `.frag`, `.wgsl`, `?worklet`) only
 * resolve inside this repository, where a build plugin loads them as strings
 * and `src/typings.d.ts` declares their shape. Neither travels with the
 * package, so a declaration file that names one type-checks here and fails in
 * every consumer's `tsc` - a failure the repository's own gates cannot see,
 * because they never read the emitted declarations the way a consumer does.
 *
 * Such an import reaches the emit when a value loaded from one of those
 * modules is re-exported: the declaration then has to name where the type came
 * from. Marking the export `@internal` is not enough on its own - the emit has
 * to be told to drop internals (`stripInternal`).
 *
 * Runs against the built `dist` trees, so `pnpm build` has to have run first.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

// Every extension a build plugin resolves in this repository and nothing
// resolves outside it, plus the worklet import query.
const UNRESOLVABLE_SPECIFIER = /\.(?:vert|frag|glsl|wgsl|comp)['"]|\?worklet['"]/;
const IMPORT_LINE = /^\s*(?:import|export)\b[^\n]*from\s*['"][^'"]+['"]/;

/** Declaration trees to scan: the core package plus every extension package. */
function declarationRoots(): string[] {
  const roots = [join(REPO_ROOT, 'dist')];
  const packagesDir = join(REPO_ROOT, 'packages');

  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const dist = join(packagesDir, entry.name, 'dist');

      if (existsSync(dist)) roots.push(dist);
    }
  }

  return roots.filter(root => existsSync(root));
}

function declarationFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...declarationFiles(full));
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }

  return files;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const roots = declarationRoots();

if (roots.length === 0) {
  console.error('verify:declaration-imports: no dist tree found. Run `pnpm build` first.');
  process.exit(1);
}

const violations: Violation[] = [];
let scanned = 0;

for (const root of roots) {
  for (const file of declarationFiles(root)) {
    scanned++;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((text, index) => {
      if (!IMPORT_LINE.test(text) || !UNRESOLVABLE_SPECIFIER.test(text)) return;

      violations.push({ file: relative(REPO_ROOT, file).replaceAll('\\', '/'), line: index + 1, text: text.trim() });
    });
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.text}`);
  }

  console.error(
    [
      '',
      `verify:declaration-imports: ${violations.length} declaration import(s) a consumer cannot resolve, across ${new Set(violations.map(v => v.file)).size} file(s).`,
      '',
      'A shader or worklet module resolves only inside this repository. A published .d.ts that',
      'names one fails every consumer type-check while passing every gate here.',
      '',
      'Resolve it by keeping the value out of the emitted declarations: mark the export `@internal`',
      '(the emit drops internals through `stripInternal`), or give it an explicit `string` type at the',
      'export site so the declaration no longer has to name the module it came from.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`verify:declaration-imports: ${scanned} declaration file(s) scanned across ${roots.length} dist tree(s), all imports resolvable by a consumer.`);
