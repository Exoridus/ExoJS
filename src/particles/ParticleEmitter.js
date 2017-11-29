import Drawable from '../graphics/Drawable';
import Particle from './Particle';
import Rectangle from '../math/Rectangle';
import Time from '../core/time/Time';
import ParticleOptions from './ParticleOptions';
import { BLEND_MODE } from '../const';

/**
 * @class ParticleEmitter
 * @extends Drawable
 */
export default class ParticleEmitter extends Drawable {

    /**
     * @constructor
     * @param {Texture} texture
     * @param {ParticleOptions|Object} [particleOptions]
     */
    constructor(texture, particleOptions) {
        super();

        /**
         * @private
         * @member {Boolean}
         */
        this._updateTexCoords = true;

        /**
         * @private
         * @member {Set<Particle>}
         */
        this._activeParticles = new Set();

        /**
         * @private
         * @member {Particle[]}
         */
        this._unusedParticles = [];

        /**
         * @private
         * @member {ParticleOptions}
         */
        this._particleOptions = new ParticleOptions(particleOptions);

        /**
         * @private
         * @member {Texture}
         */
        this._texture = null;

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
         * @member {Number}
         */
        this._blendMode = BLEND_MODE.NORMAL;

        if (texture) {
            this.setTexture(texture);
        }
    }

    /**
     * @public
     * @member {Set<Particle>}
     */
    get activeParticles() {
        return this._activeParticles;
    }

    set activeParticles(newParticles) {
        const activeParticles = this._activeParticles,
            unusedParticles = this._unusedParticles,
            activeArray = [...activeParticles],
            newArray = [...newParticles],
            activeLength = activeArray.length,
            newLength = newArray.length,
            diff = (activeLength - newLength);

        for (let i = 0; i < activeLength; i++) {
            activeArray[i].copy(newArray[i]);
        }

        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                const particle = activeArray[i];

                unusedParticles.push(particle);
                activeParticles.delete(particle);
            }
        } else if (diff < 0) {
            for (let i = activeLength; i < newLength; i++) {
                const particle = unusedParticles.pop();

                activeParticles.add(particle ? particle.copy(newArray[i]) : newArray[i].clone());
            }
        }
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
            const frame = this._textureFrame,
                texture = this._texture;

            this._textureCoords.set(
                (frame.left / texture.width),
                (frame.top / texture.height),
                (frame.right / texture.width),
                (frame.bottom / texture.height)
            );

            this._updateTexCoords = false;
        }

        return this._textureCoords;
    }

    set textureCoords(textureCoords) {
        this._textureCoords.copy(textureCoords);
        this._updateTexCoords = false;
    }

    /**
     * @public
     * @member {Number}
     */
    get blendMode() {
        return this._blendMode;
    }

    set blendMode(blendMode) {
        this.setBlendMode(blendMode);
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
     * @member {ParticleModifier[]}
     */
    get modifiers() {
        return this._modifiers;
    }

    set modifiers(newModifiers) {
        for (const modifier of this._modifiers) {
            modifier.destroy();
        }

        this._modifiers.length = 0;

        for (const modifier of newModifiers) {
            this._modifiers.push(modifier.clone());
        }
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @returns {ParticleEmitter}
     */
    setTexture(texture) {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

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
     * @returns {ParticleEmitter}
     */
    resetTextureFrame() {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    /**
     * @public
     * @chainable
     * @param {Number} blendMode
     * @returns {Drawable}
     */
    setBlendMode(blendMode) {
        this._blendMode = blendMode;

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

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {ParticleEmitter}
     */
    update(delta) {
        const particleCount = this.computeParticleCount(delta),
            particleOptions = this._particleOptions,
            activeParticles = this._activeParticles,
            unusedParticles = this._unusedParticles,
            modifiers = this._modifiers,
            unusedCount = unusedParticles.length,
            difference = (unusedCount - particleCount),
            freeParticles = unusedParticles.splice(Math.max(0, difference), Math.min(unusedCount, particleCount));

        for (const particle of freeParticles) {
            activeParticles.add(particle.reset(particleOptions));
        }

        for (let i = Math.min(0, difference); i < 0; i++) {
            activeParticles.add(new Particle(particleOptions));
        }

        for (const particle of activeParticles) {
            particle.update(delta);

            if (particle.isExpired) {
                unusedParticles.push(particle);
                activeParticles.delete(particle);

                continue;
            }

            for (const modifier of modifiers) {
                modifier.apply(particle, delta);
            }
        }

        return this;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && renderManager.insideViewport(this)) {
            const renderer = renderManager.getRenderer('particle');

            renderManager.setRenderer(renderer);

            renderer.render(this);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {ParticleEmitter} emitter
     * @returns {ParticleEmitter}
     */
    copy(emitter) {
        this.activeParticles = emitter.activeParticles;
        this.particleOptions = emitter.particleOptions;
        this.texture = emitter.texture;
        this.textureFrame = emitter.textureFrame;
        this.emissionRate = emitter.emissionRate;
        this.modifiers = emitter.modifiers;

        return this;
    }

    /**
     * @public
     * @returns {ParticleEmitter}
     */
    clone() {
        const emitter = new ParticleEmitter(this._texture, this._particleOptions);

        return emitter.copy(this);
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        for (const particle of this._activeParticles) {
            particle.destroy();
        }

        for (const particle of this._unusedParticles) {
            particle.destroy();
        }

        this._activeParticles.clear();
        this._activeParticles = null;

        this._unusedParticles.length = 0;
        this._unusedParticles = null;

        this._particleOptions.destroy();
        this._particleOptions = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._textureCoords.destroy();
        this._textureCoords = null;

        this._modifiers.length = 0;
        this._modifiers = null;

        this._texture = null;
        this._blendMode = null;
        this._emissionRate = null;
        this._emissionDelta = null;
        this._updateTexCoords = null;
    }
}
