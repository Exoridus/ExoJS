import { resolve } from 'node:path';

// `./physics` is imported for TYPES only here (erased at runtime); its module
// graph - the `@codexo/exojs-physics` source arm - is loaded lazily via a
// dynamic `import()` inside `runPhysicsDomain`, so a rendering run never pays for it.
import type { PhysicsAdapter, PhysicsCellResult, PhysicsCellSpec } from './physics';
import type { ArchetypeId, Backend, CellResult, MatrixSelection } from './rendering';
import { isHitching, profileCell, runMatrix, writeReport } from './rendering';
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

/** Split a comma-separated CLI list into trimmed, non-empty values, or `undefined` when the flag was absent. */
const parseList = (raw: string | undefined): string[] | undefined => {
  if (raw === undefined) {
    return undefined;
  }

  const values = raw
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);

  return values.length > 0 ? values : undefined;
};

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

/**
 * `--profile` mode: run the SELECTED cells under the V8 CPU sampler and print
 * self time by source file and by function, instead of measuring wall clock.
 *
 * This answers a different question than the matrix does. The matrix says how
 * expensive a frame is; the profile says WHICH code made it expensive, which is
 * the only way to tell an optimisation candidate that would move a real number
 * from one that would not. Output is deliberately printed rather than written
 * into `results.*`: a profile is not a comparable datapoint and must never end
 * up in the same table as one.
 */
