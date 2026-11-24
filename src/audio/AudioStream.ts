import { Signal } from '#core/Signal';
import type { PlaybackOptions } from '#core/types';

import type { AudioStreamVoice } from './AudioStreamVoice';
import { MediaAudio } from './MediaAudio';

/**
 * Connection health of an {@link AudioStream}, independent of whether a voice is
 * playing.
 *
 * - `'connected'`: media data arrives.
 * - `'buffering'`: the source is slow; playback waits for data.
 * - `'reconnecting'`: the connection broke and the stream is reopening it.
 * - `'disconnected'`: the connection is gone and no reconnect is pending.
 */
export type AudioStreamConnection = 'connected' | 'buffering' | 'reconnecting' | 'disconnected';

/** Automatic reconnection after a broken connection. */
export interface AudioStreamReconnectOptions {
  /** Attempts before the stream gives up and reports `'disconnected'`. Default 5. */
  readonly attempts?: number;
  /** Delay before the first attempt in milliseconds; each further attempt doubles it. Default 1000. */
  readonly delay?: number;
}

/** Construction options for {@link AudioStream}. */
export interface AudioStreamOptions extends Partial<PlaybackOptions> {
  /**
   * Reopens the source after the connection breaks. Only a source streamed from
   * a URL can be reopened; a stream built from local data never reconnects.
   * `false` disables it.
   */
  readonly reconnect?: AudioStreamReconnectOptions | false;
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY = 1000;

/**
 * A live or unbounded audio source, such as internet radio.
 *
 * Readiness means playback can start: a live source never finishes
 * downloading. Its duration may be `Infinity`, seeking is only available when
 * the source reports a seekable range, and the connection can break and
 * recover while the stream exists. {@link connection} and
 * {@link onConnectionChange} report that health separately from playback.
 *
 * When the connection breaks - a network error, or the server ending the
 * response of a live source - a URL-backed stream reopens the URL with
 * exponential backoff, and a voice that was playing resumes once data arrives.
 * After the configured attempts it reports `'disconnected'` and dispatches
 * {@link onError}. {@link reconnect} starts a new round manually.
 *
 * Load it with `assets.load({ type: AudioStream, source: 'https://radio.example/stream' })`.
 * Use {@link Music} for a finite track.
 */
export class AudioStream extends MediaAudio {
  /** Dispatched whenever {@link connection} changes. */
  public readonly onConnectionChange = new Signal<[connection: AudioStreamConnection]>();

  private _connection: AudioStreamConnection = 'connected';
  private readonly _source: string | undefined;
  private readonly _attempts: number;
  private readonly _delay: number;
  private _attempt = 0;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _resumeAfterReconnect: AudioStreamVoice | null = null;

  private readonly _onPlaying = (): void => {
    this._attempt = 0;
    this._setConnection('connected');
  };

  private readonly _onCanPlay = (): void => {
    if (this._connection !== 'disconnected') {
      this._attempt = 0;
      this._setConnection('connected');
    }

    const resumeVoice = this._resumeAfterReconnect;
    this._resumeAfterReconnect = null;

    // Reloading the element can itself make `paused` true, so consult the
    // voice's user pause/hold intent, not the browser's transient element state.
    if (this._connection !== 'disconnected' && resumeVoice !== null && resumeVoice === this._voice && resumeVoice._canAutoResume) {
      resumeVoice.resume();
    }
  };

  private readonly _onWaiting = (): void => {
    if (this._connection === 'connected') {
      this._setConnection('buffering');
    }
  };

  private readonly _onEnded = (): void => {
    // A finite file that ends has simply finished; a live source that ends lost its server.
    if (!Number.isFinite(this._audioElement.duration)) {
      this._connectionLost(new Error('The audio stream ended unexpectedly.'));
    }
  };

  /**
   * @param audioElement - An element already pointed at its source.
   * @param options - Default playback settings and the reconnect policy.
   */
  public constructor(audioElement: HTMLAudioElement, options?: AudioStreamOptions) {
    super(audioElement, options);

    const reconnect = options?.reconnect;
    const src = audioElement.currentSrc || audioElement.src;

    // An object URL reads local data: reopening it cannot repair anything.
    this._source = reconnect === false || src === '' || src.startsWith('blob:') ? undefined : src;
    this._attempts = reconnect === false ? 0 : Math.max(0, reconnect?.attempts ?? DEFAULT_ATTEMPTS);
    this._delay = reconnect === false ? 0 : Math.max(0, reconnect?.delay ?? DEFAULT_DELAY);

    audioElement.addEventListener('playing', this._onPlaying);
    audioElement.addEventListener('canplay', this._onCanPlay);
    audioElement.addEventListener('waiting', this._onWaiting);
    audioElement.addEventListener('stalled', this._onWaiting);
    audioElement.addEventListener('ended', this._onEnded);
  }

  /** The current connection health. */
  public get connection(): AudioStreamConnection {
    return this._connection;
  }

  /** `true` when the source reports no finite duration. */
  public get live(): boolean {
    return !Number.isFinite(this._audioElement.duration);
  }

  /** `true` only while the source reports a finite seekable range. */
  public get seekable(): boolean {
    return !this.live && this._audioElement.seekable.length > 0;
  }

  /**
   * Reopens the source now and restarts the attempt count. A voice that was
   * playing resumes once data arrives. Does nothing for a stream built from
   * local data or after {@link destroy}.
   */
  public reconnect(): void {
    if (this.destroyed || this._source === undefined) {
      return;
    }

    this._attempt = 0;
    this._clearTimer();
    this._reopen();
  }

  public override destroy(): void {
    if (this.destroyed) {
      return;
    }

    this._clearTimer();
    this._resumeAfterReconnect = null;

    const element = this._audioElement;

    element.removeEventListener('playing', this._onPlaying);
    element.removeEventListener('canplay', this._onCanPlay);
    element.removeEventListener('waiting', this._onWaiting);
    element.removeEventListener('stalled', this._onWaiting);
    element.removeEventListener('ended', this._onEnded);
    super.destroy();
    this.onConnectionChange.destroy();
  }

  protected override _onMediaError(error: Error): void {
    this._connectionLost(error);
  }

  /**
   * Recoverable live EOF must not finish the only voice before reconnect.
   * @internal
   */
  protected override _endVoiceOnMediaEnded(): boolean {
    return this._connection !== 'reconnecting';
  }

  private _connectionLost(error: Error): void {
    if (this.destroyed) {
      return;
    }

    if (this._source === undefined || this._attempt >= this._attempts) {
      this._clearTimer();
      this._resumeAfterReconnect = null;
      this._setConnection('disconnected');
      super._onMediaError(error);

      return;
    }

    if (this._timer !== undefined) {
      return;
    }

    const delay = this._delay * 2 ** this._attempt;

    this._attempt++;
    this._setConnection('reconnecting');
    this._timer = setTimeout(() => {
      this._timer = undefined;
      this._reopen();
    }, delay);
  }

  private _reopen(): void {
    const voice = this._voice;

    // Preserve playback intent, not HTMLMediaElement.paused: browsers may
    // pause the element automatically when its connection breaks.
    this._resumeAfterReconnect = voice?._canAutoResume ? voice : null;
    this._setConnection('reconnecting');
    this._audioElement.src = this._source!;
    this._audioElement.load();
  }

  private _setConnection(connection: AudioStreamConnection): void {
    if (this._connection !== connection) {
      this._connection = connection;
      this.onConnectionChange.dispatch(connection);
    }
  }

  private _clearTimer(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }
}
