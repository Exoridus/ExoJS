import { Time } from 'core/Time';
import { ParticleSystem } from 'particles/ParticleSystem';

export interface ParticleEmitterInterface {
    apply(system: ParticleSystem, delta: Time): this;
    destroy(): void;
}
