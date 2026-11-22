import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createVitest,
  parseCLI,
  type Reporter,
  type TestModule,
  type TestModuleState,
  type TestRunEndReason,
  type TestSpecification,
  type Vitest,
} from 'vitest/node';

import { type AffectedPlanDocument, assertAffectedPlanCheckout, readAffectedPlan } from './affected-reporter.ts';

type TestFile = AffectedPlanDocument['selections'][number]['inventory'][number];

interface ExecutedFile extends TestFile {
  state: TestModuleState | 'missing';
  counts: { total: number; passed: number; failed: number; skipped: number; pending: number };
  durationMs: number | null;
}

/** Evidence from a selected execution, distinct from the full-run shadow audit. */
export interface SelectedExecutionDocument {
  version: 1;
  executionMode: 'selected';
  fullInventoryAudited: false;
  inventoryValidated: true;
  head: string;
  tree: string;
  base: string | null;
  reason: TestRunEndReason;
  unhandledErrors: number;
  inventory: TestFile[];
  selected: TestFile[];
  omitted: TestFile[];
  selectedInventoryComplete: boolean;
  files: ExecutedFile[];
}

const fileKey = (file: TestFile): string => JSON.stringify([file.project, file.file]);
const displayFile = (file: TestFile): string => `[${file.project}] ${file.file}`;
const portable = (file: string): string => (process.platform === 'win32' ? file.replaceAll('\\', '/') : file);
const specificationFile = (root: string, spec: TestSpecification | TestModule): TestFile => ({
  project: spec.project.name,
  file: portable(relative(root, spec.moduleId)),
});
const vitestBin = (): string => join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
const shadowReporterPath = fileURLToPath(new URL('./affected-reporter.ts', import.meta.url));

/** Default and full-fallback runs use the original CLI, arguments, and reporters. */
const runNative = (args: readonly string[], env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Promise<number> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [vitestBin(), 'run', ...args], { stdio: 'inherit', env });
    let interrupted = 0;

    const onInterrupt = (): void => {
      interrupted = 130;
      child.kill('SIGINT');
    };

    const onTerminate = (): void => {
      interrupted = 143;
      child.kill('SIGTERM');
    };

    const onAbort = (): void => {
      if (signal?.reason === 130) {
        onInterrupt();
      } else {
        onTerminate();
      }
    };

    const cleanup = (): void => {
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      signal?.removeEventListener('abort', onAbort);
    };

    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    signal?.addEventListener('abort', onAbort, { once: true });

    if (signal?.aborted) {
      onAbort();
    }

    child.once('error', error => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolvePromise(interrupted || code || (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal ? 1 : 0));
    });
  });

/**
 * Vitest's terminal signal listener exits before async cleanup can complete.
 * Keep its process outside the caller's signal group and request public
 * cancellation over IPC, then wait for close() and the ordinary exit status.
 */
const runControlled = (args: readonly string[]): Promise<number> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      detached: process.platform !== 'win32',
    });
    let interrupted = 0;
    let forcedTermination: ReturnType<typeof setTimeout> | undefined;

    const cancel = (code: number): void => {
      interrupted = code;

      if (child.connected) {
        child.send({ type: 'affected-run-cancel', code }, () => {
          // An already-finished child needs no cancellation.
        });
      }

      // A configuration hook can hang before createVitest returns a context.
      // Bound cancellation cleanup without changing any test's timeout.
      forcedTermination ??= setTimeout(() => {
        console.error('[affected-run] ERROR: cancellation cleanup did not finish within 30 seconds');

        try {
          if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // The child may have exited immediately before the deadline.
        }
      }, 30_000).unref();
    };

    const onInterrupt = (): void => cancel(130);
    const onTerminate = (): void => cancel(143);

    const cleanup = (): void => {
      clearTimeout(forcedTermination);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
    };

    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    child.once('error', error => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolvePromise(interrupted || code || (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal ? 1 : 0));
    });
  });

const nativeOptions = (args: readonly string[]): ReturnType<typeof parseCLI> => {
  const native = parseCLI(['vitest', 'run', ...args]);
  // A manifest describes complete projects. Filename/name/tag/shard filters
  // would silently change that scope; timeout rechecks bypass this adapter.
  const allowed = new Set([
    '--',
    'color',
    'run',
    'project',
    'p',
    'root',
    'r',
    'config',
    'c',
    'reporter',
    'outputFile',
    'coverage',
    'fileParallelism',
    'maxWorkers',
    'minWorkers',
    'silent',
    'hideSkippedTests',
    'disableConsoleIntercept',
  ]);
  const unsupported = Object.keys(native.options).filter(option => !allowed.has(option));

  if (native.filter.length || unsupported.length) {
    throw new Error(`Selected execution has unsupported options or filters: ${[...unsupported, ...native.filter].join(', ')}`);
  }

  if (!native.options.project?.length) {
    throw new Error('Selected execution requires explicit Vitest --project options');
  }

  return native;
};

