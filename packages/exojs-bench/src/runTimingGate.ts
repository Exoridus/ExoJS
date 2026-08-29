import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';

import { runMatrix } from './rendering/driver';
import type { Backend, CellResult } from './rendering/EngineAdapter';
import type { TimingBaseline } from './rendering/timingGate';
import { compareToTimingBaseline, formatTimingOutcome, isTimingFailure, recordTimingBaseline, TIMING_FLOOR_MS, TIMING_THRESHOLD } from './rendering/timingGate';
import { parseArgs } from './shared/args';

/**
 * Run the timing regression gate - a release precondition, invoked by hand.
 *
 * ```
 * pnpm --filter @codexo/exojs-bench gate:timing                    # compare
 * pnpm --filter @codexo/exojs-bench gate:timing --update --idle    # re-record
 * ```
 *
 * Pass `--idle` when re-recording ONLY if the machine really is idle: it stamps
 * `confirmedIdle` into the baseline, and every later run of the gate repeats that
 * claim back. Without it the baseline is still usable, and the gate says on every
 * run that it is a reference point rather than a release reference.
 *
 * This is not wired into any hook or CI job on purpose; see `timingGate.ts` for
 * why a percentage gate on wall clock cannot live in either.
 */

/** Baseline location, relative to the package root. */
const BASELINE_PATH = 'baselines/timing.json';

/**
 * Scope of the gate: the ExoJS arms on WebGL2 at one node count.
 *
 * Narrow on purpose. The gate is a precondition a maintainer runs before cutting
 * a version, so its wall clock has to stay in single-digit minutes or it will be
 * skipped - and a skipped gate is worth nothing. 5 000 nodes is the step where
 * every archetype (text and render-target rows included) is comfortably above
 * measurement noise while none of them is anywhere near the abort budget. WebGPU
 * is deliberately absent: its frame timing rests on a queue-completion clock with
 * a millisecond-scale observation floor, which is a different measurement with a
 * different noise profile, and folding it into one threshold would make the gate
 * fire on the floor rather than on a regression.
 */
const GATE_NODE_COUNT = 5_000;

/** Arms the gate covers: the default path and the retained tier. */
const GATE_CONFIGS = ['current', 'retained'];

/** Backend the gate measures. */
const GATE_BACKENDS: readonly Backend[] = ['webgl2'];

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const update = args.get('update') !== undefined;
  const idle = args.get('idle') !== undefined;
  const baselinePath = resolve(args.get('baseline') ?? BASELINE_PATH);

  console.log(`Timing gate: real GPU, exojs arms [${GATE_CONFIGS.join(', ')}], ${GATE_BACKENDS.join('+')}, n=${String(GATE_NODE_COUNT)}.`);
  console.log('Close everything else first - this measures wall clock, and a background compile is worth more than the threshold.');

  const outcome = await runMatrix({
    backends: GATE_BACKENDS,
    selection: { engines: ['exojs'], configs: GATE_CONFIGS, nodeCounts: [GATE_NODE_COUNT] },
  });

  const results: readonly CellResult[] = outcome.results;
  const software = outcome.provenance.filter(entry => entry.software).map(entry => entry.adapter);

  if (software.length > 0) {
    throw new Error(`Refusing to use software-rasterizer timings (${software.join(', ')}). Fix the launch flags or run on a machine with a real GPU.`);
  }

  if (update) {
    const baseline = recordTimingBaseline(results, {
      at: new Date().toISOString(),
      engineVersion: outcome.provenance[0]?.engineVersion ?? 'unknown',
      adapters: Object.fromEntries(outcome.provenance.map(entry => [entry.backend, entry.adapter])),
      cpu: cpus()[0]?.model ?? 'unknown',
      confirmedIdle: idle,
    });

    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    console.log(
      `Recorded ${String(baseline.cells.length)} cell(s) to ${baselinePath}${idle ? ' (machine declared idle)' : ' (machine NOT declared idle - pass --idle when it is)'}.`,
    );

    return;
  }

  if (!existsSync(baselinePath)) {
    throw new Error(`No baseline at '${baselinePath}'. Record one with --update --idle on an idle machine, then commit it.`);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as TimingBaseline;
  const recordedOn = Object.values(baseline.recorded.adapters).join(', ');
  const measuredOn = outcome.provenance.map(entry => entry.adapter).join(', ');

  if (recordedOn !== measuredOn) {
    console.warn(
      `WARNING the baseline was recorded on "${recordedOn}" / CPU "${baseline.recorded.cpu}" and this run is on "${measuredOn}". Wall-clock numbers do not carry across machines, so treat what follows as informational until the baseline is re-recorded here.`,
    );
  }

  const comparison = compareToTimingBaseline(baseline, results);

  console.log(formatTimingOutcome(comparison));

  if (isTimingFailure(comparison)) {
    throw new Error(
      `Timing gate FAILED: at least one cell's median exceeded its baseline by more than ${String(TIMING_THRESHOLD * 100)}% AND by at least ${String(TIMING_FLOOR_MS)}ms. Re-run once on a quiet machine before believing it - and if it holds, this is a real regression, not noise.`,
    );
  }

  console.log('Timing gate passed.');
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
