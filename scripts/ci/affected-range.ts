import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AffectedRange {
  base: string | null;
  head: string;
  tree: string;
  files: string[];
  localState: string | null;
  fallbackReasons: string[];
}

export interface AffectedRangeOptions {
  base?: string;
  root?: string;
  /** CI compares its actual merge checkout to the event's exact base commit. */
  committed?: boolean;
}

/** Resolves every invocation afresh; no branch, merge-base or working-tree selection is cached. */
export const readAffectedRange = ({ base, root = process.cwd(), committed = false }: AffectedRangeOptions): AffectedRange => {
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const result: AffectedRange = {
    base: null,
    head: git('rev-parse', '--verify', 'HEAD').trim(),
    tree: git('rev-parse', '--verify', 'HEAD^{tree}').trim(),
    files: [],
    localState: null,
    fallbackReasons: [],
  };

  try {
    if (!base) {
      throw new Error('No comparison base was supplied.');
    }

    const resolvedBase = git('rev-parse', '--verify', '--end-of-options', `${base}^{commit}`).trim();
    result.base = committed ? resolvedBase : git('merge-base', resolvedBase, result.head).trim();

    if (committed && git('status', '--porcelain=v1', '-z', '--untracked-files=all') !== '') {
      throw new Error('A committed comparison requires a clean checkout; validate the full current tree.');
    }

    const outputs = [git('diff', '-z', '--name-only', '--no-renames', result.base, result.head, '--')];

    if (!committed) {
      outputs.push(git('diff', '-z', '--name-only', '--no-renames', result.head, '--'));
      outputs.push(git('ls-files', '-z', '--others', '--exclude-standard'));
    }

    result.files = [...new Set(outputs.flatMap(output => output.split('\0').filter(Boolean)))].sort();

    if (!committed) {
      const state = createHash('sha256');

      for (const file of result.files) {
        const path = resolve(root, file);
        const stat = lstatSync(path, { throwIfNoEntry: false });
        const contents = stat?.isSymbolicLink() ? readlinkSync(path) : stat?.isFile() ? readFileSync(path) : '(missing)';

        state.update(JSON.stringify([file, stat?.mode ?? null]));
        state.update(createHash('sha256').update(contents).digest());
      }

      result.localState = state.digest('hex');
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    result.files = [];
    result.fallbackReasons.push(`Cannot safely select the range from ${base ?? '(missing base)'}: ${detail}`);
  }

  return result;
};
