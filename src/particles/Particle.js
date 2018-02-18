import Vector from '../types/Vector';
import Color from '../types/Color';
import Time from '../types/Time';

/**
 * @class Particle
 */
export default class Particle {

    /**
     * @constructor
     */
    constructor() {

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = Time.OneSecond.clone();

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = Time.Zero.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._position = Vector.Zero.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = Vector.Zero.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = Vector.One.clone();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = 0;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = 0;

        /**
         * @private
         * @member {Number}
         */
        this._textureIndex = 0;

        /**
         * @private
         * @member {Color}
         */
        this._tint = Color.White.clone();
    }

    /**
     * @public
     * @member {Time}
     */
    get totalLifetime() {
        return this._totalLifetime;
    }

    set totalLifetime(totalLifetime) {
        this._totalLifetime.copy(totalLifetime);
    }

    /**
     * @public
     * @member {Time}
     */
    get elapsedLifetime() {
        return this._elapsedLifetime;
    }

    set elapsedLifetime(elapsedLifetime) {
        this._elapsedLifetime.copy(elapsedLifetime);
    }

    /**
     * @public
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    set position(position) {
        this._position.copy(position);
    }

    /**
     * @public
     * @member {Vector}
     */
    get velocity() {
        return this._velocity;
    }

    set velocity(velocity) {
        this._velocity.copy(velocity);
    }

    /**
     * @public
     * @member {Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(scale) {
        this._scale.copy(scale);
    }

    /**
     * @public
     * @member {Number}
     */
    get rotation() {
        return this._rotation;
    }

    set rotation(degrees) {
        const rotation = degrees % 360;

        this._rotation = rotation < 0 ? rotation + 360 : rotation;
    }

    /**
     * @public
     * @member {Number}
     */
    get rotationSpeed() {
        return this._rotationSpeed;
    }

    set rotationSpeed(rotationSpeed) {
        this._rotationSpeed = rotationSpeed;
    }

    /**
     * @public
     * @member {Number}
     */
    get textureIndex() {
        return this._textureIndex;
    }

    set textureIndex(textureIndex) {
        this._textureIndex = textureIndex;
    }

    /**
     * @public
     * @member {Color}
     */
    get tint() {
        return this._tint;
    }

    set tint(color) {
        this._tint.copy(color);
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get remainingLifetime() {
        return Time.Temp.set(this._totalLifetime.milliseconds - this._elapsedLifetime.milliseconds);
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get elapsedRatio() {
        return this._elapsedLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get remainingRatio() {
        return this.remainingLifetime.milliseconds / this._totalLifetime.milliseconds;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get expired() {
        return this._elapsedLifetime.greaterThan(this._totalLifetime);
    }

    /**
     * @public
     */
    destroy() {
        this._totalLifetime.destroy();
        this._totalLifetime = null;

        this._elapsedLifetime.destroy();
        this._elapsedLifetime = null;

        this._position.destroy();
        this._position = null;

        this._velocity.destroy();
        this._velocity = null;

        this._scale.destroy();
        this._scale = null;

        this._tint.destroy();
        this._tint = null;

        this._rotation = null;
        this._rotationSpeed = null;
        this._textureIndex = null;
    }
}
