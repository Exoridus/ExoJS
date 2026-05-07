import { Vector } from '@/math/Vector';
import { Color } from '@/core/Color';
import { Time } from '@/core/Time';
import type { ParticleOptions } from './emitters/ParticleOptions';
import type { ParticleProperties } from '@/particles/ParticleProperties';
import { trimRotation } from '@/math/utils';

/**
 * Mutable per-instance state for a single live particle. Implements
 * {@link ParticleProperties} so affectors can mutate it through the shared
 * interface. Particles are pooled by {@link ParticleSystem}: expired instances
 * are moved to the graveyard and reused via {@link ParticleSystem.requestParticle}
 * rather than garbage-collected.
 *
 * Do not construct directly — use {@link ParticleSystem.requestParticle} to
 * obtain a recycled or fresh instance, then configure it through
 * {@link Particle.applyOptions}.
 */
export class Particle implements ParticleProperties {
    private _totalLifetime = Time.oneSecond.clone();
    private _elapsedLifetime = Time.zero.clone();
    private _position = Vector.zero.clone();
    private _velocity = Vector.zero.clone();
    private _scale = Vector.one.clone();
    private _rotation = 0;
    private _rotationSpeed = 0;
    private _textureIndex = 0;
    private _tint = Color.white.clone();

    public get totalLifetime(): Time {
        return this._totalLifetime;
    }

    public set totalLifetime(totalLifetime) {
        this._totalLifetime.copy(totalLifetime);
    }

    public get elapsedLifetime(): Time {
        return this._elapsedLifetime;
    }

    public set elapsedLifetime(elapsedLifetime) {
        this._elapsedLifetime.copy(elapsedLifetime);
    }

    public get position(): Vector {
        return this._position;
    }

    public set position(position) {
        this._position.copy(position);
    }

    public get velocity(): Vector {
        return this._velocity;
    }

    public set velocity(velocity) {
        this._velocity.copy(velocity);
    }

    public get scale(): Vector {
        return this._scale;
    }

    public set scale(scale) {
        this._scale.copy(scale);
    }

    public get tint(): Color {
        return this._tint;
    }

    public set tint(tint) {
        this._tint.copy(tint);
    }

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(degrees) {
        this._rotation = trimRotation(degrees);
    }

    public get rotationSpeed(): number {
        return this._rotationSpeed;
    }

    public set rotationSpeed(rotationSpeed) {
        this._rotationSpeed = rotationSpeed;
    }

    public get textureIndex(): number {
        return this._textureIndex;
    }

    public set textureIndex(textureIndex) {
        this._textureIndex = textureIndex;
    }

    /**
     * Time remaining before this particle expires, returned via the shared
     * `Time.temp` scratch value — copy before storing if you need it beyond
     * the current frame.
     */
    public get remainingLifetime(): Time {
        return Time.temp.set(this._totalLifetime.milliseconds - this._elapsedLifetime.milliseconds);
    }

    /**
     * Fraction of total lifetime already elapsed, in [0, 1]. Used by
     * {@link ColorAffector} as the interpolation factor for tint blending.
     */
    public get elapsedRatio(): number {
        return this._elapsedLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    /** Fraction of total lifetime still remaining, in [0, 1]. */
    public get remainingRatio(): number {
        return this.remainingLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    /**
     * Returns `true` once `elapsedLifetime` exceeds `totalLifetime`. Expired
     * particles are moved to the graveyard by {@link ParticleSystem.update}
     * before affectors run.
     */
    public get expired(): boolean {
        return this._elapsedLifetime.greaterThan(this._totalLifetime);
    }

    /**
     * Bulk-copies every field from `options` into this particle, replacing all
     * previous state. Called immediately after {@link ParticleSystem.requestParticle}
     * to configure a recycled particle for reuse.
     */
    public applyOptions(options: ParticleOptions): this {
        const {
            totalLifetime,
            elapsedLifetime,
            position,
            velocity,
            scale,
            tint,
            rotation,
            rotationSpeed,
            textureIndex,
        } = options;

        this._totalLifetime.copy(totalLifetime);
        this._elapsedLifetime.copy(elapsedLifetime);
        this._position.copy(position);
        this._velocity.copy(velocity);
        this._scale.copy(scale);
        this._tint.copy(tint);
        this._rotation = rotation;
        this._rotationSpeed = rotationSpeed;
        this._textureIndex = textureIndex;

        return this;
    }

    /**
     * Destroys all owned value objects. Called by
     * {@link ParticleSystem.clearParticles} when the pool is flushed entirely.
     * Do not call on individual particles mid-simulation; let the system
     * recycle them via the graveyard instead.
     */
    public destroy(): void {
        this._totalLifetime.destroy();
        this._elapsedLifetime.destroy();
        this._position.destroy();
        this._velocity.destroy();
        this._scale.destroy();
        this._tint.destroy();
    }
}
