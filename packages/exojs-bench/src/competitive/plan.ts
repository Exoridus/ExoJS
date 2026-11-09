import { createHash } from 'node:crypto';

import { ARCHETYPES } from '../rendering/archetypes';
import type { MatrixCellSelection } from '../rendering/driver';
import type { Backend } from '../rendering/EngineAdapter';
import type { MeasurementProfile } from '../rendering/telemetry';
import { parseArgs, parsePositiveInt, unclaimedArgs } from '../shared/args';
import { parsePlatformDeclaration } from '../shared/provenance';
import { loadIdFor } from '../suite/catalog';
import { computePlanHash, PLAN_REVISION, type RunPlan } from '../suite/plan';
import { COMPETITIVE_GAPS, selectCompetitiveScenarios } from './catalog';

export interface CompetitiveOptions {
  readonly mode: 'quick' | 'standard' | 'deep' | 'long-run';
  readonly profile: MeasurementProfile;
  readonly engines: readonly string[];
  readonly configs: readonly string[];
  readonly backends: readonly Backend[];
  readonly scenarios: readonly string[];
  readonly load: 'low' | 'medium' | 'high' | 'all';
  readonly nodes?: readonly number[];
  readonly frames: number;
  readonly warmupFrames: number;
  readonly runs: number;
  readonly cycles: number;
  readonly out: string;
  readonly software: boolean;
  readonly capture: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly list: boolean;
  readonly report?: string;
  readonly baseline?: string;
  readonly platform?: string;
  readonly machine: string;
  readonly driver: string;
  readonly power: string;
  readonly background: string;
  readonly worker?: number;
}

const FLAGS = new Set([
  'mode',
  'profile',
  'engine',
  'config',
  'backend',
  'scenario',
  'load',
  'nodes',
  'frames',
  'warmup-frames',
  'runs',
  'cycles',
  'out',
  'software',
  'capture',
  'dry-run',
  'help',
  'list',
  'report',
  'baseline',
  'platform',
  'machine',
  'driver',
  'power',
  'background',
  'worker',
]);
const MODES = ['quick', 'standard', 'deep', 'long-run'] as const;

const list = (name: string, value: string): string[] => {
  const values = value.split(',');

  if (values.some(entry => entry.length === 0 || /\s/.test(entry))) {
    throw new Error(`--${name} requires a non-empty comma-separated list without spaces. Quote the flag in PowerShell.`);
  }

  return [...new Set(values)];
};

const oneOf = <T extends string>(name: string, value: string, allowed: readonly T[]): T => {
  if (!allowed.includes(value as T)) {
    throw new Error(`--${name} must be one of ${allowed.join(', ')} (got '${value}').`);
  }

  return value as T;
};

const boundedInteger = (name: string, value: string, max: number): number => {
  const result = parsePositiveInt(`--${name}`, value);

  if (!Number.isSafeInteger(result) || result > max) {
    throw new Error(`--${name} must not exceed ${max}.`);
  }

  return result;
};

