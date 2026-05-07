import type { Particle } from '@/particles/Particle';
import type { Time } from '@/core/Time';

/**
 * Contract for all per-particle mutators that run once per tick. Each
 * affector is registered on a {@link ParticleSystem} and called after
 * position integration for every live particle. Concrete implementations
 * (e.g. {@link ColorAffector}, {@link ForceAffector}, {@link ScaleAffector},
 * {@link TorqueAffector}) mutate one or more {@link ParticleProperties} fields
 * in place.
 */
export interface ParticleAffector {
    /**
     * Mutates `particle` properties for the current `delta` timestep.
     * Called by {@link ParticleSystem.update} for every non-expired particle.
     */
    apply(particle: Particle, delta: Time): this;
    /** Releases any resources owned by this affector. */
    destroy(): void;
}
