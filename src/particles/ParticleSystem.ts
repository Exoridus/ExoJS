import { Particle } from './Particle';
import { Rectangle } from 'math/Rectangle';
import type { Time } from 'core/Time';
import { Container } from 'rendering/Container';
import type { Texture } from 'rendering/texture/Texture';
import type { IParticleEmitter } from 'particles/emitters/IParticleEmitter';
import type { IParticleAffector } from 'particles/affectors/IParticleAffector';
import type { RenderManager } from 'rendering/RenderManager';
import type { ParticleRenderer } from './ParticleRenderer';
import { RendererType } from 'rendering/IRenderer';

export class ParticleSystem extends Container {

    private _emitters: Array<IParticleEmitter> = [];
    private _affectors: Array<IParticleAffector> = [];
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

    public get emitters(): Array<IParticleEmitter> {
        return this._emitters;
    }

    public get affectors(): Array<IParticleAffector> {
        return this._affectors;
    }

    public get particles(): Array<Particle> {
        return this._particles;
    }

    public get graveyard(): Array<Particle> {
        return this._graveyard;
    }

    public setTexture(texture: Texture): this {
        if (this._texture !== texture) {
            this._texture = texture;
            this.resetTextureFrame();
        }

        return this;
    }

    public setTextureFrame(frame: Rectangle): this {
        this._textureFrame.copy(frame);
        this._updateTexCoords = true;
        this._updateVertices = true;

        this.localBounds.set(0, 0, frame.width, frame.height);

        return this;
    }

    public resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.temp.set(0, 0, this._texture.width, this._texture.height));
    }

    public addEmitter(emitter: IParticleEmitter): this {
        this._emitters.push(emitter);

        return this;
    }

    public clearEmitters(): this {
        for (const emitter of this._emitters) {
            emitter.destroy();
        }

        this._emitters.length = 0;

        return this;
    }

    public addAffector(affector: IParticleAffector): this {
        this._affectors.push(affector);

        return this;
    }

    public clearAffectors(): this {
        for (const affector of this._affectors) {
            affector.destroy();
        }

        this._affectors.length = 0;

        return this;
    }

    public requestParticle(): Particle {
        return this._graveyard.pop() || new Particle();
    }

    public emitParticle(particle: Particle): this {
        this._particles.push(particle);

        return this;
    }

    public updateParticle(particle: Particle, delta: Time): this {
        const seconds = delta.seconds;

        particle.elapsedLifetime.addTime(delta);

        particle.position.add(seconds * particle.velocity.x, seconds * particle.velocity.y);
        particle.rotation += (seconds * particle.rotationSpeed);

        return this;
    }

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

    public render(renderManager: RenderManager): this {
        if (this.visible && this.inView(renderManager.view)) {
            const renderer = renderManager.getRenderer(RendererType.particle) as ParticleRenderer;

            renderManager.setRenderer(renderer);
            renderer.render(this);
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this.clearEmitters();
        this.clearAffectors();
        this.clearParticles();

        this._textureFrame.destroy();
    }
}
