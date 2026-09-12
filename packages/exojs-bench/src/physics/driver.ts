import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser } from 'playwright';
import { chromium, webkit } from 'playwright';

import type { BaseProvenance, HostInfo, LibraryProvenance, PlatformDeclaration, PrereleaseStamp, RenderingBrowser } from '../shared/provenance';
import {
  classifyPrerelease,
  declaredPrereleaseOf,
  DEFAULT_RENDERING_BROWSER,
  readHostInfo,
  readLibraryProvenance,
  readPlatformVersion,
} from '../shared/provenance';
import type { ViteDevServer } from '../shared/viteServer';
import { PHYSICS_LIBRARY_ARMS, startViteServer as startPageServer } from '../shared/viteServer';
import type { RunPlan } from '../suite/plan';
import { buildPhysicsMatrix, STEP_DELTA } from './archetypes';
import type { PhysicsArmReport, PhysicsClockReport } from './page/contract';
import type { PhysicsCellResult, PhysicsCellSpec } from './PhysicsAdapter';

/** npm package name of the native physics arm, resolved for version provenance. */
const NATIVE_PHYSICS_PACKAGE = '@codexo/exojs-physics';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = resolve(HERE, 'page');

/**
 * Per-arm methodology disclosure, keyed by the arm's `engine` label. Each arm is
 * measured at its OWN engine defaults for solver iterations, contact model and
 * sleeping - those differences are the legitimate quantity the native-vs-adapter
 * comparison surfaces, so they are stated per arm rather than silently smoothed
 * over. Only the disclosures for arms actually present in a run are
 * stamped into that run's provenance caveats.
 *
 * Each disclosure opens with the arm's ROLE, because the arms are not one flat
 * field of competitors: matter.js, planck.js and nape-js are the JavaScript
 * peers, the libraries an ExoJS app would realistically attach instead of the
 * native runtime, and they are what `exojs-physics` is compared against. rapier
 * is a Rust engine compiled to WASM and stands as the REFERENCE CEILING - the
 * ambient cost of leaving JavaScript - not as a peer a JS solver is expected to
 * match.
 */
const ARM_DISCLOSURES: Readonly<Record<string, string>> = {
  'exojs-physics':
    'exojs-physics arm (native runtime, pure JS): TGS-Soft solver, 4 sub-steps per fixed step, sleeping ON by default (resting bodies deactivate). Contact count = solid contacts in the world contact graph.',
  'matter-js':
    "matter-js arm (pure-JS peer): constraint solver at matter defaults (6 position / 4 velocity / 2 constraint iterations), sleeping OFF by default (a settled stack keeps paying full solve cost); matter's default per-step air drag (frictionAir) is zeroed so all arms integrate the same pure-gravity field; gravity (px/s^2) and perturbation velocity (px/s) are mapped into matter's px-per-step unit model. Contact count = active colliding pairs (engine.pairs.collisionActive), a pair-level proxy, not identical in semantics to the exojs solid-contact count.",
  planck:
    "planck arm (pure-JS peer): Box2D port at planck defaults (8 velocity / 3 position iterations per step), sleeping ON by default; Settings.lengthUnitsPerMeter is set to 30 so planck's absolute MKS tolerances are interpreted at the scene's pixel scale, which is the knob planck gives a pixel-coordinate game - positions, gravity (px/s^2) and velocity (px/s) then carry over unconverted. Contact count = the world contact list filtered by isTouching(), a touching collider-pair count. Rays are answered from planck's dynamic tree, but World.rayCast is Box2D's non-solid ray (an origin inside a fixture is not a hit). Continuous collision runs for every body (planck's default), where exojs and rapier restrict it to bullets and matter has none.",
  'nape-js':
    'nape-js arm (pure-JS peer): default single-step solver with default velocity/position iterations (10/10), sleeping and dynamic AABB broadphase at library defaults. Materials, body layouts, joints and perturbations come from the shared neutral scene descriptor. Contact count = active collision arbiters; ray queries use Space.rayCast with outer-surface semantics. These counters are engine-specific structural proxies, not a claim that every solver performs identical internal work.',
  rapier:
    'rapier arm (WASM reference ceiling, not a pure-JS peer): TGS-Soft solver at rapier defaults (4 solver / 1 internal PGS iterations), auto-sleeping ON; default lengthUnit=1 is fed a px-scale world (tuned for ~1-unit objects), exactly what attaching rapier with pixel coordinates yields. Contact count = collider pairs with a solid narrow-phase manifold (numContacts > 0), deduped.',
};

