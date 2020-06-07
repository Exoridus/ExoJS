import type { IPlaybackOptions } from 'types/types';

export interface IMedia {
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

    play(options?: Partial<IPlaybackOptions>): this;
    pause(options?: Partial<IPlaybackOptions>): this;
    stop(options?: Partial<IPlaybackOptions>): this;
    toggle(options?: Partial<IPlaybackOptions>): this;
    applyOptions(options: Partial<IPlaybackOptions>): this;
    setVolume(volume: number): this;
    setLoop(loop: boolean): this;
    setPlaybackRate(playbackRate: number): this;
    getTime(): number;
    setTime(time: number): this;
    setMuted(muted: boolean): this;
    destroy(): void;
}