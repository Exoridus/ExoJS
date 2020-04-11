import { clamp } from '../utils/math';
import Sprite from './sprite/Sprite';
import Texture from './texture/Texture';
import { GlobalAudioContext } from '../const/core';
import Signal from '../core/Signal';
import { PlaybackOptions } from "../const/types";
import RenderManager from "./RenderManager";
import { SamplerOptions } from "./texture/Sampler";
import { IMedia } from "../interfaces/IMedia";

export class Video extends Sprite implements IMedia {

    public readonly onStart = new Signal();
    public readonly onStop = new Signal();

    private readonly _videoElement: HTMLVideoElement;
    private readonly _duration: number;
    private readonly _gainNode: GainNode;
    private _volume: number = 1;
    private _speed: number = 1;
    private _loop: boolean = false;
    private _muted: boolean = false;
    private _sourceNode: MediaElementAudioSourceNode;

    constructor(videoElement: HTMLVideoElement, playbackOptions?: PlaybackOptions, samplerOptions?: SamplerOptions) {
        super(new Texture(videoElement, samplerOptions));

        const { duration, volume, playbackRate, loop, muted } = videoElement;

        this._videoElement = videoElement;
        this._duration = duration;
        this._volume = volume;
        this._speed = playbackRate;
        this._loop = loop;
        this._muted = muted;

        this._gainNode = GlobalAudioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this._volume, GlobalAudioContext.currentTime, 10);
        this._gainNode.connect(GlobalAudioContext.destination);

        this._sourceNode = GlobalAudioContext.createMediaElementSource(videoElement);
        this._sourceNode.connect(this._gainNode);

        if (playbackOptions) {
            this.applyOptions(playbackOptions);
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
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, GlobalAudioContext.currentTime, 10);
            }
        }
    }

    get loop() {
        return this._loop;
    }

    set loop(loop: boolean) {
        if (this._loop !== loop) {
            this._loop = loop;
            this._videoElement.loop = loop;
        }
    }

    get speed() {
        return this._speed;
    }

    set speed(value) {
        const speed = Math.max(0, value);

        if (this._speed !== speed) {
            this._speed = speed;
            this._videoElement.playbackRate = speed;
        }
    }

    get currentTime() {
        return this._videoElement.currentTime;
    }

    set currentTime(currentTime) {
        this._videoElement.currentTime = Math.max(0, currentTime);
    }

    get muted() {
        return this._muted;
    }

    set muted(muted: boolean) {
        if (this._muted !== muted) {
            this._muted = muted;

            if (this._gainNode) {
                this._gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, GlobalAudioContext.currentTime, 10);
            }
        }
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
        return this._gainNode || null;
    }

    play(options?: PlaybackOptions) {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._videoElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    pause(options?: PlaybackOptions) {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._videoElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    stop() {
        this.pause();
        this.currentTime = 0;

        return this;
    }

    toggle(options: PlaybackOptions) {
        return this.paused ? this.play(options) : this.pause(options);
    }

    applyOptions(options: PlaybackOptions = {}) {
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

    setVolume(volume: number): this {
        this.volume = volume;

        return this;
    }

    setLoop(loop: boolean): this {
        this.loop = loop;

        return this;
    }

    setSpeed(speed: number): this {
        this.speed = speed;

        return this;
    }

    getTime(): number {
        return this.currentTime;
    }

    setTime(time: number): this {
        this.currentTime = time;

        return this;
    }

    setMuted(muted: boolean): this {
        this.muted = muted;

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

        this._sourceNode.disconnect();
        this._gainNode.disconnect();

        this.onStart.destroy();
        this.onStop.destroy();
    }
}