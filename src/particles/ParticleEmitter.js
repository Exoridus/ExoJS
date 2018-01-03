import { TIME } from '../const/core';
import Drawable from '../rendering/Drawable';
import Particle from './Particle';
import Rectangle from '../math/Rectangle';
import Time from '../core/time/Time';
import Vector from '../math/Vector';
import Color from '../core/Color';

/**
 * @class ParticleEmitter
 * @extends Drawable
 */
export default class ParticleEmitter extends Drawable {

    /**
     * @constructor
     * @param {Texture} texture
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
    constructor(texture, { totalLifetime, elapsedLifetime, position, velocity, scale, rotation, rotationSpeed, tint } = {}) {
        super();

        /**
         * @private
         * @member {Time}
         */
        this._particleTotalLifetime = (totalLifetime && totalLifetime.clone()) || new Time(1, TIME.SECONDS);

        /**
         * @private
         * @member {Time}
         */
        this._particleElapsedLifetime = (elapsedLifetime && elapsedLifetime.clone()) || new Time(0, TIME.SECONDS);

        /**
         * @private
         * @member {Vector}
         */
        this._particlePosition = (position && position.clone()) || new Vector(0, 0);

        /**
         * @private
         * @member {Vector}
         */
        this._particleVelocity = (velocity && velocity.clone()) || new Vector(0, 0);

        /**
         * @private
         * @member {Vector}
         */
        this._particleScale = (scale && scale.clone()) || new Vector(1, 1);

        /**
         * @private
         * @member {Number}
         */
        this._particleRotation = rotation || 0;

        /**
         * @private
         * @member {Number}
         */
        this._particleRotationSpeed = rotationSpeed || 0;

        /**
         * @private
         * @member {Color}
         */
        this._particleTint = (tint && tint.clone()) || new Color(255, 255, 255);

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
         * @member {ParticleModifier[]}
         */
        this._modifiers = [];

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

