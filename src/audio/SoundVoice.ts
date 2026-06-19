import { clamp } from '#math/utils';

import type { Voice } from './Playable';

/**
 * Active playback handle for one {@link Sound} play call.
 *
 * Each call to `AudioManager.play(sound)` creates an independent SoundVoice
 * backed by a single `AudioBufferSourceNode`. Concurrent plays of the same
 * Sound each get their own SoundVoice.
 *
 * @internal
 */
export class SoundVoice implements Voice {
  private readonly _gainNode: GainNode;
  private readonly _pannerNode: PannerNode | null;
  private readonly _sourceNode: AudioBufferSourceNode;
  private readonly _audioContext: AudioContext;
  private _ended = false;
  private _stopScheduledId: ReturnType<typeof setTimeout> | null = null;

  public get ended(): boolean {
    return this._ended;
  }

  public constructor(
    audioContext: AudioContext,
    gainNode: GainNode,
    sourceNode: AudioBufferSourceNode,
    pannerNode: PannerNode | null,
  ) {
    this._audioContext = audioContext;
    this._gainNode = gainNode;
    this._sourceNode = sourceNode;
    this._pannerNode = pannerNode;

    sourceNode.onended = (): void => {
      this._markEnded();
      this._gainNode.disconnect();
      this._pannerNode?.disconnect();
    };
  }

  public stop(): void {
    if (this._ended) return;
    this._clearStopSchedule();
    try {
      this._sourceNode.stop(0);
    } catch {
      // already stopped
    }
    this._sourceNode.disconnect();
    this._gainNode.disconnect();
    this._pannerNode?.disconnect();
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

  /**
   * Update the PannerNode position. Called by AudioManager.update() for
   * spatial voices.
   * @internal
   */
  public _tickSpatial(x: number, y: number): void {
    if (this._pannerNode === null || this._ended) return;
    const t = this._audioContext.currentTime;
    const panner = this._pannerNode as unknown as Partial<{
      positionX: AudioParam;
      positionY: AudioParam;
      positionZ: AudioParam;
      setPosition: (x: number, y: number, z: number) => void;
    }>;
    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, t);
      panner.positionY!.setValueAtTime(y, t);
      panner.positionZ!.setValueAtTime(0, t);
    } else if (panner.setPosition) {
      panner.setPosition(x, y, 0);
    }
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
