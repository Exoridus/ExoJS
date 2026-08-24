import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { determineMimeType } from '#assets/utils';
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
  /** MIME type for the video blob. Inferred from the magic bytes when omitted, and unused by streamed media. */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link Video} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Sampling and upload state forwarded to the {@link Video} instance's texture. */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * Builds a {@link Video} over a `<video>` element usable as a dynamic texture
 * source, streaming from a URL or from bytes the application already owns.
 *
 * Streamed video defaults to `crossOrigin: 'anonymous'`: a cross-origin element
 * without it plays but can never be uploaded as a texture.
 * @internal
 */
export class VideoFactory implements AssetFactory<MediaAssetSource, Video, VideoAssetOptions> {
  private readonly _videoElements = new Set<HTMLVideoElement>();
  private readonly _objectUrls = new ObjectUrlPool();

  public async create(source: MediaAssetSource, context: AssetFactoryContext<VideoAssetOptions>): Promise<Video> {
    const options = context.options ?? {};
    const video = document.createElement('video');

    this._videoElements.add(video);

    if (source.bytes !== undefined) {
      const objectUrl = this._objectUrls.create(new Blob([source.bytes], { type: options.mimeType ?? determineMimeType(source.bytes) }));

      await attachMediaSource({
        element: video,
        src: objectUrl,
        messages: MESSAGES,
        loadEvent: options.loadEvent,
        stallTimeout: options.stallTimeout,
        signal: context.signal,
        onSettled: () => this._objectUrls.revoke(objectUrl),
      });
    } else {
      await attachMediaSource({
        element: video,
        src: source.url,
        messages: MESSAGES,
        loadEvent: options.loadEvent,
        stallTimeout: options.stallTimeout,
        crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin,
        signal: context.signal,
      });
    }

    return new Video(video, options.playbackOptions, options.textureOptions);
  }

  /** Ends playback and the transfer behind a released video. */
  public dispose(resource: Video): void {
    const video = resource.videoElement;

    resource.destroy();
    detachMediaElement(video);
    this._videoElements.delete(video);
  }

  public destroy(): void {
    for (const video of this._videoElements) {
      detachMediaElement(video);
    }

    this._videoElements.clear();
    this._objectUrls.revokeAll();
  }
}
