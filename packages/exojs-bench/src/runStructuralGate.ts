import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { runMatrix, SOFTWARE_LAUNCH_FLAGS } from './rendering/driver';
import type { CellResult } from './rendering/EngineAdapter';
import type { GateBaseline } from './rendering/structuralGate';
import { compareToBaseline, formatGateOutcome, isGateFailure, recordBaseline, UNGUARDED_ARCHETYPES } from './rendering/structuralGate';
import { parseArgs } from './shared/args';

/**
 * Run the structural regression gate.
 *
 * ```
 * pnpm --filter @codexo/exojs-bench gate:structural            # compare
 * pnpm --filter @codexo/exojs-bench gate:structural --update   # re-record
 * ```
 *
 * Deliberately a SOFTWARE-rasterizer run (`SOFTWARE_LAUNCH_FLAGS`). The gate
 * reads integer draw/bind/upload counters, which are decided CPU-side, so it
 * needs no GPU - and by asking for the software rasterizer explicitly it gets
 * the same numbers on a developer's machine, on a hosted CI runner and on a
 * laptop with a switched-off discrete GPU. It measures only the ExoJS arms: the
 * gate compares ExoJS against its own past, so no competitor library is
 * installed or loaded, which is what lets it live in CI while the timing matrix
 * cannot.
 */

/** Baseline location, relative to the package root. */
const BASELINE_PATH = 'baselines/structural.json';

/**
 * Node count the gate measures at.
 *
 * One count, and a small one. The counters the gate guards are steady-state per
 * frame and their VALUES scale with node count, but a batching collapse shows up
 * at any count - so a second count would double the gate's wall clock to
 * re-detect the same defect. 1 000 keeps every archetype (including the text and
 * render-target rows) inside a few seconds per cell on a software rasterizer.
 */
const GATE_NODE_COUNT = 1_000;

/** Timed frames per cell. Counters are steady-state, so a handful is enough to divide evenly and prove it. */
const GATE_TIMED_FRAMES = 3;

/** The ExoJS arms the gate guards: the default path and the retained tier. */
const GATE_CONFIGS = ['current', 'retained'];

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const update = args.get('update') !== undefined;
  const baselinePath = resolve(args.get('baseline') ?? BASELINE_PATH);

  console.log(`Structural gate: software rasterizer, exojs arms [${GATE_CONFIGS.join(', ')}], webgl2, n=${String(GATE_NODE_COUNT)}.`);
  console.log(`Unguarded archetypes: ${Object.keys(UNGUARDED_ARCHETYPES).join(', ')} (see structuralGate.ts for why).`);

  const outcome = await runMatrix({
    backends: ['webgl2'],
    selection: { engines: ['exojs'], configs: GATE_CONFIGS, nodeCounts: [GATE_NODE_COUNT] },
    timedFramesOverride: GATE_TIMED_FRAMES,
    launchFlags: SOFTWARE_LAUNCH_FLAGS,
  });

  const results: readonly CellResult[] = outcome.results;
  const adapter = outcome.provenance[0]?.adapter ?? 'unknown';

  if (update) {
    const baseline = recordBaseline(results, {
      at: new Date().toISOString(),
      engineVersion: outcome.provenance[0]?.engineVersion ?? 'unknown',
      adapter,
    });

    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

    console.log(`Recorded ${String(baseline.cells.length)} cell(s) to ${baselinePath} on adapter "${adapter}".`);

    return;
  }

  if (!existsSync(baselinePath)) {
    throw new Error(`No baseline at '${baselinePath}'. Record one with --update, then commit it.`);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as GateBaseline;
  const comparison = compareToBaseline(baseline, results);

  console.log(formatGateOutcome(comparison));

  if (isGateFailure(comparison)) {
    throw new Error(
      'Structural gate FAILED. These counters do not drift, so a deviation is a change in what the engine submits - either an intended one (re-record with --update in the same commit) or the batching/invalidation regression this gate exists to catch.',
    );
  }

  console.log('Structural gate passed.');
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
