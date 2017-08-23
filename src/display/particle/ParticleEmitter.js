import Particle from './Particle';
import Rectangle from '../../core/Rectangle';
import Vector from '../../core/Vector';
import Color from '../../core/Color';
import Time from '../../core/Time';

/**
 * @class ParticleEmitter
 * @memberof Exo
 */
export default class ParticleEmitter {

    /**
     * @constructor
     * @param {Exo.Texture} texture
     */
    constructor(texture) {

        /**
         * @private
         * @member {Exo.Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Exo.Rectangle}
         */
        this._textureRect = new Rectangle(0, 0, texture.width, texture.height);

        /**
         * @private
         * @member {Exo.Rectangle}
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
         * @member {Exo.ParticleModifier[]}
         */
        this._modifiers = [];

        /**
         * @private
         * @member {Exo.Particle[]}
         */
        this._particles = [];

        /**
         * @private
         * @member {Exo.Time}
         */
        this._particleLifeTime = new Time(1, Time.Seconds);

        /**
         * @private
         * @member {Exo.Vector}
         */
        this._particlePosition = new Vector();

        /**
         * @private
         * @member {Exo.Vector}
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
         * @member {Exo.Vector}
         */
        this._particleScale = new Vector(1, 1);

        /**
         * @private
         * @member {Exo.Color}
         */
        this._particleColor = Color.White.clone();
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Particle[]}
     */
    get particles() {
        return this._particles;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.ParticleModifier[]}
     */
    get modifiers() {
        return this._modifiers;
    }

    /**
     * @public
     * @readonly
     * @member {Exo.Rectangle}
     */
    get textureRect() {
        return this._textureRect;
    }

    /**
     * @public
     * @member {Exo.Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(texture) {
        this._texture = texture;
    }

    /**
     * @public
     * @member {Exo.Rectangle}
     */
    get textureCoords() {
        return this._textureCoords;
    }

    set textureCoords(value) {
        this._textureCoords.copy(value);
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
     * @member {Exo.Time}
     */
    get particleLifeTime() {
        return this._particleLifeTime;
    }

    set particleLifeTime(particleLifeTime) {
        this._particleLifeTime.copy(particleLifeTime);
    }

    /**
     * @public
     * @member {Exo.Vector}
     */
    get particlePosition() {
        return this._particlePosition;
    }

    set particlePosition(position) {
        this._particlePosition.copy(position);
    }

    /**
     * @public
     * @member {Exo.Vector}
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
     * @member {Exo.Vector}
     */
    get particleScale() {
        return this._particleScale;
    }

    set particleScale(scale) {
        this._particleScale.copy(scale);
    }

    /**
     * @public
     * @member {Exo.Color}
     */
    get particleColor() {
        return this._particleColor;
    }

    set particleColor(color) {
        this._particleColor.copy(color);
    }

    setTextureRect(textureRect) {
        const texture = this._texture,
            width = texture.width,
            height = texture.height,
            x = textureRect.x / width,
            y = textureRect.y / height;

        this._textureCoords.set(x, y, x + (textureRect.width / width), y + (textureRect.height / height));
        this._textureRect.copy(textureRect);
    }

    addModifier(modifier) {
        this._modifiers.push(modifier);
    }

    computeParticleCount(time) {
        const particleAmount = (this._emissionRate * time.asSeconds()) + this._emissionDelta,
            particles = particleAmount | 0;

        this._emissionDelta = particleAmount - particles;

        return particles;
    }

    update(delta) {
        const particles = this._particles,
            modifiers = this._modifiers,
            particleCount = this.computeParticleCount(delta),
            modifierCount = modifiers.length;

        for (let i = 0; i < particleCount; i++) {
            const particle = new Particle(this._particleLifeTime);

            particle.position.copy(this._particlePosition);
            particle.velocity.copy(this._particleVelocity);
            particle.rotation = this._particleRotation;
            particle.rotationSpeed = this._particleRotationSpeed;
            particle.scale.copy(this._particleScale);
            particle.color.copy(this._particleColor);

            particles.push(particle);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];

            this.updateParticle(particle, delta);

            if (particle.elapsedLifetime.greaterThan(particle.totalLifetime)) {
                particles.splice(i, 1);
                continue;
            }

            for (let j = 0; j < modifierCount; j++) {
                modifiers[j].apply(particle, delta);
            }
        }
    }

    updateParticle(particle, delta) {
        const seconds = delta.asSeconds(),
            velocity = particle.velocity;

        particle.elapsedLifetime.add(delta);
        particle.position.add(seconds * velocity.x, seconds * velocity.y);
        particle.rotation += (seconds * particle.rotationSpeed);
    }

    render(displayManager) {
        displayManager.setCurrentRenderer('particle');
        displayManager.getCurrentRenderer().render(this);
    }
}
