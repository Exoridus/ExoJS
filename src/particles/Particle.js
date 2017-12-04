import { TIME } from '../const';
import Vector from '../math/Vector';
import Color from '../core/Color';
import Time from '../core/time/Time';

/**
 * @class Particle
 */
export default class Particle {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.totalLifetime]
     * @param {Time} [options.elapsedLifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.velocity]
     * @param {Vector} [options.scale]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     * @param {Color} [options.tint]
     */
    constructor(options) {

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = new Time(0, TIME.SECONDS);

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = new Time(0, TIME.SECONDS);

        /**
         * @private
         * @member {Vector}
         */
        this._position = new Vector(0, 0);

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = new Vector(0, 0);

        /**
         * @private
         * @member {Vector}
         */
        this._scale = new Vector(1, 1);

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
         * @member {Color}
         */
        this._tint = new Color();

        if (options !== undefined) {
            this.copy(options);
        }
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
     * @chainable
     * @param {Time} delta
     * @returns {Particle}
     */
    update(delta) {
        const seconds = delta.seconds;

        this._elapsedLifetime.add(delta);
        this._position.add(seconds * this._velocity.x, seconds * this._velocity.y);
        this._rotation += (seconds * this._rotationSpeed);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Particle|Object} options
     * @param {Time} options.totalLifetime
     * @param {Time} options.elapsedLifetime
     * @param {Vector} options.position
     * @param {Vector} options.velocity
     * @param {Vector} options.scale
     * @param {Number} options.rotation
     * @param {Number} options.rotationSpeed
     * @param {Color} options.tint
     * @returns {Particle}
     */
    copy({ totalLifetime, elapsedLifetime, position, velocity, scale, rotation, rotationSpeed, tint } = {}) {
        this._totalLifetime.copy(totalLifetime);
        this._elapsedLifetime.copy(elapsedLifetime);
        this._position.copy(position);
        this._velocity.copy(velocity);
        this._scale.copy(scale);
        this._rotation = rotation;
        this._rotationSpeed = rotationSpeed;
        this._tint.copy(tint);

        return this;
    }

    /**
     * @public
     * @returns {Particle}
     */
    clone() {
        return new Particle({
            totalLifetime: this.totalLifetime,
            elapsedLifetime: this.elapsedLifetime,
            position: this.position,
            velocity: this.velocity,
            scale: this.scale,
            rotation: this.rotation,
            rotationSpeed: this.rotationSpeed,
            tint: this.tint,
        });
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
    }
}
