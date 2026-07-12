import { resolve } from 'node:path';

// `./physics` is imported for TYPES only here (erased at runtime); its module
// graph — the `@codexo/exojs-physics` source arm — is loaded lazily via a
// dynamic `import()` inside `runPhysicsDomain`, so a rendering run never pays for it.
import type { PhysicsAdapter, PhysicsCellResult, PhysicsCellSpec } from './physics';
import type { ArchetypeId, Backend, CellResult, CellSpec } from './rendering';
import { runMatrix, writeReport } from './rendering';
import { parseArgs } from './shared/args';
import { createCheckpointWriter } from './shared/checkpoint';

/** Domains this CLI can drive. Each has its own archetypes + arms; the shared layer (timing, provenance, checkpoint, report skeleton) is reused across both. */
const DOMAINS = ['rendering', 'physics'] as const;
type Domain = (typeof DOMAINS)[number];

/** Default output directory for the rendering report artifacts (gitignored). */
const DEFAULT_OUT_DIR = '.workspace/output/baseline/';

/** Default output directory for the physics report artifacts (gitignored). */
const DEFAULT_PHYSICS_OUT_DIR = '.workspace/output/physics/';

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
  const engineArg = args.get('engine');
  const outDir = resolve(args.get('out') ?? DEFAULT_OUT_DIR);

  const backends: readonly Backend[] = backendArg ? (backendArg.split(',').map(value => value.trim()) as Backend[]) : DEFAULT_BACKENDS;

  // Mutable filter (CellSpec's fields are readonly; a Partial keeps that, so
  // build the filter through a writable shape and hand it to runMatrix as the
  // Partial<CellSpec> it accepts).
  const filter: { -readonly [K in keyof CellSpec]?: CellSpec[K] } = {};

  if (archetypeArg !== undefined) {
    filter.archetype = archetypeArg as ArchetypeId;
  }

  if (engineArg !== undefined) {
    filter.engine = engineArg;
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

  const isSubset = backendArg !== undefined || archetypeArg !== undefined || nodesArg !== undefined || engineArg !== undefined || timedFramesOverride !== undefined;

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-session rule).');
  }

  console.log(
    `Running rendering benchmark: backends=[${backends.join(', ')}]${engineArg ? `, engine=${engineArg}` : ''}${archetypeArg ? `, archetype=${archetypeArg}` : ''}${nodesArg ? `, nodes=${nodesArg}` : ''}${timedFramesOverride !== undefined ? `, frames=${timedFramesOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
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

/**
 * Run the physics benchmark domain end-to-end and write its report artifacts.
 *
 * Physics is CPU-only: no browser, no GPU. The whole matrix runs in THIS Node
 * process as a straight loop over `world.step`, so the domain module is imported
 * dynamically (only when selected) — a rendering run never loads the physics
 * arm's `@codexo/exojs-physics` source graph, and vice versa.
 *
 * Flags mirror the rendering domain: `--archetype` and `--bodies` filter the
 * matrix (the `--bodies` node-sweep analogue), `--frames` overrides the timed-
 * step count for a fast spot-check (never a reportable run).
 */
const runPhysicsDomain = async (args: Map<string, string>): Promise<void> => {
  const { createExoJsPhysicsAdapter, createMatterJsAdapter, createRapierAdapter, runPhysicsMatrix, writePhysicsReport } = await import('./physics');

  const archetypeArg = args.get('archetype');
  const bodiesArg = args.get('bodies');
  const framesArg = args.get('frames');
  const outDir = resolve(args.get('out') ?? DEFAULT_PHYSICS_OUT_DIR);

  const filter: { -readonly [K in keyof PhysicsCellSpec]?: PhysicsCellSpec[K] } = {};

  if (archetypeArg !== undefined) {
    filter.archetype = archetypeArg as PhysicsCellSpec['archetype'];
  }

  if (bodiesArg !== undefined) {
    const bodyCount = Number.parseInt(bodiesArg, 10);

    if (Number.isNaN(bodyCount)) {
      throw new Error(`--bodies must be an integer (got '${bodiesArg}').`);
    }

    filter.bodyCount = bodyCount;
  }

  // `--frames`: override every selected cell's timed-step count (like the
  // rendering domain's flag). A convenience knob for fast iteration only — it
  // flattens the per-body-count step budgets the report's `timedSteps` column
  // exists to make honest, so any run using it is a non-reportable SUBSET RUN.
  let timedStepsOverride: number | undefined;

  if (framesArg !== undefined) {
    const frames = Number.parseInt(framesArg, 10);

    if (Number.isNaN(frames) || frames < 1) {
      throw new Error(`--frames must be a positive integer (got '${framesArg}').`);
    }

    timedStepsOverride = frames;
  }

  const isSubset = archetypeArg !== undefined || bodiesArg !== undefined || timedStepsOverride !== undefined;

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-run rule).');
  }

  console.log(
    `Running physics benchmark: ${archetypeArg ? `archetype=${archetypeArg}` : 'all archetypes'}${bodiesArg ? `, bodies=${bodiesArg}` : ''}${timedStepsOverride !== undefined ? `, frames=${timedStepsOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Resolve the arms: the native exojs-physics arm is always present; the matter
  // and rapier competitor arms are loaded lazily and degrade to a skipped arm
  // (resolver returns null) when their library was never linked via bench:setup,
  // so a checkout without the competitor deps still runs the native domain.
  const adapters: PhysicsAdapter[] = [createExoJsPhysicsAdapter()];
  const libraries: string[] = ['@codexo/exojs-physics'];

  const matter = await createMatterJsAdapter();

  if (matter !== null) {
    adapters.push(matter);
    libraries.push('matter-js');
  }

  const rapier = await createRapierAdapter();

  if (rapier !== null) {
    adapters.push(rapier);
    libraries.push('@dimforge/rapier2d-compat');
  }

  console.log(`Arms: ${adapters.map(adapter => adapter.engine).join(', ')}`);

  // Incremental, crash-safe checkpoint: each cell is persisted the instant it
  // lands, reusing the same shared writer the rendering domain uses.
  const checkpoint = createCheckpointWriter<PhysicsCellResult>(outDir);

  const data = runPhysicsMatrix({
    adapters,
    libraries,
    ...(isSubset && { filter }),
    ...(timedStepsOverride !== undefined && { timedStepsOverride }),
    onCellResult: result => checkpoint.append(result),
  });

  console.log(`\nPer-cell checkpoints written incrementally to ${checkpoint.jsonlPath}`);

  console.log('\n=== Arms ===');

  for (const library of data.libraries) {
    console.log(`  ${library.name} @ ${library.version}${library.resolvedFrom.length > 0 ? ` (from ${library.resolvedFrom})` : ''}`);
  }

  console.log('\n=== Provenance ===');
  console.log(`  node=${data.provenance.host.node} cpu="${data.provenance.host.cpu}" (${String(data.provenance.host.cpuCount)} logical) os=${data.provenance.host.os} engine=${data.provenance.engineVersion} fixedDelta=${String(data.provenance.fixedDelta)}`);

  writePhysicsReport(data, outDir);

  console.log('\n=== Per-step time (median) + structural ===');

  for (const result of data.results) {
    console.log(
      `  ${result.spec.engine.padEnd(14)} ${result.spec.config.padEnd(7)} ${result.spec.archetype.padEnd(20)} n=${String(result.spec.bodyCount).padStart(6)} bodies=${String(result.structural.bodyCount).padStart(6)} contacts=${String(result.structural.contactCount).padStart(6)} stepMsMedian=${result.stepMsMedian.toFixed(4)} stepMsP95=${result.stepMsP95.toFixed(4)} status=${result.status}`,
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
    case 'physics':
      await runPhysicsDomain(args);
      break;
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
