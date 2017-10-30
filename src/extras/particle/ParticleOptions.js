import { TIME } from '../../const';
import Vector from '../../math/Vector';
import Color from '../../core/Color';
import Time from '../../core/Time';

/**
 * @class ParticleOptions
 */
export default class ParticleOptions {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.elapsedLifetime]
     * @param {Time} [options.totalLifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.scale]
     * @param {Color} [options.color]
     * @param {Vector} [options.velocity]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     */
    constructor({ elapsedLifetime, totalLifetime, position, scale, color, velocity, rotation, rotationSpeed } = {}) {

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = (elapsedLifetime && elapsedLifetime.clone()) || new Time(0, TIME.SECONDS);

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = (totalLifetime && totalLifetime.clone()) || new Time(1, TIME.SECONDS);

        /**
         * @private
         * @member {Vector}
         */
        this._position = (position && position.clone()) || new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = (scale && scale.clone()) || new Vector(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._color = (color && color.clone()) || Color.White.clone();

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

    set rotationSpeed(speed) {
        this._rotationSpeed = speed;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

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
