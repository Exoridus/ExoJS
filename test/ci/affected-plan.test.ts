import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();

  const write = (file: string, source: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };

  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [
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
      ],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    );
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
});
