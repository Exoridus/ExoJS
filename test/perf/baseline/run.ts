import { resolve } from 'node:path';

import { runMatrix } from './driver';
import type { ArchetypeId, Backend, CellSpec } from './EngineAdapter';

/** Default output directory for the generated report artifacts (gitignored). */
const DEFAULT_OUT_DIR = '.workspace/output/baseline/';

/** Backends run when `--backend` is not given. `buildMatrix` gates each to the adapters that support it. */
const DEFAULT_BACKENDS: readonly Backend[] = ['webgl2', 'webgpu'];

/** Parses `--key=value` / `--key value` CLI flags into a map. */
const parseArgs = (argv: readonly string[]): Map<string, string> => {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token?.startsWith('--') !== true) {
      continue;
    }

    const body = token.slice(2);
    const equals = body.indexOf('=');

    if (equals >= 0) {
      args.set(body.slice(0, equals), body.slice(equals + 1));
    } else {
      const next = argv[i + 1];

      if (next !== undefined && !next.startsWith('--')) {
        args.set(body, next);
        i++;
      } else {
        args.set(body, 'true');
      }
    }
  }

  return args;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  const backendArg = args.get('backend');
  const archetypeArg = args.get('archetype');
  const nodesArg = args.get('nodes');
  const framesArg = args.get('frames');
  const outDir = resolve(args.get('out') ?? DEFAULT_OUT_DIR);

  const backends: readonly Backend[] = backendArg ? (backendArg.split(',').map(value => value.trim()) as Backend[]) : DEFAULT_BACKENDS;

  const filter: Partial<CellSpec> = {};

  if (archetypeArg !== undefined) {
    filter.archetype = archetypeArg as ArchetypeId;
  }

  if (nodesArg !== undefined) {
    const nodeCount = Number.parseInt(nodesArg, 10);

    if (Number.isNaN(nodeCount)) {
      throw new Error(`--nodes must be an integer (got '${nodesArg}').`);
    }

    filter.nodeCount = nodeCount;
  }

  // `--frames` (review B7 / S5's "thin sampling" ask): overrides EVERY cell's
  // timed-frame count regardless of node count, so a smoke/spot-check run can
  // finish in seconds without editing `timedFramesFor` in source. This is
  // strictly a convenience knob for fast iteration — like `timedFramesOverride`
  // itself (see driver.ts), it must never be used for a reportable run: it
  // flattens the per-node-count frame budgets the report's `timedFrames`
  // column exists to make honest, so any run using it is forced into the
  // existing SUBSET RUN path below.
  let timedFramesOverride: number | undefined;

  if (framesArg !== undefined) {
    const frames = Number.parseInt(framesArg, 10);

    if (Number.isNaN(frames) || frames < 1) {
      throw new Error(`--frames must be a positive integer (got '${framesArg}').`);
    }

    timedFramesOverride = frames;
  }

  const isSubset = backendArg !== undefined || archetypeArg !== undefined || nodesArg !== undefined || timedFramesOverride !== undefined;

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-session rule).');
  }

  console.log(
    `Running baseline matrix: backends=[${backends.join(', ')}]${archetypeArg ? `, archetype=${archetypeArg}` : ''}${nodesArg ? `, nodes=${nodesArg}` : ''}${timedFramesOverride !== undefined ? `, frames=${timedFramesOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  const data = await runMatrix({
    backends,
    ...(isSubset && { filter }),
    ...(timedFramesOverride !== undefined && { timedFramesOverride }),
  });

  // Provenance up front, loudly — a green run on a software rasterizer is worthless.
  console.log('\n=== Provenance ===');

  for (const entry of data.provenance) {
    console.log(
      `  backend=${entry.backend} adapter="${entry.adapter}" software=${String(entry.software)} headless=${String(entry.headless)} flags=[${entry.flags.join(' ')}] engine=${entry.engineVersion}`,
    );
  }

  if (data.provenance.some(entry => entry.software)) {
    console.warn('\n!!! SOFTWARE RASTERIZER DETECTED — timings are UNTRUSTED. Fix the launch flags before trusting any number. !!!');
  }

  const { writeReport } = await import('./report');

  writeReport(data, outDir);

  // Structural sanity summary: per-frame draw calls per archetype/node count.
  console.log('\n=== Per-frame draw calls (structural sanity) ===');

  for (const result of data.results) {
    console.log(
      `  ${result.spec.archetype.padEnd(15)} n=${String(result.spec.nodeCount).padStart(7)} drawCalls=${String(result.structural.drawCalls).padStart(8)} cpuMsMedian=${result.cpuMsMedian.toFixed(3)}`,
    );
  }

  console.log(`\nReport written to ${outDir} (results.json, results.csv, results.md)`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
