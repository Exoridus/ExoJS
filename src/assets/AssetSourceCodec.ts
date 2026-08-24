import type { AssetLocator } from './canonicalKey';

/**
 * What a codec is told about the acquisition it is decoding.
 * @advanced
 */
export interface SourceCodecContext {
  /** The canonical locator the representation was acquired from. */
  readonly locator: AssetLocator;
  /**
   * Cancellation signal of the load this decode belongs to. Honour it in any
   * long-running decode; `undefined` means the caller started the load without
   * a cancellation channel.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Turns an acquired representation into the normalized source an
 * {@link AssetFactory} builds a resource from.
 *
 * The contract is deliberately asymmetric. A codec describes how source data
 * ARRIVES - over the network, or as a slice of a container - and how the
 * representation that arrived is read back:
 *
 * ```text
 * Response       -> Stored -> Source
 * container bytes -> Stored -> Source
 * ```
 *
 * `Stored` is the representation worth keeping: what came off the wire, before
 * any interpretation that would have to be redone anyway. Splitting it from
 * `Source` is what lets a later cache persist exactly the acquired form rather
 * than a re-encoded approximation of it. When no such split is useful, leave
 * `Stored` at its default and make `decode` the identity.
 *
 * A codec validates the REPRESENTATION - well-formed JSON, a recognised
 * container header, a supported version. It must not build runtime objects:
 * compiling a module, creating a GPU resource or attaching a media element is
 * the factory's work, and failures there are construction failures, not source
 * failures.
 * @advanced
 */
export interface AssetSourceCodec<Source, Stored = Source> {
  /** Read the representation out of a network response. */
  fromResponse(response: Response, context: SourceCodecContext): Promise<Stored>;
  /**
   * Read the representation out of bytes the application already holds - a
   * slice of an asset container, or any other in-memory acquisition.
   *
   * Omit it when the type cannot be built from bytes alone (it needs response
   * headers, or a URL a browser primitive must own). Such a type cannot be
   * packed into a container, and attempting it reports that specifically rather
   * than failing somewhere inside a decode.
   */
  fromBytes?(bytes: ArrayBuffer, context: SourceCodecContext): Promise<Stored>;
  /** Interpret a stored representation as the source a factory consumes. */
  decode(stored: Stored, context: SourceCodecContext): Promise<Source>;
}

/** Raw bytes, kept and handed on unchanged. */
export const binarySourceCodec: AssetSourceCodec<ArrayBuffer> = {
  fromResponse: response => response.arrayBuffer(),
  fromBytes: bytes => Promise.resolve(bytes),
  decode: stored => Promise.resolve(stored),
};

/** UTF-8 text, stored as text. */
export const textSourceCodec: AssetSourceCodec<string> = {
  fromResponse: response => response.text(),
  fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
  decode: stored => Promise.resolve(stored),
};

/**
 * JSON, stored as the text that arrived rather than as the parsed value.
 *
 * Keeping the text is what makes the stored form byte-exact: a parsed value
 * round-trips through key order, number formatting and `undefined` handling
 * that the response never had. Parsing is cheap enough to repeat on read.
 */
export const jsonSourceCodec: AssetSourceCodec<unknown, string> = {
  fromResponse: response => response.text(),
  fromBytes: bytes => Promise.resolve(new TextDecoder().decode(bytes)),
  decode: stored => Promise.resolve(JSON.parse(stored)),
};
