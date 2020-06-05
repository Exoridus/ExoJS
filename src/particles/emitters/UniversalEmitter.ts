import type { Time } from 'core/Time';
import { ParticleOptions } from 'particles/emitters/ParticleOptions';
import type { ParticleEmitterInterface } from "particles/emitters/ParticleEmitterInterface";
import type { ParticleSystem } from 'particles/ParticleSystem';

export class UniversalEmitter implements ParticleEmitterInterface {
    private _emissionRate: number;
    private _particleOptions: ParticleOptions;
    private _emissionDelta = 0;

    constructor(emissionRate: number, particleOptions?: ParticleOptions) {
        this._emissionRate = emissionRate;
        this._particleOptions = particleOptions ?? new ParticleOptions();
    }

    get emissionRate(): number {
        return this._emissionRate;
    }

    set emissionRate(particlesPerSecond: number) {
        this._emissionRate = particlesPerSecond;
    }

    get particleOptions(): ParticleOptions {
        return this._particleOptions;
    }

    set particleOptions(particleOptions: ParticleOptions) {
        this._particleOptions = particleOptions;
    }

    computeParticleCount(time: Time): number {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta;
        const particles = particleAmount | 0;

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    apply(system: ParticleSystem, delta: Time): this {
        const count = this.computeParticleCount(delta);
        const options = this._particleOptions;

        for (let i = 0; i < count; i++) {
            const particle = system.requestParticle();

            particle.applyOptions(options);
            system.emitParticle(particle);
        }

        return this;
    }

    destroy(): void {
        this._particleOptions.destroy();
    }
}
