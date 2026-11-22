import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAffectedRange } from '../../scripts/ci/affected-range.ts';

describe('affected-test range provenance', () => {
  let root: string;
  const savedGitEnv = new Map<string, string>();
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();

  const write = (file: string, source = 'export const value = 1;\n'): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };

  const commit = (message: string): string => {
    git('add', '-A');
    git('commit', '-q', '-m', message);

    return git('rev-parse', 'HEAD');
  };

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = mkdtempSync(join(tmpdir(), 'exojs-affected-range-'));
    git('init', '-q', '--initial-branch=next');
    write('src/base.ts');
    commit('base');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('pins the committed base, head and tree while preserving exact changed paths', () => {
    const base = git('rev-parse', 'HEAD');
    write('src/Größe.ts');
    const head = commit('unicode');
    const range = readAffectedRange({ base, root, committed: true });

    expect(range).toMatchObject({ base, head, tree: git('rev-parse', 'HEAD^{tree}'), files: ['src/Größe.ts'], fallbackReasons: [] });
  });

  it('includes local index, working tree and untracked inputs without rewriting their names', () => {
    const base = git('rev-parse', 'HEAD');
    write('src/base.ts', 'export const value = 2;\n');
    write('src/staged.ts');
    git('add', 'src/staged.ts');
    write('src/ untracked .ts');
    const range = readAffectedRange({ base, root });

    expect(range.files.sort()).toEqual(['src/ untracked .ts', 'src/base.ts', 'src/staged.ts']);
    expect(range.fallbackReasons).toEqual([]);
  });

  it('falls back to full validation when a CI commit comparison has local edits', () => {
    write('src/only-local.ts');

    const range = readAffectedRange({ base: 'HEAD', root, committed: true });

    expect(range.files).toEqual([]);
    expect(range.fallbackReasons.join(' ')).toContain('clean checkout');
  });

  it('reports both sides of a rename and a deletion', () => {
    write('src/deleted.ts');
    const base = commit('another input');
    git('mv', 'src/base.ts', 'src/renamed.ts');
    git('rm', 'src/deleted.ts');
    commit('move and delete');

    expect(readAffectedRange({ base, root, committed: true }).files.sort()).toEqual(['src/base.ts', 'src/deleted.ts', 'src/renamed.ts']);
  });

  it('uses the current fork point locally and recomputes it after a base merge', () => {
    const fork = git('rev-parse', 'HEAD');
    git('switch', '-q', '-c', 'feature');
    write('src/feature.ts');
    commit('feature');
    git('switch', '-q', 'next');
    write('src/upstream.ts');
    const upstream = commit('upstream');
    git('switch', '-q', 'feature');

    expect(readAffectedRange({ base: 'next', root })).toMatchObject({ base: fork, files: ['src/feature.ts'] });
    git('merge', '--no-edit', 'next');
    expect(readAffectedRange({ base: 'next', root })).toMatchObject({ base: upstream, files: ['src/feature.ts'] });
  });

  it('recomputes the range after a branch switch instead of reusing a previous selection', () => {
    const base = git('rev-parse', 'HEAD');
    git('switch', '-q', '-c', 'one');
    write('src/one.ts');
    commit('one');
    expect(readAffectedRange({ base, root }).files).toEqual(['src/one.ts']);
    git('switch', '-q', '-c', 'two', base);
    write('src/two.ts');
    commit('two');
    expect(readAffectedRange({ base, root }).files).toEqual(['src/two.ts']);
  });

  it('reports an unresolved base as a full-validation reason', () => {
    const range = readAffectedRange({ base: 'missing-base', root });

    expect(range.base).toBe(null);
    expect(range.files).toEqual([]);
    expect(range.fallbackReasons.join(' ')).toContain('missing-base');
    expect(range.head).toBe(git('rev-parse', 'HEAD'));
  });
});
