import { mutationSignature, selectMutationIndices } from '../shared/mutation';
import type { BaseProvenance, HostInfo, LibraryProvenance } from '../shared/provenance';
import { readHostInfo, readLibraryProvenance } from '../shared/provenance';
import { createCpuTimer, median, percentile, shouldAbort } from '../shared/timing';
import { createExoJsPhysicsAdapter } from './adapters/exojs-physics';
import { buildPhysicsMatrix, PHYSICS_ARCHETYPES, seedFor,STEP_DELTA } from './archetypes';
import type { PhysicsAdapter, PhysicsCellResult, PhysicsCellSpec } from './PhysicsAdapter';

/** npm package name of the native physics arm, resolved for version provenance. */
const NATIVE_PHYSICS_PACKAGE = '@codexo/exojs-physics';

/**
 * Per-arm methodology disclosure, keyed by the arm's `engine` label. Each arm is
 * measured at its OWN engine defaults for solver iterations, contact model and
 * sleeping — those differences are the legitimate quantity the native-vs-adapter
 * comparison surfaces, so they are stated per arm rather than silently smoothed
 * (spec §4 fairness). Only the disclosures for arms actually present in a run are
 * stamped into that run's provenance caveats.
 */
const ARM_DISCLOSURES: Readonly<Record<string, string>> = {
  'exojs-physics':
    'exojs-physics arm: TGS-Soft solver, 4 sub-steps per fixed step, sleeping ON by default (resting bodies deactivate). Contact count = solid contacts in the world contact graph.',
  'matter-js':
    "matter-js arm: constraint solver at matter defaults (6 position / 4 velocity / 2 constraint iterations), sleeping OFF by default (a settled stack keeps paying full solve cost); matter's default per-step air drag (frictionAir) is zeroed so all arms integrate the same pure-gravity field; gravity (px/s²) and perturbation velocity (px/s) are mapped into matter's px-per-step unit model. Contact count = active colliding pairs (engine.pairs.collisionActive), a pair-level proxy, not identical in semantics to the exojs solid-contact count.",
  rapier:
    'rapier arm: TGS-Soft solver at rapier defaults (4 solver / 1 internal PGS iterations), auto-sleeping ON; default lengthUnit=1 is fed a px-scale world (tuned for ~1-unit objects), exactly what attaching rapier with pixel coordinates yields. Contact count = collider pairs with a solid narrow-phase manifold (numContacts > 0), deduped.',
};

/**
 * Catastrophic-regression step budget (ms). The physics domain is CPU-bound and
 * fast; a cell whose last-window median blows past this is a runaway (a
 * pathological body count or an accidental O(n²) regression), so it aborts to
 * `exceeded` rather than hanging the run. Deliberately loose — it is a hang
 * guard, not a performance gate.
 */
const STEP_BUDGET_MS = 250;
/** Sliding window (steps) `shouldAbort` medians over, so one GC spike cannot trip the abort. */
const ABORT_WINDOW = 30;

/**
 * Provenance stamped onto every physics run. Extends the shared
 * {@link BaseProvenance} (timestamp + engine version) with the CPU-domain host
 * (Node runtime + CPU) and the fixed timestep the step-time medians are measured
 * against. There is no GPU adapter or software-rasterizer bit here — physics is
 * pure CPU, so the honesty concern is instead the host CPU/Node identity.
 */
export interface PhysicsProvenance extends BaseProvenance {
  /** Node runtime + CPU host the step-time numbers were measured on. */
  readonly host: HostInfo;
  /** Fixed physics timestep (seconds) each timed `step` advanced. */
  readonly fixedDelta: number;
  /** Disclosed caveats about how these numbers were produced. */
  readonly caveats: readonly string[];
}

