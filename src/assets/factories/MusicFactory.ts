import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';
import { AudioStream } from '#audio/AudioStream';
import type { PlaybackOptions } from '#core/types';

import { attachMediaSource, detachMediaElement, type MediaAssetOptions, type MediaAssetSource, type MediaLoadMessages } from './mediaSource';
import { ObjectUrlPool } from './ObjectUrlPool';

const MESSAGES: MediaLoadMessages = {
  error: 'Error loading audio source.',
  abort: 'Audio loading was canceled.',
  emptied: 'Audio loading was emptied.',
  stalled: 'Audio loading stalled.',
};

/** Options accepted by an asset of the built-in `music` type. */
export interface MusicAssetOptions extends MediaAssetOptions {
  /** MIME type for the audio blob. Inferred from the magic bytes when omitted, and unused by streamed media. */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link AudioStream} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
}

/**
 * Builds an {@link AudioStream} over an `<audio>` element, streaming from a URL
 * or from bytes the application already owns.
 *
 * Every element it created is paused and detached when its asset is released,
 * and again on teardown.
 * @internal
 */
export class MusicFactory implements AssetFactory<MediaAssetSource, AudioStream, MusicAssetOptions> {
  private readonly _audioElements = new Set<HTMLAudioElement>();
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: MediaAssetSource, context: AssetFactoryContext<MusicAssetOptions>): Promise<AudioStream> {
    const options = context.options ?? {};
    const audio = document.createElement('audio');

    this._audioElements.add(audio);

    if (source.bytes !== undefined) {
      const objectUrl = this._objectUrls.create(new Blob([source.bytes], { type: options.mimeType ?? determineMimeType(source.bytes) }));

      await attachMediaSource({
        element: audio,
        src: objectUrl,
        messages: MESSAGES,
        loadEvent: options.loadEvent,
        stallTimeout: options.stallTimeout,
        signal: context.signal,
        // The element has taken its own reference by the time it settles, so the
        // URL has done its job; leaving it alive would pin the blob for the
        // lifetime of the document.
        onSettled: () => this._objectUrls.revoke(objectUrl),
      });
    } else {
      await attachMediaSource({
        element: audio,
        src: source.url,
        messages: MESSAGES,
        loadEvent: options.loadEvent,
        stallTimeout: options.stallTimeout,
        crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin,
        signal: context.signal,
      });
    }

    return new AudioStream(audio, options.playbackOptions);
  }

  /** Ends playback and the transfer behind a released stream. */
  public dispose(resource: AudioStream): void {
    const audio = resource.audioElement;

    resource.destroy();
    detachMediaElement(audio);
    this._audioElements.delete(audio);
  }

  public destroy(): void {
    for (const audio of this._audioElements) {
      detachMediaElement(audio);
    }

    this._audioElements.clear();
    this._objectUrls.revokeAll();
  }
}
