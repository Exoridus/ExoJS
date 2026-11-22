import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import type { Reporter, TestModule, TestModuleState, TestRunEndReason, TestSpecification, Vitest } from 'vitest/node';

interface TestFile {
  project: string;
  file: string;
}

interface Selection {
  name: string;
  mode: 'related' | 'full';
  fallbackReasons: string[];
  inventory: TestFile[];
  tests: TestFile[];
}

/** The checkout and complete inventories used to calculate shadow selections. */
export interface AffectedPlanDocument {
  version: 1;
  base: string | null;
  head: string;
  tree: string;
  selections: Selection[];
}

interface FileObservation extends TestFile {
  state: TestModuleState;
  started: boolean;
  completed: boolean;
  counts: { total: number; passed: number; failed: number; skipped: number; pending: number };
  durationMs: number | null;
  wallDurationMs: number | null;
}

interface SelectionObservation extends Selection {
  files: Array<TestFile & { selection: 'selected' | 'omitted' }>;
  excludedFailures: TestFile[];
}

/** One full Vitest invocation, with each proposed selection compared afterwards. */
export interface AffectedRunDocument {
  version: 1;
  base: string | null;
  head: string;
  tree: string;
  startedAt: string;
  finishedAt: string;
  reason: TestRunEndReason;
  unhandledErrors: number;
  inventoryComplete: boolean;
  inventoryProblems: string[];
  inventory: TestFile[];
  files: FileObservation[];
  selections: SelectionObservation[];
}

const keyOf = (file: TestFile): string => JSON.stringify([file.project, file.file]);
const labelOf = (file: TestFile): string => `[${file.project}] ${file.file}`;
const unixPath = (file: string): string => (process.platform === 'win32' ? file.replaceAll('\\', '/') : file);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const emptyCounts = (): FileObservation['counts'] => ({ total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 });

const invalidPlan: (message: string) => never = message => {
  throw new Error(`[affected] Invalid plan: ${message}`);
};

const validateFiles: (value: unknown, label: string, root: string) => asserts value is TestFile[] = (value, label, root) => {
  if (!Array.isArray(value)) {
    invalidPlan(`${label} must be an array`);
  }

  const seen = new Set<string>();

  for (const file of value) {
    if (!isRecord(file) || typeof file.project !== 'string' || typeof file.file !== 'string') {
      invalidPlan(`${label} entries must have project and file strings`);
    }

    if (
      !file.file ||
      file.file.includes('\0') ||
      isAbsolute(file.file) ||
      unixPath(relative(root, resolve(root, file.file))) !== file.file ||
      file.file === '..' ||
      file.file.startsWith('../')
    ) {
      invalidPlan(`${label} file must be an exact relative path within the checkout: ${file.file}`);
    }

    const key = keyOf({ project: file.project, file: file.file });

    if (seen.has(key)) {
      invalidPlan(`${label} contains a duplicate project/file pair: ${key}`);
    }

    seen.add(key);
  }
};

const validatePlan: (value: unknown, root: string) => asserts value is AffectedPlanDocument = (value, root) => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.base !== null && typeof value.base !== 'string') ||
    typeof value.head !== 'string' ||
    typeof value.tree !== 'string' ||
    !Array.isArray(value.selections) ||
    !value.selections.length
  ) {
    invalidPlan('expected version 1, base, head, tree, and nonempty selections');
  }

  const names = new Set<string>();

  for (const selection of value.selections) {
    if (
      !isRecord(selection) ||
      typeof selection.name !== 'string' ||
      !selection.name ||
      (selection.mode !== 'related' && selection.mode !== 'full') ||
      !Array.isArray(selection.fallbackReasons) ||
      !selection.fallbackReasons.every(reason => typeof reason === 'string')
    ) {
      invalidPlan('each selection needs a name, mode, and fallbackReasons');
    }

    if (names.has(selection.name)) {
      invalidPlan(`duplicate selection name: ${selection.name}`);
    }

    names.add(selection.name);
    validateFiles(selection.inventory, `${selection.name}.inventory`, root);
    validateFiles(selection.tests, `${selection.name}.tests`, root);

    const inventory = new Set(selection.inventory.map(keyOf));

    for (const test of selection.tests) {
      if (!inventory.has(keyOf(test))) {
        invalidPlan(`${selection.name} selects a file outside its inventory: ${labelOf(test)}`);
      }
    }

    if (selection.mode === 'full' && selection.tests.length !== inventory.size) {
      invalidPlan(`${selection.name}: full mode must select the entire inventory`);
    }
  }
};

