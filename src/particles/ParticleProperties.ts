import type { Time } from '@/core/Time';
import type { Vector } from '@/math/Vector';
import type { Color } from '@/core/Color';

/**
 * Shared property contract for both {@link Particle} (live instance) and
 * {@link ParticleOptions} (spawn configuration). Every field represents a
 * mutable, per-particle attribute that affectors and the system update each
 * tick.
 */
export interface ParticleProperties {
    /** Total time the particle lives before expiring. */
    totalLifetime: Time;
    /** Time that has passed since the particle was spawned. */
    elapsedLifetime: Time;
    /** Position in the owning {@link ParticleSystem}'s local coordinate space. */
    position: Vector;
    /** Pixels-per-second movement vector applied by the system each tick. */
    velocity: Vector;
    /** Multiplicative scale applied to the particle sprite on both axes. */
    scale: Vector;
    /** Rotation in degrees, normalised to [0, 360) by {@link trimRotation}. */
    rotation: number;
    /** Degrees-per-second angular velocity accumulated by {@link TorqueAffector}. */
    rotationSpeed: number;
    /** Index into the atlas frame list used to choose the particle sprite. */
    textureIndex: number;
    /** RGBA tint blended onto the particle sprite, interpolated by {@link ColorAffector}. */
    tint: Color;
}