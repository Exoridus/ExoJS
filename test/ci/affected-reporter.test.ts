import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AffectedPlanDocument, AffectedRunDocument } from '../../scripts/ci/affected-reporter.ts';

const repository = process.cwd();
const reporter = join(repository, 'scripts/ci/affected-reporter.ts');
const vitestCli = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));
const changed = { project: 'fixture', file: 'test/Changed é雪.test.ts' };
const unrelated = { project: 'fixture', file: 'test/unrelated.test.ts' };
const passingTest = "import { expect, it } from 'vitest';\nit('passes', () => expect(1).toBe(1));\n";
const failingTest = "import { expect, it } from 'vitest';\nit('unrelated regression', () => expect(1).toBe(2));\n";

// The hook's Git environment must not redirect the fixture at the real checkout.
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && !key.startsWith('EXOJS_AFFECTED_') && key !== 'GITHUB_STEP_SUMMARY',
  ),
);

describe('affected-test shadow reporter against a real Vitest run', () => {
  let root: string;
  let resultDirectory: string;

  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };

  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=reporter-test', '-c', 'user.email=reporter-test@example.test', ...args], {
      cwd: root,
      env: childEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  const plan = (): AffectedPlanDocument => ({
    version: 1,
    base: null,
    head: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    selections: [
      { name: 'change', mode: 'related', fallbackReasons: [], inventory: [changed, unrelated], tests: [changed] },
      {
        name: 'fallback',
        mode: 'full',
        fallbackReasons: ['configuration-change'],
        inventory: [changed, unrelated],
        tests: [changed, unrelated],
      },
    ],
  });

  const run = (document: AffectedPlanDocument | null = plan(), args: string[] = [], env: NodeJS.ProcessEnv = {}) => {
    if (document) {
      write('.workspace/plan.json', JSON.stringify(document));
    }

    return spawnSync(
      process.execPath,
      [vitestCli, 'run', '--config', 'vitest.config.mjs', '--reporter=default', `--reporter=${reporter}`, ...args],
      {
        cwd: root,
        env: {
          ...childEnv,
          ...(document ? { EXOJS_AFFECTED_PLAN: '.workspace/plan.json' } : {}),
          EXOJS_AFFECTED_RESULTS_DIR: resultDirectory,
          ...env,
        },
        encoding: 'utf8',
        timeout: 20_000,
      },
    );
  };

  const reports = (): AffectedRunDocument[] =>
    (existsSync(resultDirectory) ? readdirSync(resultDirectory) : []).map(
      file => JSON.parse(readFileSync(join(resultDirectory, file), 'utf8')) as AffectedRunDocument,
    );

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'exojs-affected-reporter-')));
    resultDirectory = join(root, '.workspace/results');
    // Only dependency files are shared; the child owns its Vite cache and output.
    symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    write('.gitignore', 'node_modules\n.workspace\n.cache\n');
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { name: 'fixture', include: ['test/**/*.test.ts'], maxWorkers: 1, fileParallelism: false } };\n",
    );
    write(changed.file, passingTest);
    write(unrelated.file, failingTest);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'fixture');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs both files and identifies an omitted failure without changing the failed exit status', () => {
    const document = plan();
    const summary = join(root, '.workspace/summary.md');
    const result = run(document, [], { GITHUB_STEP_SUMMARY: summary });

    expect({ status: result.status, signal: result.signal, error: result.error }).toEqual({ status: 1, signal: null, error: undefined });
    expect(result.stdout).toContain('unrelated regression');

    const [report] = reports();

    expect(report).toMatchObject({
      version: 1,
      base: null,
      head: document.head,
      tree: document.tree,
      reason: 'failed',
      inventoryComplete: true,
    });
    expect(report.inventory).toEqual(expect.arrayContaining([changed, unrelated]));
    expect(report.files).toHaveLength(2);
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ...changed, state: 'passed', counts: { total: 1, passed: 1, failed: 0, skipped: 0, pending: 0 } }),
        expect.objectContaining({ ...unrelated, state: 'failed', counts: { total: 1, passed: 0, failed: 1, skipped: 0, pending: 0 } }),
      ]),
    );

    for (const file of report.files) {
      expect(file.started).toBe(true);
      expect(file.completed).toBe(true);
      expect(file.durationMs).toBeGreaterThanOrEqual(0);
      expect(file.wallDurationMs).toBeGreaterThanOrEqual(0);
    }

    expect(report.selections[0].files).toEqual(
      expect.arrayContaining([
        { ...changed, selection: 'selected' },
        { ...unrelated, selection: 'omitted' },
      ]),
    );
    expect(report.selections[0].excludedFailures).toEqual([unrelated]);
    expect(report.selections[1]).toMatchObject({ mode: 'full', fallbackReasons: ['configuration-change'], excludedFailures: [] });
    expect(report.selections[1].files.every(file => file.selection === 'selected')).toBe(true);
    expect(readFileSync(summary, 'utf8')).toContain('change: 1 selected, 1 omitted, 1 excluded failure');
  });

  it('distinguishes the same file in different projects and preserves Unicode and case', () => {
    write(
      'vitest.config.mjs',
      "export default { cacheDir: '.cache/vite', test: { maxWorkers: 1, fileParallelism: false, projects: ['fixture', 'Fixture'].map(name => ({ test: { name, include: ['test/Changed*.test.ts'] } })) } };\n",
    );

    const document = plan();
    const otherProject = { ...changed, project: 'Fixture' };

    document.selections = [
      { name: 'change', mode: 'related', fallbackReasons: [], inventory: [changed, otherProject], tests: [otherProject] },
    ];

    const result = run(document);

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(reports()[0].files).toEqual(expect.arrayContaining([expect.objectContaining(changed), expect.objectContaining(otherProject)]));
    expect(reports()[0].selections[0].files).toEqual(
      expect.arrayContaining([
        { ...changed, selection: 'omitted' },
        { ...otherProject, selection: 'selected' },
      ]),
    );
  });

  it('records collection failures as excluded failures and counts intentionally skipped tests', () => {
    write(changed.file, "import { it } from 'vitest';\nit.skip('skipped', () => {});\n");
    write(unrelated.file, "throw new Error('cannot collect unrelated tests');\n");

    const result = run();
    const [report] = reports();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot collect unrelated tests');
    expect(report.inventoryComplete).toBe(true);
    expect(report.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...changed,
          state: 'skipped',
          completed: true,
          counts: { total: 1, passed: 0, failed: 0, skipped: 1, pending: 0 },
        }),
        expect.objectContaining({
          ...unrelated,
          state: 'failed',
          completed: true,
          counts: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
        }),
      ]),
    );
    expect(report.selections[0].excludedFailures).toEqual([unrelated]);
  });

  it('writes incomplete evidence and raises a reporter error when execution is cancelled', () => {
    write(
      'cancel-reporter.mjs',
      "export default class { onInit(vitest) { this.vitest = vitest; } onTestModuleStart() { void this.vitest.cancelCurrentRun('keyboard-input').catch(() => {}); } }\n",
    );

    const result = run(plan(), ['--reporter=./cancel-reporter.mjs']);
    const [report] = reports();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[affected] Incomplete full inventory');
    expect(report).toMatchObject({ reason: 'interrupted', inventoryComplete: false });
    expect(report.inventoryProblems.length).toBeGreaterThan(0);
  });

  it('is a no-op without a plan, including outside a Git checkout', () => {
    rmSync(join(root, '.git'), { recursive: true });

    const result = run(null, [changed.file]);

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(reports()).toEqual([]);
  });

  it.each(['head', 'tree'] as const)('rejects a stale %s before the tests run', field => {
    const document = plan();

    document[field] = '0'.repeat(40);

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`[affected] Plan ${field} does not match the current checkout`);
    expect(reports()).toEqual([]);
  });

  it('rejects a missing plan instead of silently dropping the audit', () => {
    const result = run(null, [], { EXOJS_AFFECTED_PLAN: 'missing.json' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Cannot read plan');
    expect(reports()).toEqual([]);
  });

  it('rejects an invalid plan document', () => {
    write('.workspace/invalid.json', '{"version":1,"selections":[]}');

    const result = run(null, [], { EXOJS_AFFECTED_PLAN: '.workspace/invalid.json' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Invalid plan');
  });

  it('rejects a filtered invocation that does not exercise the full project inventory', () => {
    const result = run(plan(), [changed.file]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Full inventory mismatch');
    expect(result.stderr).toContain(unrelated.file);
  });

  it('rejects a plan that leaves a discovered file out of its inventory', () => {
    const document = plan();

    document.selections[0].inventory = [changed];

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Full inventory mismatch');
    expect(result.stderr).toContain(unrelated.file);
  });

  it('rejects a nonexistent expected file', () => {
    const document = plan();

    document.selections[0].inventory.push({ project: 'fixture', file: 'test/missing.test.ts' });

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Full inventory mismatch');
    expect(result.stderr).toContain('test/missing.test.ts');
  });

  it('rejects full mode when a file is omitted from the selected tests', () => {
    const document = plan();

    document.selections[1].tests = [changed];

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Invalid plan');
    expect(result.stderr).toContain('full mode must select the entire inventory');
  });

  it('rejects duplicate project/file pairs within a scenario', () => {
    const document = plan();

    document.selections[0].inventory.push(changed);

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Invalid plan');
    expect(result.stderr).toContain('duplicate project/file pair');
  });

  it('rejects selected tests outside the full inventory', () => {
    const document = plan();

    document.selections[0].tests.push({ project: 'fixture', file: 'test/absent.test.ts' });

    const result = run(document);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('[affected] Invalid plan');
    expect(result.stderr).toContain('selects a file outside its inventory');
  });

  it('fails visibly when HEAD changes during execution', () => {
    write(unrelated.file, passingTest);
    write(
      changed.file,
      "import { execFileSync } from 'node:child_process';\nimport { it } from 'vitest';\nit('changes checkout', () => { execFileSync('git', ['checkout', '-q', '--detach', 'HEAD^']); });\n",
    );
    git('add', '.');
    git('commit', '-qm', 'switchable fixture');
    git('commit', '--allow-empty', '-qm', 'new checkout');

    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('2 passed');
    expect(result.stderr).toContain('[affected] Plan head does not match the current checkout');
  });

  it('writes separate reports for separate invocations and supports an absolute plan path', () => {
    const document = plan();

    for (let invocation = 0; invocation < 2; invocation++) {
      const result = run(document, [], { EXOJS_AFFECTED_PLAN: join(root, '.workspace/plan.json') });

      expect(result.status).toBe(1);
    }

    expect(reports()).toHaveLength(2);
    expect(readdirSync(resultDirectory).every(file => /^affected-[\da-f-]{36}\.json$/.test(file))).toBe(true);
  });
});