const validateInventory = (context: Vitest, document: AffectedPlanDocument, specifications: readonly TestSpecification[]): TestFile[] => {
  const inventory = specifications.map(spec => specificationFile(context.config.root, spec));
  const actual = new Set(inventory.map(fileKey));
  const projects = new Set(context.projects.map(project => project.name));

  if (!inventory.length || actual.size !== inventory.length) {
    throw new Error('Full inventory mismatch: empty or duplicate discovered specifications');
  }

  for (const selection of document.selections) {
    const expected = selection.inventory.filter(file => projects.has(file.project));
    const expectedKeys = new Set(expected.map(fileKey));
    const missing = expected.filter(file => !actual.has(fileKey(file))).map(file => `missing ${displayFile(file)}`);
    const unexpected = inventory.filter(file => !expectedKeys.has(fileKey(file))).map(file => `unexpected ${displayFile(file)}`);

    if (missing.length || unexpected.length) {
      throw new Error(`Full inventory mismatch for ${selection.name}: ${[...missing, ...unexpected].join('; ')}`);
    }
  }

  return inventory;
};

const observeFile = (root: string, module: TestModule): ExecutedFile => {
  const counts = { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 };

  for (const test of module.children.allTests()) {
    counts.total++;
    counts[test.result().state]++;
  }

  return { ...specificationFile(root, module), state: module.state(), counts, durationMs: module.diagnostic().duration };
};

