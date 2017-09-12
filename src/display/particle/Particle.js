import Vector from '../../core/shape/Vector';
import Color from '../../core/Color';
import Time from '../../core/time/Time';

/**
 * @class Particle
 */
export default class Particle {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.lifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.velocity]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     * @param {Vector} [options.scale]
     * @param {Color} [options.color]
     */
    constructor({ lifetime, position, velocity, rotation, rotationSpeed, scale, color } = {}) {

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = (lifetime && lifetime.clone()) || new Time(1, Time.Seconds);

        /**
         * @private
         * @member {Vector}
         */
        this._position = (position && position.clone()) || new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = (velocity && velocity.clone()) || new Vector();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = rotation || 0;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = rotationSpeed || 0;

        /**
         * @private
         * @member {Vector}
         */
        this._scale = (scale && scale.clone()) || new Vector(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._color = (color && color.clone()) || new Color(255, 255, 255, 1);

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = new Time();
    }

    /**
     * @public
     * @member {Vector}
     */
    get position() {
        return this._position;
    }

    set position(value) {
        this._position.copy(value);
    }

    /**
     * @public
     * @member {Vector}
     */
    get velocity() {
        return this._velocity;
    }

    set velocity(value) {
        this._velocity.copy(value);
    }

    /**
     * @public
     * @member {Number}
     */
    get rotation() {
        return this._rotation;
    }

    set rotation(value) {
        this._rotation = value;
    }

    /**
     * @public
     * @member {Number}
     */
    get rotationSpeed() {
        return this._rotationSpeed;
    }

    set rotationSpeed(value) {
        this._rotationSpeed = value;
    }

    /**
     * @public
     * @member {Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(value) {
        this._velocity.copy(value);
    }

    /**
     * @public
     * @member {Color}
     */
    get color() {
        return this._color;
    }

    set color(value) {
        this._color.copy(value);
    }

    /**
     * @public
     * @member {Time}
     */
    get elapsedLifetime() {
        return this._elapsedLifetime;
    }

    set elapsedLifetime(value) {
        this._elapsedLifetime.copy(value);
    }

    /**
     * @public
     * @member {Time}
     */
    get totalLifetime() {
        return this._totalLifetime;
    }

    set totalLifetime(value) {
        this._totalLifetime.copy(value);
    }

    /**
     * @public
     * @readonly
     * @member {Time}
     */
    get remainingLifetime() {
        return new Time(this.totalLifetime.milliseconds - this.elapsedLifetime.milliseconds);
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
}
