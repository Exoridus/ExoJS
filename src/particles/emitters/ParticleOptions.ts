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

    get totalLifetime(): Time {
        return this._totalLifetime;
    }

    set totalLifetime(totalLifetime: Time) {
        this._totalLifetime.copy(totalLifetime);
    }

    get elapsedLifetime(): Time {
        return this._elapsedLifetime;
    }

    set elapsedLifetime(elapsedLifetime: Time) {
        this._elapsedLifetime.copy(elapsedLifetime);
    }

    get position(): Vector {
        return this._position;
    }

    set position(position: Vector) {
        this._position.copy(position);
    }

    get velocity(): Vector {
        return this._velocity;
    }

    set velocity(velocity: Vector) {
        this._velocity.copy(velocity);
    }

    get scale(): Vector {
        return this._scale;
    }

    set scale(scale: Vector) {
        this._scale.copy(scale);
    }

    get rotation(): number {
        return this._rotation;
    }

    set rotation(degrees: number) {
        this._rotation = trimRotation(degrees);
    }

    get rotationSpeed(): number {
        return this._rotationSpeed;
    }

    set rotationSpeed(rotationSpeed: number) {
        this._rotationSpeed = rotationSpeed;
    }

    get textureIndex(): number {
        return this._textureIndex;
    }

    set textureIndex(textureIndex: number) {
        this._textureIndex = textureIndex;
    }

    get tint(): Color {
        return this._tint;
    }

    set tint(color: Color) {
        this._tint.copy(color);
    }

    destroy(): void {
        this._totalLifetime.destroy();
        this._elapsedLifetime.destroy();
        this._position.destroy();
        this._velocity.destroy();
        this._scale.destroy();
        this._tint.destroy();
    }
}