const runProfileMode = async (
  args: Map<string, string>,
  selection: { engines?: string[]; configs?: string[]; archetypes?: ArchetypeId[]; nodeCounts?: number[] },
  backends: readonly Backend[],
): Promise<void> => {
  const frames = Number.parseInt(args.get('profile-frames') ?? '200', 10);
  const topRows = Number.parseInt(args.get('profile-top') ?? '25', 10);
  const engines = selection.engines ?? ['exojs'];
  const configs = selection.configs ?? ['current'];
  const archetypes = selection.archetypes ?? (['static-heavy'] as ArchetypeId[]);
  const nodeCounts = selection.nodeCounts ?? [25_000];

  for (const backend of backends) {
    for (const engine of engines) {
      for (const config of configs) {
        for (const archetype of archetypes) {
          for (const nodeCount of nodeCounts) {
            const outcome = await profileCell({
              spec: { engine, config, backend, archetype, nodeCount, timedFrames: frames, warmupFrames: 30 },
              frames,
            });

            console.log(
              `\n=== CPU profile: engine=${engine} config=${config} backend=${backend} archetype=${archetype} n=${nodeCount} ===\n` +
                `  ${outcome.frames} synchronous frames in ${outcome.wallMs.toFixed(1)}ms wall (${(outcome.wallMs / outcome.frames).toFixed(3)}ms/frame), ` +
                `${outcome.totalSelfMs.toFixed(1)}ms attributed self time; adapter="${outcome.provenance.adapter}"`,
            );

            console.log('\n  -- self time by FILE --');

            for (const file of outcome.byFile.slice(0, topRows)) {
              console.log(`    ${file.selfPercent.toFixed(1).padStart(5)}%  ${(file.selfMs / outcome.frames).toFixed(4).padStart(9)} ms/frame  ${file.source}`);
            }

            console.log('\n  -- self time by FUNCTION --');

            for (const row of outcome.rows.slice(0, topRows)) {
              console.log(
                `    ${row.selfPercent.toFixed(1).padStart(5)}%  ${(row.selfMs / outcome.frames).toFixed(4).padStart(9)} ms/frame  ${row.functionName || '(anonymous)'}  @ ${row.source}`,
              );
            }
          }
        }
      }
    }
  }
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

  // `--archetype`, `--engine`, `--config` and `--nodes` each accept a
  // COMMA-SEPARATED list. A single value behaves exactly as before; a list
  // routes through `MatrixSelection` so one invocation - and therefore ONE
  // browser session per arm - can cover several archetypes/arms at once. Before
  // this, comparing two archetypes meant two process launches, i.e. two
  // sessions, which the same-session rule forbids for a cross-arm claim.
  const archetypes = parseList(archetypeArg) as ArchetypeId[] | undefined;
  const engines = parseList(engineArg);
  const configs = parseList(args.get('config'));
  const nodeCounts = parseList(nodesArg)?.map(value => {
    const nodeCount = Number.parseInt(value, 10);

    if (Number.isNaN(nodeCount)) {
      throw new Error(`--nodes must be an integer or a comma-separated list of integers (got '${nodesArg}').`);
    }

    return nodeCount;
  });

  const selection: MatrixSelection = {
    ...(engines !== undefined && { engines }),
    ...(configs !== undefined && { configs }),
    ...(archetypes !== undefined && { archetypes }),
    ...(nodeCounts !== undefined && { nodeCounts }),
  };
  const hasSelection = Object.keys(selection).length > 0;

  // `--frames` overrides EVERY cell's
  // timed-frame count regardless of node count, so a smoke/spot-check run can
  // finish in seconds without editing `timedFramesFor` in source. This is
  // strictly a convenience knob for fast iteration - like `timedFramesOverride`
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

  if (args.has('profile')) {
    await runProfileMode(
      args,
      {
        ...(engines !== undefined && { engines }),
        ...(configs !== undefined && { configs }),
        ...(archetypes !== undefined && { archetypes }),
        ...(nodeCounts !== undefined && { nodeCounts }),
      },
      backends,
    );

    return;
  }

  const isSubset = backendArg !== undefined || hasSelection || timedFramesOverride !== undefined;

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-session rule).');
  }

  console.log(
    `Running rendering benchmark: backends=[${backends.join(', ')}]${engines ? `, engine=[${engines.join(', ')}]` : ''}${configs ? `, config=[${configs.join(', ')}]` : ''}${archetypes ? `, archetype=[${archetypes.join(', ')}]` : ''}${nodeCounts ? `, nodes=[${nodeCounts.join(', ')}]` : ''}${timedFramesOverride !== undefined ? `, frames=${timedFramesOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Incremental, crash-safe checkpoint: each cell is persisted the instant it
  // lands (see shared/checkpoint.ts), so a later cell crash - the Pixi-WebGPU
  // probe was the observed one - can never discard the cells already measured.
  const checkpoint = createCheckpointWriter<CellResult>(outDir);

  const data = await runMatrix({
    backends,
    ...(hasSelection && { selection }),
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

  // Provenance up front, loudly - a green run on a software rasterizer is worthless.
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
      `  ${result.spec.engine.padEnd(6)} ${result.spec.config.padEnd(9)} ${result.spec.backend.padEnd(6)} ${result.spec.archetype.padEnd(15)} n=${String(result.spec.nodeCount).padStart(7)} drawCalls=${String(result.structural.drawCalls).padStart(8)} cpuMsMedian=${result.cpuMsMedian.toFixed(3)} cpuMsP95=${result.cpuMsP95.toFixed(3).padStart(8)} status=${result.status}${isHitching(result) ? ' HITCHING' : ''}`,
    );
  }

  console.log(`\nReport written to ${outDir} (results.json, results.csv, results.md)`);
};

/**
 * Run the physics benchmark domain end-to-end and write its report artifacts.
 *
 * Physics is CPU-only: no browser, no GPU. The whole matrix runs in THIS Node
 * process as a straight loop over `world.step`, so the domain module is imported
 * dynamically (only when selected) - a rendering run never loads the physics
 * arm's `@codexo/exojs-physics` source graph, and vice versa.
 *
 * Flags mirror the rendering domain: `--archetype` and `--bodies` filter the
 * matrix (the `--bodies` node-sweep analogue), `--frames` overrides the timed-
 * step count for a fast spot-check (never a reportable run).
 */
const runPhysicsDomain = async (args: Map<string, string>): Promise<void> => {
  const { createExoJsPhysicsAdapter, createMatterJsAdapter, createPlanckAdapter, createRapierAdapter, runPhysicsMatrix, writePhysicsReport } =
    await import('./physics');

  const archetypeArg = args.get('archetype');
  const bodiesArg = args.get('bodies');
  const framesArg = args.get('frames');
  const engineArg = args.get('engine');
  const outDir = resolve(args.get('out') ?? DEFAULT_PHYSICS_OUT_DIR);

  const filter: { -readonly [K in keyof PhysicsCellSpec]?: PhysicsCellSpec[K] } = {};

  if (archetypeArg !== undefined) {
    filter.archetype = archetypeArg as PhysicsCellSpec['archetype'];
  }

  // `--engine` narrows the matrix to one arm. The arms are independent
  // processes' worth of work in one process, so isolating an arm is the only way
  // to measure it without the other arms' heap and JIT state in the mix - which
  // is exactly what an A/B of a solver change needs, and exactly why such a run
  // is a SUBSET RUN and not a cross-arm comparison.
  if (engineArg !== undefined) {
    filter.engine = engineArg;
  }

  if (bodiesArg !== undefined) {
    const bodyCount = Number.parseInt(bodiesArg, 10);

    if (Number.isNaN(bodyCount)) {
      throw new Error(`--bodies must be an integer (got '${bodiesArg}').`);
    }

    filter.bodyCount = bodyCount;
  }

  // `--frames`: override every selected cell's timed-step count (like the
  // rendering domain's flag). A convenience knob for fast iteration only - it
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

  const isSubset = archetypeArg !== undefined || bodiesArg !== undefined || engineArg !== undefined || timedStepsOverride !== undefined;

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-run rule).');
  }

  console.log(
    `Running physics benchmark: ${archetypeArg ? `archetype=${archetypeArg}` : 'all archetypes'}${engineArg ? `, engine=${engineArg}` : ''}${bodiesArg ? `, bodies=${bodiesArg}` : ''}${timedStepsOverride !== undefined ? `, frames=${timedStepsOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Resolve the arms: the native exojs-physics arm is always present; the
  // matter, planck and rapier competitor arms are loaded lazily and degrade to a
  // skipped arm (resolver returns null) when their library was never linked via
  // bench:setup, so a checkout without the competitor deps still runs the native
  // domain.
  const adapters: PhysicsAdapter[] = [createExoJsPhysicsAdapter()];
  const libraries: string[] = ['@codexo/exojs-physics'];

  const matter = await createMatterJsAdapter();

  if (matter !== null) {
    adapters.push(matter);
    libraries.push('matter-js');
  }

  const planck = await createPlanckAdapter();

  if (planck !== null) {
    adapters.push(planck);
    libraries.push('planck');
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
  console.log(
    `  node=${data.provenance.host.node} cpu="${data.provenance.host.cpu}" (${String(data.provenance.host.cpuCount)} logical) os=${data.provenance.host.os} engine=${data.provenance.engineVersion} fixedDelta=${String(data.provenance.fixedDelta)}`,
  );

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