/**
 * Node-side wall-clock cap on a single cell, above the heaviest cell this matrix
 * is known to contain.
 *
 * The in-page abort guard bounds a runaway TIMED window, but it cannot bound the
 * warmup, and it only fires between steps - never inside one that does not
 * return. This cap lets the driver abandon a wedged page as `unavailable` and
 * relaunch, so one pathological cell can never hang the whole matrix. The
 * slowest trusted cell measured so far runs a few minutes (a 4000-body settling
 * pile on the slowest pure-JS arm), so the cap sits well above that: it is a
 * hang guard, not a budget.
 */
const CELL_TIMEOUT_MS = 900_000;

/** Sentinel returned when a cell exceeds {@link CELL_TIMEOUT_MS} and the page is presumed wedged. */
const CELL_WEDGED = Symbol('physics-cell-wedged');

/**
 * Provenance stamped onto every physics run. Extends the shared
 * {@link BaseProvenance} (timestamp + engine version) with the browser the
 * matrix was measured in, the CPU host that drove it, and the fixed timestep the
 * step-time medians are measured against.
 *
 * There is no GPU adapter or software-rasterizer bit here - physics is pure CPU
 * work - but the JavaScript engine is now part of the measurement condition: the
 * same matrix produces different numbers under V8 and under JavaScriptCore, so a
 * number is only comparable against another taken in the same browser.
 */
export interface PhysicsProvenance extends BaseProvenance {
  /** Browser engine the step times were measured in. */
  readonly browser: RenderingBrowser;
  /** Browser build the step times were measured in, as the browser reported it. */
  readonly browserVersion: string;
  /** CPU host that drove the browser. */
  readonly host: HostInfo;
  /** Whether the platform is a pre-release build, and what that rests on. */
  readonly prerelease: PrereleaseStamp;
  /** Fixed physics timestep (seconds) each timed `step` advanced. */
  readonly fixedDelta: number;
  /**
   * What the page's clock could resolve, and whether it reached a
   * cross-origin-isolated context.
   *
   * The fastest cells in this matrix step in single-digit microseconds, within
   * an order of magnitude of the browser's `performance.now()` grid, so the
   * resolution is part of what a step-time median means. It is also what the
   * per-cell `stepsPerSample` was derived from.
   */
  readonly clock: PhysicsClockReport;
  /** Disclosed caveats about how these numbers were produced. */
  readonly caveats: readonly string[];
}

/** Full outcome of a physics matrix run: provenance, arm-version provenance, and every cell result. */
export interface PhysicsMatrixOutcome {
  /** The single provenance stamp for the run (one browser session, one host). */
  readonly provenance: PhysicsProvenance;
  /** Version + resolution provenance for each physics engine arm. */
  readonly libraries: readonly LibraryProvenance[];
  /** One result per matrix cell, in completion order. */
  readonly results: readonly PhysicsCellResult[];
}

/** Callback invoked the instant a cell finishes measuring, for incremental checkpointing. */
export type PhysicsCellResultSink = (result: PhysicsCellResult) => void;

/** Keeps only the cells whose defined `filter` fields all match. */
const applyFilter = (cells: readonly PhysicsCellSpec[], filter: Partial<PhysicsCellSpec>): PhysicsCellSpec[] => {
  const entries = Object.entries(filter).filter(([, value]) => value !== undefined);

  return cells.filter(cell => entries.every(([key, value]) => cell[key as keyof PhysicsCellSpec] === value));
};

