import Vector from '../../math/Vector';
import Color from '../../core/Color';
import Time from '../../core/Time';

/**
 * @class Particle
 */
export default class Particle {

    /**
     * @constructor
     * @param {ParticleOptions} options
     */
    constructor(options) {

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = options.totalLifetime.clone();

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = new Time();

        /**
         * @private
         * @member {Vector}
         */
        this._position = options.position.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = options.velocity.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = options.scale.clone();

        /**
         * @private
         * @member {Color}
         */
        this._color = options.color.clone();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = options.rotation;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = options.rotationSpeed;
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
     * @member {Number}
     */
    get rotation() {
        return this._rotation;
    }

    set rotation(rotation) {
        this._rotation = rotation;
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
     * @member {Color}
     */
    get color() {
        return this._color;
    }

    set color(color) {
        this._color.copy(color);
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
     * @readonly
     * @member {Time}
     */
    get remainingLifetime() {
        return Time.Temp.set(this.totalLifetime.milliseconds - this.elapsedLifetime.milliseconds);
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get elapsedRatio() {
        return this.elapsedLifetime.milliseconds / this.totalLifetime.milliseconds;
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get remainingRatio() {
        return this.remainingLifetime.milliseconds / this.totalLifetime.milliseconds;
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        const seconds = delta.seconds;

        this._elapsedLifetime.add(delta);
        this._position.add(seconds * this._velocity.x, seconds * this._velocity.y);
        this._rotation += seconds * this._rotationSpeed;
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

        this._color.destroy();
        this._color = null;

        this._rotation = null;
        this._rotationSpeed = null;
    }
}
