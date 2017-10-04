import Particle from './Particle';
import Rectangle from '../core/shape/Rectangle';
import Vector from '../core/Vector';
import Color from '../core/Color';
import Time from '../core/time/Time';

/**
 * @class ParticleEmitter
 */
export default class ParticleEmitter {

    /**
     * @constructor
     * @param {Texture} texture
     */
    constructor(texture) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureRect = new Rectangle(0, 0, texture.width, texture.height);

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureCoords = new Rectangle();

        /**
         * @private
         * @member {Number}
         */
        this._emissionRate = 1;

        /**
         * @private
         * @member {Number}
         */
        this._emissionDelta = 0;

        /**
         * @private
         * @member {ParticleModifier[]}
         */
        this._modifiers = [];

        /**
         * @private
         * @member {Set<Particle>}
         */
        this._particles = new Set();

        /**
         * @private
         * @member {Time}
         */
        this._particleLifetime = new Time(1, Time.Seconds);

        /**
         * @private
         * @member {Vector}
         */
        this._particlePosition = new Vector();

        /**
         * @private
         * @member {Vector}
         */
        this._particleVelocity = new Vector();

        /**
         * @private
         * @member {Number}
         */
        this._particleRotation = 1;

        /**
         * @private
         * @member {Number}
         */
        this._particleRotationSpeed = 0;

        /**
         * @private
         * @member {Vector}
         */
        this._particleScale = new Vector(1, 1);

        /**
         * @private
         * @member {Color}
         */
        this._particleColor = Color.White.clone();

        /**
         * @private
         * @member {Boolean}
         */
        this._active = true;
    }

    /**
     * @public
     * @readonly
     * @member {Set<Particle>}
     */
    get particles() {
        return this._particles;
    }

    /**
     * @public
     * @readonly
     * @member {ParticleModifier[]}
     */
    get modifiers() {
        return this._modifiers;
    }

    /**
     * @public
     * @readonly
     * @member {Rectangle}
     */
    get textureRect() {
        return this._textureRect;
    }

    /**
     * @public
     * @member {Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(texture) {
        this._texture = texture;
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get textureCoords() {
        return this._textureCoords;
    }

    set textureCoords(textureCoords) {
        this._textureCoords.copy(textureCoords);
    }

    /**
     * @public
     * @member {Number}
     */
    get emissionRate() {
        return this._emissionRate;
    }

    set emissionRate(particlesPerSecond) {
        this._emissionRate = particlesPerSecond;
    }

    /**
     * @public
     * @member {Time}
     */
    get particleLifetime() {
        return this._particleLifetime;
    }

    set particleLifetime(particleLifetime) {
        this._particleLifetime.copy(particleLifetime);
    }

    /**
     * @public
     * @member {Vector}
     */
    get particlePosition() {
        return this._particlePosition;
    }

    set particlePosition(position) {
        this._particlePosition.copy(position);
    }

    /**
     * @public
     * @member {Vector}
     */
    get particleVelocity() {
        return this._particleVelocity;
    }

    set particleVelocity(velocity) {
        this._particleVelocity.copy(velocity);
    }

    /**
     * @public
     * @member {Number}
     */
    get particleRotation() {
        return this._particleRotation;
    }

    set particleRotation(rotation) {
        this._particleRotation = rotation % 360;
    }

    /**
     * @public
     * @member {Number}
     */
    get particleRotationSpeed() {
        return this._particleRotationSpeed;
    }

    set particleRotationSpeed(speed) {
        this._particleRotationSpeed = speed;
    }

    /**
     * @public
     * @member {Vector}
     */
    get particleScale() {
        return this._particleScale;
    }

    set particleScale(scale) {
        this._particleScale.copy(scale);
    }

    /**
     * @public
     * @member {Color}
     */
    get particleColor() {
        return this._particleColor;
    }

    set particleColor(color) {
        this._particleColor.copy(color);
    }

    /**
     * @public
     * @member {Boolean}
     */
    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;
    }

    /**
     * @public
     * @param {Rectangle} rectangle
     */
    setTextureRect(rectangle) {
        const texture = this._texture,
            width = texture.width,
            height = texture.height,
            x = rectangle.x / width,
            y = rectangle.y / height;

        this._textureCoords.set(x, y, x + (rectangle.width / width), y + (rectangle.height / height));
        this._textureRect.copy(rectangle);
    }

    /**
     * @public
     * @param {ParticleModifier} modifier
     */
    addModifier(modifier) {
        this._modifiers.push(modifier);
    }

    /**
     * @public
     * @param {Time} time
     * @returns {Number}
     */
    computeParticleCount(time) {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta,
            particles = particleAmount | 0;

        this._emissionDelta = particleAmount - particles;

        return particles;
    }

    /**
     * @public
     * @param {Time} delta
     */
    update(delta) {
        const particles = this._particles,
            modifiers = this._modifiers,
            particleCount = this.computeParticleCount(delta);

        for (let i = 0; i < particleCount; i++) {
            particles.add(new Particle({
                lifetime: this._particleLifetime,
                position: this._particlePosition,
                velocity: this._particleVelocity,
                rotation: this._particleRotation,
                rotationSpeed: this._particleRotationSpeed,
                scale: this._particleScale,
                color: this._particleColor,
            }));
        }

        for (const particle of particles) {
            particle.update(delta);

            if (particle.elapsedLifetime.greaterThan(particle.totalLifetime)) {
                particles.delete(particle);
                continue;
            }

            for (const modifier of modifiers) {
                modifier.apply(particle, delta);
            }
        }
    }

    /**
     * @public
     * @chainable
     * @param {DisplayManager} displayManager
     * @returns {ParticleEmitter}
     */
    render(displayManager) {
        if (this.active) {
            displayManager
                .getRenderer('particle')
                .render(this);
        }

        return this;
    }
}
