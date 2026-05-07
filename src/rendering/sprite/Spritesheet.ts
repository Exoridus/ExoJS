import type { Texture } from '../texture/Texture';
import { Rectangle } from '@/math/Rectangle';
import { Sprite } from './Sprite';

/** A single frame entry in a {@link SpritesheetData} descriptor. */
export interface SpritesheetFrame {
    frame: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}

/**
 * JSON-compatible descriptor that drives {@link Spritesheet.parse}.
 * Matches the Aseprite / TexturePacker output format (subset).
 */
export interface SpritesheetData {
    frames: { [name: string]: SpritesheetFrame };
    animations?: { [name: string]: Array<string> };
}

/**
 * Slices a single {@link Texture} into named frames and optional named
 * animation sequences.
 *
 * Each frame is stored as both a {@link Rectangle} (the pixel region) and a
 * pre-configured {@link Sprite} ready for direct rendering. Animations are
 * ordered lists of frame names that {@link AnimatedSprite.fromSpritesheet}
 * consumes to create playback clips.
 */
export class Spritesheet {
    public readonly texture: Texture;
    public readonly frames = new Map<string, Rectangle>();
    public readonly sprites = new Map<string, Sprite>();
    public readonly animations = new Map<string, ReadonlyArray<string>>();

    public constructor(texture: Texture, data: SpritesheetData) {
        this.texture = texture;

        this.parse(data);
    }

    /**
     * Parse a {@link SpritesheetData} descriptor, populating `frames`,
     * `sprites`, and `animations`. When `keepFrames` is `false` (default),
     * all existing frames and sprites are destroyed before parsing.
     */
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

    /** Register a single frame by name, creating its {@link Rectangle} and pre-configured {@link Sprite}. */
    public addFrame(name: string, data: SpritesheetFrame): void {
        const { x, y, w, h } = data.frame;
        const frame = new Rectangle(x, y, w, h);
        const sprite = new Sprite(this.texture);

        sprite.setTextureFrame(frame);

        this.frames.set(name, frame);
        this.sprites.set(name, sprite);
    }

    /** Register an animation sequence as an ordered list of frame names. All referenced frames must already exist. */
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

    /** Return the {@link Rectangle} for the named frame. Throws if the frame does not exist. */
    public getFrame(name: string): Rectangle {
        const frame = this.frames.get(name);

        if (!frame) {
            throw new Error(`Spritesheet frame named ${name} is not available!`);
        }

        return frame;
    }

    /** Return the ordered frame-name list for the named animation. Throws if the animation does not exist. */
    public getAnimationFrameNames(name: string): ReadonlyArray<string> {
        const frames = this.animations.get(name);

        if (!frames) {
            throw new Error(`Spritesheet animation named ${name} is not available!`);
        }

        return frames;
    }

    /** Return the pre-configured {@link Sprite} for the named frame. Throws if the frame does not exist. */
    public getFrameSprite(name: string): Sprite {
        const sprite = this.sprites.get(name);

        if (!sprite) {
            throw new Error(`Spritesheet frame named ${name} is not available!`);
        }

        return sprite;
    }

    /** Destroy all registered frames, sprites, and animations, resetting the spritesheet to an empty state. */
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
