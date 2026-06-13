import type { PlaybackOptions } from '#core/types';
import { clamp } from '#math/utils';

import { AbstractMedia } from './AbstractMedia';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from './audio-context';
import type { AudioBus } from './AudioBus';
import { getAudioManager } from './AudioManager';

interface MusicAudioSetup {
  readonly audioContext: AudioContext;
  readonly gainNode: GainNode;
  readonly sourceNode: MediaElementAudioSourceNode;
}

/**
 * Streaming long-form audio backed by an `HTMLAudioElement`. Decoded
 * lazily via the browser's media pipeline, so memory cost scales with
 * decode-buffer size rather than total duration. Routes through the
 * engine's `music` bus by default (overridable via the inherited
 * `bus` setter).
 *
 * Use {@link Sound} for short, frequently-triggered clips that benefit
 * from pre-decoded `AudioBuffer` storage and pooled overlapping
 * playback. `Music` is the right choice for background tracks, voice
 * lines, or anything else where a single source per track is enough.
 */
export class Music extends AbstractMedia {
  private readonly _audioElement: HTMLMediaElement;
  private _audioSetup: MusicAudioSetup | null = null;
  private _pendingPlay = false;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.setupWithAudioContext(ctx);
  };
  private readonly _onUnlockPlay = (): void => {
    onAudioContextReady.remove(this._onUnlockPlay);

    if (!this._pendingPlay) {
      return;
    }

    this._pendingPlay = false;
    void this._audioElement.play();
    this.onStart.dispatch();
  };

  public constructor(audioElement: HTMLAudioElement, options?: Partial<PlaybackOptions>) {
    super(audioElement);

    this._audioElement = audioElement;

    if (options) {
      this.applyOptions(options);
    }

    if (isAudioContextReady()) {
      this.setupWithAudioContext(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }
  }

  public setVolume(value: number): this {
    const volume = clamp(value, 0, 2);

    if (this._volume === volume) {
      return this;
    }

    this._volume = volume;

    if (this._audioSetup) {
      const { gainNode, audioContext } = this._audioSetup;
      gainNode.gain.setTargetAtTime(this.muted ? 0 : volume, audioContext.currentTime, 0.01);
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

  public setPlaybackRate(value: number): this {
    const playbackRate = clamp(value, 0.1, 20);

    if (this._playbackRate !== playbackRate) {
      this._playbackRate = playbackRate;
      this._audioElement.playbackRate = playbackRate;
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

      if (this._audioSetup) {
        const { gainNode, audioContext } = this._audioSetup;
        gainNode.gain.setTargetAtTime(muted ? 0 : this.volume, audioContext.currentTime, 0.01);
      }
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
    return this._audioSetup?.gainNode ?? null;
  }

  public play(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (!this.paused || this._pendingPlay) {
      return this;
    }

    if (isAudioContextReady()) {
      void this._audioElement.play();
      this.onStart.dispatch();
    } else {
      // Autoplay policy blocks playback until a user gesture resumes the
      // AudioContext. Defer and start inside that unlock so the browser
      // permits it — callers can play() at any time and it just works.
      this._pendingPlay = true;
      onAudioContextReady.add(this._onUnlockPlay);
    }

    return this;
  }

  public pause(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (this._pendingPlay) {
      this._pendingPlay = false;
      onAudioContextReady.remove(this._onUnlockPlay);
    }

    if (this.playing) {
      this._audioElement.pause();
      this.onStop.dispatch();
    }

    return this;
  }

  protected override _getAudioSetup(): { audioContext: AudioContext; gainNode: GainNode } | null {
    return this._audioSetup;
  }

  protected override _defaultBus(): AudioBus {
    return getAudioManager().music;
  }

  protected override _disconnectFromBus(): void {
    if (this._audioSetup) {
      this._audioSetup.gainNode.disconnect();
    }
  }

  protected override _connectToBus(): void {
    if (this._audioSetup) {
      const inputNode = this.bus._getInputNode();
      if (inputNode) {
        this._audioSetup.gainNode.connect(inputNode);
      } else {
        this._audioSetup.gainNode.connect(this._audioSetup.audioContext.destination);
      }
    }
  }

  public override destroy(): void {
    super.destroy();

    this._pendingPlay = false;
    onAudioContextReady.remove(this._onAudioContextReady);
    onAudioContextReady.remove(this._onUnlockPlay);

    if (this._audioSetup) {
      this._audioSetup.sourceNode.disconnect();
      this._audioSetup.gainNode.disconnect();
      this._audioSetup = null;
    }
  }

  private setupWithAudioContext(audioContext: AudioContext): void {
    const gainNode = audioContext.createGain();
    gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);

    const inputNode = this.bus._getInputNode();
    if (inputNode) {
      gainNode.connect(inputNode);
    } else {
      gainNode.connect(audioContext.destination);
    }

    const sourceNode = audioContext.createMediaElementSource(this._audioElement);
    sourceNode.connect(gainNode);

    this._audioSetup = { audioContext, gainNode, sourceNode };
  }
}
