/**
 * Driver for the WebGPU frame-timer methodology investigation (NEU-B1b / B1c).
 *
 * Runs `rendering/page/timerProbe.ts` and evaluates every candidate frame-time
 * model over the SAME recorded event timeline, so the models are compared on
 * identical data rather than on separate runs:
 *
 * ```text
 * A  raw          doneAt[i] - submitAt[i]                       (what the harness reports today)
 * B  busy         doneAt[i] - max(submitAt[i], doneAt[i-1])     (overlap attributed to its cause)
 * C  independent  A, but only for frames that submitted after the previous completion
 * D  hardware     sum of render-pass timestamp deltas           (timestamp-query ground truth)
 * ```
 *
 *   pnpm perf:webgpu:timer -- --nodes 1000000 --config retained --frames 30 --warmup 40
 *   pnpm perf:webgpu:timer -- --mode serialized --frames 30
 *   pnpm perf:webgpu:timer -- --controls-only --repeats 12
 *
 * One browser process per cell: the timer question includes device bootstrap, so
 * a cell that inherited another cell's warm device would not be the same
 * measurement.
 *
 * @internal Test/perf-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { LAUNCH_FLAGS, readEngineVersion, readWebGpuAdapter, startViteServer, WEBGPU_LAUNCH_FLAGS } from './rendering/driver';
import type { Backend } from './rendering/EngineAdapter';
import type { TimerFrameRecord, TimerProbeMode, TimerProbeResult, TimerProbeSpec } from './rendering/page/timerProbe';

const args = process.argv.slice(2);

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
};

const list = (name: string, fallback: string): string[] =>
  (flag(name) ?? fallback)
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);

const nodeCounts = list('nodes', '1000000').map(Number);
const configs = list('config', 'retained') as Array<'current' | 'retained'>;
const backends = list('backends', 'webgpu') as Backend[];
const modes = list('mode', 'pipelined') as TimerProbeMode[];
const archetype = flag('archetype') ?? 'scrolling-world';
const timedFrames = Number(flag('frames') ?? 30);
const warmupFrames = Number(flag('warmup') ?? 40);
const repeats = Number(flag('repeats') ?? 1);
const controlSamples = Number(flag('control-samples') ?? 20);
const noDrain = args.includes('--no-drain');
const noTimestamps = args.includes('--no-timestamps');
const controlsOnly = args.includes('--controls-only');
const withControls = controlsOnly || args.includes('--controls');
const outDir = flag('out') ?? '.workspace/output/webgpu-timer';

/**
 * `--disable-dawn-features=timestamp_quantization`, kept behind `--quantized`
 * for the A/B that MEASURED whether it is needed. It is not: on this Chromium
 * the same cell resolves `0.041 / 0.042 ms` of render-pass time with and without
 * the flag, so timestamps arrive unquantized under the bench's own launch flags
 * and the matrix needs no extra toggle. Passing `--quantized` runs WITHOUT the
 * flag, i.e. on the browser's default, which is how that A/B is reproduced.
 */
const TIMESTAMP_FLAGS: readonly string[] = ['--disable-dawn-features=timestamp_quantization'];

interface CellRun {
  readonly key: string;
  readonly repeat: number;
  readonly adapter: string;
  readonly result: TimerProbeResult;
}

const cellKey = (spec: TimerProbeSpec): string =>
  [spec.backend, `${spec.nodeCount}n`, spec.config, spec.mode, spec.drainAfterWarmup ? 'drained' : 'undrained', spec.timestampQueries ? 'ts' : 'no-ts'].join(
    ' ',
  );

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
};

/** Nearest-rank percentile - the same definition `shared/timing.ts` uses. */
const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);

  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
};

const max = (values: readonly number[]): number => (values.length === 0 ? 0 : Math.max(...values));

