import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseAffectedPlanOptions, parseAffectedVitestOptions } from '../../scripts/ci/affected-plan.ts';

describe('affected-test command scope', () => {
  it('keeps native Vitest arguments separate from selection arguments', () => {
    expect(parseAffectedPlanOptions(['--base', 'abc123', '--committed', '--output', 'report.json', '--', '--project=unit'])).toMatchObject({
      base: 'abc123',
      committed: true,
      output: 'report.json',
      run: false,
      vitestArgs: ['--project=unit'],
    });
  });

  it.each([['--baes', 'x'], ['--base'], ['--output', '--run'], ['--scenarios', '--run']])('rejects invalid scope %j', (...args) => {
    expect(() => parseAffectedPlanOptions(args)).toThrow();
  });

  it.each([
    '--exclude=test/leaf.test.ts',
    '--testNamePattern=^never$',
    '--shard=1/2',
    '--tags=missing',
    '--typecheck.only',
    '--changed=HEAD',
    '--related=src/leaf.ts',
    '--watch',
  ])('rejects native scope or lifecycle overrides %s', argument => {
    expect(() => parseAffectedVitestOptions(['--project=fixture', argument])).toThrow();
  });

  it('accepts reporting and concurrency flags that preserve the complete chosen test files', () => {
    expect(
      parseAffectedVitestOptions([
        '--project=fixture',
        '--config=vitest.config.ts',
        '--root=.',
        '--reporter=json',
        '--outputFile.json=results.json',
        '--no-file-parallelism',
        '--maxWorkers=1',
        '--coverage',
      ]).options,
    ).toMatchObject({ project: ['fixture'], fileParallelism: false, maxWorkers: 1, coverage: { enabled: true } });
  });
});

