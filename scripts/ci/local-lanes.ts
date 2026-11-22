import { type Lane, LANES, selectLanes } from './lanes.ts';
import { selectLocalPolicy } from './local-policy.ts';
import { affectedTestCommand, resolveRelatedBase } from './related-tests.ts';
import type { EffectiveLanes } from './select-lanes.ts';

export interface LocalLaneOptions {
  run: boolean;
  quick: boolean;
  prePush: boolean;
  testsOnly: boolean;
  all: boolean;
  base: string;
  /** Exact commit being pushed; only set by the pre-push hook. */
  head?: string;
  only?: string[];
}

const SITE_LANE: Lane = { id: 'site', stage: 'gates', when: 'siteBuild', run: 'pnpm gates site', local: 'gate', dist: true };
const SMOKE_LANE: Lane = {
  id: 'smoke',
  stage: 'verify',
  when: 'exampleSmoke',
  run: 'pnpm site:build && pnpm test:examples:smoke --sample && pnpm test:playground:e2e',
  local: 'browser',
  dist: true,
};

/**
 * Brings dist up to date when a selected lane reads it, before the first lane
 * runs: a missing or stale build then costs its build time up front instead of
 * failing the dist lane after every other lane has already run.
 */
export const DIST_PREFLIGHT = 'node --import tsx scripts/check-dist-fresh.ts --rebuild';

/** The dependency-free supervisor tests the CI `unit` lane runs before its Vitest projects. */
const NODE_TESTS = 'node --test test/ci/validation.node.ts test/ci/qualify.node.ts';

/** Whether any of `lanes` reads the built dist rather than the sources. */
export const needsDist = (lanes: readonly Lane[]): boolean => lanes.some(lane => lane.dist === true);
const eligible = (lane: Lane): boolean => lane.stage !== 'verify' && !lane.ciOnly;
const available = (): Lane[] => [...LANES.filter(eligible), SITE_LANE, SMOKE_LANE];