/** Validates the complete request before starting a browser or creating output. */
export const parseCompetitiveOptions = (argv: readonly string[]): CompetitiveOptions => {
  const args = parseArgs(argv);
  parsePlatformDeclaration(args.get('platform'));

  for (const key of args.keys()) {
    if (!FLAGS.has(key)) {
      throw new Error(`Unknown competitive option --${key}.`);
    }
  }

  if (unclaimedArgs(argv).length > 0) {
    throw new Error('Unexpected positional arguments. Use --help for competitive options.');
  }

  for (const key of ['software', 'capture', 'dry-run', 'help', 'list']) {
    if (args.has(key) && args.get(key) !== 'true') {
      throw new Error(`--${key} is a boolean flag; omit it to disable.`);
    }
  }

  for (const key of ['out', 'report', 'baseline', 'machine', 'driver', 'power', 'background']) {
    if (args.has(key) && (args.get(key) === 'true' || args.get(key)!.trim().length === 0)) {
      throw new Error(`--${key} requires a value.`);
    }
  }

  const mode = oneOf('mode', args.get('mode') ?? 'standard', MODES);
  const profile = oneOf('profile', args.get('profile') ?? (mode === 'standard' ? 'timing' : 'deep'), ['timing', 'gpu', 'deep'] as const);
  const engines = list('engine', args.get('engine') ?? 'exojs,pixi,phaser');

  for (const engine of engines) {
    oneOf('engine', engine, ['exojs', 'pixi', 'phaser']);
  }

  const configs = list('config', args.get('config') ?? 'current,retained,default,culled,webgl2');

  for (const config of configs) {
    oneOf('config', config, ['current', 'retained', 'default', 'culled', 'webgl2']);
  }

  const backends = list('backend', args.get('backend') ?? 'webgl2').map(backend =>
    oneOf('backend', backend, ['webgl2', 'webgpu'] as const),
  );
  const defaultScenarios = mode === 'long-run' ? ['dirty-10', 'lifecycle-churn'] : undefined;
  const selected = args.has('scenario') ? list('scenario', args.get('scenario')!) : defaultScenarios;
  const scenarios = selectCompetitiveScenarios(selected).map(scenario => scenario.id);
  const cycles = boundedInteger('cycles', args.get('cycles') ?? (mode === 'long-run' ? '20' : '1'), 1000);

  if (mode !== 'long-run' && cycles !== 1) {
    throw new Error('--cycles is reserved for --mode=long-run; cycles are not independent repetitions.');
  }

  if (args.has('software') && mode !== 'quick') {
    throw new Error('--software is restricted to functional --mode=quick runs.');
  }

  if (args.has('capture') && mode !== 'quick') {
    throw new Error('--capture is restricted to separate --mode=quick visual qualification.');
  }

  const workerRaw = args.get('worker');
  let worker: number | undefined;

  if (workerRaw !== undefined) {
    if (!/^\d+$/.test(workerRaw) || !Number.isSafeInteger(Number(workerRaw))) {
      throw new Error('--worker must be a non-negative integer.');
    }

    worker = Number(workerRaw);
  }

  return {
    mode,
    profile,
    engines,
    configs,
    backends,
    scenarios,
    load: oneOf('load', args.get('load') ?? (mode === 'quick' ? 'low' : 'medium'), ['low', 'medium', 'high', 'all'] as const),
    ...(args.has('nodes') && { nodes: list('nodes', args.get('nodes')!).map(value => boundedInteger('nodes', value, 1_000_000)) }),
    frames: boundedInteger('frames', args.get('frames') ?? { quick: '5', standard: '300', deep: '300', 'long-run': '600' }[mode], 3000),
    warmupFrames: boundedInteger('warmup-frames', args.get('warmup-frames') ?? (mode === 'quick' ? '2' : '90'), 10_000),
    runs: boundedInteger('runs', args.get('runs') ?? (mode === 'standard' ? '7' : '1'), 100),
    cycles,
    out: args.get('out') ?? 'run-competitive',
    software: args.has('software'),
    capture: args.has('capture'),
    dryRun: args.has('dry-run'),
    help: args.has('help'),
    list: args.has('list'),
    ...(args.has('report') && { report: args.get('report')! }),
    ...(args.has('baseline') && { baseline: args.get('baseline')! }),
    ...(args.has('platform') && { platform: args.get('platform')! }),
    machine: args.get('machine') ?? 'UNRECORDED',
    driver: args.get('driver') ?? 'UNRECORDED',
    power: args.get('power') ?? 'UNRECORDED',
    background: args.get('background') ?? 'UNRECORDED',
    ...(worker !== undefined && { worker }),
  };
};

/** Uses the existing suite-plan interface, leaving the existing rendering matrix authoritative. */
export const competitivePlan = (options: CompetitiveOptions): RunPlan => {
  const scenarios = selectCompetitiveScenarios(options.scenarios);
  const workloads = scenarios.flatMap(scenario => {
    const index = { low: 0, medium: Math.min(1, scenario.loads.length - 1), high: scenario.loads.length - 1, all: 0 }[options.load];
    const loads = options.nodes ?? (options.load === 'all' ? scenario.loads : [scenario.loads[index]!]);

    return loads.map(value => ({
      scenarioId: scenario.archetype,
      loadId: loadIdFor(value),
      value,
      unit: scenario.unit,
      primary: false,
      extreme: false,
    }));
  });

  return {
    meta: {
      suite: 'full',
      planId: 'exojs-comparison',
      planRevision: PLAN_REVISION,
      planHash: computePlanHash('full', 'rendering', workloads),
      domain: 'rendering',
      extreme: false,
      exploratory: true,
    },
    workloads,
    missingScenarios: COMPETITIVE_GAPS.map(gap => `${gap.group}: ${gap.title}`),
  };
};

export const competitiveMatrixOptions = (options: CompetitiveOptions, runIndex: number): MatrixCellSelection => ({
  backends: options.backends,
  plan: competitivePlan(options),
  selection: { engines: options.engines, configs: options.configs },
  sampling: {
    profile: options.profile,
    timedFrames: options.frames,
    warmupFrames: options.warmupFrames,
    cycles: options.cycles,
    orderSeed: 0xc0ffee + runIndex,
  },
});

/** Output paths and repetition order do not change the workload; instrumentation and sampling do. */
export const competitiveProtocolHash = (options: CompetitiveOptions): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        revision: 1,
        plan: competitivePlan(options).workloads,
        archetypes: ARCHETYPES.filter(archetype => options.scenarios.includes(archetype.id)),
        engines: options.engines,
        configs: options.configs,
        backends: options.backends,
        profile: options.profile,
        frames: options.frames,
        warmupFrames: options.warmupFrames,
        cycles: options.cycles,
        viewport: [1280, 720, 1],
        seed: 0xc0ffee,
        software: options.software,
        capture: options.capture,
      }),
    )
    .digest('hex');
