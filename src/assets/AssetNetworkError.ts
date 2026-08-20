/** Construction options for an {@link AssetNetworkError}. */
export interface AssetNetworkErrorOptions {
  /** The URL the strategy tried to fetch. */
  readonly url: string;
  /** One-line, actionable summary (becomes the {@link Error.message} prefix). */
  readonly message: string;
  /**
   * HTTP status code of the response, when one arrived. Explicitly `undefined`
   * is accepted - a request that never produced a response has none.
   */
  readonly status?: number | undefined;
  /** HTTP status text of the response, when one arrived. */
  readonly statusText?: string | undefined;
  /**
   * The underlying failure - the `TypeError` a failed `fetch` rejects with, or
   * anything a custom transport threw. Passed through as {@link Error.cause}.
   * Absent for an HTTP error status, where the response itself is the failure.
   */
  readonly cause?: unknown;
}

/**
 * Structured asset-network failure. Thrown by {@link CacheFirstStrategy} and
 * {@link NetworkOnlyStrategy} when the network leg of a load fails - either
 * because the request never completed (offline, DNS, CORS, TLS) or because the
 * server answered with a non-`ok` status.
 *
 * Extends {@link Error}, so callers can narrow with `error instanceof AssetNetworkError`
 * and read {@link AssetNetworkError.url} and {@link AssetNetworkError.status}
 * instead of matching on message text. {@link AssetNetworkError.status} being
 * `null` is itself the signal that no response arrived at all, which is what
 * separates "the server said 404" from "the request never left the machine" -
 * a distinction a flat `Error` could not express. For the transport case the
 * original rejection stays reachable through {@link Error.cause}.
 *
 * A cancelled load is never reported through this type: an `AbortError` is
 * rethrown untouched so cancellation stays distinguishable from failure.
 */
export class AssetNetworkError extends Error {
  /** The URL that failed to load. */
  public readonly url: string;
  /** HTTP status code, or `null` when the request produced no response. */
  public readonly status: number | null;
  /** HTTP status text, or `null` when the request produced no response. */
  public readonly statusText: string | null;

  public constructor(options: AssetNetworkErrorOptions) {
    super(appendCause(options.message, options.cause), options.cause !== undefined ? { cause: options.cause } : undefined);

    this.name = 'AssetNetworkError';
    this.url = options.url;
    this.status = options.status ?? null;
    this.statusText = options.statusText ?? null;
  }
}

/**
 * Append `<name>: <message>` for an `Error` cause. Without this the concrete
 * transport failure - the only thing that separates an offline device from a
 * CORS rejection - is invisible to any consumer that logs `error.message`
 * alone.
 */
function appendCause(message: string, cause: unknown): string {
  if (cause instanceof Error) {
    return `${message} (${cause.name}: ${cause.message})`;
  }

  return message;
}