describe('affected-test execution through the real Vitest API', () => {
  const command = resolve('scripts/ci/affected-plan.ts');
  const modules = resolve('node_modules');
  const savedGitEnv = new Map<string, string>();
  let root: string;
  let base: string;

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();

  const write = (file: string, source: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };

  const argumentsFor = (...args: string[]): string[] => [
    command,
    '--base',
    base,
    '--output',
    '.workspace/plan.json',
    ...args,
    '--',
    '--root',
    root,
    '--config',
    'vitest.config.ts',
    '--project=fixture',
  ];
  const run = (...args: string[]) => spawnSync(process.execPath, argumentsFor(...args), { cwd: root, encoding: 'utf8', timeout: 30_000 });
  const plan = (): { head: string; selections: Array<{ mode: string; inventory: unknown[]; tests: Array<{ file: string }> }> } =>
    JSON.parse(readFileSync(join(root, '.workspace/plan.json'), 'utf8'));

  beforeEach(() => {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GIT_') && value !== undefined) {
        savedGitEnv.set(key, value);
        delete process.env[key];
      }
    }

    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-affected-run-')));
    symlinkSync(modules, join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('.gitignore', 'node_modules\n.workspace\n.cache\n');
    write('package.json', '{"type":"module"}\n');
    write('vitest.config.ts', "export default {cacheDir: '.cache/vite', test: {name: 'fixture', include: ['test/*.test.ts']}};\n");
    write('src/leaf.ts', 'export const value = 1;\n');
    write('src/other.ts', 'export const other = 2;\n');
    write(
      'test/leaf.test.ts',
      "import { expect, it } from 'vitest'; import { value } from '../src/leaf.ts'; it('value', () => expect(value).toBe(1));\n",
    );
    write(
      'test/other.test.ts',
      "import { expect, it } from 'vitest'; import { other } from '../src/other.ts'; it('other', () => expect(other).toBe(2));\n",
    );
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'fixture');
    base = git('rev-parse', 'HEAD');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });

    for (const [key, value] of savedGitEnv) {
      process.env[key] = value;
    }

    savedGitEnv.clear();
  });

  it('selects a changed leaf, excludes an independent test, and does not execute in plan mode', () => {
    write('src/leaf.ts', 'export const value = 2;\n');
    const result = run();

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(plan().head).toBe(base);
    expect(plan().selections[0]!.tests.map(test => test.file)).toEqual(['test/leaf.test.ts']);
    expect(plan().selections[0]!.inventory).toHaveLength(2);
  });

  it('detects a deliberate leaf mutation using only the selected test', () => {
    write('src/leaf.ts', 'export const value = 2;\n');
    const result = run('--run');

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('expected 2 to be 1');
    expect(plan().selections[0]!.tests.map(test => test.file)).toEqual(['test/leaf.test.ts']);
  });

  it('succeeds when a complete nonempty inventory proves an unreferenced source has no affected tests', () => {
    write('src/unreferenced.ts', 'export const unused = 1;\n');
    const result = run('--run');

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(plan().selections[0]!.mode).toBe('related');
    expect(plan().selections[0]!.inventory).toHaveLength(2);
    expect(plan().selections[0]!.tests).toEqual([]);
  });

  it('runs every test when full qualification is requested', () => {
    write('src/leaf.ts', 'export const value = 1;\n\n');
    const result = run('--full', '--run');

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(plan().selections[0]!.mode).toBe('full');
    expect(plan().selections[0]!.tests).toHaveLength(2);
    expect(result.stdout).toMatch(/2 passed/);
  });

  it('rejects source edits during discovery, including edits to an already changed path', () => {
    write(
      'vitest.config.ts',
      "import { writeFileSync } from 'node:fs'; export default { cacheDir: '.cache/vite', plugins: [{ name: 'concurrent-edit', transform(code, id) { if (id.endsWith('/src/leaf.ts')) writeFileSync('src/leaf.ts', 'export const value = 3;\\n'); } }], test: { name: 'fixture', include: ['test/*.test.ts'] } };\n",
    );
    git('add', 'vitest.config.ts');
    git('commit', '-q', '-m', 'concurrent-edit fixture');
    base = git('rev-parse', 'HEAD');
    write('src/leaf.ts', 'export const value = 2;\n');
    const result = run('--run');

    expect(readFileSync(join(root, 'src/leaf.ts'), 'utf8')).toContain('value = 3');
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('changed during dependency discovery');
  });

  it.each(['reporter initialization', 'execution', 'cleanup'] as const)('rejects source edits during %s', phase => {
    if (phase === 'reporter initialization') {
      write(
        'reporter.ts',
        "import { writeFileSync } from 'node:fs'; export default class { onInit() { writeFileSync('src/other.ts', 'export const other = 3;'); } };\n",
      );
      write(
        'vitest.config.ts',
        "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], reporters: ['./reporter.ts'], maxWorkers: 1 } };\n",
      );
    } else if (phase === 'execution') {
      write(
        'test/leaf.test.ts',
        "import { writeFileSync } from 'node:fs'; import { it, expect } from 'vitest'; import { value } from '../src/leaf.ts'; it('edits another input', () => { writeFileSync('src/other.ts', 'export const other = 3;'); expect(value).toBe(1); });\n",
      );
    } else {
      write(
        'setup.ts',
        "import { writeFileSync } from 'node:fs'; export default () => () => writeFileSync('src/leaf.ts', 'export const value = 3;');\n",
      );
      write(
        'vitest.config.ts',
        "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['./setup.ts'], maxWorkers: 1 } };\n",
      );
    }

    git('add', '-A');
    git('commit', '-q', '-m', 'lifecycle fixture');
    base = git('rev-parse', 'HEAD');
    write('src/leaf.ts', 'export const value = 1;\n\n');

    const result = run('--run');

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('changed after dependency discovery');

    if (phase !== 'cleanup') {
      expect(plan().selections[0]!.tests.map(test => test.file)).toEqual(['test/leaf.test.ts']);
    }
  });

  it('rejects changed inputs after a passing full run too', () => {
    write(
      'test/leaf.test.ts',
      "import { writeFileSync } from 'node:fs'; import { it, expect } from 'vitest'; import { value } from '../src/leaf.ts'; it('edits an already loaded input', () => { writeFileSync('src/leaf.ts', 'export const value = 3;'); expect(value).toBe(1); });\n",
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'full lifecycle fixture');
    base = git('rev-parse', 'HEAD');
    write('src/leaf.ts', 'export const value = 1;\n\n');

    const result = run('--full', '--run');

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('changed after dependency discovery');
    expect(result.stdout).toMatch(/2 passed/);
  });

  const assertCancellation = async ({
    phase,
    transport,
    signal,
  }: {
    phase: 'startup' | 'execution';
    transport: 'signal' | 'controller';
    signal: 'SIGINT' | 'SIGTERM';
  }): Promise<void> => {
    write(
      'test/leaf.test.ts',
      "import { writeFileSync } from 'node:fs'; import { it } from 'vitest'; it('running', async () => { writeFileSync('.workspace/started', 'yes'); writeFileSync('.workspace/executed', 'yes'); await new Promise(resolve => setTimeout(resolve, 500)); });\n",
    );
    write('setup.ts', "import { writeFileSync } from 'node:fs'; export default () => () => writeFileSync('.workspace/closed', 'yes');\n");
    write(
      'reporter.ts',
      "import { writeFileSync } from 'node:fs'; export default class { onTestRunEnd(_modules, _errors, reason) { writeFileSync('.workspace/end-reason', reason); } };\n",
    );
    write(
      'vitest.config.ts',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['./setup.ts'], reporters: ['default', './reporter.ts'], maxWorkers: 1 } };\n",
    );

    if (phase === 'startup') {
      write(
        'vitest.config.ts',
        "import { writeFileSync } from 'node:fs'; export default async () => { writeFileSync('.workspace/started', 'yes'); await new Promise(resolve => setTimeout(resolve, 200)); return { cacheDir: '.cache/vite', plugins: [{ name: 'cleanup-probe', closeBundle() { writeFileSync('.workspace/closed', 'yes'); } }], test: { name: 'fixture', include: ['test/*.test.ts'], maxWorkers: 1 } }; };\n",
      );
    }

    git('add', '-A');
    git('commit', '-q', '-m', 'cancellation fixture');
    base = git('rev-parse', 'HEAD');
    write('.workspace/prepared', 'yes');
    write('src/leaf.ts', 'export const value = 1;\n\n');

    const args = argumentsFor('--run');
    const child = spawn(
      process.execPath,
      transport === 'controller' ? [resolve('test/ci/fixtures/affected-controller.ts'), ...args] : args,
      {
        cwd: root,
        stdio: transport === 'controller' ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';

    child.stdout!.on('data', chunk => {
      output += String(chunk);
    });
    child.stderr!.on('data', chunk => {
      output += String(chunk);
    });
    const completed = new Promise<number | null>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('close', resolvePromise);
    });

    try {
      for (let attempts = 0; attempts < 300 && !existsSync(join(root, '.workspace/started')) && child.exitCode === null; attempts++) {
        await setTimeout(10);
      }

      expect({ started: existsSync(join(root, '.workspace/started')), output }).toMatchObject({ started: true });

      if (transport === 'controller') {
        child.send(signal);
      } else {
        child.kill(signal);
      }

      expect({ code: await completed, output }).toMatchObject({ code: signal === 'SIGINT' ? 130 : 143 });
      expect(existsSync(join(root, '.workspace/closed'))).toBe(true);
      expect(readFileSync(join(root, '.workspace/closed'), 'utf8')).toBe('yes');

      if (phase === 'startup') {
        expect(existsSync(join(root, '.workspace/executed'))).toBe(false);
      } else {
        expect(readFileSync(join(root, '.workspace/end-reason'), 'utf8')).toBe('interrupted');
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await completed;
      }
    }
  };

  // Windows kill(SIGTERM) is forced termination, not delivery to a handler.
  it.skipIf(process.platform === 'win32').each(['startup', 'execution'] as const)(
    'preserves POSIX termination status and completes cleanup during %s',
    phase => assertCancellation({ phase, transport: 'signal', signal: 'SIGTERM' }),
  );

  it.each([
    { phase: 'startup', signal: 'SIGINT' },
    { phase: 'startup', signal: 'SIGTERM' },
    { phase: 'execution', signal: 'SIGINT' },
    { phase: 'execution', signal: 'SIGTERM' },
  ] as const)('completes controller cancellation during $phase for $signal', ({ phase, signal }) =>
    assertCancellation({ phase, signal, transport: 'controller' }),
  );
});