/** Read a plan without discarding the selector's extra explanation metadata. */
export const readAffectedPlan = (path: string, root: string): AffectedPlanDocument => {
  let contents: string;

  try {
    contents = readFileSync(resolve(root, path), 'utf8');
  } catch (cause) {
    throw new Error(`[affected] Cannot read plan: ${path}`, { cause });
  }

  let document: unknown;

  try {
    document = JSON.parse(contents);
  } catch (cause) {
    throw new Error('[affected] Invalid plan: expected JSON', { cause });
  }

  validatePlan(document, root);

  return document;
};

/** Selected execution requires clean inputs as well as the plan's committed identity. */
export const assertAffectedPlanCheckout = (plan: AffectedPlanDocument, root: string, clean = false): void => {
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  let identity: string[];

  try {
    identity = git('rev-parse', 'HEAD', 'HEAD^{tree}').trim().split(/\r?\n/);
  } catch (cause) {
    throw new Error('[affected] Cannot verify the current checkout', { cause });
  }

  for (const [index, field] of (['head', 'tree'] as const).entries()) {
    if (plan[field] !== identity[index]) {
      throw new Error(`[affected] Plan ${field} does not match the current checkout`);
    }
  }

  if (clean && git('status', '--porcelain=v1', '-z', '--untracked-files=all') !== '') {
    throw new Error('[affected] Selected execution requires a clean checkout, including tracked and untracked inputs');
  }
};

/**
 * Audits proposed affected-test selections while Vitest still runs every file.
 * Setting EXOJS_AFFECTED_PLAN opts in; invalid or stale plans fail the run.
 * Full execution remains responsible for assertion failures; the reporter only observes.
 */
export default class AffectedReporter implements Reporter {
  private _root = process.cwd();
  private _plan: AffectedPlanDocument | undefined;
  private _resultsDirectory = '';
  private _inventory: TestFile[] = [];
  private readonly _files = new Map<string, FileObservation>();
  private readonly _started = new Map<string, number>();
  private readonly _ended = new Map<string, number>();
  private _startedAt = '';

  public onInit(vitest: Vitest): void {
    const path = process.env.EXOJS_AFFECTED_PLAN;

    this._plan = undefined;

    if (path === undefined) {
      return;
    }

    this._root = vitest.config.root;
    this._plan = readAffectedPlan(path, this._root);
    this._assertCheckout();
    this._resultsDirectory = resolve(this._root, process.env.EXOJS_AFFECTED_RESULTS_DIR ?? '.workspace/affected-tests/results');

    // The reporter retains its plan for the complete lifecycle. Workers and
    // nested test-runner fixtures must not inherit this invocation's plan.
    delete process.env.EXOJS_AFFECTED_MODE;
    delete process.env.EXOJS_AFFECTED_PLAN;
  }

  public onTestRunStart(specifications: readonly TestSpecification[]): void {
    if (!this._plan) {
      return;
    }

    this._assertCheckout();
    this._files.clear();
    this._started.clear();
    this._ended.clear();
    this._startedAt = new Date().toISOString();
    this._inventory = specifications.map(specification => this._file(specification));

    const projects = new Set(this._inventory.map(file => file.project));
    const actual = new Set(this._inventory.map(keyOf));

    if (actual.size !== this._inventory.length || (!actual.size && this._plan.selections.some(selection => selection.inventory.length))) {
      throw new Error('[affected] Full inventory mismatch: empty or duplicate test specifications');
    }

    for (const selection of this._plan.selections) {
      // A lane can invoke its projects in separate Vitest processes. Compare
      // each represented project in full without demanding other processes' files.
      const expected = selection.inventory.filter(file => projects.has(file.project));
      const expectedKeys = new Set(expected.map(keyOf));
      const missing = expected.filter(file => !actual.has(keyOf(file))).map(file => `missing ${labelOf(file)}`);
      const unexpected = this._inventory.filter(file => !expectedKeys.has(keyOf(file))).map(file => `unexpected ${labelOf(file)}`);

      if (missing.length || unexpected.length) {
        throw new Error(`[affected] Full inventory mismatch for ${selection.name}: ${[...missing, ...unexpected].join('; ')}`);
      }
    }

    for (const file of this._inventory) {
      this._files.set(keyOf(file), {
        ...file,
        state: 'queued',
        started: false,
        completed: false,
        counts: emptyCounts(),
        durationMs: null,
        wallDurationMs: null,
      });
    }
  }