/**
 * Keeps only the cells one resolved suite plan selects.
 *
 * A pure filter, unlike the rendering side's re-emitting counterpart: physics
 * seeds fold the body count in (`seedFor`), so a rung outside the archetype's
 * own ladder would be a DIFFERENT world under the same name. The catalog's
 * physics loads are therefore always ladder rungs, and a plan naming one that is
 * not simply selects nothing for that scenario rather than inventing a scene.
 */
const applyPhysicsPlan = (cells: readonly PhysicsCellSpec[], plan: RunPlan): PhysicsCellSpec[] => {
  const selected = new Set(plan.workloads.map(workload => `${workload.scenarioId}/${String(workload.value)}`));

  return cells.filter(cell => selected.has(`${cell.archetype}/${String(cell.bodyCount)}`));
};

/** A cell that could not be measured: zeroed timings/structure, `unavailable` status, and an explanatory note. */
const unavailableCell = (spec: PhysicsCellSpec, note: string): PhysicsCellResult => ({
  spec,
  stepMsMedian: 0,
  stepMsP95: 0,
  stepsPerSample: 0,
  structural: { bodyCount: 0, contactCount: 0, jointCount: 0, rayHits: 0 },
  status: 'unavailable',
  note,
});

/**
 * Thrown when an arm simulated a different scene from the canonical one.
 *
 * It fails the run rather than degrading to a missing cell: the cross-arm
 * comparison the matrix exists to make rests on every arm stepping the identical
 * world, so a divergence invalidates the run rather than one datapoint of it.
 */
export class PhysicsDeterminismError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PhysicsDeterminismError';
  }
}

/** Launch the selected browser engine. Neither engine takes launch flags here - physics touches no GPU. */
const launchBrowser = async (browser: RenderingBrowser): Promise<Browser> => (browser === 'webkit' ? webkit.launch() : chromium.launch());

/** Starts the programmatic Vite dev server rooted at the physics harness page. */
export const startViteServer = async (version: string): Promise<ViteDevServer> =>
  startPageServer({ pageDir: PAGE_DIR, version, libraryArms: PHYSICS_LIBRARY_ARMS });

/**
 * Run one cell in the page, degrading a thrown cell to an `unavailable` result
 * instead of letting it reject - except a determinism divergence, which the page
 * reports as its own outcome kind and which fails the run.
 */
const runCellInPage = async (page: import('playwright').Page, spec: PhysicsCellSpec, resolutionMs: number | null): Promise<PhysicsCellResult> => {
  let outcome;

  try {
    outcome = await page.evaluate(([cell, resolution]) => globalThis.__runPhysicsCell!(cell, resolution), [spec, resolutionMs] as const);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return unavailableCell(spec, `cell errored (isolated; run continued): ${message}`);
  }

  if (outcome.kind === 'divergence') {
    throw new PhysicsDeterminismError(outcome.message);
  }

  return outcome.kind === 'unavailable' ? unavailableCell(spec, outcome.reason) : outcome.result;
};

/**
 * Run one cell, resolving to {@link CELL_WEDGED} if it does not finish within
 * {@link CELL_TIMEOUT_MS}. The still-pending evaluate is left to reject when the
 * browser closes; its rejection is swallowed so it never surfaces as an
 * unhandled rejection.
 */
const runCellOrWedge = async (
  page: import('playwright').Page,
  spec: PhysicsCellSpec,
  resolutionMs: number | null,
): Promise<PhysicsCellResult | typeof CELL_WEDGED> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof CELL_WEDGED>(resolvePromise => {
    timer = setTimeout(() => resolvePromise(CELL_WEDGED), CELL_TIMEOUT_MS);
  });

  const run = runCellInPage(page, spec, resolutionMs).then(result => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    return result;
  });

  run.catch(() => {
    /* intentionally ignored */
  });

  return Promise.race([run, timeout]);
};

/** A page ready to drive cells, plus what it reported about itself. */
interface HarnessSession {
  readonly browser: Browser;
  readonly page: import('playwright').Page;
  readonly arms: readonly PhysicsArmReport[];
  readonly clock: PhysicsClockReport;
  readonly version: string;
}

