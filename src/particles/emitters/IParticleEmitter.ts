import { Time } from '../../core/Time';
import { ParticleSystem } from '../ParticleSystem';

export interface IParticleEmitter {
    apply(system: ParticleSystem, delta: Time): this;
    destroy(): void;
}
