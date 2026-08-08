import { Signal } from '#core/Signal';

import { AssetCacheError, type AssetCacheOperation } from './AssetCacheError';
import type { CacheStore } from './CacheStore';
import type { CacheRequest, CacheStrategy } from './CacheStrategy';

/**
 * {@link CacheStrategy} that checks every provided {@link CacheStore} before
 * falling back to the network.
 *
 * On a cache hit the stored value is fed directly to
 * `request.factory.create`; if that throws (stale or
 * corrupt entry) the entry is deleted and the next store is tried. Only once
 * all stores miss does the strategy fetch from the network and write the
 * processed source back to every store.
 *
 * A failing store never fails the load: read, eviction and write errors are
 * all degraded so that a broken or full cache can never prevent an asset from
 * being delivered. Every degraded error is reported on {@link onCacheError}
 * instead of vanishing, so quota exhaustion stays diagnosable.
 *
 * Returns the fully constructed resource — callers do not need to call
 * `request.factory.create` again.
 */
export class CacheFirstStrategy implements CacheStrategy {
  /**
   * Fires for every cache error this strategy degraded rather than propagated.
   * Purely diagnostic — the load continues regardless, so a listener is the
   * only way to notice that persistence silently stopped working (a full
   * quota, a store that lost its connection, a non-cloneable value).
   *
   * `Loader` forwards this to its own `onCacheError`, so the default strategy
   * is observable without constructing one by hand.
   */
  public readonly onCacheError = new Signal<[error: AssetCacheError]>();

  public async resolve(request: CacheRequest, stores: readonly CacheStore[]): Promise<unknown> {
    const { storageName, key, url, requestOptions, factory, options } = request;

    for (const store of stores) {
      let cached: unknown;

      try {
        cached = await store.load(storageName, key);
      } catch (error: unknown) {
        this._report('load', storageName, key, 'Reading an asset from a cache store failed.', error);

        continue;
      }

      if (cached !== null && cached !== undefined) {
        try {
          return await factory.create(cached, options);
        } catch {
          // Stale or corrupt entry: drop it so the next load re-fetches. A
          // failing eviction must not turn a recoverable cache miss into a
          // failed load either.
          try {
            await store.delete(storageName, key);
          } catch (error: unknown) {
            this._report('delete', storageName, key, 'Evicting a corrupt cache entry failed.', error);
          }
        }
      }
    }

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      throw new Error(`Failed to fetch "${url}" (${response.status} ${response.statusText}).`);
    }

    const source = await factory.process(response);
    const resource = await factory.create(source, options);

    for (const store of stores) {
      try {
        await store.save(storageName, key, source);
      } catch (error: unknown) {
        // Quota exceeded or non-cloneable value — continue without caching.
        this._report('save', storageName, key, 'Writing an asset to a cache store failed.', error);
      }
    }

    return resource;
  }

  /**
   * Dispatch a degraded cache failure. An {@link AssetCacheError} raised by the
   * store itself already carries the precise operation/store/key/cause, so it
   * is forwarded unchanged rather than re-wrapped into a shallower one.
   */
  private _report(operation: AssetCacheOperation, store: string, key: string, message: string, cause: unknown): void {
    this.onCacheError.dispatch(cause instanceof AssetCacheError ? cause : new AssetCacheError({ operation, message, store, key, cause }));
  }
}
