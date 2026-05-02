import { clamp } from '@/math/utils';
import { Sprite } from '../sprite/Sprite';
import { Texture } from '../texture/Texture';
import { Signal } from '@/core/Signal';
import type { PlaybackOptions } from '@/core/types';
import type { RenderBackend } from '../RenderBackend';
import type { SamplerOptions } from '../texture/Sampler';
import type { Media } from '@/audio/Media';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from '@/audio/audio-context';
import { Rectangle } from '@/math/Rectangle';

interface VideoAudioSetup {
    readonly audioContext: AudioContext;
    readonly gainNode: GainNode;
    readonly sourceNode: MediaElementAudioSourceNode;
}

type FrameCallbackVideoElement = HTMLVideoElement & Partial<{
    requestVideoFrameCallback: (callback: (now: number, metadata: unknown) => void) => number;
    cancelVideoFrameCallback: (handle: number) => void;
}>;

export class Video extends Sprite implements Media {

    public readonly onStart = new Signal();
    public readonly onStop = new Signal();

    private readonly _videoElement: HTMLVideoElement;
    private readonly _duration: number;
    private _volume = 1;
    private _playbackRate = 1;
    private _loop = false;
    private _muted = false;
    private _audioSetup: VideoAudioSetup | null = null;
    private _textureDirty = true;
    private _lastVideoTime = Number.NaN;
    private _videoFrameCallbackHandle: number | null = null;
    private readonly _onMetadataHandler: () => void;
    private readonly _onResizeHandler: () => void;
    private readonly _onVideoFrameHandler: (now: number, metadata: unknown) => void;

    public constructor(videoElement: HTMLVideoElement, playbackOptions?: Partial<PlaybackOptions>, samplerOptions?: Partial<SamplerOptions>) {
        super(new Texture(videoElement, samplerOptions));

        const { duration, volume, playbackRate, loop, muted } = videoElement;

        this._videoElement = videoElement;
        this._duration = duration;
        this._volume = volume;
        this._playbackRate = playbackRate;
        this._loop = loop;
        this._muted = muted;
        this._onMetadataHandler = this._onVideoMetadataUpdated.bind(this);
        this._onResizeHandler = this._onVideoMetadataUpdated.bind(this);
        this._onVideoFrameHandler = this._onVideoFrame.bind(this);

        if (this._videoElement.videoWidth === 0 || this._videoElement.videoHeight === 0) {
            this._videoElement.addEventListener('loadedmetadata', this._onMetadataHandler);
            this._videoElement.addEventListener('resize', this._onResizeHandler);
        }

        if (playbackOptions) {
            this.applyOptions(playbackOptions);
        }

        if (isAudioContextReady()) {
            this.setupWithAudioContext(getAudioContext());
        } else {
            onAudioContextReady.once(this.setupWithAudioContext, this);
        }

        // Initialize frame bounds early when metadata is already available.
        this.updateTexture();
        this._requestVideoFrameCallback();
    }

    public get videoElement(): HTMLVideoElement {
        return this._videoElement;
    }

    public get duration(): number {
        return this._duration;
    }

    public get progress(): number {
        const elapsed = this.currentTime,
            duration = this.duration;

        return ((elapsed % duration) / duration);
    }

    public get volume(): number {
        return this._volume;
    }

    public set volume(value) {
        this.setVolume(value);
    }

    public get loop(): boolean {
        return this._loop;
    }

    public set loop(loop: boolean) {
        this.setLoop(loop);
    }

    public get playbackRate(): number {
        return this._playbackRate;
    }

    public set playbackRate(value) {
        this.setPlaybackRate(value);
    }

    public get currentTime(): number {
        return this.getTime();
    }

    public set currentTime(time) {
        this.setTime(time);
    }

    public get muted(): boolean {
        return this._muted;
    }

    public set muted(muted: boolean) {
        this.setMuted(muted);
    }

    public get paused(): boolean {
        return this._videoElement.paused;
    }

    public set paused(paused) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    public get playing(): boolean {
        return !this.paused;
    }

    public set playing(playing) {
        if (playing) {
            this.play();
        } else {
            this.pause();
        }
    }

    public get analyserTarget(): AudioNode | null {
        return this._audioSetup?.gainNode ?? null;
    }

