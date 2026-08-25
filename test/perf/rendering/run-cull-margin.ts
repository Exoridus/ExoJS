/**
 * Capture-margin sweep driver.
 *
 * Spawns one {@link file://./run-cull-margin-cell.ts} process per
 * (margin, nodeCount, cameraSpeed) point - see that file for why a cell owns its
 * process - collects the JSON each prints, and writes a Markdown table plus the
 * raw JSONL.
 *
 *   pnpm perf:renderers:cull-margin [--margins 0,0.0625,0.125] [--nodes 25000,100000]
 *                                   [--speeds 8] [--frames 300] [--warmup 60] [--repeats 3] [--out <dir>]
 *
 * @internal Test/perf-only.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const list = (name: string, fallback: number[]): number[] => {
  const raw = flag(name);

  return raw === undefined ? fallback : raw.split(',').map(Number);
};

const margins = list('margins', [0, 1 / 16, 3 / 32, 1 / 8, 3 / 16, 1 / 4]);
const nodeCounts = list('nodes', [25_000, 100_000]);
const speeds = list('speeds', [8]);
const frames = Number(flag('frames') ?? 300);
const warmup = Number(flag('warmup') ?? 60);
const repeats = Number(flag('repeats') ?? 3);
const out = resolve(flag('out') ?? '.workspace/output/cull-margin');

const here = dirname(fileURLToPath(import.meta.url));
const cell = resolve(here, 'run-cull-margin-cell.ts');
const nodeArgs = ['--expose-gc', '--max-old-space-size=8192', '--conditions=@codexo/source', '--import', './scripts/glsl-register.ts', '--import', 'tsx/esm'];

interface CellResult {
  margin: number;
  nodes: number;
  speed: number;
  captureAreaFactor: number;
  tiers: Record<string, number>;
  query: Record<string, number>;
  sourceItems: number;
  perFrame: Record<string, number>;
  cpuMs: Record<string, number>;
  replayMs: { count: number; median: number; mean: number; max: number } | null;
  missMs: { count: number; median: number; mean: number; max: number } | null;
  heapDeltaBytes: number;
}

const rows: CellResult[] = [];
const lines: string[] = [];

for (const nodes of nodeCounts) {
  for (const speed of speeds) {
    for (const margin of margins) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        const result = spawnSync(
          process.execPath,
          [
            ...nodeArgs,
            cell,
            '--margin',
            String(margin),
            '--nodes',
            String(nodes),
            '--speed',
            String(speed),
            '--frames',
            String(frames),
            '--warmup',
            String(warmup),
            ...(args.includes('--no-slots') ? ['--no-slots'] : []),
          ],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );

        if (result.status !== 0) {
          throw new Error(`cell failed (margin=${margin} nodes=${nodes} speed=${speed}):\n${result.stderr}`);
        }

        const line = result.stdout.trim().split('\n').pop()!;

        lines.push(JSON.stringify({ repeat, ...(JSON.parse(line) as object) }));
        rows.push(JSON.parse(line) as CellResult);

        process.stderr.write(`. margin=${margin.toFixed(5)} nodes=${nodes} speed=${speed} repeat=${repeat}\n`);
      }
    }
  }
}

/** Median of a numeric series - the repeats are combined, never averaged. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)]!;
};

const key = (row: CellResult): string => `${row.nodes}|${row.speed}|${row.margin}`;
const groups = new Map<string, CellResult[]>();

for (const row of rows) {
  const bucket = groups.get(key(row)) ?? [];

  bucket.push(row);
  groups.set(key(row), bucket);
}

const header =
  '| margin | area | nodes | speed | replay | miss | collect | drawn/frame | visible/frame | frames/miss | cand/miss | entered/miss | upload B/frame | replay ms | miss ms | CPU mean | CPU p95 |';
const divider = '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
const table = [header, divider];

for (const [, bucket] of groups) {
  const first = bucket[0]!;
  const misses = median(bucket.map(row => row.tiers.slotReselect! + row.tiers.sourceSelect! + row.tiers.fullCollect!));
  const missMs = bucket.map(row => row.missMs?.mean).filter((value): value is number => value !== undefined);

  table.push(
    [
      `${first.margin.toFixed(5)}`,
      `${first.captureAreaFactor.toFixed(3)}x`,
      `${first.nodes}`,
      `${first.speed}`,
      `${median(bucket.map(row => row.tiers.slotReplay! + row.tiers.captureReplay!))}`,
      `${misses}`,
      `${median(bucket.map(row => row.tiers.fullCollect!))}`,
      `${median(bucket.map(row => row.perFrame.submittedNodes!)).toFixed(0)}`,
      `${median(bucket.map(row => row.perFrame.visibleLeaves!)).toFixed(0)}`,
      `${misses === 0 ? 'n/a' : (frames / misses).toFixed(2)}`,
      `${misses === 0 ? 'n/a' : (median(bucket.map(row => row.query.candidates!)) / misses).toFixed(0)}`,
      `${misses === 0 ? 'n/a' : (median(bucket.map(row => row.query.entered!)) / misses).toFixed(0)}`,
      `${median(bucket.map(row => row.perFrame.uploadedBufferBytes!)).toFixed(0)}`,
      `${median(bucket.map(row => row.replayMs?.median ?? Number.NaN)).toFixed(4)}`,
      `${missMs.length === 0 ? 'n/a' : median(missMs).toFixed(4)}`,
      `${median(bucket.map(row => row.cpuMs.mean!)).toFixed(4)}`,
      `${median(bucket.map(row => row.cpuMs.p95!)).toFixed(4)}`,
    ].join(' | '),
  );
}

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'cells.jsonl'), `${lines.join('\n')}\n`);
writeFileSync(resolve(out, 'sweep.md'), `${table.join('\n')}\n`);

process.stdout.write(`${table.join('\n')}\n\nwritten: ${out}\n`);
