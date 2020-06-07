import { Vector } from 'math/Vector';
import { Color } from 'core/Color';
import { Time } from 'core/Time';
import type { ParticleOptions } from './emitters/ParticleOptions';
import type { IParticleProperties } from 'particles/IParticleProperties';
import { trimRotation } from 'utils/math';

export class Particle implements IParticleProperties {
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

    public get remainingLifetime(): Time {
        return Time.temp.set(this._totalLifetime.milliseconds - this._elapsedLifetime.milliseconds);
    }

    public get elapsedRatio(): number {
        return this._elapsedLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    public get remainingRatio(): number {
        return this.remainingLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    public get expired(): boolean {
        return this._elapsedLifetime.greaterThan(this._totalLifetime);
    }

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

    public destroy(): void {
        this._totalLifetime.destroy();
        this._elapsedLifetime.destroy();
        this._position.destroy();
        this._velocity.destroy();
        this._scale.destroy();
        this._tint.destroy();
    }
}
