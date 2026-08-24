/**
 * Run only the validation lanes a working copy's changes actually require.
 *
 * The path-to-lane decision is not made here: it comes from
 * `scripts/ci/select-lanes.mjs`, the same module the CI detector job uses, so a
 * local run and a pull request agree by construction. What this script adds is
 * the two things CI gets for free - the changed-file list (from git rather than
 * from `dorny/paths-filter`) and a concrete command per lane.
 *
 * Usage:
 *   pnpm lanes                 list the lanes this working copy needs
 *   pnpm lanes --run           run them, stopping at the first failure
 *   pnpm lanes --run --quick   the same, minus the lanes that need a browser
 *   pnpm lanes --run --tests-only   only the suites, leaving the static gates out
 *   pnpm lanes --base <ref>    compare against <ref> instead of origin/main
 *   pnpm lanes --all           every lane, as a push to the default branch gets
 *
 * The changed-file set spans the merge base with `--base` through the working
 * tree: committed, staged and unstaged changes plus untracked files all count,
 * because all of them are about to be pushed or are already being tested.
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { effectiveLanes, selectAreas } from './ci/select-lanes.mjs';

/**
 * Which lane an entry belongs to. `'always'` covers the checks CI runs on every
 * pull request without gating them on a path - they have no key in the
 * selector's vocabulary precisely because there is nothing to decide.
 */
export type LaneKey = keyof ReturnType<typeof effectiveLanes> | 'always';

/** One runnable step of a validation lane. */
export interface Lane {
  /** Lane this entry runs for. */
  readonly key: LaneKey;
  /** Label used in the plan output. */
  readonly name: string;
  /** Command to run, argv-style. */
  readonly command: readonly string[];
  /** Whether the lane drives a real browser, and so is skipped by `--quick`. */
  readonly browser?: boolean;
  /**
   * Whether this lane is one of the static gates `verify:quick` already runs.
   * `--tests-only` drops these, which is how the pre-push hook combines the two
   * without running any gate twice.
   */
  readonly gate?: boolean;
}

/**
 * The local counterpart of each CI job. Deliberately not a copy of the workflow
 * commands: the CI variants add JUnit reporters, coverage flags and artifact
 * paths that only matter to the runner. What has to match is which lane runs
 * for which change, and that comes from the shared selector.
 *
 * `coverage` has no entry - it is the same suite as `unit`, measured. Running it
 * locally would double the wall time for no extra signal, and the allocation
 * gate it shares a job with reads wrong under instrumentation anyway.
 */
export const LOCAL_LANES: readonly Lane[] = [
  { key: 'typecheck', name: 'typecheck gates', command: ['pnpm', 'gates', 'typecheck'], gate: true },
  { key: 'lint', name: 'lint gates', command: ['pnpm', 'gates', 'lint'], gate: true },
  { key: 'always', name: 'sync gates', command: ['pnpm', 'gates', 'sync'], gate: true },
  { key: 'unit', name: 'unit tests', command: ['pnpm', 'test'] },
  { key: 'unit', name: 'allocation gate', command: ['pnpm', 'test:alloc'] },
  { key: 'browserWebgl2', name: 'browser: Chromium WebGL2', command: ['pnpm', 'test:browser:webgl'], browser: true },
  { key: 'browserWebgl2', name: 'browser: inline worklet/worker sources', command: ['pnpm', 'test:browser:build'], browser: true },
  { key: 'browserWebgl2', name: 'browser: IndexedDB cache store', command: ['pnpm', 'test:browser:assets'], browser: true },
  { key: 'browserWebgpu', name: 'browser: Chromium WebGPU', command: ['pnpm', 'test:browser:webgpu'], browser: true },
  { key: 'browserAudio', name: 'browser: audio worklets', command: ['pnpm', 'test:browser:audio'], browser: true },
  { key: 'browserTilemapWorker', name: 'browser: tilemap worker', command: ['pnpm', 'test:browser:tilemap'], browser: true },
  { key: 'siteBuild', name: 'site gates', command: ['pnpm', 'gates', 'site'], gate: true },
];

const git = (...args: string[]): string => {
  const result = spawnSync('git', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }

  return result.stdout;
};

const lines = (output: string): string[] =>
  output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

/**
 * Every file this working copy has touched relative to `base`. Falls back to the
 * base ref itself when there is no merge base, which is what a branch that has
 * never been pushed and shares no history looks like.
 */
const changedFiles = (base: string): string[] => {
  const mergeBase = spawnSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' });
  const from = mergeBase.status === 0 ? mergeBase.stdout.trim() : base;

  return [
    ...lines(git('diff', '--name-only', from, 'HEAD')),
    ...lines(git('diff', '--name-only', 'HEAD')),
    ...lines(git('diff', '--name-only', '--cached')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ];
};

const readFlag = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);

  return index === -1 ? undefined : argv[index + 1];
};

function main(): void {
  const argv = process.argv.slice(2);
  const run = argv.includes('--run');
  const quick = argv.includes('--quick');
  const testsOnly = argv.includes('--tests-only');
  const all = argv.includes('--all');
  const base = readFlag(argv, '--base') ?? 'origin/main';

  const files = all ? [] : changedFiles(base);
  const areas = all ? { engine: true, site: true, audioFx: true, tilemapWorker: true } : selectAreas(files);
  const effective = effectiveLanes(areas);

  const selected = LOCAL_LANES.filter(lane => lane.key === 'always' || effective[lane.key])
    .filter(lane => !(quick && lane.browser))
    .filter(lane => !(testsOnly && lane.gate));

  const scope = all ? 'every lane' : `${files.length} changed file(s) since ${base}`;

  process.stdout.write(`lanes: ${scope}\n`);
  process.stdout.write(`lanes: engine=${areas.engine} site=${areas.site} audioFx=${areas.audioFx} tilemapWorker=${areas.tilemapWorker}\n\n`);

  for (const lane of selected) {
    process.stdout.write(`  ${lane.command.join(' ')}${lane.browser ? '   (browser)' : ''}\n`);
  }

  if (selected.length === 0) {
    process.stdout.write('  (nothing to run)\n');
  }

  if (!run) {
    process.stdout.write('\nlanes: pass --run to execute these.\n');

    return;
  }

  for (const lane of selected) {
    process.stdout.write(`\n=== ${lane.name} ===\n\n`);

    // One command string through a shell, rather than an argv array: on Windows
    // `pnpm` is a `.cmd` shim that node refuses to exec directly, and passing an
    // argv array alongside `shell: true` is what node warns about as an
    // injection risk. Every string here comes from the table above, never from
    // user input, so there is nothing to inject.
    const result = spawnSync(lane.command.join(' '), { stdio: 'inherit', shell: true });

    if (result.status !== 0) {
      process.stderr.write(`\nlanes: ${lane.name} failed (exit ${result.status ?? 'signal'}).\n`);
      process.exit(result.status ?? 1);
    }
  }

  process.stdout.write('\nlanes: all selected lanes passed.\n');
}

// Only run the CLI when executed directly, never when imported by the parity test.
const invokedPath = process.argv[1];

if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
