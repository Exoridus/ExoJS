import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export interface ParticleAffectorInterface {
    apply(particle: Particle, delta: Time): this;
    destroy(): void;
}
