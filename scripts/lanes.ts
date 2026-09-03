import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { selectLanes, type Lane } from './ci/lanes.ts';
import { effectiveLanes, selectAreas, type LaneAreas } from './ci/select-lanes.ts';

/**
 * Local lane runner - the pre-push hook's half of the lane table.
 *
 * Prints the lanes the changed files require and runs them with `--run`. The
 * selection is `scripts/ci/lanes.ts`, the same table CI plans from, so the
 * two never disagree about what a change must pass.
 *
 * Usage:
 *   pnpm lanes                      # list what this change requires
 *   pnpm lanes --run                # run it
 *   pnpm lanes --run --quick        # skip browser lanes
 *   pnpm lanes --run --tests-only   # skip the gate lanes verify:quick already ran
 *   pnpm lanes --run --all          # every lane, whatever changed
 *   pnpm lanes --base <ref>         # diff against another base (default origin/HEAD)
 */

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

const ALL_AREAS: LaneAreas = {
  engine: true,
  site: true,
  audioFx: true,
  tilemapWorker: true,
  exampleCatalog: true,
  benchStructural: true,
  release: true,
  guides: true,
  createExoApp: true,
};

/** The catalog smoke has no CI lane entry: CI smokes the site job's artifact instead. */
const SMOKE_LANE: Lane = {
  id: 'smoke',
  stage: 'verify',
  when: 'exampleSmoke',
  run: 'pnpm site:build && pnpm test:examples:smoke --sample',
  local: 'browser',
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const run = argv.includes('--run');
  const quick = argv.includes('--quick');
  const testsOnly = argv.includes('--tests-only');
  const all = argv.includes('--all');
  const base = readFlag(argv, '--base') ?? 'origin/HEAD';

  const files = all ? [] : changedFiles(base);
  const areas = all ? ALL_AREAS : selectAreas(files);
  const effective = effectiveLanes(areas);

  // The site gates run locally where CI runs them inside the site job.
  const siteGates: Lane = { id: 'site', stage: 'gates', when: 'siteBuild', run: 'pnpm gates site', local: 'gate' };

  // The verify stage packs and publints against a built dist; that stays CI's.
  const selected = [
    ...selectLanes(effective, false).filter(lane => lane.stage !== 'verify' && !lane.ciOnly),
    ...(effective.siteBuild ? [siteGates] : []),
    ...(effective.exampleSmoke ? [SMOKE_LANE] : []),
  ]
    .filter(lane => !(quick && lane.local === 'browser'))
    .filter(lane => !(testsOnly && lane.local === 'gate'));

  const scope = all ? 'every lane' : `${files.length} changed file(s) since ${base}`;
  process.stdout.write(`lanes: ${scope}\n`);
  process.stdout.write(
    `lanes: engine=${areas.engine} site=${areas.site} audioFx=${areas.audioFx} tilemapWorker=${areas.tilemapWorker} exampleCatalog=${areas.exampleCatalog} benchStructural=${areas.benchStructural}\n\n`,
  );

  for (const lane of selected) {
    process.stdout.write(`  ${lane.run}${lane.local === 'browser' ? '   (browser)' : ''}\n`);
  }
  if (selected.length === 0) {
    process.stdout.write('  (nothing to run)\n');
  }

  if (!run) {
    process.stdout.write('\nlanes: pass --run to execute these.\n');
    return;
  }

  for (const lane of selected) {
    process.stdout.write(`\n=== ${lane.id} ===\n\n`);
    const result = spawnSync(lane.run, { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      process.stderr.write(`\nlanes: ${lane.id} failed (exit ${result.status ?? 'signal'}).\n`);
      process.exit(result.status ?? 1);
    }
  }

  process.stdout.write('\nlanes: all selected lanes passed.\n');
};

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
