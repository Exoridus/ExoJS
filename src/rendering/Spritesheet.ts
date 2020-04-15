import { Texture } from './texture/Texture';
import { Rectangle } from '../math/Rectangle';
import { Sprite } from './sprite/Sprite';

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
}

export class Spritesheet {
    private _texture: Texture;
    private _frames = new Map<string, Rectangle>();
    private _sprites = new Map<string, Sprite>();

    constructor(texture: Texture, data: SpritesheetData) {
        this._texture = texture;

        this.parse(data);
    }

    get texture() {
        return this._texture;
    }

    get frames() {
        return this._frames;
    }

    get sprites() {
        return this._sprites;
    }

    parse(data: SpritesheetData, keepFrames = false) {
        if (!keepFrames) {
            this.clear();
        }

        for (const [name, frame] of Object.entries(data.frames)) {
            this.addFrame(name, frame);
        }

        return this;
    }

    addFrame(name: string, data: SpritesheetFrame) {
        const { x, y, w, h } = data.frame;
        const frame = new Rectangle(x, y, w, h);
        const sprite = new Sprite(this._texture);

        sprite.setTextureFrame(frame);

        this._frames.set(name, frame);
        this._sprites.set(name, sprite);
    }

    clear(): this {
        for (const frame of this._frames.values()) {
            frame.destroy();
        }

        this._frames.clear();

        for (const sprite of this._sprites.values()) {
            sprite.destroy();
        }

        this._sprites.clear();

        return this;
    }

    destroy() {
        this.clear();
    }
}
