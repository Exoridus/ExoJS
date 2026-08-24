import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetFactory } from '#assets/AssetFactory';
import type { AssetSourceCodec } from '#assets/AssetSourceCodec';
import type { AssetRequest } from '#assets/AssetType';
import { AssetType } from '#assets/AssetType';
import type { MediaAssetOptions, MediaAssetSource } from '#assets/factories/mediaSource';
import { type MusicAssetOptions, MusicFactory } from '#assets/factories/MusicFactory';
import { type VideoAssetOptions, VideoFactory } from '#assets/factories/VideoFactory';
import { AudioStream } from '#audio/AudioStream';
import type { NetworkSnapshot } from '#core/Connectivity';
import { Video } from '#rendering/video/Video';

/**
 * Whether this request streams from its URL, or takes the acquisition path.
 *
 * Streaming is what an ordinary load does, and it is the point: the element
 * owns the transfer and never holds more than it is playing. Nothing about the
 * request changes that - only the network does. Streaming reaches the network
 * directly, past the cache and therefore past every policy, so a request that
 * kept streaming while the application forbade the network would quietly
 * violate that. Declining to stream puts it back on the acquisition path, where
 * a cached blob answers and an uncached one misses.
 *
 * Persisting a source for that path is a separate operation - `cacheSource` -
 * rather than a flag on the load.
 */
function streamsFromUrl(network: NetworkSnapshot): boolean {
  return network.allowsNetwork;
}

/**
 * How a media type reads an acquisition it did not stream.
 *
 * The representation is a `Blob`, not an `ArrayBuffer`: it is what a media
 * element can be pointed at directly, it survives structured clone into a
 * persistent store, and it lets the browser keep the data out of the JavaScript
 * heap - which is the difference between caching a 200 MB video and running out
 * of memory trying.
 *
 * Only a request that did not stream ever reaches this: the data came from an
 * acquisition, a container slice or a cache.
 */
const mediaSourceCodec: AssetSourceCodec<MediaAssetSource, Blob> = {
  fromResponse: response => response.blob(),
  fromBytes: bytes => Promise.resolve(new Blob([bytes])),
  decode: blob => Promise.resolve({ blob }),
};

/**
 * The identity a media request contributes beyond its locator.
 *
 * The transport is deliberately absent: one URL is one asset whether the
 * browser streamed it, the loader acquired it, or a container carried it, so
 * whichever load materializes it first decides how it was built and every later
 * consumer joins it.
 *
 * A non-default CORS mode IS identity, because it is baked into the element: a
 * `null` element plays but can never be uploaded as a texture, and
 * `'use-credentials'` can resolve to a different response altogether. Neither
 * can be handed to a consumer that asked for the other. It is asked for per
 * request rather than per transport, so it counts whichever way the data
 * arrives - a blob-backed element is same-origin anyway, and separating the two
 * would put the transport back into identity to save one resident element.
 */
function mediaIdentity({ options }: AssetRequest<MediaAssetOptions & { mimeType?: string }>): string {
  const parts: string[] = [];

  if (options?.mimeType !== undefined) {
    parts.push(`mimeType=${options.mimeType}`);
  }

  if (options?.crossOrigin !== undefined && options.crossOrigin !== 'anonymous') {
    parts.push(`crossOrigin=${String(options.crossOrigin)}`);
  }

  return parts.join(',');
}

/** Streaming audio backed by an `<audio>` element. */
export class MusicAssetType extends AssetType<MediaAssetSource, AudioStream, MusicAssetOptions, Blob> {
  public readonly id = 'music';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = AudioStream;
  public override readonly codec = mediaSourceCodec;

  public override unacquiredSource(_request: AssetRequest<MusicAssetOptions>, url: string, network: NetworkSnapshot): { source: MediaAssetSource } | undefined {
    return streamsFromUrl(network) ? { source: { url } } : undefined;
  }

  public override resourceIdentity(request: AssetRequest<MusicAssetOptions>): string {
    return mediaIdentity(request);
  }

  public createFactory(): AssetFactory<MediaAssetSource, AudioStream, MusicAssetOptions> {
    return new MusicFactory();
  }
}

/** Streaming video backed by a `<video>` element, usable as a texture source. */
export class VideoAssetType extends AssetType<MediaAssetSource, Video, VideoAssetOptions, Blob> {
  public readonly id = 'video';
  public override readonly leaf = 'none';
  public override readonly _token: AssetConstructor = Video;
  public override readonly codec = mediaSourceCodec;

  public override unacquiredSource(_request: AssetRequest<VideoAssetOptions>, url: string, network: NetworkSnapshot): { source: MediaAssetSource } | undefined {
    return streamsFromUrl(network) ? { source: { url } } : undefined;
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