        if (texture) {
            this.setTexture(texture);
        }
    }

    /**
     * @public
     * @member {Time}
     */
    get particleTotalLifetime() {
        return this._particleTotalLifetime;
    }

    set particleTotalLifetime(time) {
        this._particleTotalLifetime.copy(time);
    }

    /**
     * @public
     * @member {Time}
     */
    get particleElapsedLifetime() {
        return this._particleElapsedLifetime;
    }

    set particleElapsedLifetime(time) {
        this._particleElapsedLifetime.copy(time);
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
     * @member {Number}
     */
    get particleRotation() {
        return this._particleRotation;
    }

    set particleRotation(degrees) {
        const rotation = degrees % 360;

        this._particleRotation = rotation < 0 ? rotation + 360 : rotation;
    }

    /**
     * @public
     * @member {Number}
     */
    get particleRotationSpeed() {
        return this._particleRotationSpeed;
    }

    set particleRotationSpeed(rotationSpeed) {
        this._particleRotationSpeed = rotationSpeed;
    }

    /**
     * @public
     * @member {Color}
     */
    get particleTint() {
        return this._particleTint;
    }

    set particleTint(color) {
        this._particleTint.copy(color);
    }

    /**
     * @public
     * @member {Particle[]}
     */
    get particles() {
        return this._particles;
    }

    set particles(particles) {
        const graveyard = this._graveyard,
            particlesA = this._particles,
            particlesB = particles,
            lenA = particlesA.length,
            lenB = particlesB.length,
            diff = (lenA - lenB);

        for (let i = 0; i < lenA; i++) {
            particlesA[i].copy(particlesB[i]);
        }

        if (diff > 0) {
            for (let i = lenB; i < lenA; i++) {
                graveyard.push(particlesA.pop());
            }
        } else if (diff < 0) {
            for (let i = lenA; i < lenB; i++) {
                const particle = (graveyard.pop() || new Particle());

                particles.push(particle.copy(particlesB[i]));
            }
        }
    }

    /**
     * @public
     * @member {Object}
     */
    get particleOptions() {
        return {
            totalLifetime: this.particleTotalLifetime,
            elapsedLifetime: this.particleElapsedLifetime,
            position: this.particlePosition,
            velocity: this.particleVelocity,
            scale: this.particleScale,
            rotation: this.particleRotation,
            rotationSpeed: this.particleRotationSpeed,
            tint: this.particleTint,
        };
    }

    set particleOptions(options) {
        this.setParticleOptions(options);
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
     * @member {Number}
     */
    get width() {
        return Math.abs(this.scale.x) * this._textureFrame.width;
    }

    set width(value) {
        this.scale.x = value / this._textureFrame.width;
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return Math.abs(this.scale.y) * this._textureFrame.height;
    }

    set height(value) {
        this.scale.y = value / this._textureFrame.height;
    }

    /**
     * @public
     * @chainable
     * @param {Object} [options]
     * @param {Time} [options.totalLifetime]
     * @param {Time} [options.elapsedLifetime]
     * @param {Vector} [options.position]
     * @param {Vector} [options.velocity]
     * @param {Vector} [options.scale]
     * @param {Number} [options.rotation]
     * @param {Number} [options.rotationSpeed]
     * @param {Color} [options.tint]
     * @returns {Drawable}
     */
    setParticleOptions({ totalLifetime, elapsedLifetime, position, velocity, scale, rotation, rotationSpeed, tint } = {}) {
        if (totalLifetime !== undefined) {
            this.particleTotalLifetime = totalLifetime;
        }

        if (elapsedLifetime !== undefined) {
            this.particleElapsedLifetime = elapsedLifetime;
        }

        if (position !== undefined) {
            this.particlePosition = position;
        }

        if (velocity !== undefined) {
            this.particleVelocity = velocity;
        }

        if (scale !== undefined) {
            this.particleScale = scale;
        }

        if (rotation !== undefined) {
            this.particleRotation = rotation;
        }

        if (rotationSpeed !== undefined) {
            this.particleRotationSpeed = rotationSpeed;
        }

        if (tint !== undefined) {
            this.particleTint = tint;
        }

        return this;
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

        this.localBounds.set(0, 0, frame.width, frame.height);

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
    getParticleCount(time) {
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
        const count = this.getParticleCount(delta),
            options = this.particleOptions,
            particles = this._particles,
            graveyard = this._graveyard,
            modifiers = this._modifiers;

        for (let i = 0; i < count; i++) {
            const particle = (graveyard.pop() || new Particle());

            particles.push(particle.copy(options));
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i].update(delta);

            if (particle.expired) {
                graveyard.push(particles.splice(i, 1)[0]);

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
        if (this.visible && this.inView(renderManager.view)) {
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
        this.particleOptions = emitter.particleOptions;
        this.particles = emitter.particles;
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
        const emitter = new ParticleEmitter(this.texture, this.particleOptions);

        emitter.particles = this.particles;
        emitter.textureFrame = this.textureFrame;
        emitter.emissionRate = this.emissionRate;
        emitter.modifiers = this.modifiers;

        return emitter;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        for (const particle of this._particles) {
            particle.destroy();
        }

        for (const particle of this._graveyard) {
            particle.destroy();
        }

        this._particleTotalLifetime.destroy();
        this._particleTotalLifetime = null;

        this._particleElapsedLifetime.destroy();
        this._particleElapsedLifetime = null;

        this._particlePosition.destroy();
        this._particlePosition = null;

        this._particleVelocity.destroy();
        this._particleVelocity = null;

        this._particleScale.destroy();
        this._particleScale = null;

        this._particleTint.destroy();
        this._particleTint = null;

        this._particles.length = 0;
        this._particles = null;

        this._graveyard.length = 0;
        this._graveyard = null;

        this._modifiers.length = 0;
        this._modifiers = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._texture = null;
        this._texCoordData = null;
        this._blendMode = null;
        this._emissionRate = null;
        this._emissionDelta = null;
        this._updateTexCoords = null;
        this._particleRotation = null;
        this._particleRotationSpeed = null;
    }
}
