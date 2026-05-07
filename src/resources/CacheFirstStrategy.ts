import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import type { CacheStore } from './CacheStore';

/**
 * {@link CacheStrategy} that checks every provided {@link CacheStore} before
 * falling back to the network.
 *
 * On a cache hit the stored value is fed directly to
 * {@link AssetFactory.create | factory.create}; if that throws (stale or
 * corrupt entry) the entry is deleted and the next store is tried. Only once
 * all stores miss does the strategy fetch from the network and write the
 * processed source back to every store. Quota or serialisation errors during
 * write are swallowed silently so that a full storage can never prevent an
 * asset from loading.
 *
 * Returns the fully constructed resource — callers do not need to call
 * {@link AssetFactory.create} again.
 */
export class CacheFirstStrategy implements CacheStrategy {

    public async resolve(request: CacheRequest, stores: ReadonlyArray<CacheStore>): Promise<unknown> {
        const { storageName, key, url, requestOptions, factory, options } = request;

        for (const store of stores) {
            const cached = await store.load(storageName, key);

            if (cached !== null && cached !== undefined) {
                try {
                    return await factory.create(cached, options);
                } catch {
                    await store.delete(storageName, key);
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
            } catch {
                // Quota exceeded or non-cloneable value — continue without caching.
            }
        }

        return resource;
    }
}
