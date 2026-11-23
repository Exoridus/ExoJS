import type { AudioBus } from '#audio/AudioBus';
import { getAudioContext, isAudioContextReady, onAudioContextReady } from '#audio/audioContext';
import { mediaErrorMessage } from '#core/mediaError';
import { Signal } from '#core/Signal';
import type { PlaybackOptions } from '#core/types';
import { noop } from '#core/utils';
import { Rectangle } from '#math/Rectangle';
import { clamp } from '#math/utils';
import type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { Sprite } from '#rendering/sprite/Sprite';
import { FrameTexture } from '#rendering/texture/FrameTexture';
import type { TextureOptions } from '#rendering/texture/TextureOptions';

import { VideoTexture } from './VideoTexture';

interface VideoAudioSetup {
  readonly audioContext: AudioContext;
  readonly gainNode: GainNode;
  readonly sourceNode: MediaElementAudioSourceNode;
}

/**
 * Renders an `HTMLVideoElement` as a live texture on a {@link Sprite}.
 *
 * `Video` wraps a video element, manages playback (play/pause/stop/seek,
 * volume, loop, playback rate), and draws its {@link VideoTexture}. Each
 * presented frame is uploaded once, the next time the video renders; a paused
 * video uploads nothing. Share {@link texture} with a `Mesh` or another sprite
 * to draw the same frames elsewhere without a second upload; the video owns
 * that texture and destroys it with itself.
 * Audio is routed through the Web Audio API gain node and can be directed to
 * any {@link AudioBus}.
 *
 * Frames are uploaded as sRGB colour, like any other browser image source, so
 * the video is SDR content. The engine has no HDR video path: an HDR clip
 * reaches it as whatever SDR frames the browser hands over.
 */
export class Video extends Sprite {
  public readonly onStart = new Signal();
  public readonly onStop = new Signal();
  /**
   * Dispatched when the media fails after the asset was already usable - a
   * transfer that breaks mid-playback, or a decode error on a later frame.
   *
   * A failure BEFORE the asset becomes ready fails the load instead, and is
   * reported by `Loader.onError`; this signal is the runtime counterpart, so
   * one load never appears to fail twice.
   */
  public readonly onError = new Signal<[error: Error]>();

  private readonly _videoElement: HTMLVideoElement;
  /** Texture allocated by this Video; the caller may later replace Sprite.texture. */
  private readonly _ownedTexture: VideoTexture;
  private _volume = 1;
  private _playbackRate = 1;
  private _loop = false;
  private _muted = false;
  private _bus: AudioBus | null = null;
  private _audioSetup: VideoAudioSetup | null = null;
  private _frameWidth = 0;
  private _frameHeight = 0;
  /**
   * Scratch rectangle for {@link updateTexture}. `setTextureFrame` reads its
   * `frame` argument again after re-entering node code (bounds/origin
   * invalidation), so passing the shared `Rectangle.temp` here would risk a
   * concurrent caller clobbering it mid-call; this one is private to the
   * instance.
   */
  private readonly _frameScratch = new Rectangle();
  private readonly _onFrameHandler = (): void => {
    this.invalidateContent();
    this.updateTexture();
  };
  private readonly _onErrorHandler: () => void;
  private readonly _onAudioContextReady = (ctx: AudioContext): void => {
    onAudioContextReady.remove(this._onAudioContextReady);
    this.setupWithAudioContext(ctx);
  };

  public constructor(videoElement: HTMLVideoElement, playbackOptions?: Partial<PlaybackOptions>, textureOptions?: Partial<TextureOptions>) {
    super(new VideoTexture(videoElement, textureOptions));

    this._ownedTexture = this.texture as VideoTexture;

    const { volume, playbackRate, loop, muted } = videoElement;

    this._videoElement = videoElement;
    this._volume = volume;
    this._playbackRate = playbackRate;
    this._loop = loop;
    this._muted = muted;
    this._onErrorHandler = this._onMediaError.bind(this);
    this._ownedTexture.frameSource.onFrame.add(this._onFrameHandler);
    this._videoElement.addEventListener('error', this._onErrorHandler);

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
  }

  public get videoElement(): HTMLVideoElement {
    return this._videoElement;
  }