/** Summary of one candidate model over one cell's frames. */
interface ModelStats {
  readonly model: string;
  readonly n: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

const statsFor = (model: string, values: readonly number[]): ModelStats => ({
  model,
  n: values.length,
  median: median(values),
  p95: percentile(values, 95),
  max: max(values),
});

/** Per-frame values of every candidate model, aligned to the frame index. */
interface ModelSeries {
  readonly raw: number[];
  readonly busy: number[];
  readonly independent: number[];
  readonly hardware: number[];
  /** Frames whose submit happened before the previous frame's observed completion. */
  readonly dependentFrames: number[];
  /** Frames whose completion was observed at (nearly) the same instant as the previous one. */
  readonly coalescedFrames: number[];
}

/** Two completions within this window are indistinguishable in the event loop. */
const COALESCE_EPSILON_MS = 0.2;

const evaluateModels = (frames: readonly TimerFrameRecord[]): ModelSeries => {
  const raw: number[] = [];
  const busy: number[] = [];
  const independent: number[] = [];
  const hardware: number[] = [];
  const dependentFrames: number[] = [];
  const coalescedFrames: number[] = [];

  let previousDone: number | null = null;

  for (const frame of frames) {
    if (frame.gpuPassMs !== null) {
      hardware.push(frame.gpuPassMs);
    }

    if (frame.doneAtMs === null) {
      continue;
    }

    raw.push(frame.doneAtMs - frame.submitAtMs);

    const start = previousDone === null ? frame.submitAtMs : Math.max(frame.submitAtMs, previousDone);

    busy.push(frame.doneAtMs - start);

    if (previousDone !== null && frame.submitAtMs < previousDone) {
      dependentFrames.push(frame.frame);
    } else {
      independent.push(frame.doneAtMs - frame.submitAtMs);
    }

    if (previousDone !== null && Math.abs(frame.doneAtMs - previousDone) <= COALESCE_EPSILON_MS) {
      coalescedFrames.push(frame.frame);
    }

    previousDone = frame.doneAtMs;
  }

  return { raw, busy, independent, hardware, dependentFrames, coalescedFrames };
};

const buildSpecs = (): TimerProbeSpec[] => {
  const specs: TimerProbeSpec[] = [];

  for (const backend of backends) {
    for (const mode of modes) {
      for (const nodeCount of nodeCounts) {
        for (const config of configs) {
          specs.push({
            archetype,
            nodeCount,
            backend,
            config,
            mode,
            warmupFrames: controlsOnly ? 0 : warmupFrames,
            timedFrames: controlsOnly ? 0 : timedFrames,
            drainAfterWarmup: !noDrain,
            timestampQueries: !noTimestamps && backend === 'webgpu',
            controls: withControls,
            controlSamples,
          });
        }
      }
    }
  }

  return specs;
};

const runCell = async (spec: TimerProbeSpec, baseUrl: string): Promise<{ result: TimerProbeResult; adapter: string }> => {
  const flags =
    spec.backend === 'webgpu' ? [...WEBGPU_LAUNCH_FLAGS, ...(spec.timestampQueries && !args.includes('--quantized') ? TIMESTAMP_FLAGS : [])] : LAUNCH_FLAGS;
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...flags] });

  try {
    const page = await browser.newPage();

    page.on('pageerror', error => console.error(`[page] ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') {
        console.error(`[console] ${message.text()}`);
      }
    });

    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof globalThis.__runTimerProbe === 'function');

    const webGpuAdapter = spec.backend === 'webgpu' ? await readWebGpuAdapter(page) : null;
    const adapter = webGpuAdapter === null ? 'webgl2' : webGpuAdapter.adapter;
    const result = (await page.evaluate(cell => globalThis.__runTimerProbe!(cell), spec)) as TimerProbeResult;

    return { result, adapter };
  } finally {
    await browser.close();
  }
};

const fixed = (value: number | null, digits = 2): string => (value === null ? '—' : value.toFixed(digits));

const formatSummary = (runs: readonly CellRun[]): string => {
  const lines: string[] = [];

  lines.push('# WebGPU frame-timer methodology — candidate models on one timeline', '');
  lines.push(`Archetype \`${archetype}\`, ${timedFrames} timed frames after ${warmupFrames} warmup frames.`, '');

  lines.push('| cell | repeat | adapter | model | n | median | p95 | max |');
  lines.push('| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |');

  for (const run of runs) {
    if (run.result.frames.length === 0) {
      continue;
    }

    const series = evaluateModels(run.result.frames);
    const cpu = run.result.frames.map(frame => frame.cpuMs);
    const rows: ModelStats[] = [
      statsFor('A raw', series.raw),
      statsFor('B busy', series.busy),
      statsFor('C independent', series.independent),
      statsFor('D hardware pass', series.hardware),
      statsFor('cpu', cpu),
    ];

    for (const row of rows) {
      lines.push(
        `| ${run.key} | ${run.repeat} | ${run.adapter} | ${row.model} | ${row.n} | ${row.median.toFixed(2)} | ${row.p95.toFixed(2)} | ${row.max.toFixed(2)} |`,
      );
    }
  }

  lines.push('');

  for (const run of runs) {
    lines.push(`## ${run.key} (repeat ${run.repeat})`, '');
    lines.push(`Warmup ${run.result.warmupMs.toFixed(0)} ms, post-warmup drain ${run.result.warmupDrainMs.toFixed(1)} ms.`, '');

    if (run.result.notes.length > 0) {
      lines.push(...run.result.notes.map(note => `- ${note}`), '');
    }

    if (run.result.frames.length > 0) {
      const series = evaluateModels(run.result.frames);

      lines.push(
        `Dependent submits: ${series.dependentFrames.length}/${run.result.frames.length} (frames ${series.dependentFrames.join(' ') || '—'}).`,
        `Coalesced completions (<= ${COALESCE_EPSILON_MS} ms apart): ${series.coalescedFrames.length} (frames ${series.coalescedFrames.join(' ') || '—'}).`,
        '',
      );

      lines.push('| frame | rafAt | rafΔ | cpuMs | submitAt | doneAt | A raw | B busy | dep | D hwPass | hwSpan | passes | entered | wbMiB |');
      lines.push('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :-: | ---: | ---: | ---: | ---: | ---: |');

      let previousDone: number | null = null;

      for (const frame of run.result.frames) {
        const raw = frame.doneAtMs === null ? null : frame.doneAtMs - frame.submitAtMs;
        const busy = frame.doneAtMs === null ? null : frame.doneAtMs - (previousDone === null ? frame.submitAtMs : Math.max(frame.submitAtMs, previousDone));
        const dependent = previousDone !== null && frame.submitAtMs < previousDone;

        lines.push(
          `| ${frame.frame} | ${frame.rafAtMs.toFixed(1)} | ${frame.rafDeltaMs.toFixed(1)} | ${frame.cpuMs.toFixed(2)} | ${frame.submitAtMs.toFixed(1)} | ` +
            `${fixed(frame.doneAtMs, 1)} | ${fixed(raw)} | ${fixed(busy)} | ${dependent ? 'y' : ''} | ${fixed(frame.gpuPassMs, 3)} | ${fixed(frame.gpuSpanMs, 3)} | ` +
            `${frame.timedPasses} | ${frame.entered} | ${(frame.writeBufferBytes / 1048576).toFixed(2)} |`,
        );

        if (frame.doneAtMs !== null) {
          previousDone = frame.doneAtMs;
        }
      }

      lines.push('');
    }

    const controls = run.result.controls;

    if (controls !== null) {
      lines.push('### Controls', '');
      lines.push(`- \`performance.now()\` min non-zero delta: ${controls.nowMinDeltaMs.toFixed(4)} ms; crossOriginIsolated=${controls.crossOriginIsolated}`);
      lines.push(`- clock delta histogram (ms, count): ${controls.nowDeltaHistogram.map(([delta, count]) => `${delta}×${count}`).join(' ')}`);
      lines.push(`- microtask latency: median ${median(controls.microtaskMs).toFixed(4)} ms, max ${max(controls.microtaskMs).toFixed(4)} ms`);
      lines.push(
        `- idle-queue onSubmittedWorkDone: median ${median(controls.idleQueueMs).toFixed(3)} ms, p95 ${percentile(controls.idleQueueMs, 95).toFixed(3)} ms, max ${max(controls.idleQueueMs).toFixed(3)} ms`,
      );
      lines.push(
        `- empty-submit completion: median ${median(controls.emptySubmitMs).toFixed(3)} ms, p95 ${percentile(controls.emptySubmitMs, 95).toFixed(3)} ms, max ${max(controls.emptySubmitMs).toFixed(3)} ms`,
      );
      lines.push(`- idle rAF cadence: median ${median(controls.rafIdleDeltaMs).toFixed(2)} ms`);
      lines.push(`- adapter: ${JSON.stringify(controls.adapterInfo)}; timestamp features: ${controls.features.join(', ') || 'none'}`);
      lines.push('');
    }
  }

  return lines.join('\n');
};

const main = async (): Promise<void> => {
  const version = readEngineVersion();
  const server = await startViteServer(version);
  const baseUrl = server.resolvedUrls?.local[0];

  if (baseUrl === undefined) {
    await server.close();
    throw new Error('The Vite dev server reported no local URL.');
  }

  const runs: CellRun[] = [];

  try {
    for (const spec of buildSpecs()) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        const key = cellKey(spec);

        process.stdout.write(`running ${key} (repeat ${repeat + 1}/${repeats}) ... `);

        const { result, adapter } = await runCell(spec, baseUrl);
        const series = evaluateModels(result.frames);
        const controls = result.controls;

        const controlLine =
          controls === null
            ? ''
            : `  idleQ ${median(controls.idleQueueMs).toFixed(3)}  empty ${median(controls.emptySubmitMs).toFixed(3)}  raf ${median(controls.rafIdleDeltaMs).toFixed(2)}`;

        console.log(
          `A ${median(series.raw).toFixed(2)}/${percentile(series.raw, 95).toFixed(2)}  B ${median(series.busy).toFixed(2)}/${percentile(series.busy, 95).toFixed(2)}  ` +
            `D ${median(series.hardware).toFixed(3)}/${percentile(series.hardware, 95).toFixed(3)}  dep ${series.dependentFrames.length}/${result.frames.length}${controlLine}`,
        );

        runs.push({ key, repeat, adapter, result });
      }
    }
  } finally {
    await server.close();
  }

  const directory = resolve(fileURLToPath(new URL('../../..', import.meta.url)), outDir);

  mkdirSync(directory, { recursive: true });

  const jsonl = runs
    .flatMap(run => run.result.frames.map(frame => JSON.stringify({ cell: run.key, repeat: run.repeat, adapter: run.adapter, ...frame })))
    .join('\n');

  writeFileSync(resolve(directory, 'frames.jsonl'), `${jsonl}\n`);
  writeFileSync(
    resolve(directory, 'controls.jsonl'),
    `${runs.map(run => JSON.stringify({ cell: run.key, repeat: run.repeat, adapter: run.adapter, warmupDrainMs: run.result.warmupDrainMs, notes: run.result.notes, controls: run.result.controls })).join('\n')}\n`,
  );
  writeFileSync(resolve(directory, 'summary.md'), `${formatSummary(runs)}\n`);
  console.log(`\nwrote ${runs.length} cell(s) to ${directory}`);
};

await main();
