import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { laneTimeoutMinutes } from './ci/lanes.ts';
import { changedFilesBetween } from './ci/local-policy.ts';
import { DIST_PREFLIGHT, needsDist, parseLocalLaneOptions, planLocalLanes } from './ci/local-lanes.ts';
import { effectiveLanes, type LaneAreas, selectAreas } from './ci/select-lanes.ts';
import { atLeastOutputMode, readOutputOptions } from './lib/output.ts';
import { runCommand, type RunCommandResult } from './lib/run-command.ts';
import { type acquireValidationLock, waitForValidationLock } from './lib/validation-lock.ts';

/** Lists the affected lanes; --run executes them. --only <id[,id]> is a diagnostic subset, never full validation. */
const git = (cwd: string, ...args: string[]): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000 });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);
  }

  return result.stdout;
};

const paths = (output: string): string[] => output.split('\0').filter(Boolean);

/**
 * Renames are reported as a deletion plus an addition: with rename detection a
 * moved file lists only its new path, and the vanished original would go unseen.
 */
export const changedFiles = (base: string, cwd = process.cwd()): string[] => {
  const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], { cwd, encoding: 'utf8', timeout: 30_000 });
  const from = mergeBase.status === 0 ? mergeBase.stdout.trim() : base;

  return [
    ...new Set([
      ...paths(git(cwd, 'diff', '-z', '--name-only', '--no-renames', from, 'HEAD')),
      ...paths(git(cwd, 'diff', '-z', '--name-only', '--no-renames', 'HEAD')),
      ...paths(git(cwd, 'diff', '-z', '--name-only', '--no-renames', '--cached')),
      ...paths(git(cwd, 'ls-files', '-z', '--others', '--exclude-standard')),
    ]),
  ];
};

const ALL_AREAS: LaneAreas = {
  engine: true,
  site: true,
  audioFx: true,
  tilemapWorker: true,
  exampleCatalog: true,
  benchStructural: true,
  release: true,
  guides: true,
  siteData: true,
  createExoApp: true,
  authoredMapFixture: true,
};

