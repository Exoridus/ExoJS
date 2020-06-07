import { clamp } from 'utils/math';
import { Sprite } from './sprite/Sprite';
import { Texture } from './texture/Texture';
import { Signal } from 'core/Signal';
import type { IPlaybackOptions } from 'types/types';
import type { RenderManager } from './RenderManager';
import type { ISamplerOptions } from './texture/Sampler';
import type { IMedia } from 'types/IMedia';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from 'utils/audio-context';

export class Video extends Sprite implements IMedia {

    public readonly onStart = new Signal();
    public readonly onStop = new Signal();

    private readonly _videoElement: HTMLVideoElement;
    private readonly _duration: number;
    private _audioContext: AudioContext | null = null;
    private _volume = 1;
    private _playbackRate = 1;
    private _loop = false;
    private _muted = false;
    private _gainNode: GainNode | null = null;
    private _sourceNode: MediaElementAudioSourceNode | null = null;

    public constructor(videoElement: HTMLVideoElement, playbackOptions?: Partial<IPlaybackOptions>, samplerOptions?: Partial<ISamplerOptions>) {
        super(new Texture(videoElement, samplerOptions));

        const { duration, volume, playbackRate, loop, muted } = videoElement;

        this._videoElement = videoElement;
        this._duration = duration;
        this._volume = volume;
        this._playbackRate = playbackRate;
        this._loop = loop;
        this._muted = muted;

        if (playbackOptions) {
            this.applyOptions(playbackOptions);
        }

        if (isAudioContextReady()) {
            this.setupWithAudioContext(getAudioContext());
        } else {
            onAudioContextReady.once(this.setupWithAudioContext, this);
        }
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
        return this._gainNode;
    }

    public play(options?: Partial<IPlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._videoElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    public pause(options?: Partial<IPlaybackOptions>): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._videoElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    public stop(options?: Partial<IPlaybackOptions>): this {
        this.pause(options);
        this.currentTime = 0;

        return this;
    }

    public toggle(options?: Partial<IPlaybackOptions>): this {
        return this.paused ? this.play(options) : this.pause(options);
    }

    public applyOptions(options: Partial<IPlaybackOptions> = {}): this {
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

        if (this._gainNode) {
            this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, this._audioContext!.currentTime, 10);
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

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, this._audioContext!.currentTime, 10);
            }
        }

        return this;
    }


    public render(renderManager: RenderManager): this {
        this.texture!.updateSource();
        super.render(renderManager);

        return this;
    }

    public destroy(): void {
        super.destroy();
        this.stop();

        onAudioContextReady.clearByContext(this);

        this._sourceNode?.disconnect();
        this._sourceNode = null;

        this._gainNode?.disconnect();
        this._gainNode = null;

        this.onStart.destroy();
        this.onStop.destroy();
    }

    private setupWithAudioContext(audioContext: AudioContext): void {
        this._audioContext = audioContext;

        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);

        this._sourceNode = audioContext.createMediaElementSource(this._videoElement);
        this._sourceNode.connect(this._gainNode);
    }
}