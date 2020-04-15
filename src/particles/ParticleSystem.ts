import { Particle } from './Particle';
import { Rectangle } from '../math/Rectangle';
import { Time } from '../core/Time';
import { Container } from '../rendering/Container';
import { Texture } from '../rendering/texture/Texture';
import { IParticleEmitter } from "./emitters/IParticleEmitter";
import { IParticleAffector } from "./affectors/IParticleAffector";
import { RenderManager } from '../rendering/RenderManager';
import { ParticleRenderer } from './ParticleRenderer';
import { RendererType } from "../rendering/IRenderer";

export class ParticleSystem extends Container {

    private _emitters: Array<IParticleEmitter> = [];
    private _affectors: Array<IParticleAffector> = [];
    private _particles: Array<Particle> = [];
    private _graveyard: Array<Particle> = [];
    private _texture: Texture;
    private _textureFrame: Rectangle = new Rectangle();
    private _texCoordData: Uint32Array = new Uint32Array(4);
    private _updateTexCoords = true;

    constructor(texture: Texture) {
        super();

        this._texture = texture;
        this.resetTextureFrame();
    }

    get texture() {
        return this._texture;
    }

    set texture(texture) {
        this.setTexture(texture);
    }

    get textureFrame() {
        return this._textureFrame;
    }

    set textureFrame(frame) {
        this.setTextureFrame(frame);
    }

    get texCoordData() {
        if (this._updateTexCoords) {
            const { width, height } = this._texture;
            const { left, top, right, bottom } = this._textureFrame;
            const minX = ((left / width) * 65535 & 65535);
            const minY = ((top / height) * 65535 & 65535) << 16;
            const maxX = ((right / width) * 65535 & 65535);
            const maxY = ((bottom / height) * 65535 & 65535) << 16;

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

    get emitters() {
        return this._emitters;
    }

    get affectors() {
        return this._affectors;
    }

    get particles() {
        return this._particles;
    }

    get graveyard() {
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

        this.localBounds.set(0, 0, frame.width, frame.height);

        return this;
    }

    resetTextureFrame(): this {
        return this.setTextureFrame(Rectangle.Temp.set(0, 0, this._texture.width, this._texture.height));
    }

    addEmitter(emitter: IParticleEmitter): this {
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

    addAffector(affector: IParticleAffector): this {
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