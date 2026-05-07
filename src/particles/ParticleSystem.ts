import { Particle } from './Particle';
import { Rectangle } from '@/math/Rectangle';
import type { Time } from '@/core/Time';
import { Drawable } from '@/rendering/Drawable';
import type { Texture } from '@/rendering/texture/Texture';
import type { ParticleEmitter } from '@/particles/emitters/ParticleEmitter';
import type { ParticleAffector } from '@/particles/affectors/ParticleAffector';

/**
 * The central coordinator of the particle triad. `ParticleSystem` is a
 * {@link Drawable} that owns a list of {@link ParticleEmitter} spawners, a
 * list of {@link ParticleAffector} mutators, and the live/graveyard particle
 * pools. Each call to {@link ParticleSystem.update} runs all emitters to
 * spawn new particles, advances every live particle's position and lifetime,
 * retires expired ones to the graveyard for pooling, and runs all affectors
 * on the survivors.
 *
 * Rendering reads {@link ParticleSystem.vertices} and
 * {@link ParticleSystem.texCoords} (lazily recomputed on texture-frame
 * changes) plus the live {@link ParticleSystem.particles} array to draw each
 * sprite.
 */
export class ParticleSystem extends Drawable {

    private _emitters: Array<ParticleEmitter> = [];
    private _affectors: Array<ParticleAffector> = [];
    private _particles: Array<Particle> = [];
    private _graveyard: Array<Particle> = [];
    private _texture: Texture;
    private _textureFrame: Rectangle = new Rectangle();
    private _vertices: Float32Array = new Float32Array(4);
    private _texCoords: Uint32Array = new Uint32Array(4);
    private _updateTexCoords = true;
    private _updateVertices = true;

    public constructor(texture: Texture) {
        super();

        this._texture = texture;
        this.resetTextureFrame();
    }

    public get texture(): Texture {
        return this._texture;
    }

    public set texture(texture: Texture) {
        this.setTexture(texture);
    }

    public get textureFrame(): Rectangle {
        return this._textureFrame;
    }

    public set textureFrame(frame: Rectangle) {
        this.setTextureFrame(frame);
    }

    /**
     * Quad corner offsets for the current {@link textureFrame}, in local
     * space as `[minX, minY, maxX, maxY]`. Recomputed lazily whenever
     * `textureFrame` changes. Used by the renderer to position each particle
     * sprite relative to its world position.
     */
    public get vertices(): Float32Array  {
        if (this._updateVertices) {
            const { x, y, width, height } = this._textureFrame;
            const offsetX = (width / 2);
            const offsetY = (height / 2);

            this._vertices[0] = x - offsetX;
            this._vertices[1] = y - offsetY;
            this._vertices[2] = width - offsetX;
            this._vertices[3] = height - offsetY;

            this._updateVertices = false;
        }

        return this._vertices;
    }

    /**
     * Packed UV coordinates for the current {@link textureFrame} as four
     * `Uint32` values, each encoding a `(u, v)` pair in the upper/lower 16
     * bits (normalised to 0–65535). Vertex order respects
     * {@link Texture.flipY}. Recomputed lazily on texture or frame changes.
     */
    public get texCoords(): Uint32Array {
        if (this._updateTexCoords) {
            const { width, height } = this._texture;
            const { left, top, right, bottom } = this._textureFrame;
            const minX = ((left / width) * 65535 & 65535);
            const minY = ((top / height) * 65535 & 65535) << 16;
            const maxX = ((right / width) * 65535 & 65535);
            const maxY = ((bottom / height) * 65535 & 65535) << 16;

            if (this._texture.flipY) {
                this._texCoords[0] = (maxY | minX);
                this._texCoords[1] = (maxY | maxX);
                this._texCoords[2] = (minY | maxX);
                this._texCoords[3] = (minY | minX);
            } else {
                this._texCoords[0] = (minY | minX);
                this._texCoords[1] = (minY | maxX);
                this._texCoords[2] = (maxY | maxX);
                this._texCoords[3] = (maxY | minX);
            }

            this._updateTexCoords = false;
        }

        return this._texCoords;
    }

    public get emitters(): Array<ParticleEmitter> {
        return this._emitters;
    }

    public get affectors(): Array<ParticleAffector> {
        return this._affectors;
    }

