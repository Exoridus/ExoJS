import { clamp } from '../utils/math';
import { GlobalAudioContext } from '../const/core';
import { PlaybackOptions } from "../const/types";
import { AbstractMedia } from "../AbstractMedia";

export default class Music extends AbstractMedia {
    private readonly _audioElement: HTMLMediaElement;
    private readonly _gainNode: GainNode;
    private _sourceNode: MediaElementAudioSourceNode;

    constructor(audioElement: HTMLAudioElement, options?: PlaybackOptions) {
        const { duration, volume, playbackRate, loop, muted } = audioElement;

        super({ duration, volume, speed: playbackRate, loop, muted });

        this._audioElement = audioElement;
        this._gainNode = GlobalAudioContext.createGain();
        this._gainNode.gain.setTargetAtTime(this._volume, GlobalAudioContext.currentTime, 10);
        this._gainNode.connect(GlobalAudioContext.destination);

        this._sourceNode = GlobalAudioContext.createMediaElementSource(audioElement);
        this._sourceNode.connect(this._gainNode);

        if (options) {
            this.applyOptions(options);
        }
    }

    public setVolume(value: number): this {
        const volume = clamp(value, 0, 2);

        if (this._volume !== volume) {
            this._volume = volume;
            this._gainNode.gain.setTargetAtTime(volume, GlobalAudioContext.currentTime, 10);
        }

        return this;
    }

    public setLoop(loop: boolean): this {
        if (this._loop !== loop) {
            this._loop = loop;
            this._audioElement.loop = loop;
        }

        return this;
    }

    public setSpeed(value: number): this {
        const speed = clamp(value, 0.1, 20);

        if (this._speed !== speed) {
            this._speed = speed;
            this._audioElement.playbackRate = speed;
        }

        return this;
    }

    public getTime(): number {
        return this._audioElement.currentTime;
    }

    public setTime(currentTime: number): this {
        this._audioElement.currentTime = Math.max(0, currentTime);

        return this;
    }

    public setMuted(muted: boolean): this {
        if (this._muted !== muted) {
            this._muted = muted;
            this._audioElement.muted = muted;
        }

        return this;
    }

    public get paused(): boolean {
        return this._audioElement.paused;
    }

    public set paused(paused: boolean) {
        if (paused) {
            this.pause();
        } else {
            this.play();
        }
    }

    public get analyserTarget(): AudioNode | null {
        return this._gainNode || null;
    }

    public play(options?: PlaybackOptions): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.paused) {
            this._audioElement.play();
            this.onStart.dispatch();
        }

        return this;
    }

    public pause(options?: PlaybackOptions): this {
        if (options) {
            this.applyOptions(options);
        }

        if (this.playing) {
            this._audioElement.pause();
            this.onStop.dispatch();
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this._sourceNode.disconnect();
        this._gainNode.disconnect();
    }
}
