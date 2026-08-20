import type { AssetCacheError } from './AssetCacheError';
import type { CacheStore } from './CacheStore';

/** Minimal internal factory protocol consumed by cache policies. */
interface CacheRequestFactory {
  process(response: Response): Promise<unknown>;
  create(source: unknown, options?: unknown): Promise<unknown>;
}

/**
 * All the information a {@link CacheStrategy} needs to resolve a single asset.
 *
 * Bundles the target factory, cache namespace, lookup key, the fetch
 * parameters, and any factory-specific options into one value so strategies
 * remain stateless.
 */
export interface CacheRequest {
  /** The binding/factory storage namespace used for cache lookups. */
  readonly storageName: string;
  /** The per-asset lookup key (typically the alias). */
  readonly key: string;
  /** The fully resolved URL to fetch from the network if the cache misses. */
  readonly url: string;
  readonly requestOptions: RequestInit;
  readonly factory: CacheRequestFactory;
  /** Type-specific options forwarded to `factory.create`. */
  readonly options?: unknown;
  /**
   * Diagnostic sink for cache failures the strategy degrades instead of
   * propagating (a full quota, an unreadable store). Supplied by the caller
   * that issued this request - `Loader` passes one that feeds its own
   * `onCacheError` - so a degraded write is reported to whoever asked for the
   * asset and to nobody else.
   *
   * Request-scoped rather than a signal on the strategy: strategies are
   * stateless policy objects and may legitimately be shared between several
   * loaders, which a per-instance subscription would cross-wire (and keep
   * alive past the subscriber's own teardown).
   *
   * Absent when the caller wants no diagnostics - never assume it is set.
   */
  readonly reportCacheError?: (error: AssetCacheError) => void;
}

/**
 * Strategy interface that decides how assets are fetched and cached.
 *
 * Implementations own the full pipeline: cache check (if applicable) →
 * network fetch (if needed) → `factory.process` → `factory.create` → cache
 * write (if applicable). The returned value is the fully constructed
 * resource, not the intermediate source.
 *
 * ExoJS ships {@link CacheFirstStrategy} (default) and {@link NetworkOnlyStrategy};
 * implement this interface to add custom policies such as network-first,
 * stale-while-revalidate, or cache-only / offline-first.
 */
export interface CacheStrategy {
  /**
   * Resolves a single asset according to the strategy's caching policy and
   * returns the fully constructed resource.
   */
  resolve(request: CacheRequest, stores: readonly CacheStore[]): Promise<unknown>;
}
