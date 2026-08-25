import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import type { PlaybackOptions } from '#core/types';
import type { TextureOptions } from '#rendering/texture/TextureOptions';
import { Video } from '#rendering/video/Video';

import { attachMediaSource, detachMediaElement, type MediaAssetOptions, type MediaAssetSource, type MediaLoadMessages } from './mediaSource';
import { ObjectUrlPool } from './ObjectUrlPool';

const MESSAGES: MediaLoadMessages = {
  error: 'Video loading error.',
  abort: 'Video loading error: cancelled.',
  emptied: 'Video loading error: emptied.',
  stalled: 'Video loading stalled.',
};

/** Options accepted by an asset of the built-in `video` type. */
export interface VideoAssetOptions extends MediaAssetOptions {
  /**
   * MIME type for the media data. Overrides what the response or the container
   * declared; unused by streamed media, whose type comes from the response.
   */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link Video} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Sampling and upload state forwarded to the {@link Video} instance's texture. */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * Builds a {@link Video} over a `<video>` element usable as a dynamic texture
 * source, streaming from a URL or reading data the application already owns.
 *
 * Streamed video defaults to `crossOrigin: 'anonymous'`: a cross-origin element
 * without it plays but can never be uploaded as a texture. Blob-backed video
 * needs no such attribute - the object URL is same-origin by construction.
 *
 * An object URL made for a blob-backed element lives exactly as long as that
 * element: revoking it earlier would break a seek past the buffered range,
 * which re-reads the source.
 * @internal
 */
export class VideoFactory implements AssetFactory<MediaAssetSource, Video, VideoAssetOptions> {
  /** Each element this factory made, and the object URL it owns on that element's behalf. */
  private readonly _elements = new Map<HTMLMediaElement, string | undefined>();
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: MediaAssetSource, context: AssetFactoryContext<VideoAssetOptions>): Promise<Video> {
    const options = context.options ?? {};
    const video = document.createElement('video');
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

    this._elements.set(video, objectUrl);

    await attachMediaSource({
      element: video,
      src,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      ...(objectUrl === undefined && { crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin }),
      signal: context.signal,
    });

    return new Video(video, options.playbackOptions, options.textureOptions);
  }

  /** Ends playback and the transfer behind a released video, and frees its data. */
  public dispose(resource: Video): void {
    const video = resource.videoElement;

    resource.destroy();
    detachMediaElement(video);

    const objectUrl = this._elements.get(video);

    if (objectUrl !== undefined) {
      this._objectUrls.revoke(objectUrl);
    }

    this._elements.delete(video);
  }

  public destroy(): void {
    for (const video of this._elements.keys()) {
      detachMediaElement(video);
    }

    this._elements.clear();
    this._objectUrls.revokeAll();
  }
}

/** Re-wrap a blob only when the request asked for a MIME type it does not already carry. */
const retyped = (blob: Blob, mimeType: string | undefined): Blob =>
  mimeType === undefined || mimeType === blob.type ? blob : new Blob([blob], { type: mimeType });
