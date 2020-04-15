import { Particle } from '../Particle';
import { Time } from '../../core/Time';

export interface IParticleAffector {
    apply(particle: Particle, delta: Time): this;
    destroy(): void;
}
