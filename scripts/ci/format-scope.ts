import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Which files the local format gate has to check for a pushed range.
 *
 * `pnpm format:check` and CI keep checking the whole repository. The pre-push
 * hook can check only what the range touched, because the base is already
 * formatted and Prettier formats each file independently of the others - unless
 * the change alters how files are formatted or which files are considered, in
 * which case every file is affected.
 */

/** Files whose content decides how, or whether, any file is formatted. */
export const FORMAT_CONFIG_FILES: ReadonlySet<string> = new Set([
  // Declare a `prettier` key or pin the Prettier and plugin versions.
  'package.json',
  'site/package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]);

/** Nested ignore and editor-config files apply to their subtree, so they count at any depth. */
const isFormatConfig = (file: string): boolean =>
  FORMAT_CONFIG_FILES.has(file) ||
  file.startsWith('packages/exojs-config/') ||
  /(^|\/)(\.editorconfig|\.gitignore|\.prettierignore|\.prettierrc[^/]*|prettier\.config\.[cm]?[jt]s)$/.test(file);

export type FormatScope = { mode: 'full' } | { mode: 'skip' } | { mode: 'files'; files: string[] };

/**
 * A deleted path has nothing to check, and a rename lists its new path, so
 * existing paths are the files to format. An empty range is not evidence that
 * nothing changed, so it takes the full check.
 */
export const selectFormatScope = (changedFiles: readonly string[], exists: (file: string) => boolean = existsSync): FormatScope => {
  // Git reports repository-relative paths with forward slashes and verbatim names, so nothing is rewritten here.
  const files = [...new Set(changedFiles.filter(Boolean))];

  if (files.length === 0 || files.some(isFormatConfig)) {
    return { mode: 'full' };
  }

  const present = files.filter(file => exists(file));

  return present.length === 0 ? { mode: 'skip' } : { mode: 'files', files: present };
};

/** Splits a file list so that no single invocation exceeds the shortest command-line limit in use (cmd.exe, 8191 characters). */
export const chunkFiles = (files: readonly string[], limit = 6000): string[][] => {
  const chunks: string[][] = [];
  let current: string[] = [];
  let length = 0;

  for (const file of files) {
    const cost = file.length + 3; // quoting plus a separator

    if (current.length > 0 && length + cost > limit) {
      chunks.push(current);
      current = [];
      length = 0;
    }

    current.push(file);
    length += cost;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

/**
 * Paths touched between two commits, from the pushed range itself rather than
 * the index or working tree. Throws when the range cannot be resolved; the
 * caller answers that with the full check. Renames are listed as a deletion
 * plus an addition, so the new path is checked and the vanished one is not.
 * Output is NUL-terminated: without `-z` git quotes names containing non-ASCII
 * or control characters, and a quoted name no longer exists on disk.
 */
export const formatRangeFiles = (base: string, head: string, cwd?: string): string[] =>
  execFileSync('git', ['diff', '-z', '--name-only', '--no-renames', `${base}..${head}`], {
    encoding: 'utf8',
    cwd,
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
