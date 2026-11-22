import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { changedFilesBetween, selectLocalPolicy } from '../../scripts/ci/local-policy.ts';
import { affectedTestCommand, isRelatedEligible, resolveRelatedBase } from '../../scripts/ci/related-tests.ts';
import { changedFiles } from '../../scripts/lanes.ts';

const present = (): boolean => true;
const savedGitEnv = new Map<string, string>();

describe('graph planning eligibility', () => {
  it.each([
    'src/math/Vector.ts',
    'src/rendering/webgl2/shaders/sprite.frag',
    'test/math/vector.test.ts',
    'packages/exojs-tilemap/src/index.ts',
    'site/src/lib/content.ts',
    'examples/basic/example.ts',
    'src/Größe.ts',
    'src/space name.ts',
    'src/tab\tname.ts',
    'src/new\nline.ts',
    'src/back\\slash.ts',
    'src/quote"name.ts',
  ])('passes %s directly to graph discovery without Git quoting', file => {
    expect(isRelatedEligible([file], present)).toBe(true);
  });

  it.each(
    [[], ['src/globals.d.ts'], ['src/assets/readme.md'], ['vitest.config.ts'], ['src/../outside.ts'], ['src/invalid\0.ts']].map(files => ({
      files,
    })),
  )('keeps a full inventory for $files', ({ files }) => {
    expect(isRelatedEligible(files, present)).toBe(false);
  });

  it('keeps a full inventory for deleted or renamed modules', () => {
    expect(isRelatedEligible(['src/old.ts', 'src/new.ts'], file => file !== 'src/old.ts')).toBe(false);
  });
});

describe('single affected-test invocation', () => {
  const base = { ref: 'a'.repeat(40), full: false };

  it('selects and executes projects once with a distinct report', () => {
    const command = affectedTestCommand({ base, projects: ['exojs*', 'rendering-perf', 'exojs*'], name: 'unit' });

    expect(command).toBe(
      `node --import tsx scripts/ci/affected-plan.ts --run --base ${base.ref} --output .workspace/affected-tests/local-unit.json -- --project="exojs*" --project="rendering-perf"`,
    );
    expect(command).not.toContain('--changed');
  });

  it('preserves serial execution and explicit full fallback', () => {
    const command = affectedTestCommand({ base, projects: ['browser-webgpu'], name: 'webgpu-0', full: true, serial: true });

    expect(command).toContain('--full');
    expect(command).toContain('--no-file-parallelism');
  });

  it('forces full execution when base resolution failed', () => {
    expect(affectedTestCommand({ base: { ref: 'HEAD', full: true }, projects: ['exojs*'], name: 'unit' })).toContain('--full');
  });

  it.each([
    { base: { ref: 'topic;echo unsafe', full: false }, projects: ['exojs'], name: 'unit' },
    { base, projects: ['exojs" & echo unsafe'], name: 'unit' },
    { base, projects: ['exojs'], name: 'unit;echo unsafe' },
    { base, projects: [], name: 'unit' },
  ])('rejects unverified shell inputs %j', options => {
    expect(() => affectedTestCommand(options)).toThrow();
  });
});

describe('base ref resolution outside the shell', () => {
  let root: string;
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf8' }).trim();

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = mkdtempSync(join(tmpdir(), 'exojs-related-base-'));
    git('init', '-q');
    writeFileSync(join(root, 'input.txt'), 'base');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('resolves a shell-significant valid ref through Git argv', () => {
    const ref = 'topic;$(touch${IFS}marker)';
    git('branch', ref);
    const base = resolveRelatedBase(ref, root);
    const command = affectedTestCommand({ base, projects: ['exojs*'], name: 'unit' });

    expect(base).toEqual({ ref: git('rev-parse', 'HEAD'), full: false });
    expect(command).not.toContain(ref);
    expect(existsSync(join(root, 'marker'))).toBe(false);
  });

  it('widens an unknown ref instead of interpolating it into an executable command', () => {
    expect(resolveRelatedBase('missing;echo unsafe', root)).toEqual({ ref: 'HEAD', full: true });
  });
});

describe('renamed and deleted paths', () => {
  let root: string;

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: root, encoding: 'utf8' });

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-rename-')));
    git('init', '-q');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/old.ts'), `${'export const value = 1;\n'.repeat(20)}`);
    git('add', '-A');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('reports the original path of a detected rename, so the change is not eligible for narrowing', () => {
    git('mv', 'src/old.ts', 'src/new.ts');
    git('commit', '-q', '-m', 'rename');

    // Git itself reports this as an exact rename; without it the test would prove nothing.
    expect(git('diff', '--name-status', 'HEAD~1', 'HEAD')).toMatch(/^R100\s+src\/old\.ts\s+src\/new\.ts/);

    const files = changedFilesBetween('HEAD~1', 'HEAD', root);

    expect(files.sort()).toEqual(['src/new.ts', 'src/old.ts']);
    expect(isRelatedEligible(files, file => existsSync(join(root, file)))).toBe(false);
  });

  it('reports a rename in the working tree and index the same way', () => {
    git('mv', 'src/old.ts', 'src/new.ts');

    expect(changedFiles('HEAD', root).sort()).toEqual(['src/new.ts', 'src/old.ts']);
  });

  it('preserves exact Git paths in committed and untracked changes', () => {
    const files = ['src/Größe.ts', 'src/space name.ts', 'src/ padded .ts'];

    if (process.platform !== 'win32') {
      files.push('src/tab\tname.ts', 'src/new\nline.ts', 'src/back\\slash.ts', 'src/quote"name.ts');
    }

    for (const file of files) {
      writeFileSync(join(root, file), 'export const value = 1;\n');
    }

    expect(changedFiles('HEAD', root).sort()).toEqual([...files].sort());
    git('add', '-A');
    git('commit', '-q', '-m', 'paths');

    expect(changedFilesBetween('HEAD~1', 'HEAD', root).sort()).toEqual([...files].sort());
    expect(changedFiles('HEAD~1', root).sort()).toEqual([...files].sort());
  });

  it('keeps the whole core project when a changed engine file was renamed', () => {
    expect(selectLocalPolicy(['src/new.ts', 'src/definitely-missing-original.ts']).relatedTests).toBe(false);
  });
});