/** Open the harness page and read the arms it could build plus the clock it can time with. */
const openSession = async (baseUrl: string, browserName: RenderingBrowser): Promise<HarnessSession> => {
  const browser = await launchBrowser(browserName);
  const page = await browser.newPage();

  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof globalThis.__runPhysicsCell === 'function');

  const clock = await page.evaluate(() => globalThis.__physicsClock!());
  const arms = await page.evaluate(() => globalThis.__physicsArms!());

  return { browser, page, arms, clock, version: browser.version() };
};

/**
 * Run the whole physics matrix end-to-end in one browser page.
 *
 * Physics is pure CPU work with no GPU API involved, but nobody runs it in Node:
 * the heap limits, the garbage collector and - for the WASM arm - the module
 * compilation strategy are the browser's, and the JIT is whichever the selected
 * engine ships. The matrix is therefore driven through Playwright exactly as the
 * rendering matrix is, and the browser it ran in is stamped into its provenance.
 *
 * Every cell of every arm runs in the SAME page back to back (same-run
 * discipline: JIT warmth and allocator state are shared and comparable). A cell
 * that wedges the page is abandoned as `unavailable` and the page relaunched for
 * the remainder, which breaks that discipline - so the run discloses it in the
 * caveats rather than presenting the remaining cells as if nothing happened.
 */
