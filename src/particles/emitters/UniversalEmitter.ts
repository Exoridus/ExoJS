import type { Time } from '@/core/Time';
import { ParticleOptions } from '@/particles/emitters/ParticleOptions';
import type { ParticleEmitter } from '@/particles/emitters/ParticleEmitter';
import type { ParticleSystem } from '@/particles/ParticleSystem';

/**
 * Rate-based concrete {@link ParticleEmitter} that spawns a fixed number of
 * particles per second, configured via {@link UniversalEmitter.emissionRate}
 * and {@link UniversalEmitter.particleOptions}. Sub-frame fractions are
 * accumulated in an internal delta so that low emission rates (e.g. 0.5
 * particles/s) remain accurate over time without integer truncation error.
 *
 * @example
 * const emitter = new UniversalEmitter(60, new ParticleOptions({ velocity: new Vector(0, -200) }));
 * particleSystem.addEmitter(emitter);
 */
export class UniversalEmitter implements ParticleEmitter {
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

    /**
     * Computes how many whole particles to spawn for the given `time` slice,
     * carrying any fractional remainder into the next call. This accumulator
     * prevents emission-rate drift when `emissionRate * delta` is not an
     * integer (e.g. 30 fps × 0.5 particles/s = 0.5 per frame → every other
     * frame emits one).
     */
    public computeParticleCount(time: Time): number {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta;
        const particles = particleAmount | 0;

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    /**
     * Requests the correct number of particles from `system` for this frame,
     * configures each one with {@link particleOptions} via
     * {@link Particle.applyOptions}, and emits them into the live pool.
     */
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
