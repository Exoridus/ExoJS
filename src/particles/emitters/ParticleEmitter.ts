import type { Time } from '@/core/Time';
import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Contract for all particle spawners attached to a {@link ParticleSystem}.
 * Each emitter is called once per tick via {@link ParticleSystem.update} and
 * is responsible for requesting recycled or new {@link Particle} instances from
 * the system, configuring them, and handing them back via
 * {@link ParticleSystem.emitParticle}. See {@link UniversalEmitter} for the
 * built-in rate-based implementation.
 */
export interface ParticleEmitter {
    /**
     * Spawns zero or more particles into `system` for the current `delta`
     * timestep. Called once per frame by {@link ParticleSystem.update}.
     */
    apply(system: ParticleSystem, delta: Time): this;
    /** Releases any resources owned by this emitter. */
    destroy(): void;
}
