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
 * being delivered. Every degraded error — and every discarded entry, which is
 * itself the evidence that a store is serving unusable data — is handed to
 * {@link CacheRequest.reportCacheError} instead of vanishing, so quota
 * exhaustion and cache corruption stay diagnosable. `Loader` routes that to
 * its `onCacheError`.
 *
 * Stateless and free to share between loaders: diagnostics travel with the
 * request, so nothing is retained per caller.
 *
 * Returns the fully constructed resource — callers do not need to call
 * `request.factory.create` again.
 */
export class CacheFirstStrategy implements CacheStrategy {
  public async resolve(request: CacheRequest, stores: readonly CacheStore[]): Promise<unknown> {
    const { storageName, key, url, requestOptions, factory, options } = request;

    for (const store of stores) {
      let cached: unknown;

      try {
        cached = await store.load(storageName, key);
      } catch (error: unknown) {
        report(request, 'load', 'Reading an asset from a cache store failed.', error);

        continue;
      }

      if (cached !== null && cached !== undefined) {
        try {
          return await factory.create(cached, options);
        } catch (corruptError: unknown) {
          // Stale or corrupt entry: drop it so the next load re-fetches. The
          // discard itself is the evidence that the entry was unusable, so it
          // is reported whether or not the eviction below succeeds — otherwise
          // a store that reliably serves garbage and deletes it cleanly stays
          // completely invisible.
          report(request, 'load', 'Discarded an unusable cache entry.', corruptError);

          // A failing eviction must not turn a recoverable cache miss into a
          // failed load either.
          try {
            await store.delete(storageName, key);
          } catch (error: unknown) {
            report(request, 'delete', 'Evicting a corrupt cache entry failed.', error);
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
        report(request, 'save', 'Writing an asset to a cache store failed.', error);
      }
    }

    return resource;
  }
}

/**
 * Hand a degraded cache failure to the request's diagnostic sink. An
 * {@link AssetCacheError} raised by the store itself already carries the
 * precise operation/store/key/cause, so it is forwarded unchanged rather than
 * re-wrapped into a shallower one.
 */
function report(request: CacheRequest, operation: AssetCacheOperation, message: string, cause: unknown): void {
  const { reportCacheError } = request;

  if (reportCacheError === undefined) {
    return;
  }

  reportCacheError(cause instanceof AssetCacheError ? cause : new AssetCacheError({ operation, message, store: request.storageName, key: request.key, cause }));
}
