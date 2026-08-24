import { AssetCacheMissError } from './AssetCacheMissError';
import { AssetNetworkError } from './AssetNetworkError';
import type { CacheContext, CachePolicy } from './CachePolicy';
import { cacheMiss, type CacheReadResult } from './CacheReadResult';

/**
 * Reads the cache first and only fetches when it misses.
 *
 * The default policy, and the right one for content that does not change
 * behind a stable URL. A cache failure never fails a load that the network
 * could still serve: a read failure is degraded into a miss, and a write
 * failure is degraded into "not cached this time". Both are reported to
 * {@link Loader.onCacheError} before they are degraded, so a store that is
 * silently refusing every write stays diagnosable.
 *
 * A missing entry and a failing store therefore behave the same way HERE, and
 * differently everywhere it matters - see {@link CacheOnlyPolicy}, which has no
 * network leg to degrade onto.
 */
export class CacheFirstPolicy implements CachePolicy {
  public async resolve<T>(context: CacheContext<T>): Promise<T> {
    const cached = await context.read().catch(degradedRead<T>);

    if (cached.hit) {
      return cached.value;
    }

    const value = await context.fetch();

    await context.write(value).catch(degradedWrite);

    return value;
  }
}

/**
 * Fetches first and only falls back to the cache when the network failed.
 *
 * For content that changes behind a stable URL and should be as fresh as the
 * connection allows, while still working offline.
 *
 * The fallback is deliberately narrow. Only a transport or HTTP failure
 * (`AssetNetworkError`) permits it: a cancelled load must stay cancelled, and a
 * response the codec could not read is a broken source rather than an absent
 * network - serving a stale representation for either would turn a visible
 * failure into a silently wrong asset. When the network failed and the cache
 * has nothing, the network failure is what surfaces, because it is the one that
 * explains the load.
 */
export class NetworkFirstPolicy implements CachePolicy {
  public async resolve<T>(context: CacheContext<T>): Promise<T> {
    let networkError: unknown;

    try {
      const value = await context.fetch();

      await context.write(value).catch(degradedWrite);

      return value;
    } catch (error: unknown) {
      if (!isNetworkFailure(error)) {
        throw error;
      }

      networkError = error;
    }

    const cached = await context.read().catch(degradedRead<T>);

    if (cached.hit) {
      return cached.value;
    }

    throw networkError;
  }
}

/**
 * Always fetches, and neither reads nor writes any cache.
 *
 * For sources that must always be fresh - a live configuration file, a
 * server-authoritative manifest - and for environments where persistence is
 * unwanted. It writes nothing: a policy named network-only that still filled a
 * cache would leave records no policy on the same route ever reads.
 */
export class NetworkOnlyPolicy implements CachePolicy {
  public resolve<T>(context: CacheContext<T>): Promise<T> {
    return context.fetch();
  }
}

/**
 * Reads the cache and never touches the network.
 *
 * For a shipped or pre-warmed cache, and for offline modes that must fail
 * loudly rather than reach for the network. A missing record rejects with an
 * {@link AssetCacheMissError}; a store that could not answer rejects with the
 * store's own `AssetCacheError`. Those are different failures and stay
 * different, which is the whole point of using this policy over a fetch that
 * happens to be offline.
 */
export class CacheOnlyPolicy implements CachePolicy {
  public async resolve<T>(context: CacheContext<T>): Promise<T> {
    const cached = await context.read();

    if (cached.hit) {
      return cached.value;
    }

    throw new AssetCacheMissError(context.namespace, context.sourceKey);
  }
}

/**
 * Whether `error` means the network could not deliver, as opposed to the load
 * being cancelled or the response being unreadable.
 *
 * Matched on the class rather than on a message: `fetchAsset` raises
 * `AssetNetworkError` for exactly the transport and HTTP-status failures, and
 * lets a cancellation through as the platform `AbortError`.
 */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof AssetNetworkError;
}

/**
 * Continue as though the cache held nothing.
 *
 * Only for a policy that has a network leg to fall back on. The failure is
 * already on {@link Loader.onCacheError} by the time this runs - the cache
 * reports every store failure before raising it - so degrading it here hides
 * nothing.
 */
function degradedRead<T>(): CacheReadResult<T> {
  return cacheMiss;
}

/** Continue as though the representation had been written. See {@link degradedRead}. */
function degradedWrite(error: unknown): void {
  void error;
}
