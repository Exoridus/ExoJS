/**
 * Fails when a published `.d.ts` imports a module a consumer cannot resolve.
 *
 * The shader and inline-source imports (`.vert`, `.frag`, `.wgsl`, `?worklet`,
 * `?worker`) only resolve where a build plugin loads them as strings and an
 * ambient declaration gives them a shape. Neither travels with the package, so
 * a declaration file that names one type-checks here and fails in every
 * consumer's `tsc` - a failure the repository's own gates cannot see, because
 * they never read the emitted declarations the way a consumer does. The private
 * `@codexo/exojs-config` package is unresolvable for the plainer reason that it
 * is never published.
 *
 * Such an import reaches the emit when a value loaded from one of those
 * modules is re-exported: the declaration then has to name where the type came
 * from. Marking the export `@internal` is not enough on its own - the emit has
 * to be told to drop internals (`stripInternal`).
 *
 * Runs against the built `dist` trees, so they have to exist and be current -
 * the root build covers the core alone, the extension packages build per
 * package. A tree older than its own source is refused rather than judged.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

// Every extension a build plugin resolves in this repository and nothing
// resolves outside it, plus the two inline-source import queries and the
// private tooling config, which is never published and therefore never
// installable next to a consumer's copy of these declarations.
const UNRESOLVABLE_SPECIFIER = /\.(?:vert|frag|glsl|wgsl|comp)['"]|\?(?:worklet|worker)['"]|@codexo\/exojs-config/;
const IMPORT_LINE = /^\s*(?:import|export)\b[^\n]*from\s*['"][^'"]+['"]/;

interface DeclarationRoot {
  /** The dist tree to scan. */
  readonly dist: string;
  /** The source tree it is built from, used to tell a stale tree from a fresh one. */
  readonly src: string;
}

/** Declaration trees to scan: the core package plus every extension package. */
const declarationRoots = (): DeclarationRoot[] => {
  const roots: DeclarationRoot[] = [{ dist: join(REPO_ROOT, 'dist'), src: join(REPO_ROOT, 'src') }];
  const packagesDir = join(REPO_ROOT, 'packages');

  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      roots.push({ dist: join(packagesDir, entry.name, 'dist'), src: join(packagesDir, entry.name, 'src') });
    }
  }

  return roots.filter(root => existsSync(root.dist));
};

/** Newest mtime under `dir`, or 0 when it does not exist. */
const newestMtime = (dir: string): number => {
  if (!existsSync(dir)) return 0;

  let newest = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }

  return newest;
};

const declarationFiles = (dir: string): string[] => {
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
};

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

// Only trees that actually carry declarations are this gate's business; a
// package that publishes plain JS (the app scaffolder) has nothing to judge.
const declarationTrees = roots.map(root => ({ ...root, files: declarationFiles(root.dist) })).filter(root => root.files.length > 0);

// A tree older than its own source is the one way this gate can report a clean
// run over declarations nobody has emitted yet. `pnpm build` at the repository
// root rebuilds the core only, so a change under `packages/*/src` leaves that
// package's declarations behind and the scan reads the previous release's.
// Refusing to judge is the only honest answer there.
//
// Local only: on CI the trees arrive as a build artifact of an upstream job, so
// freshness is a property of the pipeline rather than of the file times, which
// the artifact download carries over from the upload and are meaningless here.
const stale = process.env.CI
  ? []
  : declarationTrees.filter(root => newestMtime(root.dist) < newestMtime(root.src)).map(root => relative(REPO_ROOT, root.dist).replaceAll('\\', '/'));

if (stale.length > 0) {
  console.error(
    [
      `verify:declaration-imports: ${stale.length} dist tree(s) older than their source:`,
      '',
      ...stale.map(tree => `    ${tree}`),
      '',
      'The declarations these would be judged against are not the ones this source emits.',
      'Rebuild them first - the extension packages are built per package, not by the root build.',
    ].join('\n'),
  );
  process.exit(1);
}

const violations: Violation[] = [];
let scanned = 0;

for (const { files } of declarationTrees) {
  for (const file of files) {
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

console.log(
  `verify:declaration-imports: ${scanned} declaration file(s) scanned across ${declarationTrees.length} dist tree(s), all imports resolvable by a consumer.`,
);
