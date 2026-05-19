import { getAudioContext, isAudioContextReady, onAudioContextReady } from '@/audio/audio-context';
import type { AudioBus } from '@/audio/AudioBus';
import { getAudioManager } from '@/audio/AudioManager';
import type { Media } from '@/audio/Media';
import { Signal } from '@/core/Signal';
import type { PlaybackOptions } from '@/core/types';
import { Rectangle } from '@/math/Rectangle';
import { clamp } from '@/math/utils';

import type { RenderBackend } from '../RenderBackend';
import { Sprite } from '../sprite/Sprite';
import type { SamplerOptions } from '../texture/Sampler';
import { Texture } from '../texture/Texture';

interface VideoAudioSetup {
  readonly audioContext: AudioContext;
  readonly gainNode: GainNode;
  readonly sourceNode: MediaElementAudioSourceNode;
}

type FrameCallbackVideoElement = HTMLVideoElement &
  Partial<{
    requestVideoFrameCallback: (callback: (now: number, metadata: unknown) => void) => number;
    cancelVideoFrameCallback: (handle: number) => void;
  }>;

/**
 * Renders an `HTMLVideoElement` as a live texture on a {@link Sprite}.
 *
 * `Video` wraps a video element, manages playback (play/pause/stop/seek,
 * volume, loop, playback rate), and keeps the underlying {@link Texture}
 * in sync with the decoded video frame stream via
 * `requestVideoFrameCallback` (falling back to `currentTime` polling on
 * browsers that lack it). Audio is routed through the Web Audio API gain
 * node and can be directed to any {@link AudioBus}.
 */
export class Video extends Sprite implements Media {
  public readonly onStart = new Signal();
  public readonly onStop = new Signal();

