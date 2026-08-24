/**
 * The cache operation that failed. Carried by {@link AssetCacheError.operation}
 * so callers can branch on the failure class - a failed `write` is a degraded
 * cache write, a failed `connect` means the whole store is unavailable.
 */
export type AssetCacheOperation =
  | 'connect' // Opening or upgrading the backing store
  | 'read' // Reading one record
  | 'write' // Writing one record (the usual home of quota failures)
  | 'delete' // Removing one record
  | 'clear' // Emptying a namespace or a whole store
  | 'delete-storage'; // Dropping the whole database

/** Construction options for an {@link AssetCacheError}. */
export interface AssetCacheErrorOptions {
  /** Which cache operation failed. */
  readonly operation: AssetCacheOperation;
  /** One-line, actionable summary (becomes the {@link Error.message} prefix). */
  readonly message: string;
  /**
   * Storage namespace, when the operation targets one. Explicitly `undefined`
   * is accepted - a store-wide operation has none.
   */
  readonly store?: string | undefined;
  /**
   * Record key, when the operation targets a single record. Explicitly
   * `undefined` is accepted - a store-wide operation has none.
   */
  readonly key?: string | undefined;
  /**
   * The underlying failure - an `IDBRequest.error` `DOMException`, a store's
   * own rejection, or anything a custom {@link CacheStore} threw. Passed
   * through as {@link Error.cause}.
   */
  readonly cause?: unknown;
}

/**
 * Structured asset-cache failure. Raised by a {@link CacheStore} for every
 * operation it could not carry out, and dispatched on {@link Loader.onCacheError}
 * whenever a {@link CachePolicy} degrades one instead of propagating it.
 *
 * A cache MISS is not one of these - it is reported as an
 * {@link AssetCacheMissError} or as a miss result, because "this was never
 * written" and "the store is broken" call for different reactions.
 *
 * Extends {@link Error}, so callers can narrow with `error instanceof AssetCacheError`
 * and read {@link AssetCacheError.operation}, {@link AssetCacheError.store} and
 * {@link AssetCacheError.key} instead of matching on message text. The original
 * `DOMException` stays reachable through {@link Error.cause}, which is what makes
 * a quota failure (`QuotaExceededError`) distinguishable from a transaction or
 * schema failure.
 *
 * The `DOMException`'s `name` and message are also appended to
 * {@link Error.message}, so a log line that only prints the message still names
 * the real cause.
 */
export class AssetCacheError extends Error {
  /** Which cache operation failed. */
  public readonly operation: AssetCacheOperation;
  /** Storage namespace, or `null` when the operation is store-wide. */
  public readonly store: string | null;
  /** Record key, or `null` when the operation does not target a single record. */
  public readonly key: string | null;

  public constructor(options: AssetCacheErrorOptions) {
    super(appendCause(options.message, options.cause), options.cause !== undefined ? { cause: options.cause } : undefined);

    this.name = 'AssetCacheError';
    this.operation = options.operation;
    this.store = options.store ?? null;
    this.key = options.key ?? null;
  }
}

/**
 * Append `<name>: <message>` for an `Error`/`DOMException` cause. Without this
 * the DOMException name - the only thing that separates a quota failure from an
 * unknown transaction failure - is invisible to any consumer that logs
 * `error.message` alone.
 */
function appendCause(message: string, cause: unknown): string {
  if (cause instanceof Error) {
    return `${message} (${cause.name}: ${cause.message})`;
  }

  return message;
}
