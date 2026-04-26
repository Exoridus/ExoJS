import type { Texture } from '../texture/Texture';
import { Rectangle } from '@/math/Rectangle';
import { Sprite } from './Sprite';

export interface SpritesheetFrame {
    frame: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}

export interface SpritesheetData {
    frames: { [name: string]: SpritesheetFrame };
    animations?: { [name: string]: Array<string> };
}

export class Spritesheet {
    public readonly texture: Texture;
    public readonly frames = new Map<string, Rectangle>();
    public readonly sprites = new Map<string, Sprite>();
    public readonly animations = new Map<string, ReadonlyArray<string>>();

    public constructor(texture: Texture, data: SpritesheetData) {
        this.texture = texture;

        this.parse(data);
    }

    public parse(data: SpritesheetData, keepFrames = false): void {
        if (!keepFrames) {
            this.clear();
        }

        for (const [name, frame] of Object.entries(data.frames)) {
            this.addFrame(name, frame);
        }

        if (data.animations) {
            for (const [animationName, frameNames] of Object.entries(data.animations)) {
                this.defineAnimation(animationName, frameNames);
            }
        }
    }

    public addFrame(name: string, data: SpritesheetFrame): void {
        const { x, y, w, h } = data.frame;
        const frame = new Rectangle(x, y, w, h);
        const sprite = new Sprite(this.texture);

        sprite.setTextureFrame(frame);

        this.frames.set(name, frame);
        this.sprites.set(name, sprite);
    }

    public defineAnimation(name: string, frameNames: ReadonlyArray<string>): this {
        if (name.trim().length === 0) {
            throw new Error('Spritesheet animation names must be non-empty strings.');
        }

        if (!Array.isArray(frameNames) || frameNames.length === 0) {
            throw new Error(`Spritesheet animation "${name}" must reference at least one frame.`);
        }

        for (const frameName of frameNames) {
            if (!this.frames.has(frameName)) {
                throw new Error(`Spritesheet animation "${name}" references missing frame "${frameName}".`);
            }
        }

        this.animations.set(name, [...frameNames]);

        return this;
    }

    public getFrame(name: string): Rectangle {
        const frame = this.frames.get(name);

        if (!frame) {
            throw new Error(`Spritesheet frame named ${name} is not available!`);
        }

        return frame;
    }

    public getAnimationFrameNames(name: string): ReadonlyArray<string> {
        const frames = this.animations.get(name);

        if (!frames) {
            throw new Error(`Spritesheet animation named ${name} is not available!`);
        }

        return frames;
    }

    public getFrameSprite(name: string): Sprite {
        const sprite = this.sprites.get(name);

        if (!sprite) {
            throw new Error(`Spritesheet frame named ${name} is not available!`);
        }

        return sprite;
    }

    public clear(): this {
        for (const frame of this.frames.values()) {
            frame.destroy();
        }

        this.frames.clear();

        for (const sprite of this.sprites.values()) {
            sprite.destroy();
        }

        this.sprites.clear();
        this.animations.clear();

        return this;
    }

    public destroy(): void {
        this.clear();
    }
}
