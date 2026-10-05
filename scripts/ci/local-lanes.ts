import { LANES, selectLanes, type Lane } from './lanes.ts';
import { selectLocalPolicy } from './local-policy.ts';
import type { EffectiveLanes } from './select-lanes.ts';

export interface LocalLaneOptions {
  run: boolean;
  quick: boolean;
  testsOnly: boolean;
  all: boolean;
  base: string;
  only?: string[];
}

const SITE_LANE: Lane = { id: 'site', stage: 'gates', when: 'siteBuild', run: 'pnpm gates site', local: 'gate' };
const SMOKE_LANE: Lane = {
  id: 'smoke',
  stage: 'verify',
  when: 'exampleSmoke',
  run: 'pnpm site:build && pnpm test:examples:smoke --sample',
  local: 'browser',
};
const eligible = (lane: Lane): boolean => lane.stage !== 'verify' && !lane.ciOnly;
const available = (): Lane[] => [...LANES.filter(eligible), SITE_LANE, SMOKE_LANE];

/** Strict argument handling prevents a typo from silently running or certifying a different scope. */
export const parseLocalLaneOptions = (argv: readonly string[]): LocalLaneOptions => {
  const options: LocalLaneOptions = { run: false, quick: false, testsOnly: false, all: false, base: 'origin/HEAD' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--run') options.run = true;
    else if (arg === '--quick') options.quick = true;
    else if (arg === '--tests-only') options.testsOnly = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--base' || arg.startsWith('--base=') || arg === '--only' || arg.startsWith('--only=')) {
      const flag = arg.split('=')[0]!;
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
      if (flag === '--base') options.base = value;
      else {
        const names = value.split(',');
        const known = new Set(available().map(lane => lane.id));
        for (const name of names) if (!known.has(name)) throw new Error(`Unknown local lane '${name}'. Expected: ${[...known].join(', ')}.`);
        options.only = [...new Set(names)];
      }
    } else throw new Error(`Unknown option '${arg}'. Use --run, --base <ref>, --only <id[,id]>, --quick, --tests-only or --all.`);
  }
  if (options.only && (options.quick || options.testsOnly || options.all)) throw new Error('--only cannot combine with --quick, --tests-only or --all.');
  return options;
};

export const selectLocalLanes = (effective: EffectiveLanes, options: LocalLaneOptions, files: readonly string[] = []): Lane[] => {
  if (options.only) return options.only.map(id => available().find(lane => lane.id === id)!);
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
    : effective;
  const unitCommand = policy.fullUnit
    ? undefined
    : [
        policy.unitProjects.length
          ? `pnpm exec vitest run ${policy.unitProjects.map(project => `--project=${project}`).join(' ')}${policy.unitFilter ? ` ${policy.unitFilter}` : ''}`
          : '',
        policy.allocation ? 'pnpm test:alloc' : '',
        policy.physicsPerf ? 'pnpm test:physics-perf' : '',
      ]
        .filter(Boolean)
        .join(' && ');
  return [
    ...selectLanes(selectedEffective, false).filter(eligible),
    ...(selectedEffective.siteBuild ? [SITE_LANE] : []),
    ...(selectedEffective.exampleSmoke ? [SMOKE_LANE] : []),
  ]
    .filter(lane => lane.stage !== 'test' || lane.id === 'unit' || policy.browser.includes(lane.id) || (lane.id === 'bench' && policy.bench))
    .filter(lane => lane.id !== 'smoke' || policy.smoke)
    .filter(lane => lane.id !== 'unit' || policy.fullUnit || unitCommand !== '')
    .map(lane => (lane.id === 'unit' && unitCommand ? { ...lane, run: unitCommand } : lane))
    .filter(lane => !(options.quick && lane.local === 'browser'))
    .filter(lane => !(options.testsOnly && lane.local === 'gate'));
};