  private readonly _videoElement: HTMLVideoElement;
  private readonly _duration: number;
  private _volume = 1;
  private _playbackRate = 1;
  private _loop = false;
  private _muted = false;
  private _bus: AudioBus | null = null;
  private _audioSetup: VideoAudioSetup | null = null;
  private _textureDirty = true;
  private _lastVideoTime = Number.NaN;
  private _videoFrameCallbackHandle: number | null = null;
  private readonly _onMetadataHandler: () => void;
  private readonly _onResizeHandler: () => void;
  private readonly _onVideoFrameHandler: (now: number, metadata: unknown) => void;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.setupWithAudioContext(ctx);
  };

  public constructor(videoElement: HTMLVideoElement, playbackOptions?: Partial<PlaybackOptions>, samplerOptions?: Partial<SamplerOptions>) {
    super(new Texture(videoElement, samplerOptions));

    const { duration, volume, playbackRate, loop, muted } = videoElement;

    this._videoElement = videoElement;
    this._duration = duration;
    this._volume = volume;
    this._playbackRate = playbackRate;
    this._loop = loop;
    this._muted = muted;
    this._onMetadataHandler = this._onVideoMetadataUpdated.bind(this);
    this._onResizeHandler = this._onVideoMetadataUpdated.bind(this);
    this._onVideoFrameHandler = this._onVideoFrame.bind(this);

    if (this._videoElement.videoWidth === 0 || this._videoElement.videoHeight === 0) {
      this._videoElement.addEventListener('loadedmetadata', this._onMetadataHandler);
      this._videoElement.addEventListener('resize', this._onResizeHandler);
    }

    if (playbackOptions) {
      this.applyOptions(playbackOptions);
    }

    if (isAudioContextReady()) {
      this.setupWithAudioContext(getAudioContext());
    } else {
      onAudioContextReady.add(this._onAudioContextReady);
    }

    // Initialize frame bounds early when metadata is already available.
    this.updateTexture();
    this._requestVideoFrameCallback();
  }

  public get videoElement(): HTMLVideoElement {
    return this._videoElement;
  }

  public get duration(): number {
    return this._duration;
  }

  /**
   * Current playback progress in the range [0, 1), computed as
   * `(currentTime % duration) / duration`. Wraps for looping video.
   */
  public get progress(): number {
    const elapsed = this.currentTime;
    const duration = this.duration;

    return (elapsed % duration) / duration;
  }

  public get volume(): number {
    return this._volume;
  }

  public set volume(value) {
    this.setVolume(value);
  }

  public get loop(): boolean {
    return this._loop;
  }

  public set loop(loop: boolean) {
    this.setLoop(loop);
  }

  public get playbackRate(): number {
    return this._playbackRate;
  }

  public set playbackRate(value) {
    this.setPlaybackRate(value);
  }

  public get currentTime(): number {
    return this.getTime();
  }

  public set currentTime(time) {
    this.setTime(time);
  }

  public get muted(): boolean {
    return this._muted;
  }

  public set muted(muted: boolean) {
    this.setMuted(muted);
  }

  public get paused(): boolean {
    return this._videoElement.paused;
  }

  public set paused(paused) {
    if (paused) {
      this.pause();
    } else {
      this.play();
    }
  }

  public get playing(): boolean {
    return !this.paused;
  }

  public set playing(playing) {
    if (playing) {
      this.play();
    } else {
      this.pause();
    }
  }

  /**
   * The Web Audio `GainNode` for this video's audio stream, or `null` when
   * the audio context has not yet been initialized. Connect an analyser node
   * here for audio-reactive visuals.
   */
  public get analyserTarget(): AudioNode | null {
    return this._audioSetup?.gainNode ?? null;
  }

  public get bus(): AudioBus {
    return this._bus ?? getAudioManager().master;
  }

  public set bus(bus: AudioBus) {
    if (this._bus === bus) return;
    if (this._audioSetup) {
      this._audioSetup.gainNode.disconnect();
    }
    this._bus = bus;
    if (this._audioSetup) {
      const inputNode = bus._getInputNode();
      if (inputNode) {
        this._audioSetup.gainNode.connect(inputNode);
      } else {
        this._audioSetup.gainNode.connect(this._audioSetup.audioContext.destination);
      }
    }
  }

  /** Start video playback. Dispatches `onStart` if the video was paused. Applies `options` before playing. */
  public play(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (this.paused) {
      this._videoElement.play();
      this.onStart.dispatch();
    }

    return this;
  }

  /** Pause video playback. Dispatches `onStop` if the video was playing. */
  public pause(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (this.playing) {
      this._videoElement.pause();
      this.onStop.dispatch();
    }

    return this;
  }

  /** Pause and seek to the start of the video. */
  public stop(options?: Partial<PlaybackOptions>): this {
    this.pause(options);
    this.currentTime = 0;

    return this;
  }

  /** Toggle between play and pause. */
  public toggle(options?: Partial<PlaybackOptions>): this {
    return this.paused ? this.play(options) : this.pause(options);
  }

  /** Apply a partial set of playback options (volume, loop, playbackRate, time, muted) to the video element. */
  public applyOptions(options: Partial<PlaybackOptions> = {}): this {
    const { volume, loop, playbackRate, time, muted } = options;

    if (volume !== undefined) {
      this.volume = volume;
    }

    if (loop !== undefined) {
      this.loop = loop;
    }

    if (playbackRate !== undefined) {
      this.playbackRate = playbackRate;
    }

    if (time !== undefined) {
      this.currentTime = time;
    }

    if (muted !== undefined) {
      this.muted = muted;
    }

    return this;
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
      this._videoElement.loop = loop;
    }

    return this;
  }

  public setPlaybackRate(value: number): this {
    const playbackRate = clamp(value, 0.1, 20);

    if (this._playbackRate !== playbackRate) {
      this._playbackRate = playbackRate;
      this._videoElement.playbackRate = playbackRate;
    }

    return this;
  }

  public getTime(): number {
    return this._videoElement.currentTime;
  }

  public setTime(time: number): this {
    this._videoElement.currentTime = Math.max(0, time);

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

  /**
   * Mark the texture dirty when the video frame has advanced, then upload
   * the latest video frame and delegate rendering to {@link Sprite.render}.
   * @internal
   */
  public override render(backend: RenderBackend): this {
    if (this.visible) {
      this._markTextureDirtyIfPlaybackAdvanced();
      this.updateTexture();
      super.render(backend);
    }

    return this;
  }

  /**
   * Upload the current video frame to the GPU texture if the frame is dirty
   * and the video dimensions are known. Called automatically by `render`;
   * also safe to call manually when the video is paused on a specific frame.
   */
  public override updateTexture(): this {
    const texture = this.texture;

    if (!texture || !this._videoElement) {
      return this;
    }

    if (this._videoElement.videoWidth === 0 || this._videoElement.videoHeight === 0) {
      return this;
    }

    if (!this._textureDirty) {
      return this;
    }

    const preserveSize = this.textureFrame.width > 0 && this.textureFrame.height > 0;

    texture.updateSource();

    if (texture.width > 0 && texture.height > 0) {
      this.setTextureFrame(Rectangle.temp.set(0, 0, texture.width, texture.height), !preserveSize);
    }

    this._textureDirty = false;

    return this;
  }

  public override destroy(): void {
    super.destroy();
    this.stop();
    this._videoElement.removeEventListener('loadedmetadata', this._onMetadataHandler);
    this._videoElement.removeEventListener('resize', this._onResizeHandler);
    this._cancelVideoFrameCallback();

    onAudioContextReady.remove(this._onAudioContextReady);

    if (this._audioSetup) {
      this._audioSetup.sourceNode.disconnect();
      this._audioSetup.gainNode.disconnect();
      this._audioSetup = null;
    }

    this.onStart.destroy();
    this.onStop.destroy();
  }

  private _onVideoMetadataUpdated(): void {
    this._textureDirty = true;
    this.updateTexture();
  }

  private _onVideoFrame(_now: number, _metadata: unknown): void {
    this._videoFrameCallbackHandle = null;
    this._textureDirty = true;
    this._requestVideoFrameCallback();
  }

  private _markTextureDirtyIfPlaybackAdvanced(): void {
    const currentTime = this._videoElement.currentTime;

    if (this._lastVideoTime !== currentTime) {
      this._lastVideoTime = currentTime;
      this._textureDirty = true;
    }
  }

  private _requestVideoFrameCallback(): void {
    const frameCallbackVideo = this._videoElement as FrameCallbackVideoElement;

    if (!frameCallbackVideo.requestVideoFrameCallback || this._videoFrameCallbackHandle !== null) {
      return;
    }

    this._videoFrameCallbackHandle = frameCallbackVideo.requestVideoFrameCallback(this._onVideoFrameHandler);
  }

  private _cancelVideoFrameCallback(): void {
    const frameCallbackVideo = this._videoElement as FrameCallbackVideoElement;

    if (!frameCallbackVideo.cancelVideoFrameCallback || this._videoFrameCallbackHandle === null) {
      return;
    }

    frameCallbackVideo.cancelVideoFrameCallback(this._videoFrameCallbackHandle);
    this._videoFrameCallbackHandle = null;
  }

  private readonly setupWithAudioContext = (audioContext: AudioContext): void => {
    const gainNode = audioContext.createGain();
    gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);

    const inputNode = this.bus._getInputNode();
    if (inputNode) {
      gainNode.connect(inputNode);
    } else {
      gainNode.connect(audioContext.destination);
    }

    const sourceNode = audioContext.createMediaElementSource(this._videoElement);
    sourceNode.connect(gainNode);

    this._audioSetup = { audioContext, gainNode, sourceNode };
  };
}
