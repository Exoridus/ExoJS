import Vector from '../math/Vector';
import Color from '../core/Color';
import Time from '../core/time/Time';
import ParticleOptions from "./emitters/ParticleOptions";
import { IParticleProps } from "./IParticleProps";

export default class Particle implements IParticleProps {
    private _totalLifetime = Time.OneSecond.clone();
    private _elapsedLifetime = Time.Zero.clone();
    private _position = Vector.Zero.clone();
    private _velocity = Vector.Zero.clone();
    private _scale = Vector.One.clone();
    private _rotation = 0;
    private _rotationSpeed = 0;
    private _textureIndex = 0;
    private _tint = Color.White.clone();

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

    get tint() {
        return this._tint;
    }

    set tint(tint) {
        this._tint.copy(tint);
    }

    get rotation() {
        return this._rotation;
    }

    set rotation(degrees) {
        const rotation = degrees % 360;

        this._rotation = rotation < 0 ? rotation + 360 : rotation;
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

    get remainingLifetime() {
        return Time.Temp.set(this._totalLifetime.milliseconds - this._elapsedLifetime.milliseconds);
    }

    get elapsedRatio() {
        return this._elapsedLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    get remainingRatio() {
        return this.remainingLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    get expired() {
        return this._elapsedLifetime.greaterThan(this._totalLifetime);
    }

    applyOptions(options: ParticleOptions) {
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

    destroy() {
        this._totalLifetime.destroy();
        this._elapsedLifetime.destroy();
        this._position.destroy();
        this._velocity.destroy();
        this._scale.destroy();
        this._tint.destroy();
    }
}
