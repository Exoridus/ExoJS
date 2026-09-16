import { AssetDecodeError } from '#assets/AssetDecodeError';
import { AssetNetworkError } from '#assets/AssetNetworkError';
import { logger } from '#core/Logger';

import { CONTAINER_HEADER_SIZE, containerHeadLength } from './assetContainer';

/**
 * Where a {@link ContainerReader} gets bytes.
 *
 * A source answers byte ranges of one container file and knows how long that
 * file is. Whether a range costs a request or is a slice of something already
 * in memory is the source's business, which is what lets one reader serve both
 * the single-request path and the range-fetching one.
 */
export interface ContainerSource {
  /** Total byte length of the container file. */
  readonly byteLength: number;
  /**
   * Whether a range genuinely costs less than the whole file. `false` means the
   * bytes are already in hand (or the server refused ranges), so a reader
   * should stop trying to be frugal and read whatever it needs.
   */
  readonly ranged: boolean;
  /** Read exactly `length` bytes starting at `offset`. */
  read(offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
}

/** The prefix a first request speculatively asks for, in bytes. */
const PROBE_LENGTH = 64 * 1024;

/**
 * The caller's request headers with a `Range` on top.
 *
 * Built through `Headers` rather than by spreading: `HeadersInit` is also an
 * array of pairs and a `Headers` instance, and spreading either of those yields
 * indices or nothing at all, silently dropping the caller's headers.
 */
const withRange = (init: RequestInit | undefined, range: string): Headers => {
  const headers = new Headers(init?.headers);

  headers.set('Range', range);

  return headers;
};

type Fail = (detail: string) => never;

const fail: Fail = detail => {
  throw new AssetDecodeError({ message: `Invalid asset container: ${detail}.`, assetType: 'container' });
};

/**
 * A container that did not arrive fails the way every other asset does.
 *
 * The block-wise path fetches for itself rather than through `fetchAsset`, and
 * a transport failure it reported as a decode failure would tell a caller that
 * the file is broken when the reaction it needs is a retry.
 */
const failTransport = (url: string, response: Response, detail: string): never => {
  throw new AssetNetworkError({
    url,
    message: `Failed to fetch ${detail} of "${url}" (${response.status} ${response.statusText}).`,
    status: response.status,
    statusText: response.statusText,
  });
};

/** A source over a container already held whole in memory. */
export const bufferContainerSource = (buffer: ArrayBuffer): ContainerSource => ({
  byteLength: buffer.byteLength,
  ranged: false,
  read: (offset, length) => Promise.resolve(new Uint8Array(buffer.slice(offset, offset + length))),
});

/** Total length of the resource behind a `206`, read from its `Content-Range`. */
const totalFromContentRange = (header: string | null): number | null => {
  const match = /^bytes \d+-\d+\/(\d+)$/.exec(header?.trim() ?? '');

  return match === null ? null : Number(match[1]);
};

/**
 * Whether a response may be addressed by byte offset.
 *
 * The hazard the container format documents: a server that applies
 * `Content-Encoding` to the response makes a range address the *encoded*
 * stream, so every offset in the head is wrong. Such a response is refused for
 * range use rather than trusted, and the reader falls back to the whole file -
 * detect and degrade, never require a server configuration.
 */
const addressableByOffset = (response: Response): boolean => {
  const encoding = response.headers.get('content-encoding');

  return encoding === null || encoding === '' || encoding === 'identity';
};

/** What {@link openContainerSource} reports about the first request it made. */
export interface OpenedContainerSource {
  readonly source: ContainerSource;
  /**
   * The header-and-head prefix, already read. Every open costs one request, and
   * this is what that request bought; a reader parses the head straight from it
   * rather than asking for those bytes again.
   *
   * `null` when the first response did not reach the end of the head, which a
   * reader answers with one more read.
   */
  readonly headPrefix: ArrayBuffer | null;
}

/**
 * Open a container over HTTP, deciding in one request whether it can be read by
 * byte range.
 *
 * The request is a speculative range over the first {@link PROBE_LENGTH} bytes,
 * which does double duty. A server that honours it answers `206`, and the
 * prefix almost always already contains the whole head, so the reader is ready
 * without a second round trip. A server that ignores it answers `200` with the
 * entire file, which is the single-request path - and is also what a reader
 * gets from a server whose response is content-encoded, where offsets could not
 * be trusted anyway.
 *
 * Throws only when the request itself fails; an unhelpful but successful
 * response is degraded, never rejected.
 */
export const openContainerSource = async (url: string, init?: RequestInit): Promise<OpenedContainerSource> => {
  const probe = await fetch(url, { ...init, headers: withRange(init, `bytes=0-${PROBE_LENGTH - 1}`) });

  if (!probe.ok) {
    failTransport(url, probe, 'the head');
  }

  const body = await probe.arrayBuffer();

  if (probe.status !== 206 || !addressableByOffset(probe)) {
    if (__DEV__) {
      const reason =
        probe.status !== 206
          ? 'the server answered the byte-range request with the whole file'
          : 'the response is content-encoded, so its byte offsets address the encoded stream';

      logger.warn(
        `"${url}" is read whole because ${reason}. Block-wise loading needs byte ranges (Accept-Ranges: bytes, 206) on an uncompressed response; until the server provides them every load fetches the entire pack.`,
        { source: 'Loader' },
      );
    }

    // The whole file, either because the server sent it or because its offsets
    // cannot be trusted. Both end at the same place: read from memory.
    return { source: bufferContainerSource(body), headPrefix: body };
  }

  const byteLength = totalFromContentRange(probe.headers.get('content-range'));

  if (byteLength === null) {
    fail(`"${url}" answered a byte range without a usable Content-Range`);
  }

  const source: ContainerSource = {
    byteLength,
    ranged: true,
    read: async (offset, length) => {
      if (length === 0) return new Uint8Array(new ArrayBuffer(0));

      const response = await fetch(url, { ...init, headers: withRange(init, `bytes=${offset}-${offset + length - 1}`) });

      if (!response.ok) {
        failTransport(url, response, `bytes ${offset}..${offset + length - 1}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      // A server that answered the probe with 206 and this one with 200 handed
      // back the whole file; taking the slice keeps the reader correct rather
      // than letting a silently wrong region reach a decoder.
      const region = response.status === 206 ? bytes : bytes.subarray(offset, offset + length);

      if (region.byteLength !== length) {
        fail(`"${url}" answered ${region.byteLength} bytes for a ${length}-byte range`);
      }

      // Copied so the returned bytes own their buffer, whatever the slice was taken from.
      return new Uint8Array(region);
    },
  };

  if (body.byteLength < CONTAINER_HEADER_SIZE) {
    fail(`"${url}" answered ${body.byteLength} bytes, too few for a ${CONTAINER_HEADER_SIZE}-byte header`);
  }

  return { source, headPrefix: containerHeadLength(body) <= body.byteLength ? body : null };
};
