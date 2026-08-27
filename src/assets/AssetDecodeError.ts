/** Construction options for an {@link AssetDecodeError}. */
export interface AssetDecodeErrorOptions {
  /** One-line, actionable summary (becomes the {@link Error.message}). */
  readonly message: string;
  /** Asset type id the bytes were being decoded for, when known. */
  readonly assetType?: string | undefined;
  /** The underlying failure - a `DOMException` from a browser decoder, a parser's own error. */
  readonly cause?: unknown;
}

/**
 * Raised when bytes that were successfully obtained cannot be turned into a
 * resource: a malformed container index, an XML document the parser rejected,
 * audio the browser could not decode, an empty buffer.
 *
 * Distinct from {@link AssetNetworkError} and {@link AssetCacheError} because
 * the reaction differs: a transport failure is worth retrying and a cache
 * failure is worth ignoring, while broken content stays broken - the asset has
 * to be dropped or the file fixed. Narrow with `error instanceof
 * AssetDecodeError`; the decoder's own error stays reachable through
 * {@link Error.cause}.
 */
export class AssetDecodeError extends Error {
  /** Asset type id the bytes were being decoded for, or `null` when the decoder is type-agnostic. */
  public readonly assetType: string | null;

  public constructor(options: AssetDecodeErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);

    this.name = 'AssetDecodeError';
    this.assetType = options.assetType ?? null;
  }
}
