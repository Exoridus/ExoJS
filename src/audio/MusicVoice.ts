import { clamp } from '#math/utils';

import type { Voice } from './Playable';

/**
 * Active playback handle for one {@link Music} play call.
 *
 * Wraps the underlying `HTMLAudioElement` stream. Because a Music asset owns
 * a single `HTMLAudioElement`, only one MusicVoice can be active per asset at
 * a time — starting a new voice pauses the previous one.
 *
 * @internal
 */
export class MusicVoice implements Voice {
  private readonly _audioElement: HTMLMediaElement;
  private readonly _gainNode: GainNode;
  private readonly _audioContext: AudioContext;
  private _ended = false;
  private _stopScheduledId: ReturnType<typeof setTimeout> | null = null;

  public get ended(): boolean {
    return this._ended;
  }

  public constructor(
    audioContext: AudioContext,
    gainNode: GainNode,
    audioElement: HTMLMediaElement,
  ) {
    this._audioContext = audioContext;
    this._gainNode = gainNode;
    this._audioElement = audioElement;
  }

  public stop(): void {
    if (this._ended) return;
    this._clearStopSchedule();
    this._audioElement.pause();
    this._markEnded();
  }

  public setVolume(volume: number): void {
    const v = clamp(volume, 0, 2);
    this._gainNode.gain.setTargetAtTime(v, this._audioContext.currentTime, 0.01);
  }

  public fadeOut(durationMs: number): void {
    if (this._ended) return;

    if (durationMs <= 0) {
      this.stop();
      return;
    }

    const ctx = this._audioContext;
    const node = this._gainNode;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
    node.gain.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);

    this._clearStopSchedule();
    this._stopScheduledId = setTimeout(() => {
      this._stopScheduledId = null;
      this.stop();
    }, durationMs);
  }

  private _clearStopSchedule(): void {
    if (this._stopScheduledId !== null) {
      clearTimeout(this._stopScheduledId);
      this._stopScheduledId = null;
    }
  }

  private _markEnded(): void {
    if (!this._ended) {
      this._ended = true;
      this._clearStopSchedule();
    }
  }
}
