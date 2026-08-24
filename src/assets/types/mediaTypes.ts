import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import type { MediaAssetOptions, MediaAssetSource } from '#assets/factories/mediaSource';
import { type MusicAssetOptions, MusicFactory } from '#assets/factories/MusicFactory';
import { type VideoAssetOptions, VideoFactory } from '#assets/factories/VideoFactory';
import { AudioStream } from '#audio/AudioStream';
import { Video } from '#rendering/video/Video';

/**
 * How a media type reads an acquisition it did not stream.
 *
 * Only a request that opted out of streaming ever reaches this: the bytes came
 * from a download, a container slice or a cache, and the element is built over
 * them instead of over a URL.
 */
const mediaSourceCodec: AssetSourceCodec<MediaAssetSource, ArrayBuffer> = {
  fromResponse: response => response.arrayBuffer(),
  fromBytes: bytes => Promise.resolve(bytes),
  decode: bytes => Promise.resolve({ bytes }),
};

/**
 * The identity a streaming media request contributes beyond its locator.
 *
 * The transport is deliberately absent: one URL is one asset whether the
 * browser streamed it, the loader downloaded it, or a container carried it, so
 * whichever load materializes it first decides how it was built and every later
 * consumer joins it.
 *
 * A non-default CORS mode IS identity, because it is baked into the element: a
 * `null` element plays but can never be uploaded as a texture, and
 * `'use-credentials'` can resolve to a different response altogether. Neither
 * can be handed to a consumer that asked for the other. It is irrelevant to
 * bytes the application already owns, so a downloaded asset ignores it.
 */
function mediaIdentity({ options }: AssetRequest<MediaAssetOptions & { mimeType?: string }>): string {
  const parts: string[] = [];

  if (options?.mimeType !== undefined) {
    parts.push(`mimeType=${options.mimeType}`);
  }

  if (options?.download !== true && options?.crossOrigin !== undefined && options.crossOrigin !== 'anonymous') {
    parts.push(`crossOrigin=${String(options.crossOrigin)}`);
  }

  return parts.join(',');
}

/** Streaming audio backed by an `<audio>` element. */
export class MusicAssetType extends AssetType<MediaAssetSource, AudioStream, MusicAssetOptions, ArrayBuffer> {
  public readonly id = 'music';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = AudioStream;
  public override readonly codec = mediaSourceCodec;

  public override unacquiredSource({ options }: AssetRequest<MusicAssetOptions>, url: string): { source: MediaAssetSource } | undefined {
    return options?.download === true ? undefined : { source: { url } };
  }

  public override resourceIdentity(request: AssetRequest<MusicAssetOptions>): string {
    return mediaIdentity(request);
  }

  public createFactory(): AssetFactory<MediaAssetSource, AudioStream, MusicAssetOptions> {
    return new MusicFactory();
  }
}

/** Streaming video backed by a `<video>` element, usable as a texture source. */
export class VideoAssetType extends AssetType<MediaAssetSource, Video, VideoAssetOptions, ArrayBuffer> {
  public readonly id = 'video';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = Video;
  public override readonly codec = mediaSourceCodec;

  public override unacquiredSource({ options }: AssetRequest<VideoAssetOptions>, url: string): { source: MediaAssetSource } | undefined {
    return options?.download === true ? undefined : { source: { url } };
  }

  public override resourceIdentity(request: AssetRequest<VideoAssetOptions>): string {
    return mediaIdentity(request);
  }

  public createFactory(): AssetFactory<MediaAssetSource, Video, VideoAssetOptions> {
    return new VideoFactory();
  }
}

/** The built-in `music` asset type. */
export const musicType = new MusicAssetType();
/** The built-in `video` asset type. */
export const videoType = new VideoAssetType();
