import Vector from '../../core/Vector';
import Color from '../../core/Color';
import Time from '../../core/time/Time';

/**
 * @class Particle
 * @memberof Exo
 */
export default class Particle {

    /**
     * @constructor
     * @param {Exo.Time} totalLifetime
     */
    constructor(totalLifetime) {

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._position = new Vector();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._velocity = new Vector();

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
         * @member {Exo.Vector}
         */
        this._scale = new Vector(1, 1);

        /**
         * @private
         * @member {Exo.Color}
         */
        this._color = Color.White.clone();

        /**
         * @private
         * @member {Exo.Time}
         */
        this._elapsedLifetime = new Time();

        /**
         * @private
         * @member {Exo.Time}
         */
        this._totalLifetime = totalLifetime.clone();
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get position() {
        return this._position;
    }

    set position(value) {
        this._position.copy(value);
    }

    /**
     * @public
     * @member {Exo.Vector}
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
     * @member {Exo.Vector}
     */
    get scale() {
        return this._scale;
    }

    set scale(value) {
        this._velocity.copy(value);
    }

    /**
     * @public
     * @member {Exo.Color}
     */
    get color() {
        return this._color;
    }

    set color(value) {
        this._color.copy(value);
    }

    /**
     * @public
     * @member {Exo.Time}
     */
    get elapsedLifetime() {
        return this._elapsedLifetime;
    }

    set elapsedLifetime(value) {
        this._elapsedLifetime.copy(value);
    }

    /**
     * @public
     * @member {Exo.Time}
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
     * @member {Exo.Time}
     */
    get remainingLifetime() {
        return new Time(this.totalLifetime.asMilliseconds() - this.elapsedLifetime.asMilliseconds());
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Time}
     */
    get elapsedRatio() {
        return this.elapsedLifetime.asMilliseconds() / this.totalLifetime.asMilliseconds();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Time}
     */
    get remainingRatio() {
        return this.remainingLifetime.asMilliseconds() / this.totalLifetime.asMilliseconds();
    }
}
