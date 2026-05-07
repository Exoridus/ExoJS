import type { PlaybackOptions } from '@/core/types';

/**
 * Common public interface implemented by every playable audio source —
 * {@link Sound}, {@link Music}, {@link OscillatorSound}. Extracted so that
 * code routing audio through generic helpers (fade managers, audio
 * scheduling) can operate against the abstraction rather than the concrete
 * subclass.
 *
 * Mutator methods are dual-API: each `setX(value)` setter has a paired
 * regular property setter, so both `media.volume = 0.5` and
 * `media.setVolume(0.5)` work — pick whichever style fits the call site.
 */
export interface Media {
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