export const runPhysicsMatrix = async (
  options: {
    /** Browser engine to measure in. Defaults to the shared harness default. */
    browser?: RenderingBrowser;
    /**
     * The runner's statement about the operating system: its major version and
     * whether that build is a pre-release one. Neither is readable at runtime on
     * every platform, and both are part of a published profile's file name.
     */
    platform?: PlatformDeclaration;
    /** Resolved suite plan restricting the matrix to the loads it selects, applied before `filter`. */
    plan?: RunPlan;
    filter?: Partial<PhysicsCellSpec>;
    /** Forces every selected cell's timed-step count to this value (smoke/spot-check knob; never a reportable run). */
    timedStepsOverride?: number;
    onCellResult?: PhysicsCellResultSink;
  } = {},
): Promise<PhysicsMatrixOutcome> => {
  const browserName = options.browser ?? DEFAULT_RENDERING_BROWSER;
  const engineVersionSource = readLibraryProvenance([NATIVE_PHYSICS_PACKAGE]);
  const server = await startViteServer(engineVersionSource[0]?.version ?? '0.0.0');
  const baseUrl = server.resolvedUrls?.local[0];

  if (baseUrl === undefined) {
    await server.close();
    throw new Error('The physics harness server started without a local URL to drive.');
  }

  const onCellResult: PhysicsCellResultSink = options.onCellResult ?? ((): void => undefined);
  const results: PhysicsCellResult[] = [];
  const timestamp = new Date().toISOString();

  let session = await openSession(baseUrl, browserName);
  let relaunched = false;

  try {
    const { arms, clock } = session;
    const available = new Set(arms.filter(arm => arm.available).map(arm => `${arm.engine}/${arm.config}`));
    const reasons = new Map(arms.map(arm => [`${arm.engine}/${arm.config}`, arm.reason]));

    const allCells = buildPhysicsMatrix(arms);
    const planned = options.plan ? applyPhysicsPlan(allCells, options.plan) : allCells;
    const filtered = options.filter ? applyFilter(planned, options.filter) : planned;
    const cells = options.timedStepsOverride === undefined ? filtered : filtered.map(cell => ({ ...cell, timedSteps: options.timedStepsOverride! }));

    if (cells.length === 0) {
      throw new Error('The physics matrix is empty: no arm/archetype/body-count matched the requested filter.');
    }

    let remaining = cells;

    while (remaining.length > 0) {
      const cell = remaining[0]!;
      const key = `${cell.engine}/${cell.config}`;

      if (!available.has(key)) {
        const result = unavailableCell(cell, reasons.get(key) ?? `no physics arm is registered for ${key}`);

        results.push(result);
        onCellResult(result);
        remaining = remaining.slice(1);
        continue;
      }

      const outcome = await runCellOrWedge(session.page, cell, clock.resolutionMs);

      if (outcome === CELL_WEDGED) {
        const result = unavailableCell(
          cell,
          `cell wedged the browser (no result after ${String(CELL_TIMEOUT_MS)}ms); isolated as unavailable, page relaunched for the remaining cells`,
        );

        results.push(result);
        onCellResult(result);
        remaining = remaining.slice(1);
        relaunched = true;

        await session.browser.close();
        session = await openSession(baseUrl, browserName);
        continue;
      }

      results.push(outcome);
      onCellResult(outcome);
      remaining = remaining.slice(1);
    }

    // Disclosures and arm versions only for the arms this browser could build,
    // in matrix order: a run never claims a version for an arm it did not run.
    const measuredArms = arms.filter(arm => arm.available);
    const libraries = readLibraryProvenance([NATIVE_PHYSICS_PACKAGE, ...measuredArms.map(arm => arm.library).filter(name => name !== NATIVE_PHYSICS_PACKAGE)]);
    const armCaveats = [...new Set(measuredArms.map(arm => arm.engine))]
      .map(engine => ARM_DISCLOSURES[engine])
      .filter((caveat): caveat is string => caveat !== undefined);
    const unavailableArms = arms.filter(arm => !arm.available);

    const provenance: PhysicsProvenance = {
      timestamp,
      engineVersion: libraries.find(library => library.name === NATIVE_PHYSICS_PACKAGE)?.version ?? libraries[0]?.version ?? 'unknown',
      browser: browserName,
      browserVersion: session.version,
      host: readHostInfo(readPlatformVersion(options.platform)),
      prerelease: classifyPrerelease({ browserVersion: session.version, declared: declaredPrereleaseOf(options.platform) }),
      fixedDelta: STEP_DELTA,
      clock,
      caveats: [
        `Step time is CPU wall-clock per step() over the timed window (median/p95), measured in one ${browserName} page (same-run discipline). No number here was taken in Node.`,
        clock.resolutionMs === null
          ? `The page's performance.now() step could not be observed (cross-origin isolated: ${String(clock.crossOriginIsolated)}), so no cell was batched against a grid and no comparison here publishes a factor. An unobserved clock is the absence of the reading, not a fine one.`
          : `The page's performance.now() resolves to ${(clock.resolutionMs * 1000).toFixed(1)}us (cross-origin isolated: ${String(clock.crossOriginIsolated)}). A cell whose step is too fast to time individually at that resolution batches steps per timing sample and records the batch as stepsPerSample; median and p95 are then per-step averages over that batch.`,
        'Scenes are warmed to steady state before timing; the per-cell warmupSteps/timedSteps counts are recorded for honesty.',
        'All arms build the byte-identical scene (bodies, positions, shapes, sizes, static/dynamic split, gravity, perturbed-body set) from the shared deterministic RNG, and the perturbed-body selection is asserted equal across arms before each cell is timed.',
        'Each arm runs at its own engine defaults for solver iterations, contact model and sleeping - those engine differences are the measured quantity in a native-vs-adapter comparison, disclosed per arm below.',
        'Arm roles: matter-js, planck and nape-js are the JAVASCRIPT PEERS exojs-physics is compared against; rapier is a Rust/WASM engine and stands as the REFERENCE CEILING for what leaving JavaScript buys, not as a peer a JS solver is expected to match.',
        ...(unavailableArms.length > 0
          ? [
              `Arms this browser could not run, recorded as unavailable cells rather than omitted: ${unavailableArms.map(arm => `${arm.engine} (${arm.reason})`).join('; ')}`,
            ]
          : []),
        ...(relaunched
          ? [
              'A cell wedged the page and the browser was relaunched mid-run, so the cells after it did not share the JIT and allocator state of the cells before it.',
            ]
          : []),
        ...armCaveats,
      ],
    };

    return { provenance, libraries, results };
  } finally {
    await session.browser.close();
    await server.close();
  }
};