  /** Media duration in seconds; `NaN` until the element has loaded its metadata. */
  public get duration(): number {
    return this._videoElement.duration;
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
   * The Web Audio node this video's audio stream terminates in, or `null` when
   * the audio context has not yet been initialized. Connect an analyser node
   * here for audio-reactive visuals.
   *
   * Which concrete node type this is belongs to the routing implementation and
   * is not part of the contract.
   */
  public get analyserTarget(): AudioNode | null {
    return this._audioSetup?.gainNode ?? null;
  }

  /**
   * The {@link AudioBus} this video's audio routes into, or `null` when none
   * has been assigned. Set `video.bus = app.audio.master` to route through a
   * system's mix; assigning `null` routes straight to the context destination.
   */
  public get bus(): AudioBus | null {
    return this._bus;
  }

  public set bus(bus: AudioBus | null) {
    if (this._bus === bus) {
      return;
    }

    if (this._audioSetup) {
      this._audioSetup.gainNode.disconnect();
    }

    this._bus = bus;

    if (this._audioSetup) {
      const inputNode = bus?.getInputNode() ?? null;

      if (inputNode) {
        this._audioSetup.gainNode.connect(inputNode);
      } else {
        this._audioSetup.gainNode.connect(this._audioSetup.audioContext.destination);
      }
    }
  }

  /**
   * Start video playback. Applies `options` before playing.
   *
   * When the video was paused, `onStart` is dispatched once the element has
   * actually started playing. A start the browser refuses (autoplay policy) or
   * one superseded by `pause()` before it begins dispatches nothing.
   */
  public play(options?: Partial<PlaybackOptions>): this {
    if (options) {
      this.applyOptions(options);
    }

    if (this.paused) {
      this._videoElement.play().then(this._onPlayStarted, noop);
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
    } else {
      this._videoElement.volume = Math.min(volume, 1);
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
      } else {
        this._videoElement.muted = muted;
      }
    }

    return this;
  }

  /** @internal */
  public override collect(builder: RenderPlanBuilder, seq?: number): void {
    if (this.visible) {
      this.updateTexture();
    }

    super.collect(builder, seq);
  }

  /**
   * Syncs the texture with the current video frame and fits the sprite to a
   * changed video size. Called automatically when the video renders; the
   * upload itself happens when a renderer binds the texture.
   */
  public override updateTexture(): this {
    const texture = this.texture;

    if (!texture || texture.destroyed) {
      return this;
    }

    if (texture instanceof FrameTexture) {
      texture.sync();
    }

    const { width, height } = texture;

    if (width > 0 && height > 0 && (width !== this._frameWidth || height !== this._frameHeight)) {
      const preserveSize = this.textureFrame.width > 0 && this.textureFrame.height > 0;

      this._frameWidth = width;
      this._frameHeight = height;
      this.setTextureFrame(this._frameScratch.set(0, 0, width, height), !preserveSize);
    }

    return this;
  }

  public override destroy(): void {
    if (this.destroyed) {
      return;
    }

    super.destroy();
    this.stop();
    this._videoElement.removeEventListener('error', this._onErrorHandler);

    // Always release the texture allocated by this Video, even if a caller
    // replaced Sprite.texture. A replacement remains caller-owned.
    this._ownedTexture.frameSource.onFrame.remove(this._onFrameHandler);
    this._ownedTexture.destroy();

    onAudioContextReady.remove(this._onAudioContextReady);

    if (this._audioSetup) {
      this._audioSetup.sourceNode.disconnect();
      this._audioSetup.gainNode.disconnect();
      this._audioSetup = null;
    }

    this.onStart.destroy();
    this.onStop.destroy();
    this.onError.destroy();
    this._frameScratch.destroy();
  }

  private readonly _onPlayStarted = (): void => {
    if (!this.paused) {
      this.onStart.dispatch();
    }
  };

  private _onMediaError(): void {
    this.onError.dispatch(new Error(mediaErrorMessage(this._videoElement, 'Video playback failed.')));
  }

  private readonly setupWithAudioContext = (audioContext: AudioContext): void => {
    const gainNode = audioContext.createGain();
    gainNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, audioContext.currentTime, 0.01);

    const inputNode = this.bus?.getInputNode() ?? null;

    if (inputNode) {
      gainNode.connect(inputNode);
    } else {
      gainNode.connect(audioContext.destination);
    }

    const sourceNode = audioContext.createMediaElementSource(this._videoElement);
    sourceNode.connect(gainNode);

    // Until now the element itself carried volume and mute. Browsers differ in
    // whether those still attenuate the source node, so neutralize them and
    // leave the gain node as the only control.
    this._videoElement.volume = 1;
    this._videoElement.muted = false;

    this._audioSetup = { audioContext, gainNode, sourceNode };
  };
}