/** Full outcome of a physics matrix run: provenance, arm-version provenance, and every cell result. */
export interface PhysicsMatrixOutcome {
  /** The single provenance stamp for the run (one Node process, one host). */
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

/** The archetype spec and its ordinal (for the deterministic seed) for a cell. */
const archetypeFor = (id: PhysicsCellSpec['archetype']): { spec: (typeof PHYSICS_ARCHETYPES)[number]; ordinal: number } => {
  const ordinal = PHYSICS_ARCHETYPES.findIndex(archetype => archetype.id === id);

  if (ordinal === -1) {
    throw new Error(`Unknown physics archetype '${id}'.`);
  }

  return { spec: PHYSICS_ARCHETYPES[ordinal]!, ordinal };
};

/**
 * Measure one cell: build the scene, assert its cross-arm determinism, warm it
 * to steady state, then time `timedSteps` `step`s and reduce to median/p95.
 * Aborts to `exceeded` on a sustained runaway (see {@link STEP_BUDGET_MS}).
 */
const runCell = (adapter: PhysicsAdapter, spec: PhysicsCellSpec): PhysicsCellResult => {
  const { spec: archetype, ordinal } = archetypeFor(spec.archetype);
  const seed = seedFor(ordinal, spec.bodyCount);

  adapter.setup(archetype, spec.bodyCount, seed);

  // Cross-arm determinism guard (review B3/B5): the perturbed-body set the arm
  // selected must match the canonical shared selection for this cell. With one
  // arm today this is a self-check; it is what a future matter/rapier arm is
  // asserted against so a divergent RNG path fails loudly instead of silently
  // simulating a different scene. An arm that omits the signature is skipped.
  const armSignature = adapter.mutationSignature?.();

  if (armSignature !== undefined) {
    const canonical = mutationSignature(selectMutationIndices(spec.bodyCount, archetype.perturbFraction, seed));

    if (armSignature !== canonical) {
      adapter.teardown();
      throw new Error(`Determinism divergence for ${spec.engine}/${spec.archetype}/${spec.bodyCount}: arm=${armSignature} canonical=${canonical}.`);
    }
  }

  for (let i = 0; i < spec.warmupSteps; i++) {
    adapter.step(STEP_DELTA);
  }

  const timer = createCpuTimer();
  let exceeded = false;

  for (let i = 0; i < spec.timedSteps; i++) {
    timer.begin();
    adapter.step(STEP_DELTA);
    timer.end();

    if (shouldAbort(timer.samples, STEP_BUDGET_MS, ABORT_WINDOW)) {
      exceeded = true;
      break;
    }
  }

  const structural = adapter.sampleStructural();

  adapter.teardown();

  const samples = timer.samples;
  const stepMsMedian = median(samples);
  const stepMsP95 = percentile(samples, 95);

  return {
    spec,
    stepMsMedian,
    stepMsP95,
    structural,
    status: exceeded ? 'exceeded' : 'ok',
    ...(exceeded && { note: `aborted: last-${ABORT_WINDOW}-step median exceeded ${STEP_BUDGET_MS}ms/step` }),
  };
};

/**
 * Run the whole physics matrix end-to-end in this Node process.
 *
 * Unlike the rendering domain there is no browser and no GPU: physics is pure
 * CPU work, so the harness is a straight loop calling `world.step`. Every cell
 * runs in the SAME process back-to-back (same-run discipline: JIT warmth and
 * allocator state are shared and comparable), and `onCellResult` fires after
 * each cell so the caller can checkpoint it immediately.
 */
export const runPhysicsMatrix = (options: {
  adapters?: readonly PhysicsAdapter[];
  /**
   * npm package names whose installed versions are recorded in the report header
   * (one per arm). Defaults to the native physics package alone; the CLI passes
   * the competitor package names for whichever adapter arms actually resolved, so
   * a run never claims a version for an arm it did not include.
   */
  libraries?: readonly string[];
  filter?: Partial<PhysicsCellSpec>;
  /** Forces every selected cell's timed-step count to this value (smoke/spot-check knob; never a reportable run). */
  timedStepsOverride?: number;
  onCellResult?: PhysicsCellResultSink;
} = {}): PhysicsMatrixOutcome => {
  const adapters = options.adapters ?? [createExoJsPhysicsAdapter()];
  const libraries = readLibraryProvenance(options.libraries ?? [NATIVE_PHYSICS_PACKAGE]);
  const engineVersion = libraries.find(library => library.name === NATIVE_PHYSICS_PACKAGE)?.version ?? libraries[0]?.version ?? 'unknown';

  const allCells = buildPhysicsMatrix(adapters);
  const filtered = options.filter ? applyFilter(allCells, options.filter) : allCells;
  const cells =
    options.timedStepsOverride === undefined ? filtered : filtered.map(cell => ({ ...cell, timedSteps: options.timedStepsOverride! }));

  if (cells.length === 0) {
    throw new Error('The physics matrix is empty: no arm/archetype/body-count matched the requested filter.');
  }

  const adaptersByEngine = new Map(adapters.map(adapter => [`${adapter.engine}/${adapter.config}`, adapter]));
  const onCellResult: PhysicsCellResultSink = options.onCellResult ?? ((): void => undefined);
  const results: PhysicsCellResult[] = [];

  for (const cell of cells) {
    const adapter = adaptersByEngine.get(`${cell.engine}/${cell.config}`);

    if (adapter === undefined) {
      throw new Error(`No physics adapter registered for ${cell.engine}/${cell.config}.`);
    }

    const result = runCell(adapter, cell);

    results.push(result);
    onCellResult(result);
  }

  // Disclosures only for the arms actually present, in matrix order, de-duplicated.
  const armEngines = [...new Set(adapters.map(adapter => adapter.engine))];
  const armCaveats = armEngines.map(engine => ARM_DISCLOSURES[engine]).filter((caveat): caveat is string => caveat !== undefined);

  const provenance: PhysicsProvenance = {
    timestamp: new Date().toISOString(),
    engineVersion,
    host: readHostInfo(),
    fixedDelta: STEP_DELTA,
    caveats: [
      'Step time is CPU wall-clock per step() over the timed window (median/p95), measured in one Node process (same-run discipline).',
      'Scenes are warmed to steady state before timing; the per-cell warmupSteps/timedSteps counts are recorded for honesty.',
      'All arms build the byte-identical scene (bodies, positions, shapes, sizes, static/dynamic split, gravity, perturbed-body set) from the shared deterministic RNG, and the perturbed-body selection is asserted equal across arms before each cell is timed.',
      'Each arm runs at its own engine defaults for solver iterations, contact model and sleeping — those engine differences are the measured quantity in a native-vs-adapter comparison, disclosed per arm below.',
      ...armCaveats,
    ],
  };

  return { provenance, libraries, results };
};
