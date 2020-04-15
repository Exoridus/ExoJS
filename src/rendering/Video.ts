import { clamp } from '../utils/math';
import { Sprite } from './sprite/Sprite';
import { Texture } from './texture/Texture';
import { Signal } from '../core/Signal';
import { PlaybackOptions } from "../const/types";
import { RenderManager } from './RenderManager';
import { SamplerOptions } from "./texture/Sampler";
import { IMedia } from "../interfaces/IMedia";
import { audioContext, isAudioContextReady, onAudioContextReady } from "../const/audio-context";

export class Video extends Sprite implements IMedia {

    public readonly onStart = new Signal();
    public readonly onStop = new Signal();

    private readonly _videoElement: HTMLVideoElement;
    private readonly _duration: number;
    private readonly _setupAudioContextHandler: (audioContext: AudioContext) => void = this.setupWithAudioContext.bind(this);
    private _audioContext: AudioContext | null = null;
    private _volume = 1;
    private _speed = 1;
    private _loop = false;
    private _muted = false;
    private _gainNode: GainNode | null = null;
    private _sourceNode: MediaElementAudioSourceNode | null = null;

    constructor(videoElement: HTMLVideoElement, playbackOptions?: Partial<PlaybackOptions>, samplerOptions?: Partial<SamplerOptions>) {
        super(new Texture(videoElement, samplerOptions));

        const { duration, volume, playbackRate, loop, muted } = videoElement;

        this._videoElement = videoElement;
        this._duration = duration;
        this._volume = volume;
        this._speed = playbackRate;
        this._loop = loop;
        this._muted = muted;

        if (playbackOptions) {
            this.applyOptions(playbackOptions);
        }

        if (isAudioContextReady()) {
            this._setupAudioContextHandler(audioContext!);
        } else {
            onAudioContextReady.once(this._setupAudioContextHandler);
        }
    }

    get videoElement() {
        return this._videoElement;
    }

    get duration() {
        return this._duration;
    }

    get progress() {
        const elapsed = this.currentTime,
            duration = this.duration;

        return ((elapsed % duration) / duration);
    }

    get volume() {
        return this._volume;
    }

    set volume(value) {
        this.setVolume(value);
    }

    get loop() {
        return this._loop;
    }

    set loop(loop: boolean) {
        this.setLoop(loop);
    }

    get speed() {
        return this._speed;
    }

    set speed(value) {
        this.setSpeed(value);
    }

    get currentTime() {
        return this.getTime();
    }

    set currentTime(time) {
        this.setTime(time);
    }

    get muted() {
        return this._muted;
    }

    set muted(muted: boolean) {
        this.setMuted(muted);
    }

    get paused() {
        return this._videoElement.paused;
    }

    set paused(paused) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    get playing() {
        return !this.paused;
    }

    set playing(playing) {
        if (playing) {
            this.play();
        } else {
            this.pause();
        }
    }

    get analyserTarget(): AudioNode | null {
        return this._gainNode;
    }

    play(options?: Partial<PlaybackOptions>) {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._videoElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    pause(options?: Partial<PlaybackOptions>) {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._videoElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    stop(options?: Partial<PlaybackOptions>) {
        this.pause(options);
        this.currentTime = 0;

        return this;
    }

    toggle(options?: Partial<PlaybackOptions>) {
        return this.paused ? this.play(options) : this.pause(options);
    }

    applyOptions(options: Partial<PlaybackOptions> = {}) {
        const { volume, loop, speed, time, muted } = options;

        if (volume !== undefined) {
            this.volume = volume;
        }

        if (loop !== undefined) {
            this.loop = loop;
        }

        if (speed !== undefined) {
            this.speed = speed;
        }

        if (time !== undefined) {
            this.currentTime = time;
        }

        if (muted !== undefined) {
            this.muted = muted;
        }

        return this;
    }

    setVolume(value: number): this {
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

    setLoop(loop: boolean): this {
        if (this._loop !== loop) {
            this._loop = loop;
            this._videoElement.loop = loop;
        }

        return this;
    }

    setSpeed(value: number): this {
        const speed = clamp(value, 0.1, 20);

        if (this._speed !== speed) {
            this._speed = speed;
            this._videoElement.playbackRate = speed;
        }

        return this;
    }

    getTime(): number {
        return this._videoElement.currentTime;
    }

    setTime(time: number): this {
        this._videoElement.currentTime = Math.max(0, time);

        return this;
    }

    setMuted(muted: boolean): this {
        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, this._audioContext!.currentTime, 10);
            }
        }

        return this;
    }


    render(renderManager: RenderManager) {
        this.texture!.updateSource();
        super.render(renderManager);

        return this;
    }

    destroy() {
        super.destroy();
        this.stop();

        onAudioContextReady.remove(this.setupWithAudioContext, this);

        this._sourceNode?.disconnect();
        this._sourceNode = null;

        this._gainNode?.disconnect();
        this._gainNode = null;

        this.onStart.destroy();
        this.onStop.destroy();
    }

    private setupWithAudioContext(audioContext: AudioContext) {
        this._audioContext = audioContext;

        this._gainNode = audioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 10);
        this._gainNode.connect(audioContext.destination);

        this._sourceNode = audioContext.createMediaElementSource(this._videoElement);
        this._sourceNode.connect(this._gainNode);
    }
}