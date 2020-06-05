import { Vector } from 'math/Vector';
import { Color } from 'core/Color';
import { Time } from 'core/Time';
import type { ParticleProperties } from "particles/ParticleProperties";
import { trimRotation } from "utils/math";

export class ParticleOptions implements ParticleProperties {
    private readonly _totalLifetime: Time;
    private readonly _elapsedLifetime: Time;
    private readonly _position: Vector;
    private readonly _velocity: Vector;
    private readonly _scale: Vector;
    private readonly _tint: Color;
    private _rotation: number;
    private _rotationSpeed: number;
    private _textureIndex: number;

    constructor(options: Partial<ParticleProperties> = {}) {
        const {
            totalLifetime,
            elapsedLifetime,
            position,
            velocity,
            scale,
            rotation,
            rotationSpeed,
            textureIndex,
            tint,
        } = options;

        this._totalLifetime = (totalLifetime ?? Time.OneSecond).clone();
        this._elapsedLifetime = (elapsedLifetime ?? Time.Zero).clone();
        this._position = (position ?? Vector.Zero).clone();
        this._velocity = (velocity ?? Vector.Zero).clone();
        this._scale = (scale ?? Vector.One).clone();
        this._tint = (tint ?? Color.White).clone();
        this._rotation = rotation ?? 0;
        this._rotationSpeed = rotationSpeed ?? 0;
        this._textureIndex = textureIndex ?? 0;
    }

    get totalLifetime() {
        return this._totalLifetime;
    }

    set totalLifetime(totalLifetime) {
        this._totalLifetime.copy(totalLifetime);
    }

    get elapsedLifetime() {
        return this._elapsedLifetime;
    }

    set elapsedLifetime(elapsedLifetime) {
        this._elapsedLifetime.copy(elapsedLifetime);
    }

    get position() {
        return this._position;
    }

    set position(position) {
        this._position.copy(position);
    }

    get velocity() {
        return this._velocity;
    }

    set velocity(velocity) {
        this._velocity.copy(velocity);
    }

    get scale() {
        return this._scale;
    }

    set scale(scale) {
        this._scale.copy(scale);
    }

    get rotation() {
        return this._rotation;
    }

    set rotation(degrees) {
        this._rotation = trimRotation(degrees);
    }

    get rotationSpeed() {
        return this._rotationSpeed;
    }

    set rotationSpeed(rotationSpeed) {
        this._rotationSpeed = rotationSpeed;
    }

    get textureIndex() {
        return this._textureIndex;
    }

    set textureIndex(textureIndex) {
        this._textureIndex = textureIndex;
    }

    get tint() {
        return this._tint;
    }

    set tint(color) {
        this._tint.copy(color);
    }

    destroy() {
        this._totalLifetime.destroy();
        this._elapsedLifetime.destroy();
        this._position.destroy();
        this._velocity.destroy();
        this._scale.destroy();
        this._tint.destroy();
    }
}
