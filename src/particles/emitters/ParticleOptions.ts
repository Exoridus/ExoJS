import { Vector } from 'math/Vector';
import { Color } from 'core/Color';
import { Time } from 'core/Time';
import type { IParticleProperties } from 'particles/IParticleProperties';
import { trimRotation } from 'utils/math';

export class ParticleOptions implements IParticleProperties {
    private readonly _totalLifetime: Time;
    private readonly _elapsedLifetime: Time;
    private readonly _position: Vector;
    private readonly _velocity: Vector;
    private readonly _scale: Vector;
    private readonly _tint: Color;
    private _rotation: number;
    private _rotationSpeed: number;
    private _textureIndex: number;

    public constructor(options: Partial<IParticleProperties> = {}) {
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

        this._totalLifetime = (totalLifetime ?? Time.oneSecond).clone();
        this._elapsedLifetime = (elapsedLifetime ?? Time.zero).clone();
        this._position = (position ?? Vector.zero).clone();
        this._velocity = (velocity ?? Vector.zero).clone();
        this._scale = (scale ?? Vector.one).clone();
        this._tint = (tint ?? Color.white).clone();
        this._rotation = rotation ?? 0;
        this._rotationSpeed = rotationSpeed ?? 0;
        this._textureIndex = textureIndex ?? 0;
    }

    public get totalLifetime(): Time {
        return this._totalLifetime;
    }

    public set totalLifetime(totalLifetime: Time) {
        this._totalLifetime.copy(totalLifetime);
    }

    public get elapsedLifetime(): Time {
        return this._elapsedLifetime;
    }

    public set elapsedLifetime(elapsedLifetime: Time) {
        this._elapsedLifetime.copy(elapsedLifetime);
    }

    public get position(): Vector {
        return this._position;
    }

    public set position(position: Vector) {
        this._position.copy(position);
    }

    public get velocity(): Vector {
        return this._velocity;
    }

    public set velocity(velocity: Vector) {
        this._velocity.copy(velocity);
    }

    public get scale(): Vector {
        return this._scale;
    }

    public set scale(scale: Vector) {
        this._scale.copy(scale);
    }

    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(degrees: number) {
        this._rotation = trimRotation(degrees);
    }

    public get rotationSpeed(): number {
        return this._rotationSpeed;
    }

    public set rotationSpeed(rotationSpeed: number) {
        this._rotationSpeed = rotationSpeed;
    }

    public get textureIndex(): number {
        return this._textureIndex;
    }

    public set textureIndex(textureIndex: number) {
        this._textureIndex = textureIndex;
    }

    public get tint(): Color {
        return this._tint;
    }

    public set tint(color: Color) {
        this._tint.copy(color);
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
