import Vector from '../../math/Vector';
import Color from '../../core/Color';
import Time from '../../core/Time';
import { TIME } from '../../const';
import ParticleOptions from './ParticleOptions';

/**
 * @class Particle
 */
export default class Particle {

    /**
     * @constructor
     * @param {ParticleOptions|Particle} options
     */
    constructor(options) {

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = options.elapsedLifetime.clone();

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = options.totalLifetime.clone();

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
    get isExpired() {
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
     * @param {ParticleOptions} options
     * @returns {Particle}
     */
    reset(options) {
        this._elapsedLifetime.set(0, TIME.SECONDS);
        this._totalLifetime.copy(options.totalLifetime);
        this._position.copy(options.position);
        this._velocity.copy(options.velocity);
        this._scale.copy(options.scale);
        this._color.copy(options.color);
        this._rotation = options.rotation;
        this._rotationSpeed = options.rotationSpeed;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @returns {Particle}
     */
    copy(particle) {
        this._elapsedLifetime.copy(particle.elapsedLifetime);
        this._totalLifetime.copy(particle.totalLifetime);
        this._position.copy(particle.position);
        this._velocity.copy(particle.velocity);
        this._scale.copy(particle.scale);
        this._color.copy(particle.color);
        this._rotation = particle.rotation;
        this._rotationSpeed = particle.rotationSpeed;

        return this;
    }

    /**
     * @public
     * @returns {Particle}
     */
    clone() {
        return new Particle(this);
    }

    /**
     * @public
     */
    destroy() {
        this._elapsedLifetime.destroy();
        this._elapsedLifetime = null;

        this._totalLifetime.destroy();
        this._totalLifetime = null;

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
