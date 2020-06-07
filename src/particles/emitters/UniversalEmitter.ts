import type { Time } from 'core/Time';
import { ParticleOptions } from 'particles/emitters/ParticleOptions';
import type { IParticleEmitter } from 'particles/emitters/IParticleEmitter';
import type { ParticleSystem } from 'particles/ParticleSystem';

export class UniversalEmitter implements IParticleEmitter {
    private _emissionRate: number;
    private _particleOptions: ParticleOptions;
    private _emissionDelta = 0;

    public constructor(emissionRate: number, particleOptions?: ParticleOptions) {
        this._emissionRate = emissionRate;
        this._particleOptions = particleOptions ?? new ParticleOptions();
    }

    public get emissionRate(): number {
        return this._emissionRate;
    }

    public set emissionRate(particlesPerSecond: number) {
        this._emissionRate = particlesPerSecond;
    }

    public get particleOptions(): ParticleOptions {
        return this._particleOptions;
    }

    public set particleOptions(particleOptions: ParticleOptions) {
        this._particleOptions = particleOptions;
    }

    public computeParticleCount(time: Time): number {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta;
        const particles = particleAmount | 0;

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    public apply(system: ParticleSystem, delta: Time): this {
        const count = this.computeParticleCount(delta);
        const options = this._particleOptions;

        for (let i = 0; i < count; i++) {
            const particle = system.requestParticle();

            particle.applyOptions(options);
            system.emitParticle(particle);
        }

        return this;
    }

    public destroy(): void {
        this._particleOptions.destroy();
    }
}
