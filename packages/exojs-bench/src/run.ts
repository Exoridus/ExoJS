import { resolve } from 'node:path';

// `./physics` is imported for TYPES only here (erased at runtime); its module
// graph is loaded lazily via a dynamic `import()` inside `runPhysicsDomain`, so
// a rendering run never pays for it.
import type { PhysicsCellResult, PhysicsCellSpec } from './physics';
import { PHYSICS_ARCHETYPES } from './physics/archetypes';
import type { ArchetypeId, Backend, CellResult, MatrixSelection, RenderingBrowser } from './rendering';
import { isHitching, parseRenderingBrowser, profileCell, runMatrix, writeReport } from './rendering';
import { ARCHETYPES } from './rendering/archetypes';
import { resolveMatrixCells } from './rendering/driver';
import { parseArgs } from './shared/args';
import { createCheckpointWriter } from './shared/checkpoint';
import type { PlatformDeclaration } from './shared/provenance';
import { parsePlatformDeclaration, PLATFORM_DECLARATION_SYNTAX, readPlatformVersion } from './shared/provenance';
import { printTextTable } from './shared/table';
import { PHYSICS_LIBRARY_ARMS } from './shared/viteServer';
import type { RunPlan } from './suite/plan';
import { parseSuite, resolveSuitePlan } from './suite/plan';

/** Domains this CLI can drive. Each has its own archetypes + arms; the shared layer (timing, provenance, checkpoint, report skeleton) is reused across both. */
const DOMAINS = ['rendering', 'physics'] as const;
type Domain = (typeof DOMAINS)[number];

/** `--domain` accepts a single domain or `all`, which runs both SERIALLY. */
type DomainSelector = Domain | 'all';

/** Default output directory for the rendering report artifacts (gitignored). */
const DEFAULT_OUT_DIR = '.workspace/output/baseline/';

/** Default output directory for the physics report artifacts (gitignored). */
const DEFAULT_PHYSICS_OUT_DIR = '.workspace/output/physics/';

/** Default parent directory for a `--domain=all` run; each domain gets a subdirectory of it. */
const DEFAULT_ALL_OUT_DIR = '.workspace/output/all/';

/** Backends run when `--backend` is not given. `buildMatrix` gates each to the adapters that support it. */
const DEFAULT_BACKENDS: readonly Backend[] = ['webgl2', 'webgpu'];

/**
 * Refuse a selection value that carries whitespace.
 *
 * PowerShell reads an unquoted `a,b` argument as an array literal and rejoins
 * it with spaces on its way through pnpm's `.ps1` shim, so
 * `--nodes=1000,5000` typed there arrives as `--nodes=1000 5000`. Most of that
 * damage announces itself - an engine or backend named `'webgl2 webgpu'`
 * matches nothing and the matrix comes out empty - but `--nodes` does not:
 * `Number.parseInt('1000 5000', 10)` is `1000`, so the run would measure one
 * node count, report success, and publish it under the provenance of two.
 * Refusing the shape here is what keeps that from becoming a number somebody
 * later quotes.
 *
 * Quoting the flag is what preserves the list. A `--` separator does not: the
 * rewrite happens in the argument binder, before pnpm sees anything.
 */
const refuseSplitList = (flag: string, value: string): void => {
  if (!/\s/.test(value)) {
    return;
  }

  throw new Error(
    `--${flag} takes a comma-separated list, and '${value}' contains whitespace. ` +
      'PowerShell splits an unquoted `a,b` argument and rejoins it with spaces; quote the flag ' +
      `("--${flag}=...") or run the command from a POSIX shell. A \`--\` separator does not help.`,
  );
};

/** Split a comma-separated CLI list into trimmed, non-empty values, or `undefined` when the flag was absent. */
const parseList = (flag: string, raw: string | undefined): string[] | undefined => {
  if (raw === undefined) {
    return undefined;
  }

  const values = raw
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);

  for (const value of values) {
    refuseSplitList(flag, value);
  }

  return values.length > 0 ? values : undefined;
};

/**
 * Resolve the `--platform` declaration and refuse the flag it replaced.
 *
 * `--prerelease` used to declare a beta operating system without naming its
 * version. Silently ignoring it would let a stale command line publish a beta
 * measurement under a shipping platform's name, so it is rejected outright
 * rather than dropped.
 */