  public onTestModuleStart(testModule: TestModule): void {
    if (this._plan) {
      this._started.set(keyOf(this._file(testModule)), performance.now());
    }
  }

  public onTestModuleEnd(testModule: TestModule): void {
    if (this._plan) {
      this._ended.set(keyOf(this._file(testModule)), performance.now());
      this._record(testModule);
    }
  }

  public onTestRunEnd(testModules: readonly TestModule[], errors: readonly unknown[], reason: TestRunEndReason): void {
    if (!this._plan) {
      return;
    }

    this._assertCheckout();

    for (const testModule of testModules) {
      this._record(testModule);
    }

    const files = [...this._files.values()];
    const expected = new Set(this._inventory.map(keyOf));
    const inventoryProblems = this._inventory.filter(file => !this._files.has(keyOf(file))).map(file => `missing result ${labelOf(file)}`);

    inventoryProblems.push(
      ...files.flatMap(file => {
        if (!expected.has(keyOf(file))) {
          return [`unexpected result ${labelOf(file)}`];
        }

        return file.completed && !file.counts.pending ? [] : [`incomplete result ${labelOf(file)}`];
      }),
    );
    const selections: SelectionObservation[] = this._plan.selections.map(selection => {
      const selected = new Set(selection.tests.map(keyOf));

      return {
        ...selection,
        files: files.map(({ project, file }) => ({
          project,
          file,
          selection: selected.has(keyOf({ project, file })) ? 'selected' : 'omitted',
        })),
        excludedFailures: files
          .filter(file => !selected.has(keyOf(file)) && (file.state === 'failed' || file.counts.failed > 0))
          .map(({ project, file }) => ({ project, file })),
      };
    });
    const report: AffectedRunDocument = {
      version: 1,
      base: this._plan.base,
      head: this._plan.head,
      tree: this._plan.tree,
      startedAt: this._startedAt,
      finishedAt: new Date().toISOString(),
      reason,
      unhandledErrors: errors.length,
      inventoryComplete: !inventoryProblems.length,
      inventoryProblems,
      inventory: this._inventory,
      files,
      selections,
    };

    mkdirSync(this._resultsDirectory, { recursive: true });
    writeFileSync(resolve(this._resultsDirectory, `affected-${randomUUID()}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });

    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = selections.map(selection => {
        const selected = selection.files.filter(file => file.selection === 'selected').length;

        return `- ${selection.name}: ${String(selected)} selected, ${String(files.length - selected)} omitted, ${String(selection.excludedFailures.length)} excluded failure(s)`;
      });

      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Affected-test shadow comparison\n\n${rows.join('\n')}\n`);
    }

    if (inventoryProblems.length) {
      throw new Error(`[affected] Incomplete full inventory: ${inventoryProblems.join('; ')}`);
    }
  }

  private _file(source: TestSpecification | TestModule): TestFile {
    return { project: source.project.name, file: unixPath(relative(this._root, source.moduleId)) };
  }

  private _record(testModule: TestModule): void {
    const file = this._file(testModule);
    const key = keyOf(file);
    const counts = emptyCounts();

    for (const test of testModule.children.allTests()) {
      counts.total++;
      counts[test.result().state]++;
    }

    const state = testModule.state();
    const start = this._started.get(key);
    const end = this._ended.get(key);

    this._files.set(key, {
      ...file,
      state,
      started: start !== undefined,
      completed: state !== 'pending' && state !== 'queued',
      counts,
      durationMs: testModule.diagnostic().duration,
      wallDurationMs: start === undefined || end === undefined ? null : Math.max(0, end - start),
    });
  }

  private _assertCheckout(): void {
    if (!this._plan) {
      return;
    }

    assertAffectedPlanCheckout(this._plan, this._root);
  }
}
