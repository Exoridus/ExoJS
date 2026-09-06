import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import { median, percentile, shouldAbort } from '../../shared/timing';
import { PHYSICS_ARCHETYPES, seedFor, STEP_DELTA } from '../archetypes';
import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsCellSpec } from '../PhysicsAdapter';
import type { PhysicsArmReport, PhysicsCellOutcome, PhysicsClockReport } from './contract';

/**
 * In-page physics matrix harness.
 *
 * This is where a physics cell is actually measured: the driver launches a
 * browser at this page and calls `__runPhysicsCell` once per cell, so every
 * number describes the runtime ExoJS ships to rather than the Node process that
 * happens to drive the run. The arms, the scenes, the seeds and the step budgets
 * are the same ones the domain has always used; only the runtime they execute in
 * changed.
 */

/**
 * Catastrophic-regression step budget (ms). The physics domain is CPU-bound and
 * fast; a cell whose last-window median blows past this is a runaway (a
 * pathological body count or an accidental O(n^2) regression), so it aborts to
 * `exceeded` rather than hanging the page. Deliberately loose - it is a hang
 * guard, not a performance gate.
 */
const STEP_BUDGET_MS = 250;

/** Sliding window (timing samples) `shouldAbort` medians over, so one GC spike cannot trip the abort. */
const ABORT_WINDOW = 30;

/**
 * Warmup steps timed as one block to estimate the cell's per-step cost.
 *
 * They are the LAST warmup steps rather than extra ones: the estimate must not
 * advance the world past where the timed window has always started, or the
 * measured steady state would no longer be the one the Node harness measured.
 */
const CALIBRATION_STEPS = 60;

/**
 * Clock ticks one timing sample must span, which caps quantisation error at
 * roughly `1 / TICKS_PER_SAMPLE` of the reported value.
 *
 * `performance.now()` resolves to 5 microseconds in a cross-origin-isolated
 * Chromium page and 20 in WebKit, while the fastest cells in this matrix step in
 * single-digit microseconds. Timing such a step on its own would report the
 * clock's grid rather than the engine, so a sample covers as many steps as it
 * takes to clear the grid by this factor.
 */
const TICKS_PER_SAMPLE = 20;

/**
 * Timing samples a cell must retain, which caps how many steps one sample may
 * cover.
 *
 * The timed-step budget is fixed per cell, so batching trades sample count for
 * per-sample resolution. A median and a p95 need a distribution behind them, so
 * the batch stops growing here even when the clock would justify a larger one;
 * a cell that hits the cap says so in its note instead of silently reporting a
 * coarser number than it appears to.
 */
const MIN_TIMED_SAMPLES = 12;

/** Iterations of the resolution probe: enough distinct deltas to find the clock's grid without stalling page load. */
const CLOCK_PROBE_ITERATIONS = 200_000;

/**
 * Every physics engine arm the matrix knows, in the order the report lists them.
 *
 * Each arm's ADAPTER MODULE is imported dynamically rather than at the top of
 * this file, because the adapter is where the competitor library's bare
 * specifier lives. A specifier the dev server cannot resolve - the state of a
 * checkout that never ran `bench:setup` - fails that module, and a static import
 * would take the whole harness page down with it, leaving no page to report from.
 * Loading each adapter on demand turns that into one rejected arm carrying the
 * loader's own message.
 */
const ARM_FACTORIES: ReadonlyArray<{
  readonly engine: string;
  readonly config: string;
  readonly library: string;
  readonly create: () => Promise<PhysicsAdapter>;
}> = [
  {
    engine: 'exojs-physics',
    config: 'native',
    library: '@codexo/exojs-physics',
    create: async (): Promise<PhysicsAdapter> => {
      const module = await import('../adapters/exojs-physics');

      return module.createExoJsPhysicsAdapter();
    },
  },
  {
    engine: 'matter-js',
    config: 'default',
    library: 'matter-js',
    create: async (): Promise<PhysicsAdapter> => {
      const module = await import('../adapters/matter-js');

      return module.createMatterJsAdapter();
    },
  },
  {
    engine: 'planck',
    config: 'default',
    library: 'planck',
    create: async (): Promise<PhysicsAdapter> => {
      const module = await import('../adapters/planck');

      return module.createPlanckAdapter();
    },
  },
  {
    engine: 'rapier',
    config: 'default',
    library: '@dimforge/rapier2d-compat',
    create: async (): Promise<PhysicsAdapter> => {
      const module = await import('../adapters/rapier');

      return module.createRapierAdapter();
    },
  },
];

/** One arm's resolution outcome, cached so a matrix of cells constructs each arm once. */
interface ResolvedArm {
  readonly report: PhysicsArmReport;
  readonly adapter: PhysicsAdapter | null;
}

