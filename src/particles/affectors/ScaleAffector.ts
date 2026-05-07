import type { ParticleAffector } from '@/particles/affectors/ParticleAffector';
import { Vector } from '@/math/Vector';
import type { Time } from '@/core/Time';
import type { Particle } from '@/particles/Particle';

/**
 * Additively grows or shrinks a particle's {@link Particle.scale} each tick
 * by a constant rate vector. A positive factor enlarges the sprite; a
 * negative factor shrinks it. Use `new ScaleAffector(-1, -1)` to make
 * particles fade out in size over one second.
 */
export class ScaleAffector implements ParticleAffector {

    private readonly _scaleFactor: Vector;

    public constructor(factorX: number, factorY: number) {
        this._scaleFactor = new Vector(factorX, factorY);
    }

    public get scaleFactor(): Vector {
        return this._scaleFactor;
    }

    public set scaleFactor(scaleFactor: Vector) {
        this.setScaleFactor(scaleFactor);
    }

    public setScaleFactor(scaleFactor: Vector): this {
        this._scaleFactor.copy(scaleFactor);

        return this;
    }

    /**
     * Adds `scaleFactor * delta.seconds` to `particle.scale` on both axes,
     * implementing linear scale drift for the configured rate.
     */
    public apply(particle: Particle, delta: Time): this {
        particle.scale.add(
            delta.seconds * this._scaleFactor.x,
            delta.seconds * this._scaleFactor.y
        );

        return this;
    }

    public destroy(): void {
        this._scaleFactor.destroy();
    }
}
