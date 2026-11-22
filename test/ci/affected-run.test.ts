// @vitest-environment node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AffectedPlanDocument } from '../../scripts/ci/affected-reporter.ts';
import type { SelectedExecutionDocument } from '../../scripts/ci/affected-run.ts';

const repository = process.cwd();
const adapter = resolve('scripts/ci/affected-run.ts');
const runner = resolve('scripts/run-tests.ts');
const shadowReporter = resolve('scripts/ci/affected-reporter.ts');
const selectedFile = { project: 'fixture', file: 'test/Selected é雪.test.ts' };
const unrelatedFile = { project: 'fixture', file: 'test/unrelated.test.ts' };
const pass =
  "import { expect, it } from 'vitest'; import { value } from '../src/value.ts'; it('selected passes', () => expect(value).toBe(1));\n";
const fail = "import { expect, it } from 'vitest'; it('unrelated fails', () => expect(1).toBe(2));\n";
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && !key.startsWith('EXOJS_AFFECTED_') && key !== 'GITHUB_STEP_SUMMARY',
  ),
);

interface TestReport {
  success: boolean;
  numPassedTests: number;
  numFailedTests: number;
  numTotalTests: number;
  testResults: Array<{ name: string }>;
}

describe('affected-test execution adapter with real Vitest', () => {
  let root: string;

  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  const git = (...args: string[]): string =>
    execFileSync(
      'git',
      ['-c', 'core.autocrlf=false', '-c', 'user.name=adapter-test', '-c', 'user.email=adapter-test@example.test', ...args],
      {
        cwd: root,
        env: childEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();

  const commit = (): void => {
    git('add', '-A');
    git('commit', '-qm', 'fixture');
  };

  const plan = (): AffectedPlanDocument => ({
    version: 1,
    base: git('rev-parse', 'HEAD'),
    head: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    selections: [{ name: 'change', mode: 'related', fallbackReasons: [], inventory: [selectedFile, unrelatedFile], tests: [selectedFile] }],
  });

  const argumentsFor = (command = adapter, args: string[] = []): string[] => [
    command,
    '--config=vitest.config.mjs',
    '--project=fixture',
    '--reporter=default',
    '--reporter=junit',
    ...(command === runner ? [] : ['--reporter=json']),
    `--reporter=${shadowReporter}`,
    '--outputFile.junit=.workspace/results.xml',
    ...(command === runner ? [] : ['--outputFile.json=.workspace/results.json']),
    ...args,
  ];

  const environment = (env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    ...childEnv,
    EXOJS_AFFECTED_MODE: 'enforce',
    EXOJS_AFFECTED_PLAN: '.workspace/plan.json',
    ...env,
  });

  const run = (document: AffectedPlanDocument | null = plan(), args: string[] = [], env: NodeJS.ProcessEnv = {}, command = adapter) => {
    if (document) {
      write('.workspace/plan.json', JSON.stringify(document));
    }

    return spawnSync(process.execPath, argumentsFor(command, args), {
      cwd: root,
      env: environment(env),
      encoding: 'utf8',
      timeout: 30_000,
    });
  };

  const readReport = (): TestReport => JSON.parse(readFileSync(join(root, '.workspace/results.json'), 'utf8')) as TestReport;

  const executions = (): SelectedExecutionDocument[] => {
    const directory = join(root, '.workspace/affected-tests/execution');

    return existsSync(directory)
      ? readdirSync(directory).map(file => JSON.parse(readFileSync(join(directory, file), 'utf8')) as SelectedExecutionDocument)
      : [];
  };

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-affected-run-')));
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('.gitignore', 'node_modules\n.workspace\n.cache\n');
    write('package.json', '{"type":"module"}\n');
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], maxWorkers: 1, fileParallelism: false, coverage: { provider: 'istanbul', reporter: ['json'], reportsDirectory: '.workspace/coverage' } } };\n",
    );
    write('src/value.ts', 'export const value = 1;\n');
    write(selectedFile.file, pass);
    write(unrelatedFile.file, fail);
    git('init', '-q');
    commit();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('executes the selected file, retains JUnit, and labels its evidence as selected execution', () => {
    const result = run();

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(readReport()).toMatchObject({ success: true, numTotalTests: 1, numPassedTests: 1 });
    expect(readFileSync(join(root, '.workspace/results.xml'), 'utf8')).toContain('tests="1"');
    expect(executions()).toHaveLength(1);
    expect(executions()[0]).toMatchObject({
      executionMode: 'selected',
      fullInventoryAudited: false,
      inventoryValidated: true,
      selectedInventoryComplete: true,
      selected: [selectedFile],
      omitted: [unrelatedFile],
      files: [expect.objectContaining({ ...selectedFile, state: 'passed' })],
    });
    expect(existsSync(join(root, '.workspace/affected-tests/results'))).toBe(false);
  });

  it('preserves a selected assertion failure and excludes the unrelated failing file', () => {
    write('src/value.ts', 'export const value = 3;\n');
    commit();

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('expected 3 to be 1');
    expect(readReport()).toMatchObject({ success: false, numTotalTests: 1, numFailedTests: 1 });
    expect(executions()[0].files).toEqual([expect.objectContaining({ ...selectedFile, state: 'failed' })]);
  });

  it.each([true, false])('records complete selected execution for a workspace project with extends=%s', inherit => {
    write(
      'vitest.config.mjs',
      `export default { cacheDir: '.cache/vite', test: { projects: [{ extends: ${String(inherit)}, test: { name: 'fixture', include: ['test/*.test.ts'], maxWorkers: 1, fileParallelism: false } }] } };\n`,
    );
    commit();

    const result = run();

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(readReport()).toMatchObject({ success: true, numTotalTests: 1, numPassedTests: 1 });
    expect(executions()).toHaveLength(1);
    expect(executions()[0]).toMatchObject({
      inventoryValidated: true,
      selectedInventoryComplete: true,
      selected: [selectedFile],
      omitted: [unrelatedFile],
      files: [expect.objectContaining({ ...selectedFile, state: 'passed' })],
    });
    expect(existsSync(join(root, '.workspace/affected-tests/results'))).toBe(false);
  });

  it('fails if another reporter removes the selected execution observer', () => {
    write(
      'discard-reporters.mjs',
      'export default class { onInit(context) { this.context = context; } onTestRunStart() { this.context.reporters = []; } }\n',
    );
    commit();

    const result = run(plan(), ['--reporter=./discard-reporters.mjs']);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('did not record its complete inventory receipt');
    expect(executions()).toEqual([]);
  });

  it('emits successful zero-test JUnit evidence for a proven empty selection', () => {
    const document = plan();

    document.selections[0].tests = [];

    const result = run(document);

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(readReport()).toMatchObject({ success: true, numTotalTests: 0, testResults: [] });
    expect(readFileSync(join(root, '.workspace/results.xml'), 'utf8')).toMatch(/<testsuites[^>]*tests="0"[^>]*failures="0"/);
    expect(executions()[0]).toMatchObject({ selected: [], omitted: [selectedFile, unrelatedFile], selectedInventoryComplete: true });
  });

  it('uses native full execution for a full fallback and keeps the shadow reporter', () => {
    const document = plan();

    document.selections[0].mode = 'full';
    document.selections[0].tests = document.selections[0].inventory;
    document.selections[0].fallbackReasons = ['global configuration changed'];

    const result = run(document);

    expect(result.status).toBe(1);
    expect(readReport()).toMatchObject({ numTotalTests: 2, numPassedTests: 1, numFailedTests: 1 });
    expect(executions()).toEqual([]);
    expect(readdirSync(join(root, '.workspace/affected-tests/results'))).toHaveLength(1);
  });

  it('uses native full execution and preserves coverage output when coverage is enabled', () => {
    const result = run(plan(), ['--coverage', '--coverage.reportOnFailure']);

    expect(result.status).toBe(1);
    expect(readReport()).toMatchObject({ numTotalTests: 2, numPassedTests: 1, numFailedTests: 1 });
    expect(existsSync(join(root, '.workspace/coverage/coverage-final.json'))).toBe(true);
    expect(executions()).toEqual([]);
  });

  it.each([undefined, 'shadow'])('forwards the native full command when mode is %s', mode => {
    const result = run(null, [], { EXOJS_AFFECTED_MODE: mode, EXOJS_AFFECTED_PLAN: undefined });

    expect(result.status).toBe(1);
    expect(readReport()).toMatchObject({ numTotalTests: 2, numFailedTests: 1 });
    expect(executions()).toEqual([]);
  });

  it.each([adapter, runner])('executes the full native inventory after discovery clears the plan: %s', command => {
    const result = run(null, [], { EXOJS_AFFECTED_MODE: '', EXOJS_AFFECTED_PLAN: '' }, command);

    expect(result.status).toBe(1);
    expect(readFileSync(join(root, '.workspace/results.xml'), 'utf8')).toMatch(/<testsuites[^>]*tests="2"[^>]*failures="1"/);
    expect(result.stderr).toContain('expected 1 to be 2');
    expect(executions()).toEqual([]);
    expect(existsSync(join(root, '.workspace/affected-tests/results'))).toBe(false);
  });

  it('requires a plan when enforcement is explicitly enabled', () => {
    const result = run(null, [], { EXOJS_AFFECTED_PLAN: undefined });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('EXOJS_AFFECTED_PLAN');
    expect(executions()).toEqual([]);
  });

  it.each(['head', 'tree'] as const)('rejects a stale %s before executing tests', field => {
    const document = plan();

    document[field] = '0'.repeat(40);

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Plan ${field} does not match`);
    expect(existsSync(join(root, '.workspace/results.json'))).toBe(false);
  });

  it.each(['tracked', 'untracked'])('rejects %s dirty inputs before executing tests', kind => {
    const document = plan();

    write(kind === 'tracked' ? 'src/value.ts' : 'src/extra.ts', 'export const value = 2;\n');

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('clean checkout');
    expect(existsSync(join(root, '.workspace/results.json'))).toBe(false);
  });

  it.each(['startup', 'execution', 'cleanup'] as const)('rejects inputs changed during %s', phase => {
    if (phase === 'startup') {
      write(
        'vitest.config.mjs',
        "import { writeFileSync } from 'node:fs'; writeFileSync('src/value.ts', 'export const value = 2;'); export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], maxWorkers: 1 } };\n",
      );
    } else if (phase === 'execution') {
      write(
        selectedFile.file,
        "import { writeFileSync } from 'node:fs'; import { it } from 'vitest'; it('changes input', () => writeFileSync('src/value.ts', 'export const value = 2;'));\n",
      );
    } else {
      write(
        'setup.mjs',
        "import { writeFileSync } from 'node:fs'; export default () => () => writeFileSync('src/value.ts', 'export const value = 2;');\n",
      );
      write(
        'vitest.config.mjs',
        "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['setup.mjs'], maxWorkers: 1 } };\n",
      );
    }

    commit();

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('clean checkout');
  });

  it('rejects malformed or missing manifest files', () => {
    write('.workspace/plan.json', '{"version":1}');

    expect(run(null).stderr).toContain('Invalid plan');
    rmSync(join(root, '.workspace/plan.json'));
    expect(run(null).stderr).toContain('Cannot read plan');
    expect(executions()).toEqual([]);
  });

  it('rejects a stale discovered inventory instead of running a partial project', () => {
    const document = plan();

    document.selections[0].inventory = [selectedFile];

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Full inventory mismatch');
    expect(result.stderr).toContain(unrelatedFile.file);
  });

  it('rejects native filters that could invalidate its complete-inventory check', () => {
    const result = run(plan(), ['--exclude=test/unrelated.test.ts']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsupported');
    expect(executions()).toEqual([]);
  });

  it('ignores manifest rows for projects invoked separately', () => {
    const document = plan();
    const other = { ...unrelatedFile, project: 'other' };

    document.selections[0].inventory.push(other);
    document.selections[0].tests.push(other);

    expect(run(document).status).toBe(0);
    expect(executions()[0].selected).toEqual([selectedFile]);
  });

  it('selects the exact project/file identity when two projects share one Unicode filename', () => {
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { maxWorkers: 1, projects: ['fixture', 'Fixture'].map(name => ({ test: { name, include: ['test/Selected*.test.ts'] } })) } };\n",
    );
    commit();

    const document = plan();
    const other = { ...selectedFile, project: 'Fixture' };

    document.selections[0].inventory = [selectedFile, other];
    document.selections[0].tests = [other];

    expect(run(document, ['--project=Fixture']).status).toBe(0);
    expect(executions()[0].files).toEqual([expect.objectContaining({ ...other, state: 'passed' })]);
    expect(readReport().numTotalTests).toBe(1);
  });

  it('keeps unhandled failures fatal even when the selected assertion passes', () => {
    write(
      selectedFile.file,
      "import { it } from 'vitest'; it('passes with unhandled error', async () => { setTimeout(() => { throw new Error('unhandled adapter fixture'); }, 1); await new Promise(resolve => setTimeout(resolve, 20)); });\n",
    );
    commit();

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unhandled adapter fixture');
    expect(executions()[0].unhandledErrors).toBeGreaterThan(0);
  });

  it('keeps timeout-only retries native even if the manifest changes during the first run', () => {
    write(
      selectedFile.file,
      "import { existsSync, writeFileSync } from 'node:fs'; import { it } from 'vitest'; it('transient timeout', async () => { if (!existsSync('.workspace/retried')) { writeFileSync('.workspace/retried', 'yes'); writeFileSync('.workspace/plan.json', 'invalid after original selection'); await new Promise(() => {}); } }, 50);\n",
    );
    commit();

    const result = run(plan(), [], {}, runner);

    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    expect(result.stdout).toContain('Rechecking 1 file(s)');
    expect(result.stdout).toContain('1 passed');
    expect(executions()).toHaveLength(1);
    expect(executions()[0].files[0].state).toBe('failed');
  });

  it.each(['selected', 'full', 'coverage', 'retry'] as const)(
    'does not activate the outer plan in nested child runners during %s execution',
    mode => {
      write(
        selectedFile.file,
        `
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
${mode === 'retry' ? "it('transient timeout', async () => { if (!existsSync('.workspace/retried')) { writeFileSync('.workspace/retried', 'yes'); writeFileSync('.workspace/plan.json', 'invalid after original selection'); await new Promise(() => {}); } }, 50);" : ''}
it('nested runner uses its complete independent fixture', () => {
  const nested = resolve('.workspace/nested');
  mkdirSync(nested, { recursive: true });
  writeFileSync(resolve(nested, '.gitignore'), '.cache\\n.workspace\\n');
  writeFileSync(resolve(nested, 'package.json'), '{"type":"module"}');
  writeFileSync(resolve(nested, 'vitest.config.mjs'), "export default { cacheDir: '.cache/vite', test: { name: 'nested', include: ['*.test.ts'], maxWorkers: 1 } };");
  writeFileSync(resolve(nested, 'one.test.ts'), "import { it, expect } from 'vitest'; it('one', () => expect(1).toBe(1));");
  writeFileSync(resolve(nested, 'two.test.ts'), "import { it, expect } from 'vitest'; it('two', () => expect(2).toBe(2));");
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=nested', '-c', 'user.email=nested@example.test', ...args], { cwd: nested });
  git('init', '-q');
  // Exercise the common Windows setting; fixture Git calls must preserve LF inputs.
  git('config', 'core.autocrlf', 'true');
  git('add', '-A');
  git('commit', '--allow-empty', '-qm', 'nested fixture');
  const result = spawnSync(process.execPath, [${JSON.stringify(runner)}, '--config=vitest.config.mjs', '--project=nested', '--reporter=default', ${JSON.stringify(`--reporter=${shadowReporter}`)}], { cwd: nested, env: process.env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.stdout).toMatch(/2 passed/);
});
`,
      );
      commit();

      const document = plan();

      if (mode === 'full') {
        document.selections[0].mode = 'full';
        document.selections[0].tests = document.selections[0].inventory;
      }

      const result = run(document, mode === 'coverage' ? ['--coverage'] : [], {}, mode === 'retry' ? runner : adapter);

      if (mode === 'retry') {
        expect(result.stderr.match(/\[affected-run\] ERROR:[^\n]*/g)).toBeNull();
      }

      expect({ status: result.status, stderr: result.stderr }).toEqual({
        status: mode === 'selected' || mode === 'retry' ? 0 : 1,
        stderr: mode === 'selected' ? '' : expect.any(String),
      });

      if (mode === 'retry') {
        expect(result.stdout).toContain('Rechecking 1 file(s)');
        expect(result.stdout).toContain('2 passed');
        expect(executions()).toHaveLength(1);
        expect(executions()[0].files[0].counts).toMatchObject({ total: 2, failed: 1, passed: 1 });
      } else {
        expect(readReport()).toMatchObject({ numTotalTests: mode === 'selected' ? 1 : 2, numPassedTests: 1 });
      }
    },
  );

  it('does not retry a selected assertion failure through the timeout wrapper', () => {
    write(
      selectedFile.file,
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs'; import { expect, it } from 'vitest'; it('assertion', () => { const file = '.workspace/attempts'; const attempts = existsSync(file) ? Number(readFileSync(file, 'utf8')) + 1 : 1; writeFileSync(file, String(attempts)); expect(attempts).toBe(2); });\n",
    );
    commit();

    const result = run(plan(), [], {}, runner);

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('Rechecking');
    expect(readFileSync(join(root, '.workspace/attempts'), 'utf8')).toBe('1');
  });

  it('preserves a cleanup failure after every selected test passed', () => {
    write('setup.mjs', "export default () => () => { throw new Error('adapter cleanup failed'); };\n");
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['setup.mjs'], maxWorkers: 1 } };\n",
    );
    commit();

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('adapter cleanup failed');
    expect(readReport()).toMatchObject({ numPassedTests: 1, numFailedTests: 0 });
  });

  it('does not retry a timeout accompanied by a separate cleanup failure', () => {
    write(
      selectedFile.file,
      "import { existsSync, writeFileSync } from 'node:fs'; import { it } from 'vitest'; it('transient timeout', async () => { if (!existsSync('.workspace/retried')) { writeFileSync('.workspace/retried', 'yes'); await new Promise(() => {}); } }, 50);\n",
    );
    write(
      'setup.mjs',
      "import { existsSync, writeFileSync } from 'node:fs'; export default () => () => { if (!existsSync('.workspace/cleanup-failed')) { writeFileSync('.workspace/cleanup-failed', 'yes'); throw new Error('adapter cleanup failed'); } };\n",
    );
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['setup.mjs'], maxWorkers: 1 } };\n",
    );
    commit();

    const result = run(plan(), [], {}, runner);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('adapter cleanup failed');
    expect(result.stdout).not.toContain('Rechecking');
  });

  const assertCancellation = async ({
    command,
    phase,
    transport,
    signal,
  }: {
    command: string;
    phase: 'startup' | 'execution';
    transport: 'signal' | 'controller';
    signal: 'SIGINT' | 'SIGTERM';
  }): Promise<void> => {
    write(
      selectedFile.file,
      "import { writeFileSync } from 'node:fs'; import { it } from 'vitest'; it('running', async () => { writeFileSync('.workspace/started', 'yes'); writeFileSync('.workspace/executed', 'yes'); await new Promise(resolve => setTimeout(resolve, 500)); });\n",
    );
    write('setup.mjs', "import { writeFileSync } from 'node:fs'; export default () => () => writeFileSync('.workspace/closed', 'yes');\n");
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/*.test.ts'], globalSetup: ['setup.mjs'], maxWorkers: 1 } };\n",
    );

    if (phase === 'startup') {
      write(
        'vitest.config.mjs',
        "import { writeFileSync } from 'node:fs'; export default async () => { writeFileSync('.workspace/started', 'yes'); await new Promise(resolve => setTimeout(resolve, 200)); return { cacheDir: '.cache/vite', plugins: [{ name: 'cleanup-probe', closeBundle() { writeFileSync('.workspace/closed', 'yes'); } }], test: { name: 'fixture', include: ['test/*.test.ts'], maxWorkers: 1 } }; };\n",
      );
    }

    commit();
    write('.workspace/plan.json', JSON.stringify(plan()));

    const args = argumentsFor(command);
    const child = spawn(
      process.execPath,
      transport === 'controller' ? [resolve('test/ci/fixtures/affected-controller.ts'), ...args] : args,
      {
        cwd: root,
        env: environment(),
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
      expect(readFileSync(join(root, '.workspace/closed'), 'utf8')).toBe('yes');
      expect(executions().map(execution => execution.reason)).toEqual(phase === 'startup' ? [] : ['interrupted']);

      if (phase === 'startup') {
        expect(existsSync(join(root, '.workspace/executed'))).toBe(false);
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await completed;
      }
    }
  };

  // Windows kill(SIGTERM) is forced termination, not delivery to a handler.
  it.skipIf(process.platform === 'win32').each([
    { command: adapter, phase: 'execution' },
    { command: runner, phase: 'execution' },
    { command: adapter, phase: 'startup' },
  ] as const)('preserves POSIX termination status and closes Vitest during $phase through $command', ({ command, phase }) =>
    assertCancellation({ command, phase, transport: 'signal', signal: 'SIGTERM' }),
  );

  it.each([
    { phase: 'startup', signal: 'SIGINT' },
    { phase: 'startup', signal: 'SIGTERM' },
    { phase: 'execution', signal: 'SIGINT' },
    { phase: 'execution', signal: 'SIGTERM' },
  ] as const)('completes controller cancellation during $phase for $signal', ({ phase, signal }) =>
    assertCancellation({ command: adapter, phase, signal, transport: 'controller' }),
  );
});