const resolvePlatform = (args: Map<string, string>): PlatformDeclaration | undefined => {
  if (args.has('prerelease')) {
    throw new Error(`--prerelease has been replaced by ${PLATFORM_DECLARATION_SYNTAX}, which states the pre-release build together with the version it is of.`);
  }

  return parsePlatformDeclaration(args.get('platform'));
};

/**
 * Refuse a reportable run whose platform version nothing established.
 *
 * The version is part of a published profile's file name, and it is only
 * readable on some platforms. Failing here, before any measurement, costs the
 * runner a command line; failing at `bench:compare` would cost them every run
 * they had already taken. A narrowed run cannot be published anyway, so it only
 * warns.
 */
const requirePlatformVersion = (declared: PlatformDeclaration | undefined, isSubset: boolean): void => {
  if (readPlatformVersion(declared).source !== 'undetermined') {
    return;
  }

  const message = `This platform does not report its own major version, which a published profile's file name carries. Declare it with ${PLATFORM_DECLARATION_SYNTAX}.`;

  if (isSubset) {
    console.warn(`\n${message}`);

    return;
  }

  throw new Error(message);
};

/** Parse and validate the `--domain` selector (defaults to `rendering`). */
const resolveDomain = (raw: string | undefined): DomainSelector => {
  if (raw === undefined) {
    return 'rendering';
  }

  if (raw === 'all' || (DOMAINS as readonly string[]).includes(raw)) {
    return raw as DomainSelector;
  }

  throw new Error(`--domain must be one of [${DOMAINS.join(', ')}, all] (got '${raw}').`);
};

/**
 * Output directory for one domain of a run.
 *
 * `--domain=all` gives each domain its own SUBDIRECTORY of the requested output
 * rather than letting the second domain's `results.json` overwrite the first's.
 * A single-domain run keeps writing exactly where it always did.
 */
const outDirFor = (args: Map<string, string>, domain: Domain, selector: DomainSelector): string => {
  const requested = args.get('out');

  if (selector !== 'all') {
    return resolve(requested ?? (domain === 'rendering' ? DEFAULT_OUT_DIR : DEFAULT_PHYSICS_OUT_DIR));
  }

  return resolve(requested ?? DEFAULT_ALL_OUT_DIR, domain);
};

/** Resolve the suite plan for one domain from the shared `--suite` / `--extreme` flags. */
const resolvePlanFor = (args: Map<string, string>, domain: Domain, exploratory: boolean): RunPlan =>
  resolveSuitePlan({
    suite: parseSuite(args.get('suite')),
    domain,
    extreme: args.has('extreme'),
    exploratory,
    ladders: laddersFor(domain),
  });

/**
 * Every archetype a domain implements, mapped to its own load ladder.
 *
 * This is what a catalog scenario is checked against, and what `full` falls back
 * to for the ExoJS-internal probes the published catalog deliberately omits.
 */
const laddersFor = (domain: Domain): ReadonlyMap<string, readonly number[]> =>
  new Map(
    domain === 'rendering'
      ? ARCHETYPES.map(archetype => [archetype.id as string, archetype.nodeCounts])
      : PHYSICS_ARCHETYPES.map(archetype => [archetype.id as string, archetype.bodyCounts]),
  );

/**
 * Print the resolved plan without measuring anything.
 *
 * States the planned workload - scenarios, loads, cells and sampling budget -
 * and the capability gaps the catalog still has. Deliberately prints no wall
 * clock estimate: how long a cell takes is a property of the machine, and a
 * number invented here would be quoted as if it had been measured.
 */