const main = async (): Promise<void> => {
  const outputOptions = readOutputOptions(process.argv.slice(2));
  const options = parseLocalLaneOptions(outputOptions.argv);
  // Pre-push validates only what the remote will receive. The ordinary
  // diagnostic command deliberately includes local edits and untracked files.
  const files =
    options.all || options.only
      ? []
      : options.prePush && options.head !== undefined
        ? changedFilesBetween(options.base, options.head)
        : changedFiles(options.base);

  // A resolved empty diff needs no tests. Manual diagnostics deliberately
  // include dirty and untracked files; pre-push compares committed inputs only.
  // An unresolvable Git range throws rather than being treated as empty, while
  // explicit --all and --only commands are never skipped.
  if (!options.all && options.only === undefined && files.length === 0) {
    process.stdout.write(
      options.prePush && options.head !== undefined
        ? 'lanes: no committed files changed in pushed range; no test lanes needed.\n'
        : 'lanes: no files changed in the selected range; no test lanes needed.\n',
    );

    return;
  }

  const areas = options.all || options.only ? ALL_AREAS : selectAreas(files);
  const { selected, deferred } = planLocalLanes(effectiveLanes(areas), options, files);
  const distPreflight = needsDist(selected);
  const diagnostic = options.only !== undefined || options.quick;
  const scope = options.only
    ? `diagnostic subset: ${options.only.join(', ')}`
    : options.all
      ? 'every local lane'
      : `${files.length} changed file(s) since ${options.base}`;

  for (const lane of deferred) {
    process.stdout.write(`lanes: deferred ${lane.id} to mandatory CI. ${lane.reason}\n`);
  }

  if (!options.run || outputOptions.mode !== 'silent') {
    process.stdout.write(`lanes: ${scope}\n`);

    if (distPreflight) {
      process.stdout.write(`  dist (before the first lane): ${DIST_PREFLIGHT}\n`);
    }

    for (const lane of selected) {
      process.stdout.write(`  ${lane.id}: ${lane.run} (limit ${laneTimeoutMinutes(lane)}m)\n`);
    }

    if (selected.length === 0) {
      process.stdout.write('  (nothing to run)\n');
    }
  }

  if (!options.run) {
    process.stdout.write('\nlanes: pass --run to execute these.\n');

    return;
  }

  if (options.prePush && options.head !== undefined) {
    // The affected graph runs against the checked-out HEAD. If the user
    // pushes another commit, never silently certify a different tree.
    const checkedOutHead = git(process.cwd(), 'rev-parse', 'HEAD').trim();

    if (checkedOutHead !== options.head) {
      throw new Error('Full pre-push test selection requires the pushed commit to equal checkout HEAD. Use CI for another ref.');
    }
  }

  if (selected.length === 0) {
    return;
  }

  let lock: ReturnType<typeof acquireValidationLock> | undefined;
  let checkoutLock: ReturnType<typeof acquireValidationLock> | undefined;
  const controller = new AbortController();
  let interrupted = 0;

  const onInterrupt = (): void => {
    interrupted = 130;
    controller.abort('SIGINT');
  };

  const onTerminate = (): void => {
    interrupted = 143;
    controller.abort('SIGTERM');
  };

  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const started = Date.now();
  const results: Array<{ id: string; result: RunCommandResult }> = [];
  let status = 0;
  let completed = false;
  let retainLock = false;

  try {
    const onWait = (owner: string): void => {
      process.stderr.write(`lanes: waiting for validation ownership. ${owner}\n`);
    };

    checkoutLock = await waitForValidationLock(process.cwd(), controller.signal, onWait, 'checkout');

    // Builds and reports belong to the checkout; test lanes also share GPU and machine-load budgets.
    if (selected.some(lane => lane.local !== 'gate')) {
      lock = await waitForValidationLock(process.cwd(), controller.signal, onWait);
    }

    if (distPreflight) {
      const result = await runCommand({
        label: 'dist',
        command: DIST_PREFLIGHT,
        signal: controller.signal,
        output: outputOptions.mode,
      });

      results.push({ id: 'dist', result });
      retainLock ||= result.cleanupError !== undefined;

      if (result.status !== 0 || interrupted !== 0) {
        status = interrupted || result.status;
      }
    }

    for (const lane of status === 0 ? selected : []) {
      if (controller.signal.aborted) {
        status = interrupted;
        break;
      }

      const result = await runCommand({
        label: lane.id,
        command: lane.run,
        timeoutMs: laneTimeoutMinutes(lane) * 60_000,
        signal: controller.signal,
        output: atLeastOutputMode(outputOptions.mode, lane.minimumOutput ?? 'silent'),
      });
      results.push({ id: lane.id, result });
      retainLock ||= result.cleanupError !== undefined;

      if (result.status !== 0 || interrupted !== 0) {
        status = interrupted || result.status;
        break;
      }
    }

    completed = status === 0 && results.length === selected.length + (distPreflight ? 1 : 0);
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }

    status = interrupted;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);

    try {
      const logDirectory = resolve('.workspace/logs');
      mkdirSync(logDirectory, { recursive: true });
      const summary = resolve(logDirectory, `lanes-${started}-${process.pid}-${randomUUID()}.json`);
      writeFileSync(
        summary,
        `${JSON.stringify({ completed, diagnostic, prePush: options.prePush, scope, base: options.base, selected: selected.map(lane => lane.id), deferred, durationMs: Date.now() - started, results }, null, 2)}\n`,
      );

      if (outputOptions.mode !== 'silent' || status !== 0) {
        process.stdout.write(`lanes: summary ${summary}\n`);
      }
    } finally {
      if (!retainLock) {
        lock?.release();
        checkoutLock?.release();
      } else {
        lock?.retain();
        checkoutLock?.retain();
        process.stderr.write(
          `lanes: cleanup was incomplete; inspect the owned processes before removing ${lock?.path ?? checkoutLock!.path}.\n`,
        );
      }
    }
  }

  process.exitCode = status;

  if (completed && outputOptions.mode !== 'silent') {
    process.stdout.write(
      diagnostic
        ? 'lanes: diagnostic subset passed; full validation is still required.\n'
        : deferred.length
          ? 'lanes: pre-push checks passed; deferred lanes still require CI for this commit.\n'
          : 'lanes: all selected lanes passed.\n',
    );
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    process.stderr.write(`lanes: ${String(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
