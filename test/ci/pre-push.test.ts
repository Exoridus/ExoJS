import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repository = resolve(import.meta.dirname!, '../..');
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));

describe.skipIf(process.platform === 'win32')('pre-push command dispatch', () => {
  let root: string;
  let base: string;
  let head: string;

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
    }).trim();

  const runHook = (remote: string, options: { mode?: 'fast' | 'full'; remoteRef?: string } = {}) => {
    const log = join(root, 'commands.log');
    // Keep the real hook, Git range and policy. Only expensive gate/lane/build
    // processes are replaced at their command boundary.
    const result = spawnSync(
      'sh',
      [
        '-c',
        `npm() { printf 'npm'; printf '\\t%s' "$@"; printf '\\n'; } >> "$PRE_PUSH_CALL_LOG"
node() {
  if [ "$1" = 'scripts/check-dist-fresh.ts' ]; then
    { printf 'node'; printf '\\t%s' "$@"; printf '\\n'; } >> "$PRE_PUSH_CALL_LOG"
  else
    command node "$@"
  fi
}
. "$PRE_PUSH_HOOK"`,
      ],
      {
        cwd: root,
        env: {
          ...environment,
          EXOJS_PRE_PUSH_MODE: options.mode ?? '',
          PRE_PUSH_HOOK: join(repository, '.husky/pre-push'),
          PRE_PUSH_CALL_LOG: log,
        },
        input: `refs/heads/topic ${head} ${options.remoteRef ?? 'refs/heads/topic'} ${remote}\n`,
        encoding: 'utf8',
        timeout: 15_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);

    return {
      output: result.stdout,
      calls: readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('\t')),
    };
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'exojs-pre-push-'));
    cpSync(join(repository, 'scripts'), join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'packages'));
    mkdirSync(join(root, 'src/math'), { recursive: true });
    writeFileSync(join(root, 'src/math/Random.ts'), 'export const random = 1;\n');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    base = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'src/math/Random.ts'), 'export const random = 2;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'change');
    head = git('rev-parse', 'HEAD');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs only fast tracked-file gates on ordinary feature pushes by default', () => {
    const { calls, output } = runHook(base);

    expect(calls).toEqual([['npm', 'run', 'gates', '--', 'affected-fast', base, head]]);
    expect(output).toContain('CI-first');
    expect(output).toContain('Draft PR');
  });

  it('preserves the previous complete local validation path on explicit opt-in', () => {
    const { calls } = runHook(base, { mode: 'full' });

    expect(calls).toEqual([
      ['npm', 'run', 'gates', '--', 'affected-fast', base, head],
      ['npm', 'run', 'gates', '--', 'affected-rest', base, head],
      ['npm', 'run', 'lanes', '--', '--run', '--tests-only', '--pre-push', '--base', base],
    ]);
  });

  it.each(['refs/heads/main', 'refs/heads/next'])('always runs complete local checks when pushing directly to %s', remoteRef => {
    const { calls } = runHook(base, { mode: 'fast', remoteRef });

    expect(calls).toEqual([
      ['npm', 'run', 'gates', '--', 'affected-fast', base, head],
      ['npm', 'run', 'gates', '--', 'affected-rest', base, head],
      ['npm', 'run', 'lanes', '--', '--run', '--tests-only', '--pre-push', '--base', base],
    ]);
  });

  it('does not turn an unresolved feature-branch base into a full local suite', () => {
    const { calls } = runHook('0'.repeat(40));

    expect(calls).toEqual([['npm', 'run', 'gates', '--', 'affected-fast', '', head]]);
  });

  it('preserves fail-closed exhaustive verification for an unresolved full-mode range', () => {
    const { calls } = runHook('0'.repeat(40), { mode: 'full' });

    expect(calls).toEqual([
      ['npm', 'run', 'gates', '--', 'affected-fast', '', head],
      ['node', 'scripts/check-dist-fresh.ts', '--rebuild'],
      ['npm', 'run', 'gates', '--', 'affected-rest', '', head],
      ['npm', 'run', 'lanes', '--', '--run', '--tests-only', '--pre-push', '--all'],
    ]);
  });

  it('prints the deferred lane identities and CI obligation even with silent output', () => {
    mkdirSync(join(root, 'src/rendering/sprite'), { recursive: true });
    writeFileSync(join(root, 'src/rendering/sprite/Sprite.ts'), 'export const sprite = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'sprite');

    const result = spawnSync(process.execPath, ['scripts/lanes.ts', '--pre-push', '--tests-only', '--base', base, '--output=silent'], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect([...result.stdout.matchAll(/lanes: deferred (\w+) to mandatory CI\./g)].map(match => match[1])).toEqual([
      'webgl',
      'webgpu',
      'bench',
      'smoke',
    ]);
    expect(result.stdout).toContain('pushed commit');
    expect(result.stdout).toContain('dist (before the first lane)');
    expect(result.stdout).toContain('  unit:');
    expect(result.stdout).not.toContain('  webgl:');
  });
});
