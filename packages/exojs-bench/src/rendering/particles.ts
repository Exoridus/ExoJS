import { createRng } from '../shared/rng';
import type { ArchetypeSpec } from './EngineAdapter';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './world';

/**
 * The particle scenes' shared definition: how large a particle is, where it
 * starts, how it moves and how long it lives.
 *
 * The two scenes ask different questions and must not be confused. `particles-draw`
 * submits a fixed set of quads through each arm's particle draw path and
 * simulates nothing; `particles-lifecycle` runs a steady effect - ageing,
 * movement, fading and respawning - on top of that same draw path. A figure
 * from one says nothing about the other, which is why they are separate
 * archetypes rather than one with a flag.
 */

/** Edge length of a particle quad, in pixels. Small, so the scenes are submission-bound rather than fill-bound. */
export const PARTICLE_SIZE = 4;

/** Alpha every particle carries, so the scenes exercise a blended draw rather than an opaque one. */
export const PARTICLE_ALPHA = 0.5;

/**
 * Packed `0xAABBGGRR` tint every particle carries: white at
 * {@link PARTICLE_ALPHA}.
 *
 * Stated as the packed word because that is the form the storage takes, and
 * deriving it in each arm is how two arms end up a rounding step apart on the
 * alpha channel.
 */
export const PARTICLE_TINT = ((Math.round(PARTICLE_ALPHA * 255) << 24) | 0x00_ff_ff_ff) >>> 0;

/** Seconds a particle lives in the lifecycle scene. */
export const PARTICLE_LIFETIME = 2;

/** Fixed simulation step, in seconds. The lifecycle scene advances by exactly this much per frame on every arm. */
export const PARTICLE_STEP = 1 / 60;

/**
 * Simulation steps the lifecycle scene runs before it is measured.
 *
 * Exactly one lifetime, so the pool reaches the steady state it is supposed to
 * be measured in: every particle has been through a respawn, and the respawns
 * are spread evenly across the frames instead of arriving as one burst. Run at
 * build time, outside the timed window, like every other arm's scene
 * construction.
 */
export const PARTICLE_PREROLL_STEPS = 120;

/** Seed the particle layout is drawn from. */
const PARTICLE_SEED = 0xc0_ff_ee;

/** One particle's initial state, derived from its index alone. */
export interface ParticleSeedState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  /** Seconds this particle has already lived at preroll time, spread across one lifetime. */
  readonly age: number;
}

/**
 * Deterministic sample stream for particle `index`.
 *
 * Seeded per particle from the shared RNG rather than hashed inline, so an arm
 * can fill its storage in whatever order it wants and still produce the
 * identical scene - and so neighbouring indices decorrelate, which a
 * hand-rolled integer mix does not reliably do: an earlier one here laid
 * consecutive particles along visible lines.
 */
const sampler = (index: number): (() => number) => createRng((PARTICLE_SEED + Math.imul(index, 0x9e_37_79_b1)) >>> 0);

/**
 * The initial state of particle `index` of `total`.
 *
 * Positions fill the viewport and velocities are a modest drift, so the
 * lifecycle scene stays inside the frame for its whole life and no arm spends
 * its time on particles nothing can see. Ages are spread evenly over one
 * lifetime, which is what makes respawns land on different frames rather than
 * all at once.
 */
export const particleSeedAt = (index: number, total: number): ParticleSeedState => {
  const random = sampler(index);
  const angle = random() * Math.PI * 2;
  const speed = 20 + random() * 40;

  return {
    x: random() * (VIEWPORT_WIDTH - PARTICLE_SIZE),
    y: random() * (VIEWPORT_HEIGHT - PARTICLE_SIZE),
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    age: total > 0 ? (index / total) * PARTICLE_LIFETIME : 0,
  };
};

/** Whether the archetype renders particles rather than a sprite scene. */
export const isParticles = (spec: ArchetypeSpec): boolean => spec.particles !== undefined;

/** Whether the archetype simulates its particles rather than only drawing them. */
export const isParticleLifecycle = (spec: ArchetypeSpec): boolean => spec.particles === 'lifecycle';
