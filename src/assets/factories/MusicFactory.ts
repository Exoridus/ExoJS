import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
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
  /**
   * MIME type for the media data. Overrides what the response or the container
   * declared; unused by streamed media, whose type comes from the response.
   */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link AudioStream} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
}

/**
 * Builds an {@link AudioStream} over an `<audio>` element, streaming from a URL
 * or reading data the application already owns.
 *
 * Every element it created is paused and detached when its asset is released,
 * and again on teardown. An object URL made for a blob-backed element lives
 * exactly as long as that element: revoking it earlier would break a seek past
 * the buffered range, which re-reads the source.
 * @internal
 */
export class MusicFactory implements AssetFactory<MediaAssetSource, AudioStream, MusicAssetOptions> {
  /** Each element this factory made, and the object URL it owns on that element's behalf. */
  private readonly _elements = new Map<HTMLMediaElement, string | undefined>();
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: MediaAssetSource, context: AssetFactoryContext<MusicAssetOptions>): Promise<AudioStream> {
    const options = context.options ?? {};
    const audio = document.createElement('audio');
    // A streamed element points at the URL; one built from data the application
    // owns points at an object URL this factory then owns on its behalf.
    let objectUrl: string | undefined;
    let src: string;

    if (source.blob === undefined) {
      src = source.url;
    } else {
      objectUrl = this._objectUrls.create(retyped(source.blob, options.mimeType));
      src = objectUrl;
    }

    this._elements.set(audio, objectUrl);

    await attachMediaSource({
      element: audio,
      src,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      // A blob URL is same-origin by construction, and setting the attribute for
      // it would only restrict what the element may then be used for.
      ...(objectUrl === undefined && { crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin }),
      signal: context.signal,
    });

    return new AudioStream(audio, options.playbackOptions);
  }

  /** Ends playback and the transfer behind a released stream, and frees its data. */
  public dispose(resource: AudioStream): void {
    const audio = resource.audioElement;

    resource.destroy();
    detachMediaElement(audio);

    const objectUrl = this._elements.get(audio);

    if (objectUrl !== undefined) {
      this._objectUrls.revoke(objectUrl);
    }

    this._elements.delete(audio);
  }

  public destroy(): void {
    for (const audio of this._elements.keys()) {
      detachMediaElement(audio);
    }

    this._elements.clear();
    this._objectUrls.revokeAll();
  }
}

/** Re-wrap a blob only when the request asked for a MIME type it does not already carry. */
function retyped(blob: Blob, mimeType: string | undefined): Blob {
  return mimeType === undefined || mimeType === blob.type ? blob : new Blob([blob], { type: mimeType });
}
