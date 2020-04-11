import Time from '../../core/time/Time';
import ParticleSystem from "../ParticleSystem";

export interface IParticleEmitter {
    apply(system: ParticleSystem, delta: Time): this;
    destroy(): void;
}
