/**
 * Runner for the measurement harnesses under `test/perf/` and the bench
 * package's probes.
 *
 *   pnpm perf                      # list the runs
 *   pnpm perf <name> [args...]     # run one, forwarding the arguments
 *   pnpm perf smoke                # what the `sync` gate group runs
 *
 * Every in-process harness needs the same Node invocation: the
 * `@codexo/exojs-source` condition so package imports resolve to `src/`, the
 * GLSL loader so shader imports resolve at all, and `tsx` for TypeScript.
 * Spelling that prefix out once per harness in package.json is what let the
 * scripts drift apart (some with `--expose-gc`, some without, one with a heap
 * limit), so the prefix lives here and a run declares only what differs.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

interface PerfRun {
  /** What the run measures, one line. */
  readonly summary: string;
  /** A `test/perf` module executed in-process against engine source. */
  readonly module?: string;
  /** Extra Node flags for `module` runs. */
  readonly nodeFlags?: readonly string[];
  /** A shell command instead of an in-process module. */
  readonly command?: string;
  /** Other runs to execute in order. */
  readonly runs?: readonly string[];
}

const SOURCE_NODE_FLAGS = ['--conditions=@codexo/exojs-source', '--import', './scripts/glsl-register.ts', '--import', 'tsx/esm'] as const;
/** Cell probes take one large scene per process and read `gc()` for exact deltas. */
const CELL_NODE_FLAGS = ['--expose-gc', '--max-old-space-size=8192'] as const;

export const PERF_RUNS = {
  rendering: { summary: 'renderer CPU submission benchmark', module: 'test/perf/rendering-benchmark.ts' },
  audio: { summary: 'audio graph benchmark', module: 'test/perf/audio-benchmark.ts' },
  collision: { summary: 'collision benchmark', module: 'test/perf/collision-benchmark.ts' },
  'scene-graph': { summary: 'scene graph benchmark', module: 'test/perf/scene-graph-benchmark.ts' },
  interaction: { summary: 'interaction benchmark', module: 'test/perf/interaction-benchmark.ts' },
  'collect-phase': { summary: 'collect phase benchmark', module: 'test/perf/collect-phase-benchmark.ts' },
  profile: { summary: 'profile benchmark', module: 'test/perf/profile-benchmark.ts' },
  'profile:gc': { summary: 'profile benchmark with forced GC for exact memory deltas', module: 'test/perf/profile-benchmark.ts', nodeFlags: ['--expose-gc'] },
  smoke: {
    summary: 'every in-process benchmark once, for its exit code (the `sync` gate)',
    runs: ['rendering', 'audio', 'collision', 'scene-graph', 'interaction', 'collect-phase', 'profile'],
  },

  renderers: { summary: 'structural renderer sweep, full matrix', command: 'tsx test/perf/rendering/run-sweep.ts full' },
  'renderers:quick': { summary: 'structural renderer sweep, small matrix', command: 'tsx test/perf/rendering/run-sweep.ts quick' },
  'renderers:browser': {
    summary: 'structural renderer metrics against a real WebGL2 context',
    command: 'vitest run --project=browser-webgl-chromium webgl2-renderer-perf',
  },
  'renderers:alloc': { summary: 'steady-state allocation per renderer scene', module: 'test/perf/rendering/run-allocation.ts' },
  'renderers:alloc:cell': { summary: 'one allocation scene in a fresh process', module: 'test/perf/rendering/run-allocation-cell.ts' },
  'renderers:cull-margin': { summary: 'culling margin sweep', module: 'test/perf/rendering/run-cull-margin.ts' },
  'renderers:cull-margin:cell': {
    summary: 'one culling margin cell in a fresh process',
    module: 'test/perf/rendering/run-cull-margin-cell.ts',
    nodeFlags: CELL_NODE_FLAGS,
  },
  'renderers:bootstrap': { summary: 'scene bootstrap allocation', module: 'test/perf/rendering/run-bootstrap-allocation.ts' },
  'renderers:bootstrap:cell': {
    summary: 'one bootstrap cell in a fresh process',
    module: 'test/perf/rendering/run-bootstrap-cell.ts',
    nodeFlags: CELL_NODE_FLAGS,
  },
  'renderers:instance-cost': {
    summary: 'per-instance cost by node type',
    module: 'test/perf/rendering/run-instance-cost.ts',
    nodeFlags: CELL_NODE_FLAGS,
  },

  'webgpu:alloc': { summary: 'WebGPU allocation per scene, one browser per cell', command: 'tsx test/perf/webgpu/run-webgpu-allocation.ts' },
  'webgpu:timer': { summary: 'WebGPU frame timer methodology probe', command: 'pnpm --filter @codexo/exojs-bench timer' },
} as const satisfies Record<string, PerfRun>;

export type PerfRunName = keyof typeof PERF_RUNS;

const runNames = Object.keys(PERF_RUNS) as PerfRunName[];

const printUsage = (): void => {
  const width = Math.max(...runNames.map(name => name.length));
  console.log('Usage: pnpm perf <name> [args...]\n');
  for (const name of runNames) {
    console.log(`  ${name.padEnd(width)}  ${PERF_RUNS[name].summary}`);
  }
};

const execute = (name: PerfRunName, args: readonly string[]): number => {
  const run: PerfRun = PERF_RUNS[name];

  if (run.runs) {
    for (const child of run.runs) {
      console.log(`\n=== pnpm perf ${child} ===\n`);
      const status = execute(child as PerfRunName, args);
      if (status !== 0) return status;
    }
    return 0;
  }

  if (run.module) {
    const result = spawnSync(process.execPath, [...(run.nodeFlags ?? []), ...SOURCE_NODE_FLAGS, run.module, ...args], { stdio: 'inherit' });
    return result.status ?? 1;
  }

  // A shell so the pnpm/tsx/vitest shims resolve on Windows as well; arguments
  // are re-quoted because the shell splits the joined line again.
  const quoted = args.map(arg => (/\s/.test(arg) ? JSON.stringify(arg) : arg));
  const result = spawnSync([run.command, ...quoted].join(' '), { stdio: 'inherit', shell: true });
  return result.status ?? 1;
};

const main = (): void => {
  const [requested, ...rest] = process.argv.slice(2);
  // `pnpm perf <name> -- <args>` forwards the separator too; the harnesses do not expect it.
  const args = rest[0] === '--' ? rest.slice(1) : rest;

  if (!requested) {
    printUsage();
    process.exit(2);
  }

  if (!runNames.includes(requested as PerfRunName)) {
    console.error(`Unknown perf run '${requested}'.\n`);
    printUsage();
    process.exit(2);
  }

  const status = execute(requested as PerfRunName, args);
  if (status !== 0) {
    console.error(`\nperf ${requested} failed (exit code ${status}).`);
  }
  process.exit(status);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
