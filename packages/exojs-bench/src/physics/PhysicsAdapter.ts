import type { BaseCellResult } from '../shared/result';

/**
 * Identifier for one of the fixed set of physics scene archetypes.
 *
 * Kept deliberately small (review-note "don't overdo the physics implementation"):
 * a settling box stack, a field of bouncing dynamic bodies, and a mixed
 * static-geometry + dynamic-bodies scene. These cover the three cost regimes an
 * ExoJS user cares about when deciding stay-native vs. attach an adapter -
 * resting-contact solving, wide broad-phase + many active contacts, and a mix.
 */
export type PhysicsArchetypeId = 'box-stack' | 'many-dynamic' | 'mixed-static-dynamic' | 'raycast' | 'body-churn' | 'joints' | 'settling-pile';

/**
 * Body layout an archetype simulates, independent of what its per-step work is.
 *
 * Separating the layout from the archetype id is what lets a new archetype be
 * read as a DELTA against an existing one: `raycast` simulates exactly the
 * `mixed-static-dynamic` scene and additionally casts rays, so the difference
 * between the two rows is query cost and nothing else. An archetype whose id
 * doubled as its scene could only ever be compared against zero.
 */
export type PhysicsSceneShape = 'box-stack' | 'many-dynamic' | 'mixed-static-dynamic' | 'joint-chains';

/** Structural definition of a physics archetype, independent of any physics engine arm. */
export interface PhysicsArchetypeSpec {
  /** Archetype identifier. */
  readonly id: PhysicsArchetypeId;
  /** Body layout this archetype simulates; see {@link PhysicsSceneShape}. */
  readonly scene: PhysicsSceneShape;
  /** Dynamic-body counts swept for this archetype, smallest to largest. */
  readonly bodyCounts: readonly number[];
  /** World gravity in px/s² (+Y down). */
  readonly gravity: { readonly x: number; readonly y: number };
  /**
   * Fraction of dynamic bodies (in 0..1) given a deterministic initial impulse
   * at setup, selected through the shared {@link '../shared/mutation'} RNG so
   * every arm perturbs the identical body set for a fixed seed. `0` for the
   * archetypes that settle purely under gravity.
   */
  readonly perturbFraction: number;
  /**
   * Rays cast per step, or `undefined` for an archetype that runs no queries.
   *
   * Queries exercise the broad-phase acceleration structure rather than the
   * solver, which is a separate cost class: a world can be cheap to step and
   * expensive to query, or the reverse. Ray origins and directions come from the
   * shared closed-form {@link '../shared/mutation'} -free generator in `scene.ts`,
   * so every arm casts the identical rays at the identical step index.
   */
  readonly raysPerStep?: number;
  /**
   * When `true`, the {@link perturbFraction} selection is DESTROYED and rebuilt
   * per step instead of being given an initial impulse.
   *
   * Reusing the perturbed selection for the churned set keeps the cross-arm
   * determinism assertion intact - the arms are asserted to agree on that set
   * before a cell is timed - and makes `body-churn` differ from its base scene in
   * exactly one thing.
   */
  readonly churn?: boolean;
  /**
   * Bodies per constraint chain, meaningful only for the `joint-chains` scene.
   * The scene builds `ceil(bodyCount / jointChainLength)` chains, each hanging
   * from its own static anchor.
   */
  readonly jointChainLength?: number;
  /**
   * Material override applied to every DYNAMIC body a scene builds, replacing
   * that scene's own default friction/restitution.
   *
   * This is what lets an archetype reuse an existing {@link PhysicsSceneShape}
   * (body layout, RNG draws and therefore `seedFor` seed) unchanged while
   * differing from it in exactly one property - how contacts behave rather
   * than where bodies start. `undefined` leaves the scene's own defaults in
   * place.
   */
  readonly dynamicMaterial?: { readonly friction: number; readonly restitution: number };
  /**
   * Per-body-count warmup override, in fixed `1/60 s` steps, keyed by the
   * exact values in {@link bodyCounts}. Replaces the shared `warmupStepsFor`
   * schedule for this archetype's cells only; every other archetype keeps
   * that schedule unchanged.
   *
   * `warmupStepsFor` is sized for a scene that reaches ITS steady state well
   * inside the shared budget - a settled stack, a bouncing field, a resting
   * mix. An archetype whose steady state takes longer needs its own number:
   * a warmup that stops mid-transition times a mix of still-active and
   * already-steady bodies, which is neither cost regime and not a number
   * worth reporting.
   */
  readonly warmupStepsOverride?: Readonly<Record<number, number>>;
}

/** One physics matrix cell: an (engine, config, archetype, body count) combination to measure. */
export interface PhysicsCellSpec {
  /** Physics engine arm label, e.g. `'exojs-physics'`. */
  readonly engine: string;
  /** Arm configuration label, e.g. `'native'`. */
  readonly config: string;
  /** Archetype identifier for this cell. */
  readonly archetype: PhysicsArchetypeId;
  /** Number of dynamic bodies for this cell. */
  readonly bodyCount: number;
  /** Discarded warmup `step`s run before timing starts (lets a stack settle into steady state). */
  readonly warmupSteps: number;
  /** Number of timed `step`s measured for this cell. */
  readonly timedSteps: number;
}

