/**
 * Cold/bootstrap allocation driver.
 *
 * Spawns ONE fresh `run-bootstrap-cell.ts` process per cardinality - the cell
 * runner's block comment explains why same-process attribution is worthless for
 * a first-ever-touch measurement - collects each cell's JSON line, prints a
 * scaling table, and writes `bootstrap-allocation.json` into the perf output
 * directory, printing the resolved path on completion.
 *
 *   pnpm perf:renderers:bootstrap                       # 1k / 10k / 100k
 *   pnpm perf:renderers:bootstrap -- --counts 1000,1000000
 *   pnpm perf:renderers:bootstrap -- --cpu              # wall-clock companion
 *   pnpm perf:renderers:bootstrap -- --incremental 100  # streaming shape
 *
 * @internal Test/perf-only.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

/** 1M is opt-in: one cell at that size costs minutes and several GB of heap. */
const counts = (flag('counts') ?? '1000,10000,100000').split(',').map(value => Number(value.trim()));
const wantCpu = args.includes('--cpu');
const incremental = flag('incremental');
const rampFrames = flag('frames');
const steadyFrames = flag('steady');
const steadyWarmup = flag('warmup');
const samplingInterval = flag('interval');

const CELL = 'test/perf/rendering/run-bootstrap-cell.ts';

const nodeArgs = (count: number): string[] => [
  '--expose-gc',
  '--max-old-space-size=8192',
  '--conditions=@codexo/exojs-source',
  '--import',
  './scripts/glsl-register.ts',
  '--import',
  'tsx/esm',
  CELL,
  '--count',
  String(count),
  ...(rampFrames === undefined ? [] : ['--frames', rampFrames]),
  ...(steadyFrames === undefined ? [] : ['--steady', steadyFrames]),
  ...(steadyWarmup === undefined ? [] : ['--warmup', steadyWarmup]),
  ...(samplingInterval === undefined ? [] : ['--interval', samplingInterval]),
  ...(incremental === undefined ? [] : ['--incremental', incremental]),
  ...(wantCpu ? ['--cpu'] : []),
];

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(2);

const cells: unknown[] = [];

for (const count of counts) {
  const started = performance.now();
  const run = spawnSync(process.execPath, nodeArgs(count), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

  if (run.status !== 0) {
    process.stderr.write(run.stderr ?? '');
    throw new Error(`cell for count=${count} exited with ${String(run.status)}`);
  }

  const lines = run.stdout.trim().split('\n');
  const cell = JSON.parse(lines[lines.length - 1]!) as {
    count: number;
    bootstrapBytes: number;
    steadyBytesPerFrame: number | null;
    phases: Array<{ phase: string; allocBytes: number; retainedBytes: number | null; peakHeapBytes: number; ms: number }>;
    timings?: Record<string, number>;
  };

  cells.push({ ...cell, seconds: Number(((performance.now() - started) / 1000).toFixed(1)) });

  if (wantCpu) {
    console.log(`count=${String(count).padStart(8)}  ${JSON.stringify(cell.timings)}`);
    continue;
  }

  console.log(
    `\ncount=${String(count).padStart(8)}  bootstrap ${mb(cell.bootstrapBytes).padStart(10)} MB  steady ${((cell.steadyBytesPerFrame ?? 0) / 1024).toFixed(2)} KB/frame`,
  );

  for (const entry of cell.phases) {
    const retained = entry.retainedBytes === null ? '     n/a' : `${mb(entry.retainedBytes).padStart(8)}`;
    console.log(
      `  ${entry.phase.padEnd(26)} alloc ${mb(entry.allocBytes).padStart(9)} MB  retained ${retained} MB  peakHeap ${mb(entry.peakHeapBytes).padStart(8)} MB`,
    );
  }
}

const outDir = resolve(process.cwd(), '.workspace/output/render-perf');
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, wantCpu ? 'bootstrap-cpu.json' : 'bootstrap-allocation.json');
writeFileSync(
  outPath,
  `${JSON.stringify({ env: `Node ${process.version} ${process.platform}/${process.arch}`, mode: incremental === undefined ? 'bulk' : 'incremental', cells }, null, 2)}\n`,
);

console.log(`\nWrote ${outPath}`);
