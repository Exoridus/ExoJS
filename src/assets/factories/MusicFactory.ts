import { AbstractAssetFactory } from '#assets/AbstractAssetFactory';
import { determineMimeType } from '#assets/utils';
import { AudioStream } from '#audio/AudioStream';
import type { PlaybackOptions } from '#core/types';

import { attachMediaSource, detachMediaElement, type MediaLoadMessages, type MediaLoadOptions } from './mediaSource';

const MESSAGES: MediaLoadMessages = {
  error: 'Error loading audio source.',
  abort: 'Audio loading was canceled.',
  emptied: 'Audio loading was emptied.',
  stalled: 'Audio loading stalled.',
};

/** Construction options for {@link MusicFactory.create} and {@link MusicFactory.createFromUrl}. */
export interface MusicFactoryOptions extends MediaLoadOptions {
  /**
   * MIME type for the audio blob. Inferred from magic bytes when omitted, and
   * unused by streamed media, whose type comes from the response.
   */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link AudioStream} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
}

/**
 * {@link AssetFactory} implementation that loads streaming audio assets
 * (MP3, OGG, WAV, AAC, and other browser-supported formats) and produces an
 * {@link AudioStream} instance backed by an `<audio>` element.
 *
 * A URL-backed asset hands the resolved URL to the element and lets the browser
 * stream it, so memory and network scale with playback rather than with total
 * duration. {@link create} takes the complete bytes instead - the path used by
 * `download: true` and by container entries - and wraps them in a blob.
 *
 * The `<audio>` elements this factory created are paused and detached when the
 * asset is released, and again when {@link MusicFactory.destroy} runs.
 */
export class MusicFactory extends AbstractAssetFactory<AudioStream> {
  public readonly storageName = 'music';

  private readonly _audioElements: HTMLAudioElement[] = [];

  /**
   * Reads the full response body as an {@link ArrayBuffer} for blob
   * construction.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Wraps audio bytes in an `<audio>` element and resolves with an
   * {@link AudioStream} instance once the configured `loadEvent` fires.
   *
   * Rejects if the element emits an `error`, `abort` or `emptied` event before
   * the load event is received.
   */
  public async create(source: ArrayBuffer, options: MusicFactoryOptions = {}): Promise<AudioStream> {
    const { mimeType, playbackOptions } = options;
    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });
    const objectUrl = this.createObjectUrl(blob);
    const audio = this._createElement();

    await attachMediaSource({
      element: audio,
      src: objectUrl,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      signal: undefined,
      onSettled: () => this.revokeObjectUrl(objectUrl),
    });

    return new AudioStream(audio, playbackOptions);
  }

  /**
   * Streams the media at `url` through an `<audio>` element and resolves with an
   * {@link AudioStream} once the configured `loadEvent` fires.
   *
   * The resource is ready to play, not fully downloaded: the browser continues
   * transferring during playback, and a failure after this point is reported by
   * {@link AudioStream.onError} rather than by this promise.
   */
  public async createFromUrl(url: string, options: MusicFactoryOptions = {}, signal?: AbortSignal): Promise<AudioStream> {
    const audio = this._createElement();

    await attachMediaSource({
      element: audio,
      src: url,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin,
      signal,
    });

    return new AudioStream(audio, options.playbackOptions);
  }

  /** Ends playback and the transfer behind a released stream. */
  public dispose(resource: AudioStream): void {
    const audio = resource.audioElement;

    resource.destroy();
    detachMediaElement(audio);

    const index = this._audioElements.indexOf(audio);

    if (index !== -1) {
      this._audioElements.splice(index, 1);
    }
  }

  /**
   * Pauses and resets all `<audio>` elements created by this factory to
   * release media resources, then delegates to the base
   * {@link AbstractAssetFactory.destroy} to revoke any object URLs.
   */
  public override destroy(): void {
    for (const audio of this._audioElements) {
      detachMediaElement(audio);
    }
    this._audioElements.length = 0;
    super.destroy();
  }

  private _createElement(): HTMLAudioElement {
    const audio = document.createElement('audio');

    this._audioElements.push(audio);

    return audio;
  }
}
