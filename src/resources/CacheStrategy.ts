import type { AssetFactory } from './AssetFactory';
import type { CacheStore } from './CacheStore';

/**
 * All the information a {@link CacheStrategy} needs to resolve a single asset.
 *
 * Bundles the target factory, cache namespace, lookup key, and the fetch
 * parameters into one value so strategies remain stateless.
 */
export interface CacheRequest {
    /** The {@link AssetFactory.storageName} used as the cache namespace. */
    readonly storageName: string;
    /** The per-asset lookup key (typically the alias). */
    readonly key: string;
    /** The fully resolved URL to fetch from the network if the cache misses. */
    readonly url: string;
    readonly requestOptions: RequestInit;
    readonly factory: AssetFactory;
}

/**
 * Strategy interface that decides how assets are fetched and cached.
 *
 * Implement this interface to control the caching policy — for example,
 * {@link CacheFirstStrategy} checks persistent stores before hitting the
 * network, while {@link NetworkOnlyStrategy} always goes to the network.
 */
export interface CacheStrategy {
    /**
     * Resolves a single asset according to the strategy's caching policy and
     * returns the processed intermediate value ready for {@link AssetFactory.create}.
     */
    resolve(request: CacheRequest, stores: ReadonlyArray<CacheStore>): Promise<unknown>;
}
