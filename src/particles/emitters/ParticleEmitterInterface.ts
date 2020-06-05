import type { Time } from 'core/Time';
import type { ParticleSystem } from 'particles/ParticleSystem';

export interface ParticleEmitterInterface {
    apply(system: ParticleSystem, delta: Time): this;
    destroy(): void;
}
