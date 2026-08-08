/**
 * The cache operation that failed. Carried by {@link AssetCacheError.operation}
 * so callers can branch on the failure class — a failed `save` is a degraded
 * cache write, a failed `connect` means the whole store is unavailable.
 */
export type AssetCacheOperation =
  | 'connect' // Opening or upgrading the backing database
  | 'load' // Reading one record
  | 'save' // Writing one record (the usual home of quota failures)
  | 'delete' // Removing one record
  | 'clear' // Emptying one store
  | 'delete-storage'; // Dropping the whole database

/** Construction options for an {@link AssetCacheError}. */
export interface AssetCacheErrorOptions {
  /** Which cache operation failed. */
  readonly operation: AssetCacheOperation;
  /** One-line, actionable summary (becomes the {@link Error.message} prefix). */
  readonly message: string;
  /** Object store / storage namespace, when the operation targets one. */
  readonly store?: string;
  /** Record key, when the operation targets a single record. */
  readonly key?: string;
  /**
   * The underlying failure — an `IDBRequest.error` `DOMException`, a store's
   * own rejection, or anything a custom {@link CacheStore} threw. Passed
   * through as {@link Error.cause}.
   */
  readonly cause?: unknown;
}

/**
 * Structured asset-cache failure. Thrown by {@link IndexedDbDatabase} for every
 * failed IndexedDB request, and handed to {@link CacheRequest.reportCacheError}
 * — which `Loader` routes to {@link Loader.onCacheError} — for cache errors a
 * {@link CacheStrategy} degrades instead of propagating.
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
  /** Object store / storage namespace, or `null` when the operation is database-wide. */
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
 * the DOMException name — the only thing that separates a quota failure from an
 * unknown transaction failure — is invisible to any consumer that logs
 * `error.message` alone.
 */
function appendCause(message: string, cause: unknown): string {
  if (cause instanceof Error) {
    return `${message} (${cause.name}: ${cause.message})`;
  }

  return message;
}
