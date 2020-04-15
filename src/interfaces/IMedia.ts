import { PlaybackOptions } from "const/types";

export enum MediaFlags {
    None = 0,
    Volume = 1 << 0,
    Speed = 1 << 1,
    Loop = 1 << 2,
    Muted = 1 << 3,
    Time = 1 << 4,
    Playback = 1 << 5,
}

export interface IMedia {
    readonly duration: number;
    readonly progress: number;
    readonly analyserTarget: AudioNode | null;
    volume: number;
    loop: boolean;
    speed: number;
    currentTime: number;
    muted: boolean;
    paused: boolean;
    playing: boolean;

    play(options?: Partial<PlaybackOptions>): this;
    pause(options?: Partial<PlaybackOptions>): this;
    stop(options?: Partial<PlaybackOptions>): this;
    toggle(options?: Partial<PlaybackOptions>): this;
    applyOptions(options: Partial<PlaybackOptions>): this;
    setVolume(volume: number): this;
    setLoop(loop: boolean): this;
    setSpeed(speed: number): this;
    getTime(): number;
    setTime(time: number): this;
    setMuted(muted: boolean): this;
    destroy(): void;
}