    public get particles(): Array<Particle> {
        return this._particles;
    }

    /**
     * Pool of expired {@link Particle} instances waiting to be recycled.
     * {@link requestParticle} pops from this array before allocating a new
     * instance, keeping GC pressure low during sustained emission.
     */
    public get graveyard(): Array<Particle> {
        return this._graveyard;
    }

    /**
     * Replaces the particle sprite texture and resets the texture frame to
     * cover the full new texture. No-ops if `texture` is the same instance.
     */
    public setTexture(texture: Texture): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

        return this;
    }

    /**
     * Sets the sub-rectangle of the texture used as the particle sprite,
     * invalidating cached vertices and UV coordinates and updating the system's
     * local bounds to match the frame dimensions.
     */
    public setTextureFrame(frame: Rectangle): this {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;
        this._updateVertices = true;

        this.localBounds.set(0, 0, frame.width, frame.height);
        this._invalidateBoundsCascade();

        return this;
    }

    /** Resets the texture frame to the full dimensions of the current texture. */
    public resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
    }

    /** Registers `emitter` to be called each tick during {@link update}. */
    public addEmitter(emitter: ParticleEmitter): this {
        this._emitters.push(emitter);

        return this;
    }

    /** Destroys and removes all registered emitters. */
    public clearEmitters(): this {
        for (const emitter of this._emitters) {
            emitter.destroy();
        }

        this._emitters.length = 0;

        return this;
    }

    /** Registers `affector` to run on every live particle each tick during {@link update}. */
    public addAffector(affector: ParticleAffector): this {
        this._affectors.push(affector);

        return this;
    }

    /** Destroys and removes all registered affectors. */
    public clearAffectors(): this {
        for (const affector of this._affectors) {
            affector.destroy();
        }

        this._affectors.length = 0;

        return this;
    }

    /**
     * Returns a recycled particle from the {@link graveyard}, or allocates a
     * new one if the pool is empty. Call {@link Particle.applyOptions}
     * immediately after to reset its state before passing it to
     * {@link emitParticle}.
     */
    public requestParticle(): Particle {
        return this._graveyard.pop() || new Particle();
    }

    /** Adds a fully-configured `particle` to the live pool. Typically called by emitters. */
    public emitParticle(particle: Particle): this {
        this._particles.push(particle);

        return this;
    }

    /**
     * Advances a single particle by one `delta` step: increments
     * `elapsedLifetime`, integrates velocity into position, and applies
     * `rotationSpeed` to rotation. Called for every live particle by
     * {@link update} before the affector pass.
     */
    public updateParticle(particle: Particle, delta: Time): this {
        const seconds = delta.seconds;

        particle.elapsedLifetime.addTime(delta);

        particle.position.add(seconds * particle.velocity.x, seconds * particle.velocity.y);
        particle.rotation += (seconds * particle.rotationSpeed);

        return this;
    }

    /**
     * Destroys and removes all particles from both the live pool and the
     * graveyard. Use when resetting or recycling the entire system.
     */
    public clearParticles(): this {
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
     * Advances the full simulation by one `delta` step: runs all emitters,
     * then for each live particle calls {@link updateParticle}, moves expired
     * ones to the {@link graveyard}, and runs all affectors on survivors.
     * The particle array is iterated in reverse to allow in-place splice
     * without re-indexing.
     */
    public update(delta: Time): this {
        const emitters = this._emitters;
        const affectors = this._affectors;
        const particles = this._particles;
        const graveyard = this._graveyard;
        const len = particles.length;

        for (const emitter of emitters) {
            emitter.apply(this, delta);
        }

        let expireCount = 0;

        for (let i = len - 1; i >= 0; i--) {
            this.updateParticle(particles[i], delta);

            if (particles[i].expired) {
                graveyard.push(particles[i]);
                expireCount++;

                continue;
            }

            if (expireCount > 0) {
                particles.splice(i + 1, expireCount);
                expireCount = 0;
            }

            for (const affector of affectors) {
                affector.apply(particles[i], delta);
            }
        }

        if (expireCount > 0) {
            particles.splice(0, expireCount);
        }

        return this;
    }

    public override destroy(): void {
        super.destroy();

        this.clearEmitters();
        this.clearAffectors();
        this.clearParticles();

        this._textureFrame.destroy();
    }
}