/** Structural counters gathered for a single physics cell - the CPU-domain analogue of draw calls. */
export interface PhysicsStructuralCounters {
  /** Live body count in the world (static + dynamic). */
  readonly bodyCount: number;
  /** Touching solid contacts resolved on the last step (broad×narrow-phase load proxy). */
  readonly contactCount: number;
  /** Live constraints in the world; `0` for an archetype that builds none. */
  readonly jointCount: number;
  /**
   * Rays that hit something on the last step, out of {@link PhysicsArchetypeSpec.raysPerStep}.
   *
   * The counter exists because a query archetype whose rays all miss measures an
   * empty traversal and would look fast for the wrong reason. `0` for an
   * archetype that casts no rays; a query archetype reporting `0` is a defect,
   * not a datapoint.
   */
  readonly rayHits: number;
}

/**
 * Measured outcome for a single physics cell. Extends the domain-agnostic
 * {@link BaseCellResult} (spec/status/note) with the physics-specific per-`step`
 * CPU time (median/p95) and structural counters.
 */
export interface PhysicsCellResult extends BaseCellResult<PhysicsCellSpec> {
  /** Median per-`step` CPU time in milliseconds. */
  readonly stepMsMedian: number;
  /** 95th-percentile per-`step` CPU time in milliseconds. */
  readonly stepMsP95: number;
  /**
   * `step`s one timing sample covered, the sample divided by this to give the
   * per-step times above.
   *
   * `1` means every step was timed on its own, which is what a cell whose step
   * cost comfortably clears the browser clock's grid does. A larger value means
   * the step was too fast to time individually at the available resolution and
   * the harness batched steps per sample instead; the median and p95 are then
   * per-step averages over that batch, so their tail detail is coarser. The
   * timed-step budget is unaffected - the batch only decides how finely the
   * fixed window is sampled.
   */
  readonly stepsPerSample: number;
  /** Structural counters sampled after the timed window. */
  readonly structural: PhysicsStructuralCounters;
}

/**
 * The two labels that name one physics engine arm in the matrix.
 *
 * Separate from {@link PhysicsAdapter} because the matrix is built before any
 * arm is constructed: an arm the measuring browser cannot build still has an
 * identity, and its cells are recorded as unavailable under it.
 */
export interface PhysicsArmIdentity {
  /** Physics engine arm label, e.g. `'exojs-physics'`. */
  readonly engine: string;
  /** Arm configuration label, e.g. `'native'`. */
  readonly config: string;
}

/**
 * Neutral contract a physics engine arm implements so the harness can drive it
 * identically across arms - the CPU-domain counterpart of the rendering
 * {@link '../rendering/EngineAdapter'.EngineAdapter}.
 *
 * Every arm - the native `@codexo/exojs-physics` runtime and the matter.js,
 * planck, nape-js and rapier libraries an app would attach instead - implements this one
 * interface, so the stay-native vs. attach-an-adapter comparison rests on the
 * harness driving all of them through the identical calls. Implementations run
 * in the browser page, not in the driver process.
 */
export interface PhysicsAdapter extends PhysicsArmIdentity {
  /**
   * Build the world and its bodies for the given archetype/body count from the
   * shared deterministic RNG seed, so every arm simulates the identical scene.
   */
  setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void;
  /** Advance the world by one fixed step of `dt` seconds. */
  step(dt: number): void;
  /** Sample the structural counters (called after the timed window). */
  sampleStructural(): PhysicsStructuralCounters;
  /** Release the world and its bodies. */
  teardown(): void;
  /**
   * Order-sensitive signature of the perturbed-body index set the most recent
   * {@link setup} selected (see `shared/mutation.ts::mutationSignature`). The
   * driver compares it against the canonical selection for the cell and fails
   * loudly on divergence, so a future cross-arm comparison rests on an assertion
   * rather than a prose contract. Optional: an arm that omits it is skipped with
   * a warning, leaving its determinism unverified rather than blocking the run.
   */
  mutationSignature?(): string;
  /**
   * Census of how much of the world is still being simulated, for a diagnostic
   * that runs OUTSIDE any timed window.
   *
   * The structural counters say what exists - bodies, constraints, contacts -
   * and not what is stepped, so they cannot separate a world that legitimately
   * went to sleep from one that is present but not simulating. Both report the
   * same bodies and the same joints while one of them costs almost nothing per
   * step.
   *
   * Optional and never read by a measurement: an arm whose library exposes no
   * sleep state omits it, and no number a cell publishes depends on it.
   */
  sampleSleepState?(): PhysicsSleepCensus;
}

/** How many of a world's dynamic bodies are still awake, at the moment of the call. */
export interface PhysicsSleepCensus {
  /** Dynamic bodies in the world. */
  readonly dynamic: number;
  /** Of those, how many the engine still integrates and solves. */
  readonly awake: number;
}
