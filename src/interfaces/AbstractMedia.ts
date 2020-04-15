import { IMedia } from "./IMedia";
import { Signal } from 'core/Signal';
import { PlaybackOptions } from "const/types";
import { defaultPlaybackOptions } from "const/defaults";

export interface AbstractMediaInitialState {
    duration: number;
    volume?: number;
    speed?: number;
    loop?: boolean;
    muted?: boolean;
}

export abstract class AbstractMedia implements IMedia {

    public readonly onStart = new Signal();
    public readonly onStop = new Signal();

    protected readonly _duration: number;
    protected _volume: number;
    protected _speed: number;
    protected _loop: boolean;
    protected _muted: boolean;
    protected _audioContext: AudioContext | null = null;

    public abstract get paused(): boolean;
    public abstract set paused(paused: boolean);
    public abstract get analyserTarget(): AudioNode | null;

    public get duration() {
        return this._duration;
    }

    public get volume(): number {
        return this._volume;
    }

    public set volume(volume: number) {
        this.setVolume(volume);
    }

    public get loop(): boolean {
        return this._loop;
    }

    public set loop(loop: boolean) {
        this.setLoop(loop);
    }

    public get speed(): number {
        return this._speed;
    }

    public set speed(speed: number) {
        this.setSpeed(speed);
    }

    public get currentTime(): number {
        return this.getTime();
    }

    public set currentTime(currentTime: number) {
        this.setTime(currentTime)
    }

    public get muted(): boolean {
        return this._muted;
    }

    public set muted(muted: boolean) {
        this.setMuted(muted);
    }

    public get progress(): number {
        const elapsed = this.currentTime;
        const duration = this.duration;

        return ((elapsed % duration) / duration);
    }

    public get playing(): boolean {
        return !this.paused;
    }

    public set playing(playing: boolean) {
        if (playing) {
            this.play();
        } else {
            this.pause();
        }
    }

    protected constructor(initialState: AbstractMediaInitialState) {
        const { duration, volume, speed, loop, muted } = initialState;

        this._duration = duration;
        this._volume = volume ?? defaultPlaybackOptions.volume;
        this._speed = speed ?? defaultPlaybackOptions.speed;
        this._loop = loop ?? defaultPlaybackOptions.loop;
        this._muted = muted ?? defaultPlaybackOptions.muted;
    }

    public abstract play(options?: Partial<PlaybackOptions>): this;
    public abstract pause(options?: Partial<PlaybackOptions>): this;
    public abstract setVolume(volume: number): this;
    public abstract setLoop(loop: boolean): this;
    public abstract setSpeed(speed: number): this;
    public abstract getTime(): number;
    public abstract setTime(time: number): this;
    public abstract setMuted(muted: boolean): this;

    public stop(options?: Partial<PlaybackOptions>) {
        this.pause(options);
        this.currentTime = 0;

        return this;
    }

    public toggle(options?: Partial<PlaybackOptions>): this {
        return this.paused ? this.play(options) : this.pause(options);
    }

    public applyOptions(options: Partial<PlaybackOptions> = {}): this {
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

    public destroy(): void {
        this.stop();

        this.onStart.destroy();
        this.onStop.destroy();
    }
}