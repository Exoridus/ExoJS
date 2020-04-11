import { PlaybackOptions } from "../const/types";

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

    play(options?: PlaybackOptions): this;
    pause(options?: PlaybackOptions): this;
    stop(options?: PlaybackOptions): this;
    toggle(options?: PlaybackOptions): this;
    applyOptions(options: PlaybackOptions): this;
    setVolume(volume: number): this;
    setLoop(loop: boolean): this;
    setSpeed(speed: number): this;
    getTime(): number;
    setTime(time: number): this;
    setMuted(muted: boolean): this;
    destroy(): void;
}