let resolvedArms: Map<string, ResolvedArm> | null = null;

/** Key an arm by the two labels a cell spec carries. */
const armKey = (engine: string, config: string): string => `${engine}/${config}`;

/**
 * Replace the URLs a module-loading failure quotes with the arm they belong to.
 *
 * A dev-server URL spells out the absolute path of the checkout that measured
 * the run, and this reason is stamped into a published profile's caveats. The
 * cause a reader needs is which arm failed and how, not where the machine kept
 * its files.
 */
const sanitizeReason = (message: string, library: string): string => message.replaceAll(/https?:\/\/\S+/g, `<${library} adapter module>`);

/**
 * Construct every arm once, recording why any of them could not be built.
 *
 * An arm that throws is kept in the list as unavailable rather than dropped: a
 * matrix that silently omits an arm reads as an arm that was never meant to run,
 * which is exactly the ambiguity a second browser introduces.
 */
const resolveArms = async (): Promise<Map<string, ResolvedArm>> => {
  if (resolvedArms !== null) {
    return resolvedArms;
  }

  const arms = new Map<string, ResolvedArm>();

  for (const factory of ARM_FACTORIES) {
    const key = armKey(factory.engine, factory.config);

    try {
      const adapter = await factory.create();

      if (adapter.engine !== factory.engine || adapter.config !== factory.config) {
        throw new Error(`the arm identifies itself as ${armKey(adapter.engine, adapter.config)}, but the matrix knows it as ${key}`);
      }

      arms.set(key, { adapter, report: { engine: factory.engine, config: factory.config, library: factory.library, available: true, reason: '' } });
    } catch (error) {
      const reason = sanitizeReason(error instanceof Error ? error.message : String(error), factory.library);

      arms.set(key, {
        adapter: null,
        report: {
          engine: factory.engine,
          config: factory.config,
          library: factory.library,
          available: false,
          reason: `arm could not be constructed: ${reason}`,
        },
      });
    }
  }

  resolvedArms = arms;

  return arms;
};

/** Report every arm and whether this browser could build it. */
const physicsArms = async (): Promise<PhysicsArmReport[]> => {
  const arms = await resolveArms();

  return [...arms.values()].map(arm => arm.report);
};

/**
 * Measure the clock's grid: the smallest non-zero difference two consecutive
 * `performance.now()` readings produce.
 *
 * Read rather than assumed, because the value depends on the engine and on
 * whether the page reached a cross-origin-isolated context, and it is what the
 * per-cell batch size is derived from.
 */
const physicsClock = (): PhysicsClockReport => {
  let resolutionMs = Number.POSITIVE_INFINITY;
  let previous = performance.now();

  for (let i = 0; i < CLOCK_PROBE_ITERATIONS; i++) {
    const now = performance.now();
    const delta = now - previous;

    if (delta > 0) {
      resolutionMs = Math.min(resolutionMs, delta);
      previous = now;
    }
  }

  return {
    resolutionMs: Number.isFinite(resolutionMs) ? resolutionMs : 0,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  };
};

/** The archetype spec for a cell. */
const archetypeFor = (id: PhysicsCellSpec['archetype']): PhysicsArchetypeSpec => {
  const spec = PHYSICS_ARCHETYPES.find(archetype => archetype.id === id);

  if (spec === undefined) {
    throw new Error(`Unknown physics archetype '${id}'.`);
  }

  return spec;
};

/**
 * Steps one timing sample must cover for the sample to clear the clock's grid,
 * bounded so the cell still reports a distribution.
 */
const resolveStepsPerSample = (estimatedStepMs: number, resolutionMs: number, timedSteps: number): number => {
  const cap = Math.max(1, Math.floor(timedSteps / MIN_TIMED_SAMPLES));

  if (resolutionMs <= 0) {
    return 1;
  }

  if (estimatedStepMs <= 0) {
    return cap;
  }

  return Math.min(cap, Math.max(1, Math.ceil((TICKS_PER_SAMPLE * resolutionMs) / estimatedStepMs)));
};

/**
 * Measure one cell: build the scene, assert its cross-arm determinism, warm it
 * to steady state, then time `timedSteps` `step`s and reduce to median/p95.
 *
 * The timed window covers exactly the cell's `timedSteps`, whether they are
 * timed one at a time or in batches; the batch only decides how finely the
 * window is sampled, never how far the world advances.
 */