const main = async (args: string[]): Promise<number> => {
  if (process.env.EXOJS_AFFECTED_MODE !== 'enforce') {
    return runNative(args);
  }

  const planPath = process.env.EXOJS_AFFECTED_PLAN;

  if (!planPath) {
    throw new Error('EXOJS_AFFECTED_PLAN is required when EXOJS_AFFECTED_MODE=enforce');
  }

  const native = nativeOptions(args);
  const root = resolve(native.options.root ?? process.cwd());
  const document = readAffectedPlan(planPath, root);
  const selection = document.selections.find(item => item.name === 'change');

  // This process owns the plan. Test workers and the child commands they
  // launch must not activate it again for their independent fixtures.
  delete process.env.EXOJS_AFFECTED_MODE;
  delete process.env.EXOJS_AFFECTED_PLAN;

  if (!selection) {
    throw new Error('The plan must contain the actual change selection named "change"');
  }

  assertAffectedPlanCheckout(document, root, true);

  let context: Vitest | undefined;
  let inventory: TestFile[] = [];
  let selected: TestFile[] = [];
  let interrupted = 0;
  let hasShadowReporter = false;
  const cancellation = new AbortController();

  const cancel = (code: number): void => {
    interrupted = code;
    cancellation.abort(code);
    void context?.cancelCurrentRun('keyboard-input').catch(() => {
      // The awaited test run still reports its own error; close() follows it.
    });
  };

  const onMessage = (message: unknown): void => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'affected-run-cancel' &&
      'code' in message &&
      (message.code === 130 || message.code === 143)
    ) {
      cancel(message.code);
    }
  };

  const onDisconnect = (): void => cancel(143);
  const executionReporter: Reporter = {
    onTestRunEnd(modules, errors, reason): void {
      const observed = modules.map(module => observeFile(root, module));
      const results = new Map(observed.map(file => [fileKey(file), file]));
      const selectedKeys = new Set(selected.map(fileKey));
      const files: ExecutedFile[] = selected.map(
        file =>
          results.get(fileKey(file)) ?? {
            ...file,
            state: 'missing',
            counts: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
            durationMs: null,
          },
      );
      const complete =
        results.size === observed.length &&
        observed.every(file => selectedKeys.has(fileKey(file))) &&
        files.every(file => !['missing', 'queued', 'pending'].includes(file.state) && file.counts.pending === 0);
      const report: SelectedExecutionDocument = {
        version: 1,
        executionMode: 'selected',
        fullInventoryAudited: false,
        inventoryValidated: true,
        head: document.head,
        tree: document.tree,
        base: document.base,
        reason,
        unhandledErrors: errors.length,
        inventory,
        selected,
        omitted: inventory.filter(file => !selectedKeys.has(fileKey(file))),
        selectedInventoryComplete: complete,
        files,
      };
      const directory = resolve(root, process.env.EXOJS_AFFECTED_EXECUTION_DIR ?? '.workspace/affected-tests/execution');

      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `selected-${randomUUID()}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });

      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n### Affected-test selected execution\n\n${String(selected.length)}/${String(inventory.length)} files selected; full inventory validated before execution. This is not a full-run shadow audit.\n`,
        );
      }

      if (!complete) {
        throw new Error('Selected test execution did not complete its exact specification inventory');
      }
    },
  };

  process.on('message', onMessage);
  process.once('disconnect', onDisconnect);

  try {
    context = await createVitest(
      { ...native.options, watch: false, run: true },
      {
        plugins: [
          {
            name: 'exojs:affected-selected-execution',
            enforce: 'post',
            configureVitest({ vitest }) {
              const reporters = vitest.config.reporters;
              const retained = reporters.filter(
                reporter =>
                  !(
                    Array.isArray(reporter) &&
                    typeof reporter[0] === 'string' &&
                    (resolve(root, reporter[0]) === shadowReporterPath || resolve(process.cwd(), reporter[0]) === shadowReporterPath)
                  ),
              );

              hasShadowReporter ||= retained.length !== reporters.length;

              reporters.splice(0, reporters.length, ...retained);

              if (!reporters.includes(executionReporter)) {
                reporters.push(executionReporter);
              }
            },
          },
        ],
      },
    );

    if (realpathSync(context.config.root) !== realpathSync(root)) {
      throw new Error('The Vitest root differs from the pinned checkout; pass its root explicitly');
    }

    const specifications = await context.globTestSpecifications();

    inventory = validateInventory(context, document, specifications);
    assertAffectedPlanCheckout(document, root, true);

    if (interrupted) {
      return interrupted;
    }

    if (selection.mode === 'full' || selection.fallbackReasons.length || context.config.coverage.enabled) {
      await context.close();
      context = undefined;
      assertAffectedPlanCheckout(document, root, true);

      const code = await runNative(
        args,
        {
          ...process.env,
          // The full-run reporter captures this before workers are started.
          EXOJS_AFFECTED_PLAN: hasShadowReporter ? planPath : undefined,
        },
        cancellation.signal,
      );

      assertAffectedPlanCheckout(document, root, true);

      return code;
    }

    const projects = new Set(context.projects.map(project => project.name));
    const keys = new Set(selection.tests.filter(file => projects.has(file.project)).map(fileKey));
    const exact = specifications.filter(spec => keys.has(fileKey(specificationFile(root, spec))));

    selected = exact.map(spec => specificationFile(root, spec));

    if (selected.length !== keys.size) {
      throw new Error('The selected project/file identities do not match the discovered specifications');
    }

    await context.standalone();
    assertAffectedPlanCheckout(document, root, true);

    if (interrupted) {
      return interrupted;
    }

    // An empty affected set is valid only after the nonempty full inventory
    // was verified above. Vitest then emits ordinary zero-test JUnit evidence.
    if (!exact.length) {
      context.config.passWithNoTests = true;
    }

    const result = await context.runTestSpecifications(exact, false);

    assertAffectedPlanCheckout(document, root, true);

    if (result.unhandledErrors.length) {
      throw new Error(`Selected execution reported ${String(result.unhandledErrors.length)} unhandled error(s)`);
    }

    return interrupted || (result.testModules.some(module => module.state() === 'failed') ? 1 : Number(process.exitCode) || 0);
  } finally {
    try {
      await context?.close();
      assertAffectedPlanCheckout(document, root, true);
    } finally {
      process.removeListener('message', onMessage);
      process.removeListener('disconnect', onDisconnect);

      if (interrupted) {
        process.exitCode = interrupted;
      }
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const execute = process.env.EXOJS_AFFECTED_MODE === 'enforce' && !process.send ? runControlled : main;

  const code = await execute(args).catch((error: unknown) => {
    // The timeout-only wrapper treats this marker as fatal even if a test
    // report also contains a timeout. Manifest or reporter errors must not retry.
    console.error(`[affected-run] ERROR: ${error instanceof Error ? error.message : String(error)}`);

    return Number(process.exitCode) || 1;
  });

  // close() can record teardown failures after the run result was returned.
  // Preserve that nonzero status as well as explicit run/cancellation codes.
  process.exitCode = code || Number(process.exitCode) || 0;

  if (process.connected) {
    process.disconnect?.();
  }
}
