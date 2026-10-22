/**
 * Content hash of a source tree, and the stamp a build leaves in its dist so a
 * later step can tell whether the artifacts still describe the sources.
 *
 * Content rather than modification time: the lint step rewrites shader files
 * in place and restores them, which moves their mtime without changing what
 * the build would produce.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { RUNTIME_MODULES } from './release/lockstep-packages.ts';

// No leading dot: the CI build artifact skips hidden files, and a stamp that
// never reaches the consuming job would fail every dist-consuming lane.
export const SOURCE_STAMP_FILE = 'source-stamp.json';

interface SourceStamp {
  readonly sourceHash: string;
}

const listFiles = (dir: string, out: string[]): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      listFiles(path, out);
    } else if (entry.isFile()) {
      out.push(path);
    }
  }

  return out;
};

/**
 * The source trees the Core `dist/` is built from: Core's own `src/` and the
 * `src/` of every runtime module compiled into it.
 */
export const coreSourceRoots = (repoRoot: string): readonly string[] => [
  resolve(repoRoot, 'src'),
  ...RUNTIME_MODULES.map(module => resolve(repoRoot, module.dir, 'src')),
];

/**
 * Hash every file under `sourceDirs`, by relative path and content, in a stable
 * order. Paths are relative to the single directory, or to the repository root
 * when several trees are hashed together.
 */
export const hashSourceTree = (sourceDirs: string | readonly string[]): string => {
  const dirs = typeof sourceDirs === 'string' ? [sourceDirs] : sourceDirs;
  const base = dirs.length === 1 ? dirs[0]! : resolve(dirs[0]!, '..');
  const hash = createHash('sha1');

  for (const file of dirs.flatMap(dir => listFiles(dir, [])).sort()) {
    hash.update(relative(base, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }

  return hash.digest('hex');
};

/** Record the hash of `sourceDirs` in `distDir`, to be read back by {@link readSourceStamp}. */
export const writeSourceStamp = (sourceDirs: string | readonly string[], distDir: string): void => {
  const stamp: SourceStamp = { sourceHash: hashSourceTree(sourceDirs) };

  writeFileSync(join(distDir, SOURCE_STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
};

/** The hash a build recorded in `distDir`, or `null` when no build left one. */
export const readSourceStamp = (distDir: string): string | null => {
  const file = join(distDir, SOURCE_STAMP_FILE);

  if (!existsSync(file)) {
    return null;
  }

  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));

  return typeof parsed === 'object' && parsed !== null && typeof (parsed as SourceStamp).sourceHash === 'string'
    ? (parsed as SourceStamp).sourceHash
    : null;
};
