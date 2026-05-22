import type { PlaybackOptions, StreamingLoadEvent } from '@/core/types';
import type { SamplerOptions } from '@/rendering/texture/Sampler';
import { Video } from '@/rendering/video/Video';
import { AbstractAssetFactory } from '@/resources/AbstractAssetFactory';
import { determineMimeType } from '@/resources/utils';

const onceListenerOption = { once: true };

/** Construction options for {@link VideoFactory.create}. */
export interface VideoFactoryOptions {
  /**
   * MIME type for the video blob. Inferred from magic bytes when omitted.
   */
  mimeType?: string;
  /**
   * The `HTMLVideoElement` event that signals the asset is ready for
   * playback. Defaults to `'canplaythrough'`. Use `'loadedmetadata'` for
   * faster (dimensions-only) readiness.
   */
  loadEvent?: StreamingLoadEvent;
  /** Initial playback settings forwarded to the {@link Video} instance. */
  playbackOptions?: Partial<PlaybackOptions>;
  /** Sampler parameters forwarded to the {@link Video} instance's texture. */
  samplerOptions?: Partial<SamplerOptions>;
  /**
   * Milliseconds to wait after a `stalled` event before rejecting the load
   * promise. When omitted no timeout is applied and a stalled load will wait
   * indefinitely. Each subsequent `stalled` event resets the timer.
   */
  stallTimeout?: number;
}

/**
 * {@link AssetFactory} implementation that loads video files (MP4, WebM, OGG,
 * and other browser-supported container formats) and produces a {@link Video}
 * instance suitable for use as a dynamic texture source in the rendering
 * pipeline.
 *
 * Video data is buffered via a `<video>` element rather than decoded up-front.
 * The `'stalled'` event is intentionally not treated as an error because it
 * fires transiently during normal buffering on slow connections. All `<video>`
 * elements are paused and detached when {@link VideoFactory.destroy} is called.
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
   * Wraps video bytes in a `<video>` element and resolves with a
   * {@link Video} instance once the configured `loadEvent` fires.
   *
   * Rejects if the element emits `error`, `abort`, or `emptied` before the
   * load event is received.
   */
  public async create(source: ArrayBuffer, options: VideoFactoryOptions = {}): Promise<Video> {
    const { mimeType, loadEvent, playbackOptions, samplerOptions, stallTimeout } = options;
    const blob = new Blob([source], { type: mimeType ?? determineMimeType(source) });
    const objectUrl = this.createObjectUrl(blob);

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      this._videoElements.push(video);

      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (stallTimer !== undefined) {
          clearTimeout(stallTimer);
          stallTimer = undefined;
        }
        this.revokeObjectUrl(objectUrl);
        fn();
      };

      video.addEventListener('error',   () => settle(() => reject(new Error('Video loading error.'))),            onceListenerOption);
      video.addEventListener('abort',   () => settle(() => reject(new Error('Video loading error: cancelled.'))), onceListenerOption);
      video.addEventListener('emptied', () => settle(() => reject(new Error('Video loading error: emptied.'))),   onceListenerOption);
      video.addEventListener(loadEvent ?? 'canplaythrough', () => settle(() => resolve(new Video(video, playbackOptions, samplerOptions))), onceListenerOption);

      // 'stalled' fires transiently during normal buffering on slow connections and is not
      // treated as an error by default. Supply stallTimeout to reject after a stall persists.
      if (stallTimeout !== undefined) {
        video.addEventListener('stalled', () => {
          if (settled) return;
          if (stallTimer !== undefined) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => settle(() => reject(new Error('Video loading stalled.'))), stallTimeout);
        });
      }

      video.preload = 'auto';
      video.src = objectUrl;
    });
  }

  /**
   * Pauses and resets all `<video>` elements created by this factory to
   * release media resources, then delegates to the base
   * {@link AbstractAssetFactory.destroy} to revoke any object URLs.
   */
  public override destroy(): void {
    for (const video of this._videoElements) {
      video.pause();
      video.src = '';
      video.load();
    }
    this._videoElements.length = 0;
    super.destroy();
  }
}
