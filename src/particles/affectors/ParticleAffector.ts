import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export interface ParticleAffector {
    apply(particle: Particle, delta: Time): this;
    destroy(): void;
}