const measureCell = (adapter: PhysicsAdapter, spec: PhysicsCellSpec, resolutionMs: number): PhysicsCellOutcome => {
  const archetype = archetypeFor(spec.archetype);
  const seed = seedFor(archetype.scene, spec.bodyCount);

  adapter.setup(archetype, spec.bodyCount, seed);

  // Cross-arm determinism guard: the perturbed-body set the arm selected must
  // match the canonical shared selection for this cell, so a divergent RNG path
  // fails the run loudly instead of silently simulating a different scene. An
  // arm that omits the signature is skipped, leaving its determinism unverified.
  const armSignature = adapter.mutationSignature?.();

  if (armSignature !== undefined) {
    const canonical = mutationSignature(selectMutationIndices(spec.bodyCount, archetype.perturbFraction, seed));

    if (armSignature !== canonical) {
      adapter.teardown();

      return {
        kind: 'divergence',
        message: `Determinism divergence for ${spec.engine}/${spec.archetype}/${String(spec.bodyCount)}: arm=${armSignature} canonical=${canonical}.`,
      };
    }
  }

  const calibrationFrom = Math.max(0, spec.warmupSteps - CALIBRATION_STEPS);
  let calibrationStart = 0;

  for (let i = 0; i < spec.warmupSteps; i++) {
    if (i === calibrationFrom) {
      calibrationStart = performance.now();
    }

    adapter.step(STEP_DELTA);
  }

  const calibrationMs = performance.now() - calibrationStart;
  const calibrationSteps = spec.warmupSteps - calibrationFrom;
  const estimatedStepMs = calibrationSteps > 0 ? calibrationMs / calibrationSteps : 0;
  const stepsPerSample = resolveStepsPerSample(estimatedStepMs, resolutionMs, spec.timedSteps);

  const samples: number[] = [];
  let stepped = 0;
  let exceeded = false;

  while (stepped < spec.timedSteps) {
    const batch = Math.min(stepsPerSample, spec.timedSteps - stepped);
    const startedAt = performance.now();

    for (let i = 0; i < batch; i++) {
      adapter.step(STEP_DELTA);
    }

    samples.push((performance.now() - startedAt) / batch);
    stepped += batch;

    if (shouldAbort(samples, STEP_BUDGET_MS, ABORT_WINDOW)) {
      exceeded = true;
      break;
    }
  }

  const structural = adapter.sampleStructural();

  adapter.teardown();

  // Achieved grid coverage of the shortest sample. Below the target the cell
  // could not batch far enough without dropping under MIN_TIMED_SAMPLES, and the
  // reported median carries that much quantisation - said here rather than left
  // for a reader to infer from the resolution and the median.
  const stepMsMedian = median(samples);
  const achievedTicks = resolutionMs > 0 ? (stepMsMedian * stepsPerSample) / resolutionMs : Number.POSITIVE_INFINITY;
  const coarse = achievedTicks < TICKS_PER_SAMPLE;

  const notes: string[] = [];

  if (exceeded) {
    notes.push(`aborted: last-${String(ABORT_WINDOW)}-sample median exceeded ${String(STEP_BUDGET_MS)}ms/step`);
  }

  if (coarse) {
    notes.push(
      `coarse timing: one sample spans ${achievedTicks.toFixed(1)} clock ticks of ${(resolutionMs * 1000).toFixed(1)}us (target ${String(TICKS_PER_SAMPLE)}), so the median carries about ${(100 / achievedTicks).toFixed(0)}% quantisation`,
    );
  }

  return {
    kind: 'measured',
    result: {
      spec,
      stepMsMedian,
      stepMsP95: percentile(samples, 95),
      stepsPerSample,
      structural,
      status: exceeded ? 'exceeded' : 'ok',
      ...(notes.length > 0 && { note: notes.join('; ') }),
    },
  };
};

/** Drive one matrix cell, or report why its arm could not run it. */
const runPhysicsCell = async (spec: PhysicsCellSpec, resolutionMs: number): Promise<PhysicsCellOutcome> => {
  const arms = await resolveArms();
  const arm = arms.get(armKey(spec.engine, spec.config));

  if (arm === undefined) {
    return { kind: 'unavailable', reason: `no physics arm is registered for ${armKey(spec.engine, spec.config)}` };
  }

  if (arm.adapter === null) {
    return { kind: 'unavailable', reason: arm.report.reason };
  }

  return measureCell(arm.adapter, spec, resolutionMs);
};

declare global {
  var __physicsArms: (() => Promise<PhysicsArmReport[]>) | undefined;
  var __physicsClock: (() => PhysicsClockReport) | undefined;
  var __runPhysicsCell: ((spec: PhysicsCellSpec, resolutionMs: number) => Promise<PhysicsCellOutcome>) | undefined;
}

globalThis.__physicsArms = physicsArms;
globalThis.__physicsClock = physicsClock;
globalThis.__runPhysicsCell = runPhysicsCell;
