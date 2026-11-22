import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * Narrows the core unit project to the tests that can observe a change.
 *
 * Vitest's own module graph (`--changed`) already resolves aliases, package
 * `imports`, re-exports, static imports and literal dynamic imports through the
 * same Vite pipeline the tests run with, so no second graph is built here. What
 * the graph cannot see is input a test reads without importing it. Those tests
 * are kept unconditionally, and any change outside the shapes below keeps the
 * whole project.
 */

/** Extensions of the shader/data modules the graph tracks; a test project proves each one links a change to its importers. */
export const GRAPH_MODULE_EXTENSIONS = ['vert', 'frag', 'glsl', 'wgsl', 'json'] as const;

/** Modules the graph tracks: sources and the shader/data files the loaders import. */
const GRAPH_EXTENSIONS = new RegExp(`\\.(ts|tsx|${GRAPH_MODULE_EXTENSIONS.join('|')})$`);

/** Declarations carry no runtime edge; their consumers are found through the type-checking gates. */
const DECLARATION = /\.d\.ts$/;

/**
 * Whether the graph can answer for every file in the change: each one sits in
 * `src/` or `test/`, is a module kind the graph tracks, and still exists. A
 * deleted or renamed module leaves no node to follow back to its importers.
 */
export const isRelatedEligible = (files: readonly string[], exists: (file: string) => boolean = existsSync): boolean =>
  files.length > 0 &&
  files.every(file => /^(src|test)\//.test(file) && GRAPH_EXTENSIONS.test(file) && !DECLARATION.test(file) && exists(file));

/** Constructs through which a test consumes files or modules the import graph does not record. */
const UNTRACKED_INPUT = [
  /\bnode:fs\b|\bnode:fs\/promises\b|from\s+['"]fs['"]/,
  /\bnode:child_process\b/,
  /import\.meta\.glob/,
  /\b(?:import|require)\s*\(\s*(?:`[^`]*\$\{|[^'"`\s])/,
  // A query import (`?raw`, `?worker`) is keyed by a module id the changed file's path never matches.
  /(?:from|import\s*\()\s*['"][^'"\n]+\?[^'"\n]+['"]/,
  /process\.cwd\(\)/,
];

export const readsUntrackedInput = (source: string): boolean => UNTRACKED_INPUT.some(pattern => pattern.test(source));

const testFiles = (directory: string, root: string): string[] =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = posix.join(directory, entry.name);

    if (entry.isDirectory()) {
      return testFiles(path, root);
    }

    return entry.name.endsWith('.test.ts') ? [path] : [];
  });

const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"\n]*)['"]/g;

const resolveRelative = (importer: string, specifier: string, root: string): string | undefined => {
  const base = posix.join(posix.dirname(importer.replaceAll('\\', '/')), specifier.replace(/\?.*$/, ''));

  return [base, `${base}.ts`, posix.join(base, 'index.ts')].find(candidate => {
    try {
      return statSync(join(root, candidate)).isFile();
    } catch {
      return false;
    }
  });
};

/**
 * Whether a file, or any module it reaches through relative imports, reads
 * input the graph does not record. A helper that scans the repository makes
 * every test importing it equally blind, so the search follows imports rather
 * than inspecting test files alone.
 */
/** A separate visited set per test avoids caching false negatives while another path is in an import cycle. */
const reachesUntrackedInput = (file: string, root: string, visited: Set<string>): boolean => {
  if (visited.has(file)) {
    return false;
  }

  visited.add(file);

  let source: string;

  try {
    source = readFileSync(join(root, file), 'utf8');
  } catch {
    // An unreadable input cannot safely prove the test independent of the change.
    return true;
  }

  return (
    readsUntrackedInput(source) ||
    [...source.matchAll(RELATIVE_IMPORT)].some(match => {
      const target = resolveRelative(file, match[1]!, root);

      return target !== undefined && target.endsWith('.ts') && reachesUntrackedInput(target, root, visited);
    })
  );
};

/** Core tests that read repository files or resolve modules at run time, directly or through a helper, and so are never skipped. */
export const untrackedInputTests = (root = '.'): string[] =>
  testFiles('test', root)
    .filter(file => reachesUntrackedInput(file, root, new Set<string>()))
    .sort();

/**
 * The core-project commands for a change the graph can answer for: the tests
 * that import any changed file, then the tests that read untracked input.
 * `--passWithNoTests` covers a change no test reaches.
 */
export const relatedCoreCommands = (base: string, root = '.', additionalTests: readonly string[] = []): string[] => {
  const keep = [...new Set([...untrackedInputTests(root), ...additionalTests])];

  return [
    `pnpm exec vitest run --project=exojs --passWithNoTests --changed=${base}`,
    ...(keep.length ? [`pnpm exec vitest run --project=exojs ${keep.join(' ')}`] : []),
  ];
};
