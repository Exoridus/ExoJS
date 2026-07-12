import { resolve } from 'node:path';

import type { ArchetypeId, Backend, CellResult, CellSpec } from './rendering';
import { runMatrix, writeReport } from './rendering';
import { parseArgs } from './shared/args';
import { createCheckpointWriter } from './shared/checkpoint';

/** Domains this CLI can drive. Rendering is the first; `physics` etc. can be added as sibling barrels. */
const DOMAINS = ['rendering'] as const;
type Domain = (typeof DOMAINS)[number];

/** Default output directory for the generated report artifacts (gitignored). */
const DEFAULT_OUT_DIR = '.workspace/output/baseline/';

/** Backends run when `--backend` is not given. `buildMatrix` gates each to the adapters that support it. */
const DEFAULT_BACKENDS: readonly Backend[] = ['webgl2', 'webgpu'];

/** Parse and validate the `--domain` selector (defaults to `rendering`). */
const resolveDomain = (raw: string | undefined): Domain => {
  if (raw === undefined) {
    return 'rendering';
  }

  if ((DOMAINS as readonly string[]).includes(raw)) {
    return raw as Domain;
  }

  throw new Error(`--domain must be one of [${DOMAINS.join(', ')}] (got '${raw}').`);
};

/** Run the rendering benchmark domain end-to-end and write its report artifacts. */
const runRenderingDomain = async (args: Map<string, string>): Promise<void> => {
  const backendArg = args.get('backend');
  const archetypeArg = args.get('archetype');
  const nodesArg = args.get('nodes');
  const framesArg = args.get('frames');
  const outDir = resolve(args.get('out') ?? DEFAULT_OUT_DIR);

  const backends: readonly Backend[] = backendArg ? (backendArg.split(',').map(value => value.trim()) as Backend[]) : DEFAULT_BACKENDS;

  // Mutable filter (CellSpec's fields are readonly; a Partial keeps that, so
  // build the filter through a writable shape and hand it to runMatrix as the
  // Partial<CellSpec> it accepts).
  const filter: { -readonly [K in keyof CellSpec]?: CellSpec[K] } = {};

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
    `Running rendering benchmark: backends=[${backends.join(', ')}]${archetypeArg ? `, archetype=${archetypeArg}` : ''}${nodesArg ? `, nodes=${nodesArg}` : ''}${timedFramesOverride !== undefined ? `, frames=${timedFramesOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Incremental, crash-safe checkpoint: each cell is persisted the instant it
  // lands (see shared/checkpoint.ts), so a later cell crash — the Pixi-WebGPU
  // probe was the observed one — can never discard the cells already measured.
  const checkpoint = createCheckpointWriter<CellResult>(outDir);

  const data = await runMatrix({
    backends,
    ...(isSubset && { filter }),
    ...(timedFramesOverride !== undefined && { timedFramesOverride }),
    onCellResult: result => checkpoint.append(result),
  });

  console.log(`\nPer-cell checkpoints written incrementally to ${checkpoint.jsonlPath}`);

  // Library arm provenance up front: a "vs Pixi" number is only auditable if the
  // exact library version is on the record.
  console.log('\n=== Library arms ===');

  for (const library of data.libraries) {
    console.log(`  ${library.name} @ ${library.version}${library.resolvedFrom.length > 0 ? ` (from ${library.resolvedFrom})` : ''}`);
  }

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

  writeReport(data, outDir);

  // Structural sanity summary: per-frame draw calls per arm/archetype/node count.
  console.log('\n=== Per-frame draw calls (structural sanity) ===');

  for (const result of data.results) {
    console.log(
      `  ${result.spec.engine.padEnd(6)} ${result.spec.config.padEnd(9)} ${result.spec.backend.padEnd(6)} ${result.spec.archetype.padEnd(15)} n=${String(result.spec.nodeCount).padStart(7)} drawCalls=${String(result.structural.drawCalls).padStart(8)} cpuMsMedian=${result.cpuMsMedian.toFixed(3)} status=${result.status}`,
    );
  }

  console.log(`\nReport written to ${outDir} (results.json, results.csv, results.md)`);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const domain = resolveDomain(args.get('domain'));

  switch (domain) {
    case 'rendering':
      await runRenderingDomain(args);
      break;
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