    public play(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._videoElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    public pause(options?: Partial<PlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._videoElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    public stop(options?: Partial<PlaybackOptions>): this {
        this.pause(options);
        this.currentTime = 0;

        return this;
    }

    public toggle(options?: Partial<PlaybackOptions>): this {
        return this.paused ? this.play(options) : this.pause(options);
    }

    public applyOptions(options: Partial<PlaybackOptions> = {}): this {
        const { volume, loop, playbackRate, time, muted } = options;

        if (volume !== undefined) {
            this.volume = volume;
        }

        if (loop !== undefined) {
            this.loop = loop;
        }

        if (playbackRate !== undefined) {
            this.playbackRate = playbackRate;
        }

        if (time !== undefined) {
            this.currentTime = time;
        }

        if (muted !== undefined) {
            this.muted = muted;
        }

        return this;
    }

    public setVolume(value: number): this {
        const volume = clamp(value, 0, 2);

        if (this._volume === volume) {
            return this;
        }

        this._volume = volume;

        if (this._audioSetup) {
            const { gainNode, audioContext } = this._audioSetup;
            gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, audioContext.currentTime, 0.01);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        if (this._loop !== loop) {
            this._loop = loop;
            this._videoElement.loop = loop;
        }

        return this;
    }

    public setPlaybackRate(value: number): this {
        const playbackRate = clamp(value, 0.1, 20);

        if (this._playbackRate !== playbackRate) {
            this._playbackRate = playbackRate;
            this._videoElement.playbackRate = playbackRate;
        }

        return this;
    }

    public getTime(): number {
        return this._videoElement.currentTime;
    }

    public setTime(time: number): this {
        this._videoElement.currentTime = Math.max(0, time);

        return this;
    }

    public setMuted(muted: boolean): this {
        if (this._muted !== muted) {
            this._muted = muted;

            if (this._audioSetup) {
                const { gainNode, audioContext } = this._audioSetup;
                gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, audioContext.currentTime, 0.01);
            }
        }

        return this;
    }


    public override render(backend: RenderBackend): this {
        if (this.visible) {
            this._markTextureDirtyIfPlaybackAdvanced();
            this.updateTexture();
            super.render(backend);
        }

        return this;
    }

    public override updateTexture(): this {
        const texture = this.texture;

        if (!texture || !this._videoElement) {
            return this;
        }

        if (this._videoElement.videoWidth === 0 || this._videoElement.videoHeight === 0) {
            return this;
        }

        if (!this._textureDirty) {
            return this;
        }

        const preserveSize = this.textureFrame.width > 0 && this.textureFrame.height > 0;

        texture.updateSource();

        if (texture.width > 0 && texture.height > 0) {
            this.setTextureFrame(
                Rectangle.temp.set(0, 0, texture.width, texture.height),
                !preserveSize
            );
        }

        this._textureDirty = false;

        return this;
    }

    public override destroy(): void {
        super.destroy();
        this.stop();
        this._videoElement.removeEventListener('loadedmetadata', this._onMetadataHandler);
        this._videoElement.removeEventListener('resize', this._onResizeHandler);
        this._cancelVideoFrameCallback();

        onAudioContextReady.clearByContext(this);

        if (this._audioSetup) {
            this._audioSetup.sourceNode.disconnect();
            this._audioSetup.gainNode.disconnect();
            this._audioSetup = null;
        }

        this.onStart.destroy();
        this.onStop.destroy();
    }

    private _onVideoMetadataUpdated(): void {
        this._textureDirty = true;
        this.updateTexture();
    }

    private _onVideoFrame(_now: number, _metadata: unknown): void {
        this._videoFrameCallbackHandle = null;
        this._textureDirty = true;
        this._requestVideoFrameCallback();
    }

    private _markTextureDirtyIfPlaybackAdvanced(): void {
        const currentTime = this._videoElement.currentTime;

        if (this._lastVideoTime !== currentTime) {
            this._lastVideoTime = currentTime;
            this._textureDirty = true;
        }
    }

    private _requestVideoFrameCallback(): void {
        const frameCallbackVideo = this._videoElement as FrameCallbackVideoElement;

        if (!frameCallbackVideo.requestVideoFrameCallback || this._videoFrameCallbackHandle !== null) {
            return;
        }

        this._videoFrameCallbackHandle = frameCallbackVideo.requestVideoFrameCallback(this._onVideoFrameHandler);
    }

    private _cancelVideoFrameCallback(): void {
        const frameCallbackVideo = this._videoElement as FrameCallbackVideoElement;

        if (!frameCallbackVideo.cancelVideoFrameCallback || this._videoFrameCallbackHandle === null) {
            return;
        }

        frameCallbackVideo.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
        this._videoFrameCallbackHandle = null;
    }

    private setupWithAudioContext(audioContext: AudioContext): void {
        const gainNode = audioContext.createGain();
        gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);
        gainNode.connect(audioContext.destination);

        const sourceNode = audioContext.createMediaElementSource(this._videoElement);
        sourceNode.connect(gainNode);

        this._audioSetup = { audioContext, gainNode, sourceNode };
    }
}
