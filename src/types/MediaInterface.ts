import { PlaybackOptions } from "types/types";

export interface MediaInterface {
    readonly duration: number;
    readonly progress: number;
    readonly analyserTarget: AudioNode | null;
    volume: number;
    loop: boolean;
    playbackRate: number;
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
    setPlaybackRate(playbackRate: number): this;
    getTime(): number;
    setTime(time: number): this;
    setMuted(muted: boolean): this;
    destroy(): void;
}