/** Strict argument handling prevents a typo from silently running or certifying a different scope. */
export const parseLocalLaneOptions = (argv: readonly string[]): LocalLaneOptions => {
  const options: LocalLaneOptions = { run: false, quick: false, prePush: false, testsOnly: false, all: false, base: 'origin/HEAD' };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === '--run') {
      options.run = true;
    } else if (arg === '--quick') {
      options.quick = true;
    } else if (arg === '--pre-push') {
      options.prePush = true;
    } else if (arg === '--tests-only') {
      options.testsOnly = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (
      arg === '--base' ||
      arg.startsWith('--base=') ||
      arg === '--head' ||
      arg.startsWith('--head=') ||
      arg === '--only' ||
      arg.startsWith('--only=')
    ) {
      const flag = arg.split('=')[0]!;
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];

      if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value.`);
      }

      if (flag === '--base') {
        options.base = value;
      } else if (flag === '--head') {
        if (!/^[a-f\d]{40}$|^[a-f\d]{64}$/i.test(value)) {
          throw new Error('--head requires an exact 40- or 64-digit commit SHA.');
        }

        options.head = value;
      } else {
        const names = value.split(',');
        const known = new Set(available().map(lane => lane.id));

        for (const name of names) {
          if (!known.has(name)) {
            throw new Error(`Unknown local lane '${name}'. Expected: ${[...known].join(', ')}.`);
          }
        }

        options.only = [...new Set(names)];
      }
    } else {
      throw new Error(
        `Unknown option '${arg}'. Use --run, --base <ref>, --head <sha>, --only <id[,id]>, --quick, --pre-push, --tests-only or --all.`,
      );
    }
  }

  if (options.only && (options.quick || options.testsOnly || options.all)) {
    throw new Error('--only cannot combine with --quick, --tests-only or --all.');
  }

  if (options.prePush && (options.only || options.quick)) {
    throw new Error('--pre-push cannot combine with --only or --quick.');
  }

  if (options.head !== undefined && !options.prePush) {
    throw new Error('--head is only valid with --pre-push.');
  }

  return options;
};

export interface LocalLanePlan {
  selected: Lane[];
  deferred: Array<{ id: string; reason: string }>;
}

/** Pre-push deferral is explicit; uncertain or full scopes keep their original local obligations. */
export const planLocalLanes = (effective: EffectiveLanes, options: LocalLaneOptions, files: readonly string[] = []): LocalLanePlan => {
  if (options.only) {
    return { selected: options.only.map(id => available().find(lane => lane.id === id)!), deferred: [] };
  }

  const policy = selectLocalPolicy(options.all ? [] : files);
  const selectedEffective = policy.fullUnit
    ? {
        ...effective,
        unit: true,
        browserWebgl2: true,
        browserWebgpu: true,
        browserAudio: true,
        browserTilemapWorker: true,
        benchStructural: true,
        siteBuild: true,
        exampleSmoke: true,
      }
    : policy.nodeTests
      ? { ...effective, unit: true } // `.husky/` is outside every CI area, yet `test/ci` reads the hooks
      : effective;
  // The hook passes a verified previous remote SHA (or nearest integration
  // merge base). Do not re-merge-base it against checkout HEAD: that could
  // reintroduce older unrelated commits into the selected test graph.
  const base =
    options.prePush && options.head !== undefined && /^[a-f\d]{40}$|^[a-f\d]{64}$/i.test(options.base)
      ? { ref: options.base, full: false }
      : resolveRelatedBase(options.base);
  const full = policy.fullUnit || !policy.relatedTests;
  const unitProjects = policy.fullUnit ? ['exojs*', 'rendering-perf'] : policy.unitProjects;
  const unitCommand = [
    policy.nodeTests ? NODE_TESTS : '',
    unitProjects.length
      ? policy.unitFilter
        ? `pnpm exec vitest run ${unitProjects.map(project => `--project=${project}`).join(' ')} ${policy.unitFilter}`
        : affectedTestCommand({
            base,
            projects: unitProjects,
            name: 'unit',
            full,
            committed: options.prePush && options.head !== undefined,
          })
      : '',
    policy.allocation ? 'pnpm test:alloc' : '',
    policy.physicsPerf ? 'pnpm test:physics-perf' : '',
  ]
    .filter(Boolean)
    .join(' && ');

  const selected = [
    ...selectLanes(selectedEffective, false).filter(eligible),
    ...(selectedEffective.siteBuild ? [SITE_LANE] : []),
    ...(selectedEffective.exampleSmoke ? [SMOKE_LANE] : []),
  ]
    .filter(
      lane => lane.stage !== 'test' || lane.id === 'unit' || policy.browser.includes(lane.id) || (lane.id === 'bench' && policy.bench),
    )
    .filter(lane => lane.id !== 'smoke' || policy.smoke)
    .filter(lane => lane.id !== 'unit' || policy.fullUnit || unitCommand !== '')
    .map(lane => {
      if (lane.id === 'unit' && unitCommand) {
        return { ...lane, run: unitCommand };
      }

      if (lane.stage === 'test' && lane.affectedProjects?.length) {
        return {
          ...lane,
          // Keep the existing separate invocations and their order. Combining
          // projects could change the browser's runtime concurrency contract.
          run: lane.affectedProjects
            .map((project, index) =>
              affectedTestCommand({
                base,
                projects: [project],
                name: `${lane.id}-${index}`,
                full,
                serial: lane.id === 'webgpu' && index === 0,
                committed: options.prePush && options.head !== undefined,
              }),
            )
            .join(' && '),
        };
      }

      return lane;
    })
    .filter(lane => !(options.quick && lane.local === 'browser'))
    .filter(lane => !(options.testsOnly && lane.local === 'gate'));

  if (!options.prePush || options.all || base.full || full) {
    return { selected, deferred: [] };
  }

  const deferred = selected.filter(lane => lane.local === 'browser' || lane.id === 'bench');

  return {
    selected: selected
      .filter(lane => !deferred.includes(lane))
      // Retained unit files can read built output too. Keep the existing
      // freshness requirement even when the browser and smoke lanes defer.
      .map(lane => (lane.id === 'unit' && policy.needsDist ? { ...lane, dist: true } : lane)),
    deferred: deferred.map(lane => ({
      id: lane.id,
      reason: 'Resolved source scope; mandatory CI validates this lane for the pushed commit.',
    })),
  };
};

/** Selected commands for callers that do not need the deferral report. */
export const selectLocalLanes = (effective: EffectiveLanes, options: LocalLaneOptions, files: readonly string[] = []): Lane[] =>
  planLocalLanes(effective, options, files).selected;
