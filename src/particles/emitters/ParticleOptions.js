import Vector from '../../types/Vector';
import Color from '../../types/Color';
import Time from '../../types/Time';

/**
 * @class ParticleOptions
 */
export default class ParticleOptions {

    /**
     * @constructor
     * @param {Object} [options]
     * @param {Time} [options.totalLifetime=Time.OneSecond]
     * @param {Time} [options.elapsedLifetime=Time.Zero]
     * @param {Vector} [options.position=Vector.Zero]
     * @param {Vector} [options.velocity=Vector.Zero]
     * @param {Vector} [options.scale=Vector.One]
     * @param {Number} [options.rotation=0]
     * @param {Number} [options.rotationSpeed=0]
     * @param {Number} [options.textureIndex=0]
     * @param {Color} [options.tint=Color.White]
     */
    constructor({
        totalLifetime = Time.OneSecond,
        elapsedLifetime = Time.Zero,
        position = Vector.Zero,
        velocity = Vector.Zero,
        scale = Vector.One,
        rotation = 0,
        rotationSpeed = 0,
        textureIndex = 0,
        tint = Color.White,
    } = {}) {

        /**
         * @private
         * @member {Time}
         */
        this._totalLifetime = totalLifetime.clone();

        /**
         * @private
         * @member {Time}
         */
        this._elapsedLifetime = elapsedLifetime.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._position = position.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._velocity = velocity.clone();

        /**
         * @private
         * @member {Vector}
         */
        this._scale = scale.clone();

        /**
         * @private
         * @member {Number}
         */
        this._rotation = rotation;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = rotationSpeed;

        /**
         * @private
         * @member {Number}
         */
        this._textureIndex = textureIndex;

        /**
         * @private
         * @member {Color}
         */
        this._tint = tint.clone();
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
     * @chainable
     * @param {Particle} particle
     * @returns {ParticleOptions}
     */
    apply(particle) {
        particle.totalLifetime = this.totalLifetime;
        particle.elapsedLifetime = this.elapsedLifetime;
        particle.position = this.position;
        particle.velocity = this.velocity;
        particle.scale = this.scale;
        particle.rotation = this.rotation;
        particle.rotationSpeed = this.rotationSpeed;
        particle.textureIndex = this.textureIndex;
        particle.tint = this.tint;

        return this;
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
