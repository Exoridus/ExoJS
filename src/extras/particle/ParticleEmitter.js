import Renderable from '../../display/Renderable';
import Particle from './Particle';
import Rectangle from '../../math/Rectangle';
import Time from '../../core/Time';
import ParticleOptions from './ParticleOptions';

/**
 * @class ParticleEmitter
 * @extends {Renderable}
 */
export default class ParticleEmitter extends Renderable {

    /**
     * @constructor
     * @param {Texture} texture
     * @param {Object} [particleOptions = new ParticleOptions()]
     */
    constructor(texture, particleOptions = new ParticleOptions()) {
        super();

        /**
         * @private
         * @member {Texture}
         */
        this._texture = texture;

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureFrame = new Rectangle();

        /**
         * @private
         * @member {Rectangle}
         */
        this._textureCoords = new Rectangle();

        /**
         * @private
         * @member {Boolean}
         */
        this._updateTexCoords = true;

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
         * @member {ParticleOptions}
         */
        this._particleOptions = particleOptions;

        if (texture) {
            this.setTexture(texture);
        }
    }

    /**
     * @public
     * @member {Texture}
     */
    get texture() {
        return this._texture;
    }

    set texture(texture) {
        this.setTexture(texture);
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get textureFrame() {
        return this._textureFrame;
    }

    set textureFrame(frame) {
        this.setTextureFrame(frame);
    }

    /**
     * @public
     * @member {Rectangle}
     */
    get textureCoords() {
        if (this._updateTexCoords) {
            const { left, top, right, bottom } = this._textureFrame,
                { width, height } = this._texture;

            this._textureCoords.set((left / width), (top / height), (right / width), (bottom / height));
            this._updateTexCoords = false;
        }

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
        this.setEmissionRate(particlesPerSecond);
    }

    /**
     * @public
     * @member {ParticleOptions}
     */
    get particleOptions() {
        return this._particleOptions;
    }

    set particleOptions(options) {
        this._particleOptions = options;
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
     * @member {Set<Particle>}
     */
    get particles() {
        return this._particles;
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @returns {ParticleEmitter}
     */
    setTexture(texture) {
        this._texture = texture;
        this.setTextureFrame(texture.frame);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Rectangle} frame
     * @returns {ParticleEmitter}
     */
    setTextureFrame(frame) {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} particlesPerSecond
     * @returns {ParticleEmitter}
     */
    setEmissionRate(particlesPerSecond) {
        this._emissionRate = particlesPerSecond;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {ParticleModifier} modifier
     * @returns {ParticleEmitter}
     */
    addModifier(modifier) {
        this._modifiers.push(modifier);

        return this;
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
        const options = this._particleOptions,
            particles = this._particles,
            modifiers = this._modifiers,
            particleCount = this.computeParticleCount(delta);

        for (let i = 0; i < particleCount; i++) {
            particles.add(new Particle(options));
        }

        for (const particle of particles) {
            particle.update(delta);

            if (particle.elapsedLifetime.greaterThan(particle.totalLifetime)) {
                particle.destroy();
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

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._texture = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._textureCoords.destroy();
        this._textureCoords = null;

        this._modifiers.length = 0;
        this._modifiers = null;

        this._particles.clear();
        this._particles = null;

        this._particleOptions.destroy();
        this._particleOptions = null;

        this._emissionRate = null;
        this._emissionDelta = null;
        this._updateTexCoords = null;
    }
}
