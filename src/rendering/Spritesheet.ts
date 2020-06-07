import type { Texture } from './texture/Texture';
import { Rectangle } from 'math/Rectangle';
import { Sprite } from './sprite/Sprite';

export interface ISpritesheetFrame {
    frame: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}

export interface ISpritesheetData {
    frames: { [name: string]: ISpritesheetFrame };
}

export class Spritesheet {
    public readonly texture: Texture;
    public readonly frames = new Map<string, Rectangle>();
    public readonly sprites = new Map<string, Sprite>();

    public constructor(texture: Texture, data: ISpritesheetData) {
        this.texture = texture;

        this.parse(data);
    }

    public parse(data: ISpritesheetData, keepFrames = false): void {
        if (!keepFrames) {
            this.clear();
        }

        for (const [name, frame] of Object.entries(data.frames)) {
            this.addFrame(name, frame);
        }
    }

    public addFrame(name: string, data: ISpritesheetFrame): void {
        const { x, y, w, h } = data.frame;
        const frame = new Rectangle(x, y, w, h);
        const sprite = new Sprite(this.texture);

        sprite.setTextureFrame(frame);

        this.frames.set(name, frame);
        this.sprites.set(name, sprite);
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

        return this;
    }

    public destroy(): void {
        this.clear();
    }
}
