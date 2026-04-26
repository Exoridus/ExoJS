import { Signal } from '@/core/Signal';
import type { Time } from '@/core/Time';
import type { Rectangle } from '@/math/Rectangle';
import { Sprite } from './Sprite';
import type { Spritesheet } from './Spritesheet';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';

export interface AnimatedSpriteClipDefinition {
    readonly frames: ReadonlyArray<Rectangle>;
    readonly fps?: number;
    readonly loop?: boolean;
}

export interface AnimatedSpritePlayOptions {
    loop?: boolean;
    restart?: boolean;
}

interface NormalizedAnimatedSpriteClip {
    readonly frames: ReadonlyArray<Rectangle>;
    readonly frameDurationMs: number;
    readonly loop: boolean;
}

const defaultClipFps = 12;

export class AnimatedSprite extends Sprite {

    private readonly _clips = new Map<string, NormalizedAnimatedSpriteClip>();
    private _currentClipName: string | null = null;
    private _currentFrameIndex = 0;
    private _playing = false;
    private _loopOverride: boolean | null = null;
    private _elapsedFrameTimeMs = 0;

    public readonly onComplete = new Signal<[clip: string]>();
    public readonly onFrame = new Signal<[clip: string, frame: number]>();

    public constructor(texture: Texture | RenderTexture | null, clips?: Readonly<Record<string, AnimatedSpriteClipDefinition>>) {
        super(texture);

        if (clips) {
            this.setClips(clips);
        }
    }

    public get currentClip(): string | null {
        return this._currentClipName;
    }

    public get currentFrame(): number {
        return this._currentFrameIndex;
    }

    public get playing(): boolean {
        return this._playing;
    }

    public get loop(): boolean {
        if (this._loopOverride !== null) {
            return this._loopOverride;
        }

        if (!this._currentClipName) {
            return false;
        }

        return this._clips.get(this._currentClipName)?.loop ?? false;
    }

    public set loop(loop: boolean) {
        this._loopOverride = loop;
    }

    public setClips(clips: Readonly<Record<string, AnimatedSpriteClipDefinition>>): this {
        this._clips.clear();

        for (const [name, clip] of Object.entries(clips)) {
            this.defineClip(name, clip);
        }

        return this;
    }

    public defineClip(name: string, clip: AnimatedSpriteClipDefinition): this {
        if (name.trim().length === 0) {
            throw new Error('AnimatedSprite clip names must be non-empty strings.');
        }

        if (!Array.isArray(clip.frames) || clip.frames.length === 0) {
            throw new Error(`AnimatedSprite clip "${name}" must define at least one frame.`);
        }

        const fps = clip.fps ?? defaultClipFps;

        if (!Number.isFinite(fps) || fps <= 0) {
            throw new Error(`AnimatedSprite clip "${name}" has an invalid fps value (${fps}).`);
        }

        this._clips.set(name, {
            frames: clip.frames.map(frame => frame.clone()),
            frameDurationMs: 1000 / fps,
            loop: clip.loop ?? true,
        });

        return this;
    }

    public removeClip(name: string): this {
        if (this._currentClipName === name) {
            this.stop();
        }

        this._clips.delete(name);

        return this;
    }

    public play(name: string, options: AnimatedSpritePlayOptions = {}): this {
        const clip = this._clips.get(name);

        if (!clip) {
            throw new Error(`AnimatedSprite clip "${name}" is not defined.`);
        }

        const isSameClip = this._currentClipName === name;
        const shouldRestart = options.restart ?? true;

        if (!isSameClip || shouldRestart) {
            this._currentClipName = name;
            this._currentFrameIndex = 0;
            this._elapsedFrameTimeMs = 0;
            this._applyFrame(clip.frames[0]);
            this.onFrame.dispatch(name, 0);
        }

        this._loopOverride = options.loop ?? this._loopOverride;
        this._playing = true;

        return this;
    }

    public stop(): this {
        this._playing = false;
        this._elapsedFrameTimeMs = 0;

        if (!this._currentClipName) {
            return this;
        }

        const clip = this._clips.get(this._currentClipName);

        if (clip && clip.frames.length > 0) {
            this._currentFrameIndex = 0;
            this._applyFrame(clip.frames[0]);
            this.onFrame.dispatch(this._currentClipName, 0);
        }

        return this;
    }

    public pause(): this {
        this._playing = false;

        return this;
    }

    public resume(): this {
        if (this._currentClipName !== null) {
            this._playing = true;
        }

        return this;
    }

    public update(delta: Time | number): this {
        if (!this._playing || this._currentClipName === null) {
            return this;
        }

        const clip = this._clips.get(this._currentClipName);

        if (!clip || clip.frames.length <= 1) {
            return this;
        }

        const deltaMs = typeof delta === 'number' ? delta : delta.milliseconds;

        if (deltaMs <= 0) {
            return this;
        }

        this._elapsedFrameTimeMs += deltaMs;

        while (this._elapsedFrameTimeMs >= clip.frameDurationMs) {
            this._elapsedFrameTimeMs -= clip.frameDurationMs;

            const nextFrame = this._currentFrameIndex + 1;

            if (nextFrame >= clip.frames.length) {
                if (this.loop) {
                    this._currentFrameIndex = 0;
                    this._applyFrame(clip.frames[0]);
                    this.onFrame.dispatch(this._currentClipName, 0);
                    continue;
                }

                this._currentFrameIndex = clip.frames.length - 1;
                this._applyFrame(clip.frames[this._currentFrameIndex]);
                this._playing = false;
                this.onComplete.dispatch(this._currentClipName);

                break;
            }

            this._currentFrameIndex = nextFrame;
            this._applyFrame(clip.frames[this._currentFrameIndex]);
            this.onFrame.dispatch(this._currentClipName, this._currentFrameIndex);
        }

        return this;
    }

    public override destroy(): void {
        super.destroy();

        this.onComplete.destroy();
        this.onFrame.destroy();

        for (const clip of this._clips.values()) {
            for (const frame of clip.frames) {
                frame.destroy();
            }
        }

        this._clips.clear();
    }

    public static fromSpritesheet(spritesheet: Spritesheet): AnimatedSprite {
        const clips: Record<string, AnimatedSpriteClipDefinition> = {};

        for (const [clipName, frameNames] of spritesheet.animations) {
            clips[clipName] = {
                frames: frameNames.map(frameName => spritesheet.getFrame(frameName)),
                loop: true,
            };
        }

        return new AnimatedSprite(spritesheet.texture, clips);
    }

    private _applyFrame(frame: Rectangle): void {
        this.setTextureFrame(frame, false);
    }
}
