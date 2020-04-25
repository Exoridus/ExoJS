import { Particle } from 'particles/Particle';
import { Time } from 'core/Time';

export interface ParticleAffectorInterface {
    apply(particle: Particle, delta: Time): this;
    destroy(): void;
}
