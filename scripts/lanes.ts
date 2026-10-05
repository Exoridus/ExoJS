import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { laneTimeoutMinutes } from './ci/lanes.ts';
import { parseLocalLaneOptions, selectLocalLanes } from './ci/local-lanes.ts';
import { effectiveLanes, selectAreas, type LaneAreas } from './ci/select-lanes.ts';
import { atLeastOutputMode, readOutputOptions } from './lib/output.ts';
import { runCommand, type RunCommandResult } from './lib/run-command.ts';
import { acquireValidationLock } from './lib/validation-lock.ts';

/** Lists the affected lanes; --run executes them. --only <id[,id]> is a diagnostic subset, never full validation. */
const git = (...args: string[]): string => {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
};
const lines = (output: string): string[] =>
  output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
const changedFiles = (base: string): string[] => {
  const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8', timeout: 30_000 });
  const from = mergeBase.status === 0 ? mergeBase.stdout.trim() : base;
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', from, 'HEAD')),
      ...lines(git('diff', '--name-only', 'HEAD')),
      ...lines(git('diff', '--name-only', '--cached')),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
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
};

const main = async (): Promise<void> => {
  const outputOptions = readOutputOptions(process.argv.slice(2));
  const options = parseLocalLaneOptions(outputOptions.argv);
  const files = options.all || options.only ? [] : changedFiles(options.base);
  const areas = options.all || options.only ? ALL_AREAS : selectAreas(files);
  const selected = selectLocalLanes(effectiveLanes(areas), options, files);
  const diagnostic = options.only !== undefined || options.quick;
  const scope = options.only
    ? `diagnostic subset: ${options.only.join(', ')}`
    : options.all
      ? 'every local lane'
      : `${files.length} changed file(s) since ${options.base}`;
  if (!options.run || outputOptions.mode !== 'silent') {
    process.stdout.write(`lanes: ${scope}\n`);
    for (const lane of selected) process.stdout.write(`  ${lane.id}: ${lane.run} (limit ${laneTimeoutMinutes(lane)}m)\n`);
    if (selected.length === 0) process.stdout.write('  (nothing to run)\n');
  }
  if (!options.run) {
    process.stdout.write('\nlanes: pass --run to execute these.\n');
    return;
  }
  if (selected.length === 0) return;

  const lock = acquireValidationLock(process.cwd());
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
  const results: { id: string; result: RunCommandResult }[] = [];
  let status = 0;
  let completed = false;
  let retainLock = false;
  try {
    for (const lane of selected) {
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
    completed = status === 0 && results.length === selected.length;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    try {
      const logDirectory = resolve('.workspace/logs');
      mkdirSync(logDirectory, { recursive: true });
      const summary = resolve(logDirectory, `lanes-${started}-${process.pid}-${randomUUID()}.json`);
      writeFileSync(
        summary,
        `${JSON.stringify({ completed, diagnostic, scope, base: options.base, selected: selected.map(lane => lane.id), durationMs: Date.now() - started, results }, null, 2)}\n`,
      );
      if (outputOptions.mode !== 'silent' || status !== 0) process.stdout.write(`lanes: summary ${summary}\n`);
    } finally {
      if (!retainLock) lock.release();
      else process.stderr.write(`lanes: cleanup was incomplete; inspect the owned processes before removing ${lock.path}.\n`);
    }
  }
  process.exitCode = status;
  if (completed && outputOptions.mode !== 'silent') {
    process.stdout.write(diagnostic ? 'lanes: diagnostic subset passed; full validation is still required.\n' : 'lanes: all selected lanes passed.\n');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch(error => {
    process.stderr.write(`lanes: ${String(error instanceof Error ? error.message : error)}\n`);
    process.exitCode = 1;
  });
}
