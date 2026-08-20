import { AbstractAssetFactory } from '#assets/AbstractAssetFactory';
import { determineMimeType } from '#assets/utils';
import type { PlaybackOptions } from '#core/types';
import type { TextureOptions } from '#rendering/texture/TextureOptions';
import { Video } from '#rendering/video/Video';

import { attachMediaSource, detachMediaElement, type MediaLoadMessages, type MediaLoadOptions } from './mediaSource';

const MESSAGES: MediaLoadMessages = {
  error: 'Video loading error.',
  abort: 'Video loading error: cancelled.',
  emptied: 'Video loading error: emptied.',
  stalled: 'Video loading stalled.',
};

/** Construction options for {@link VideoFactory.create} and {@link VideoFactory.createFromUrl}. */
export interface VideoFactoryOptions extends MediaLoadOptions {
  /**
   * MIME type for the video blob. Inferred from magic bytes when omitted, and
   * unused by streamed media, whose type comes from the response.
   */
  mimeType?: string;
  /** Initial playback settings forwarded to the {@link Video} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Sampling and upload state forwarded to the {@link Video} instance's texture. */
  textureOptions?: Partial<TextureOptions>;
}

/**
 * {@link AssetFactory} implementation that loads video files (MP4, WebM, OGG,
 * and other browser-supported container formats) and produces a {@link Video}
 * instance suitable for use as a dynamic texture source in the rendering
 * pipeline.
 *
 * A URL-backed asset hands the resolved URL to the element and lets the browser
 * stream it, which is what keeps a long video off the heap. {@link create}
 * takes the complete bytes instead - the path used by `download: true` and by
 * container entries - and wraps them in a blob.
 *
 * Streamed video defaults to `crossOrigin: 'anonymous'`, because a cross-origin
 * element without it plays but cannot be uploaded as a texture.
 *
 * The `<video>` elements this factory created are paused and detached when the
 * asset is released, and again when {@link VideoFactory.destroy} runs.
 */
export class VideoFactory extends AbstractAssetFactory<Video> {
  public readonly storageName = 'video';

  private readonly _videoElements: HTMLVideoElement[] = [];

  /**
   * Reads the full response body as an {@link ArrayBuffer} for blob
   * construction.
   */
  public async process(response: Response): Promise<ArrayBuffer> {
    return response.arrayBuffer();
  }

  /**
   * Wraps video bytes in a `<video>` element and resolves with a {@link Video}
   * instance once the configured `loadEvent` fires.
   *
   * Rejects if the element emits `error`, `abort`, or `emptied` before the
   * load event is received.
   */
  public async create(source: ArrayBuffer, options: VideoFactoryOptions = {}): Promise<Video> {
    const { mimeType, playbackOptions, textureOptions } = options;
    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });
    const objectUrl = this.createObjectUrl(blob);
    const video = this._createElement();

    await attachMediaSource({
      element: video,
      src: objectUrl,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      signal: undefined,
      onSettled: () => this.revokeObjectUrl(objectUrl),
    });

    return new Video(video, playbackOptions, textureOptions);
  }

  /**
   * Streams the media at `url` through a `<video>` element and resolves with a
   * {@link Video} once the configured `loadEvent` fires.
   *
   * The resource is ready to play, not fully downloaded: the browser continues
   * transferring during playback, and a failure after this point is reported by
   * {@link Video.onError} rather than by this promise.
   */
  public async createFromUrl(url: string, options: VideoFactoryOptions = {}, signal?: AbortSignal): Promise<Video> {
    const video = this._createElement();

    await attachMediaSource({
      element: video,
      src: url,
      messages: MESSAGES,
      loadEvent: options.loadEvent,
      stallTimeout: options.stallTimeout,
      crossOrigin: options.crossOrigin === undefined ? 'anonymous' : options.crossOrigin,
      signal,
    });

    return new Video(video, options.playbackOptions, options.textureOptions);
  }

  /** Ends playback and the transfer behind a released video. */
  public dispose(resource: Video): void {
    const video = resource.videoElement;

    resource.destroy();
    detachMediaElement(video);

    const index = this._videoElements.indexOf(video);

    if (index !== -1) {
      this._videoElements.splice(index, 1);
    }
  }

  /**
   * Pauses and resets all `<video>` elements created by this factory to
   * release media resources, then delegates to the base
   * {@link AbstractAssetFactory.destroy} to revoke any object URLs.
   */
  public override destroy(): void {
    for (const video of this._videoElements) {
      detachMediaElement(video);
    }
    this._videoElements.length = 0;
    super.destroy();
  }

  private _createElement(): HTMLVideoElement {
    const video = document.createElement('video');

    this._videoElements.push(video);

    return video;
  }
}
