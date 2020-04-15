import { Time } from '../../core/Time';
import { ParticleOptions } from './ParticleOptions';
import { IParticleEmitter } from "./IParticleEmitter";
import { ParticleSystem } from '../ParticleSystem';

export class UniversalEmitter implements IParticleEmitter {
    private _emissionRate: number;
    private _particleOptions: ParticleOptions;
    private _emissionDelta = 0;

    constructor(emissionRate: number, particleOptions?: ParticleOptions) {
        this._emissionRate = emissionRate;
        this._particleOptions = particleOptions ?? new ParticleOptions();
    }

    get emissionRate() {
        return this._emissionRate;
    }

    set emissionRate(particlesPerSecond) {
        this._emissionRate = particlesPerSecond;
    }

    get particleOptions() {
        return this._particleOptions;
    }

    set particleOptions(particleOptions) {
        this._particleOptions = particleOptions;
    }

    computeParticleCount(time: Time) {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta;
        const particles = particleAmount | 0;

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    apply(system: ParticleSystem, delta: Time) {
        const count = this.computeParticleCount(delta);
        const options = this._particleOptions;

        for (let i = 0; i < count; i++) {
            const particle = system.requestParticle();

            particle.applyOptions(options);
            system.emitParticle(particle);
        }

        return this;
    }

    destroy() {
        this._particleOptions.destroy();
    }
}
