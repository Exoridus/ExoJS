import { Particle } from './Particle';
import { Rectangle } from 'math/Rectangle';
import type { Time } from 'core/Time';
import { Container } from 'rendering/Container';
import type { Texture } from 'rendering/texture/Texture';
import type { ParticleEmitterInterface } from "particles/emitters/ParticleEmitterInterface";
import type { ParticleAffectorInterface } from "particles/affectors/ParticleAffectorInterface";
import type { RenderManager } from 'rendering/RenderManager';
import type { ParticleRenderer } from './ParticleRenderer';
import { RendererType } from "rendering/RendererInterface";

export class ParticleSystem extends Container {

    private _emitters: Array<ParticleEmitterInterface> = [];
    private _affectors: Array<ParticleAffectorInterface> = [];
    private _particles: Array<Particle> = [];
    private _graveyard: Array<Particle> = [];
    private _texture: Texture;
    private _textureFrame: Rectangle = new Rectangle();
    private _vertices: Float32Array = new Float32Array(4);
    private _texCoords: Uint32Array = new Uint32Array(4);
    private _updateTexCoords = true;
    private _updateVertices = true;

    constructor(texture: Texture) {
        super();

        this._texture = texture;
        this.resetTextureFrame();
    }

    get texture(): Texture {
        return this._texture;
    }

    set texture(texture: Texture) {
        this.setTexture(texture);
    }

    get textureFrame(): Rectangle {
        return this._textureFrame;
    }

    set textureFrame(frame: Rectangle) {
        this.setTextureFrame(frame);
    }

    get vertices(): Float32Array  {
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

    get texCoords(): Uint32Array {
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

    get emitters(): Array<ParticleEmitterInterface> {
        return this._emitters;
    }

    get affectors(): Array<ParticleAffectorInterface> {
        return this._affectors;
    }

    get particles(): Array<Particle> {
        return this._particles;
    }

    get graveyard(): Array<Particle> {
        return this._graveyard;
    }

    setTexture(texture: Texture): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

        return this;
    }

    setTextureFrame(frame: Rectangle): this {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;
        this._updateVertices = true;

        this.localBounds.set(0, 0, frame.width, frame.height);

        return this;
    }

    resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    addEmitter(emitter: ParticleEmitterInterface): this {
        this._emitters.push(emitter);

        return this;
    }

    clearEmitters(): this {
        for (const emitter of this._emitters) {
            emitter.destroy();
        }

        this._emitters.length = 0;

        return this;
    }

    addAffector(affector: ParticleAffectorInterface): this {
        this._affectors.push(affector);

        return this;
    }

    clearAffectors(): this {
        for (const affector of this._affectors) {
            affector.destroy();
        }

        this._affectors.length = 0;

        return this;
    }

    requestParticle(): Particle {
        return this._graveyard.pop() || new Particle();
    }

    emitParticle(particle: Particle): this {
        this._particles.push(particle);

        return this;
    }

    updateParticle(particle: Particle, delta: Time): this {
        const seconds = delta.seconds;

        particle.elapsedLifetime.addTime(delta);

        particle.position.add(seconds * particle.velocity.x, seconds * particle.velocity.y);
        particle.rotation += (seconds * particle.rotationSpeed);

        return this;
    }

    clearParticles(): this {
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

    update(delta: Time): this {
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

    render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer(RendererType.Particle) as ParticleRenderer;

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    destroy(): void {
        super.destroy();

        this.clearEmitters();
        this.clearAffectors();
        this.clearParticles();

        this._textureFrame.destroy();
    }
}
