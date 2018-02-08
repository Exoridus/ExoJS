import Particle from './Particle';
import Rectangle from '../math/Rectangle';
import Time from '../core/time/Time';
import Container from '../rendering/Container';

/**
 * @class ParticleSystem
 * @extends Container
 */
export default class ParticleSystem extends Container {

    /**
     * @constructor
     * @param {Texture} texture
     */
    constructor(texture) {
        super();

        /**
         * @private
         * @member {ParticleEmitter[]}
         */
        this._emitters = [];

        /**
         * @private
         * @member {ParticleAffector[]}
         */
        this._affectors = [];

        /**
         * @private
         * @member {Particle[]}
         */
        this._particles = [];

        /**
         * @private
         * @member {Particle[]}
         */
        this._graveyard = [];

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
         * @type {Uint32Array}
         */
        this._texCoordData = new Uint32Array(4);

        /**
         * @private
         * @member {Boolean}
         */
        this._updateTexCoords = true;

        if (texture !== undefined) {
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
     * @readonly
     * @member {Uint32Array}
     */
    get texCoordData() {
        if (this._updateTexCoords) {
            const { width, height } = this._texture,
                { left, top, right, bottom } = this._textureFrame,
                minX = ((left / width) * 65535 & 65535),
                minY = ((top / height) * 65535 & 65535) << 16,
                maxX = ((right / width) * 65535 & 65535),
                maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._texCoordData[0] = (maxY | minX);
                this._texCoordData[1] = (maxY | maxX);
                this._texCoordData[2] = (minY | maxX);
                this._texCoordData[3] = (minY | minX);
            } else {
                this._texCoordData[0] = (minY | minX);
                this._texCoordData[1] = (minY | maxX);
                this._texCoordData[2] = (maxY | maxX);
                this._texCoordData[3] = (maxY | minX);
            }

            this._updateTexCoords = false;
        }

        return this._texCoordData;
    }

    /**
     * @public
     * @readonly
     * @member {ParticleEmitter[]}
     */
    get emitters() {
        return this._emitters;
    }

    /**
     * @public
     * @readonly
     * @member {ParticleAffector[]}
     */
    get affectors() {
        return this._affectors;
    }

    /**
     * @public
     * @readonly
     * @member {Particle[]}
     */
    get particles() {
        return this._particles;
    }

    /**
     * @public
     * @readonly
     * @member {Particle[]}
     */
    get graveyard() {
        return this._graveyard;
    }

    /**
     * @public
     * @chainable
     * @param {Texture} texture
     * @returns {ParticleSystem}
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
     * @returns {ParticleSystem}
     */
    setTextureFrame(frame) {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;

        this.localBounds.set(0, 0, frame.width, frame.height);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ParticleSystem}
     */
    resetTextureFrame() {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    /**
     * @public
     * @chainable
     * @param {ParticleEmitter} emitter
     * @returns {ParticleSystem}
     */
    addEmitter(emitter) {
        this._emitters.push(emitter);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ParticleSystem}
     */
    clearEmitters() {
        for (const emitter of this._emitters) {
            emitter.destroy();
        }

        this._emitters.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {ParticleAffector} affector
     * @returns {ParticleSystem}
     */
    addAffector(affector) {
        this._affectors.push(affector);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ParticleSystem}
     */
    clearAffectors() {
        for (const affector of this._affectors) {
            affector.destroy();
        }

        this._affectors.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Particle}
     */
    requestParticle() {
        return this._graveyard.pop() || new Particle();
    }

    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @returns {ParticleSystem}
     */
    emitParticle(particle) {
        this._particles.push(particle);

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @param {Time} delta
     * @returns {ParticleSystem}
     */
    updateParticle(particle, delta) {
        const seconds = delta.seconds;

        particle.elapsedLifetime.add(delta);

        particle.position.add(seconds * particle.velocity.x, seconds * particle.velocity.y);
        particle.rotation += (seconds * particle.rotationSpeed);

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {ParticleSystem}
     */
    clearParticles() {
        for (const particle of this._particles) {
            particle.destroy();
        }

        for (const particle of this._graveyard) {
            particle.destroy();
        }

        this._particles.length = 0;
        this._graveyard.length = 0;

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Time} delta
     * @returns {ParticleSystem}
     */
    update(delta) {
        const emitters = this._emitters,
            affectors = this._affectors,
            particles = this._particles,
            graveyard = this._graveyard;

        for (const emitter of emitters) {
            emitter.apply(this, delta);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            this.updateParticle(particles[i], delta);

            if (particles[i].expired) {
                graveyard.push(particles.splice(i, 1)[0]);

                continue;
            }

            for (const affector of affectors) {
                affector.apply(particles[i], delta);
            }
        }

        return this;
    }

    /**
     * @override
     */
    render(renderManager) {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer('particle');

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this.clearEmitters();
        this.clearAffectors();
        this.clearParticles();

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._emitters = null;
        this._affectors = null;
        this._particles = null;
        this._graveyard = null;
        this._texture = null;
        this._texCoordData = null;
        this._blendMode = null;
        this._emissionRate = null;
        this._emissionDelta = null;
        this._updateTexCoords = null;
    }
}
