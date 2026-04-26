import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import type { CacheStore } from './CacheStore';

export class CacheFirstStrategy implements CacheStrategy {

    public async resolve(request: CacheRequest, stores: ReadonlyArray<CacheStore>): Promise<unknown> {
        const { storageName, key, url, requestOptions, factory } = request;

        for (const store of stores) {
            const cached = await store.load(storageName, key);

            if (cached !== null && cached !== undefined) {
                try {
                    await factory.create(cached);
                    return cached;
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

        for (const store of stores) {
            try {
                await store.save(storageName, key, source);
            } catch {
                // Quota exceeded or non-cloneable value — continue without caching.
            }
        }

        return source;
    }
}
