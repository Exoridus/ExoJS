import type { BaseCellResult } from '../shared/result';

/**
 * Identifier for one of the fixed set of physics scene archetypes.
 *
 * Kept deliberately small (review-note "don't overdo the physics implementation"):
 * a settling box stack, a field of bouncing dynamic bodies, and a mixed
 * static-geometry + dynamic-bodies scene. These cover the three cost regimes an
 * ExoJS user cares about when deciding stay-native vs. attach an adapter —
 * resting-contact solving, wide broad-phase + many active contacts, and a mix.
 */
export type PhysicsArchetypeId = 'box-stack' | 'many-dynamic' | 'mixed-static-dynamic';

/** Structural definition of a physics archetype, independent of any physics engine arm. */
export interface PhysicsArchetypeSpec {
  /** Archetype identifier. */
  readonly id: PhysicsArchetypeId;
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

/** Structural counters gathered for a single physics cell — the CPU-domain analogue of draw calls. */
export interface PhysicsStructuralCounters {
  /** Live body count in the world (static + dynamic). */
  readonly bodyCount: number;
  /** Touching solid contacts resolved on the last step (broad×narrow-phase load proxy). */
  readonly contactCount: number;
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
 * identically across arms — the CPU-domain counterpart of the rendering
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
