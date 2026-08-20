/**
 * Driver for the WebGPU allocation cell.
 *
 * Spawns one vitest run - and therefore one browser process - per (scene,
 * repetition) pair, and reports the median across repetitions. Sequential on
 * purpose: two browsers sharing one GPU contend for it, and a wall-clock or
 * allocation number taken under contention describes the contention.
 *
 *   pnpm perf:webgpu:alloc                        every scene, 3 fresh processes each
 *   pnpm perf:webgpu:alloc -- --id "mesh/1000"    one scene
 *   pnpm perf:webgpu:alloc -- --id "…" --profile  plus the callsite table
 *   pnpm perf:webgpu:alloc -- --mode cpu          wall-clock instead of bytes
 *   pnpm perf:webgpu:alloc -- --mode structural   work units instead of bytes
 *   pnpm perf:webgpu:alloc -- --json out.json     also write the raw records
 *
 * @internal Test/perf-only.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { WEBGPU_ALLOC_ARCHETYPES } from './webgpuAllocScenes';

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const id = flag('id');
const mode = flag('mode') ?? 'alloc';
const repeats = Number(flag('repeats') ?? (mode === 'alloc' ? 3 : 1));
/** 0 = let the archetype decide; an explicit `--frames` overrides it. */
const frames = Number(flag('frames') ?? 0);
const warmup = Number(flag('warmup') ?? 0);
const top = args.includes('--profile') ? Number(flag('top') ?? 20) : 0;
const jsonOut = flag('json');

const MARKER = '__EXOJS_WEBGPU_ALLOC__';

interface CellRecord {
  readonly id: string;
  readonly mode?: string;
  readonly skipped?: string;
  readonly kbPerFrame?: number;
  readonly medianUs?: number;
  readonly p95Us?: number;
  readonly callsites?: ReadonlyArray<{ site: string; selfKbPerFrame: number; totalKbPerFrame: number; stack: string }>;
  readonly [key: string]: unknown;
}

const runCell = (sceneId: string): CellRecord => {
  const result = spawnSync('npx', ['vitest', 'run', '--project=browser-webgpu-alloc'], {
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      EXOJS_ALLOC_ID: sceneId,
      EXOJS_ALLOC_MODE: mode,
      EXOJS_ALLOC_FRAMES: String(frames),
      EXOJS_ALLOC_WARMUP: String(warmup),
      EXOJS_ALLOC_TOP: String(top),
      EXOJS_ALLOC_REPEATS: '1',
    },
  });

  const line = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split('\n').find(candidate => candidate.includes(MARKER));

  if (line === undefined) {
    throw new Error(`no record from '${sceneId}' (exit ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }

  return JSON.parse(line.slice(line.indexOf(MARKER) + MARKER.length)) as CellRecord;
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)]!;
};

const scenes = id === undefined ? WEBGPU_ALLOC_ARCHETYPES.map(archetype => archetype.id) : [id];
const records: CellRecord[] = [];

for (const sceneId of scenes) {
  const runs: CellRecord[] = [];

  for (let repeat = 0; repeat < repeats; repeat++) {
    runs.push(runCell(sceneId));
  }

  records.push(...runs);

  const first = runs[0]!;

  if (first.skipped !== undefined) {
    console.log(`${sceneId.padEnd(32)} skipped — ${first.skipped}`);
    continue;
  }

  if (mode === 'cpu') {
    const medians = runs.map(run => run.medianUs!);
    const p95s = runs.map(run => run.p95Us!);

    console.log(
      `${sceneId.padEnd(32)} ${median(medians).toFixed(1).padStart(9)} us/frame median   p95 ${median(p95s).toFixed(1).padStart(9)}   runs [${medians.join(', ')}]`,
    );
    continue;
  }

  if (mode === 'structural') {
    const { id: _unused, mode: _unusedMode, ...counters } = first;

    console.log(`${sceneId}`);

    for (const [key, value] of Object.entries(counters)) {
      console.log(`  ${key.padEnd(24)} ${String(value)}`);
    }

    continue;
  }

  const kbs = runs.map(run => run.kbPerFrame!);
  const spread = Math.max(...kbs) / Math.max(1e-9, Math.min(...kbs));

  console.log(
    `${sceneId.padEnd(32)} ${median(kbs).toFixed(3).padStart(10)} KB/frame median   spread ${spread.toFixed(2)}x   runs [${kbs.map(value => value.toFixed(3)).join(', ')}]`,
  );

  if (top > 0) {
    for (const row of first.callsites ?? []) {
      console.log(`    ${row.selfKbPerFrame.toFixed(3).padStart(9)} KB/f self  ${row.totalKbPerFrame.toFixed(3).padStart(9)} KB/f total  ${row.site}`);
    }
  }
}

if (jsonOut !== undefined) {
  writeFileSync(jsonOut, JSON.stringify(records, null, 2));
  console.log(`\nwrote ${records.length} records to ${jsonOut}`);
}