const printDryRun = (plan: RunPlan, backends: readonly Backend[]): void => {
  const scenarios = new Set(plan.workloads.map(workload => workload.scenarioId));

  console.log(
    `\n=== Plan: ${plan.meta.planId} suite=${plan.meta.suite} rev=${String(plan.meta.planRevision)} hash=${plan.meta.planHash} domain=${plan.meta.domain} ===`,
  );
  console.log(
    `  ${String(scenarios.size)} scenarios, ${String(plan.workloads.length)} scenario/load pairs${plan.meta.extreme ? ' (extreme loads included)' : ''}`,
  );

  if (plan.meta.domain === 'rendering') {
    const cells = resolveMatrixCells({ backends, plan });
    const frames = cells.reduce((total, cell) => total + cell.timedFrames, 0);
    const arms = new Set(cells.map(cell => `${cell.engine} ${cell.config}`));

    console.log(`  ${String(cells.length)} cells over ${String(arms.size)} arms and backends [${backends.join(', ')}]`);
    console.log(
      `  ${String(frames)} timed frames planned, plus ${String(cells.reduce((total, cell) => total + cell.warmupFrames, 0))} discarded warmup frames`,
    );

    for (const backend of backends) {
      console.log(`    ${backend}: ${String(cells.filter(cell => cell.backend === backend).length)} cells`);
    }
  } else {
    const armCount = PHYSICS_LIBRARY_ARMS.length + 1;

    console.log(`  ${String(plan.workloads.length * armCount)} cells at most, over ${String(armCount)} arms (exojs plus ${PHYSICS_LIBRARY_ARMS.join(', ')})`);
    console.log('  Arm availability is decided by the measuring browser, so the built matrix may be smaller; a missing arm is recorded, never dropped.');
  }

  for (const workload of plan.workloads) {
    console.log(
      `    ${workload.scenarioId.padEnd(22)} ${workload.loadId.padStart(5)} = ${String(workload.value).padStart(9)} ${workload.unit}${workload.primary ? '  [headline]' : ''}${workload.extreme ? '  [extreme]' : ''}`,
    );
  }

  if (plan.missingScenarios.length > 0) {
    console.warn(`\n  CAPABILITY GAP — catalog scenarios with no archetype behind them: ${plan.missingScenarios.join(', ')}`);
  }
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
  browser: RenderingBrowser,
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
              browser,
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
const runRenderingDomain = async (args: Map<string, string>, selector: DomainSelector): Promise<void> => {
  const backendArg = args.get('backend');
  const archetypeArg = args.get('archetype');
  const nodesArg = args.get('nodes');
  const framesArg = args.get('frames');
  const engineArg = args.get('engine');
  const outDir = outDirFor(args, 'rendering', selector);

  // `--browser` selects the engine the run is measured in and is stamped into
  // every provenance block, so a WebKit number can never be read as a Chromium
  // one. `--platform` states the operating system's major version and whether
  // that build is a beta, neither of which is observable at runtime on every
  // platform; a preview BROWSER build is detected from its own version string
  // and needs no flag.
  const browser = parseRenderingBrowser(args.get('browser'));
  const platform = resolvePlatform(args);

  const backends: readonly Backend[] = (parseList('backend', backendArg) as Backend[] | undefined) ?? DEFAULT_BACKENDS;

  // `--archetype`, `--engine`, `--config` and `--nodes` each accept a
  // COMMA-SEPARATED list. A single value behaves exactly as before; a list
  // routes through `MatrixSelection` so one invocation - and therefore ONE
  // browser session per arm - can cover several archetypes/arms at once. Before
  // this, comparing two archetypes meant two process launches, i.e. two
  // sessions, which the same-session rule forbids for a cross-arm claim.
  const archetypes = parseList('archetype', archetypeArg) as ArchetypeId[] | undefined;
  const engines = parseList('engine', engineArg);
  const configs = parseList('config', args.get('config'));
  const nodeCounts = parseList('nodes', nodesArg)?.map(value => {
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
      browser,
    );

    return;
  }

  // A plan resolved WHOLE is a publishable contract however few cells it holds;
  // only a free filter makes the run exploratory. `--backend` is a free filter
  // in that sense too: it publishes one backend's block under a plan that names
  // both.
  const isSubset = backendArg !== undefined || hasSelection || timedFramesOverride !== undefined || args.has('capture');
  const plan = resolvePlanFor(args, 'rendering', isSubset);

  if (args.has('dry-run')) {
    printDryRun(plan, backends);

    return;
  }

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-session rule).');
  }

  requirePlatformVersion(platform, isSubset);

  console.log(
    `Running rendering benchmark: browser=${browser}, backends=[${backends.join(', ')}]${engines ? `, engine=[${engines.join(', ')}]` : ''}${configs ? `, config=[${configs.join(', ')}]` : ''}${archetypes ? `, archetype=[${archetypes.join(', ')}]` : ''}${nodeCounts ? `, nodes=[${nodeCounts.join(', ')}]` : ''}${timedFramesOverride !== undefined ? `, frames=${timedFramesOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Incremental, crash-safe checkpoint: each cell is persisted the instant it
  // lands (see shared/checkpoint.ts), so a later cell crash - the Pixi-WebGPU
  // probe was the observed one - can never discard the cells already measured.
  const checkpoint = createCheckpointWriter<CellResult>(outDir);

  // `--capture=<dir>`: write each measured cell's final frame there, for
  // checking by eye that two arms asked for one scene rendered it. A capture
  // costs a readback per cell, so it belongs to a spot check and never to a
  // reportable run - which is why it also marks the run a subset.
  const captureDir = args.get('capture');

  const data = await runMatrix({
    backends,
    browser,
    plan,
    ...(captureDir !== undefined && { captureDir: resolve(captureDir) }),
    ...(platform !== undefined && { platform }),
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
      `  backend=${entry.backend} browser=${entry.browser}/${entry.browserVersion} os=${entry.os} platformVersion=${String(entry.platformVersion.major)} (${entry.platformVersion.source}) prerelease=${String(entry.prerelease.value)} (${entry.prerelease.source}) adapter="${entry.adapter}" software=${String(entry.software)} headless=${String(entry.headless)} flags=[${entry.flags.join(' ')}] engine=${entry.engineVersion}`,
    );
  }

  if (data.provenance.some(entry => entry.prerelease.value)) {
    console.warn('\nPRE-RELEASE PLATFORM — this profile does not describe a shipping platform. The stamp records how that was established.');
  }

  if (data.provenance.some(entry => entry.software)) {
    console.warn('\n!!! SOFTWARE RASTERIZER DETECTED — timings are UNTRUSTED. Fix the launch flags before trusting any number. !!!');
  }

  writeReport(data, outDir);

  // Per-cell summary. Grouped by scenario and load so the arms of one row sit
  // under one another: the comparison a reader is after is between arms, and the
  // matrix is emitted arm-major.
  console.log('\n=== Results ===');

  printTextTable(
    [
      { header: 'scenario' },
      { header: 'load', align: 'right' },
      { header: 'backend' },
      { header: 'arm' },
      { header: 'cpu ms', align: 'right' },
      { header: 'cpu p95', align: 'right' },
      { header: 'draws', align: 'right' },
      { header: 'status' },
    ],
    [...data.results]
      .sort(
        (left, right) =>
          left.spec.archetype.localeCompare(right.spec.archetype) ||
          left.spec.nodeCount - right.spec.nodeCount ||
          left.spec.backend.localeCompare(right.spec.backend) ||
          left.spec.engine.localeCompare(right.spec.engine) ||
          left.spec.config.localeCompare(right.spec.config),
      )
      .map(result => [
        result.spec.archetype,
        String(result.spec.nodeCount),
        result.spec.backend,
        `${result.spec.engine} ${result.spec.config}`,
        result.cpuMsMedian.toFixed(3),
        `${result.cpuMsP95.toFixed(3)}${isHitching(result) ? ' hitching' : ''}`,
        String(result.structural.drawCalls),
        result.status,
      ]),
    { groupBy: 0 },
  );

  console.log(`\nReport written to ${outDir} (results.json, results.csv, results.md)`);
};

/**
 * Run the physics benchmark domain end-to-end and write its report artifacts.
 *
 * Physics touches no GPU, but it is measured in a real browser all the same: the
 * matrix runs inside a Playwright-driven harness page, so the numbers describe
 * the runtime ExoJS ships to rather than the Node process that drives the run.
 * The domain module is imported dynamically (only when selected), so a rendering
 * run never loads it and vice versa.
 *
 * Flags mirror the rendering domain: `--browser` selects the engine to measure
 * in, `--archetype` and `--bodies` filter the matrix (the `--bodies` node-sweep
 * analogue), `--frames` overrides the timed-step count for a fast spot-check
 * (never a reportable run).
 */
const runPhysicsDomain = async (args: Map<string, string>, selector: DomainSelector): Promise<void> => {
  const archetypeArg = args.get('archetype');
  const bodiesArg = args.get('bodies');
  const framesArg = args.get('frames');
  const engineArg = args.get('engine');
  const outDir = outDirFor(args, 'physics', selector);
  const browser = parseRenderingBrowser(args.get('browser'));
  const platform = resolvePlatform(args);

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
    refuseSplitList('bodies', bodiesArg);

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
  const plan = resolvePlanFor(args, 'physics', isSubset);

  if (args.has('dry-run')) {
    printDryRun(plan, []);

    return;
  }

  const { runPhysicsMatrix, writePhysicsReport } = await import('./physics');

  if (isSubset) {
    console.warn('SUBSET RUN — not a reportable comparison (see the same-run rule).');
  }

  requirePlatformVersion(platform, isSubset);

  console.log(
    `Running physics benchmark: browser=${browser}, ${archetypeArg ? `archetype=${archetypeArg}` : 'all archetypes'}${engineArg ? `, engine=${engineArg}` : ''}${bodiesArg ? `, bodies=${bodiesArg}` : ''}${timedStepsOverride !== undefined ? `, frames=${timedStepsOverride} (OVERRIDE — thin sampling, not reportable)` : ''}`,
  );

  // Incremental, crash-safe checkpoint: each cell is persisted the instant it
  // lands, reusing the same shared writer the rendering domain uses.
  const checkpoint = createCheckpointWriter<PhysicsCellResult>(outDir);

  const data = await runPhysicsMatrix({
    browser,
    plan,
    ...(platform !== undefined && { platform }),
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
    `  browser=${data.provenance.browser}/${data.provenance.browserVersion} cpu="${data.provenance.host.cpu}" (${String(data.provenance.host.cpuCount)} logical) os=${data.provenance.host.os} platformVersion=${String(data.provenance.host.platformVersion.major)} (${data.provenance.host.platformVersion.source}) prerelease=${String(data.provenance.prerelease.value)} (${data.provenance.prerelease.source}) engine=${data.provenance.engineVersion} fixedDelta=${String(data.provenance.fixedDelta)} clock=${(data.provenance.clock.resolutionMs * 1000).toFixed(1)}us (isolated=${String(data.provenance.clock.crossOriginIsolated)})`,
  );

  if (!data.provenance.clock.crossOriginIsolated) {
    console.warn(
      '\nNOT CROSS-ORIGIN ISOLATED — performance.now() is running at the browser Spectre clamp, so the fastest cells are batched far harder than they need to be. Check the harness server headers.',
    );
  }

  writePhysicsReport(data, outDir);

  console.log('\n=== Results ===');

  printTextTable(
    [
      { header: 'scenario' },
      { header: 'bodies', align: 'right' },
      { header: 'arm' },
      { header: 'step ms', align: 'right' },
      { header: 'step p95', align: 'right' },
      { header: 'simulated', align: 'right' },
      { header: 'contacts', align: 'right' },
      { header: 'steps/sample', align: 'right' },
      { header: 'status' },
    ],
    [...data.results]
      .sort(
        (left, right) =>
          left.spec.archetype.localeCompare(right.spec.archetype) ||
          left.spec.bodyCount - right.spec.bodyCount ||
          left.spec.engine.localeCompare(right.spec.engine) ||
          left.spec.config.localeCompare(right.spec.config),
      )
      .map(result => [
        result.spec.archetype,
        String(result.spec.bodyCount),
        `${result.spec.engine} ${result.spec.config}`,
        result.stepMsMedian.toFixed(4),
        result.stepMsP95.toFixed(4),
        String(result.structural.bodyCount),
        String(result.structural.contactCount),
        String(result.stepsPerSample),
        result.status,
      ]),
    { groupBy: 0 },
  );

  // Notes are per cell and long enough that a column would set the table's width
  // from the worst one, so they follow it instead.
  for (const result of data.results.filter(entry => entry.note !== undefined)) {
    console.log(`  note  ${result.spec.engine} ${result.spec.config} ${result.spec.archetype} n=${String(result.spec.bodyCount)}: ${result.note ?? ''}`);
  }

  console.log(`\nReport written to ${outDir} (results.json, results.csv, results.md)`);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const domain = resolveDomain(args.get('domain'));

  // Serial on purpose: the two domains contend for the same CPU (and the
  // rendering one for the GPU), so running them concurrently would measure the
  // contention rather than either domain.
  if (domain === 'rendering' || domain === 'all') {
    await runRenderingDomain(args, domain);
  }

  if (domain === 'physics' || domain === 'all') {
    await runPhysicsDomain(args, domain);
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
