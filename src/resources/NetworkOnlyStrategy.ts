import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import type { CacheStore } from './CacheStore';

/**
 * {@link CacheStrategy} that always fetches from the network and never reads
 * from or writes to any {@link CacheStore}.
 *
 * Useful for assets that must always be fresh (e.g. live configuration files)
 * or for environments where persistent storage is unavailable. The `stores`
 * argument is accepted but intentionally ignored.
 *
 * Returns the fully constructed resource — callers do not need to call
 * {@link AssetFactory.create} again.
 */
export class NetworkOnlyStrategy implements CacheStrategy {

    public async resolve(request: CacheRequest, _stores: ReadonlyArray<CacheStore>): Promise<unknown> {
        const { url, requestOptions, factory, options } = request;
        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            throw new Error(`Failed to fetch "${url}" (${response.status} ${response.statusText}).`);
        }

        const source = await factory.process(response);

        return factory.create(source, options);
    }
}
