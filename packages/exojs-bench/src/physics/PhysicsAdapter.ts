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
export type PhysicsArchetypeId = 'box-stack' | 'many-dynamic' | 'mixed-static-dynamic' | 'raycast' | 'body-churn' | 'joints';

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
  /** Structural counters sampled after the timed window. */
  readonly structural: PhysicsStructuralCounters;
}

/**
 * Neutral contract a physics engine arm implements so the harness can drive it
 * identically across arms - the CPU-domain counterpart of the rendering
 * {@link '../rendering/EngineAdapter'.EngineAdapter}.
 *
 * The native `@codexo/exojs-physics` arm is the only implementation today; the
 * planned matter.js + rapier adapter arms (a separate follow-on) implement this
 * same interface so a stay-native vs. attach-an-adapter comparison drops in
 * without the driver or archetypes changing.
 */
export interface PhysicsAdapter {
  /** Physics engine arm label, e.g. `'exojs-physics'`. */
  readonly engine: string;
  /** Arm configuration label, e.g. `'native'`. */
  readonly config: string;
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
}
