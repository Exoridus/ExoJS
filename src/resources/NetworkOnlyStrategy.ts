import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import type { CacheStore } from './CacheStore';

/**
 * {@link CacheStrategy} that always fetches from the network and never reads
 * from or writes to any {@link CacheStore}.
 *
 * Useful for assets that must always be fresh (e.g. live configuration files)
 * or for environments where persistent storage is unavailable. The `stores`
 * argument is accepted but intentionally ignored.
 */
export class NetworkOnlyStrategy implements CacheStrategy {

    public async resolve(request: CacheRequest, _stores: ReadonlyArray<CacheStore>): Promise<unknown> {
        const response = await fetch(request.url, request.requestOptions);

        if (!response.ok) {
            throw new Error(`Failed to fetch "${request.url}" (${response.status} ${response.statusText}).`);
        }

        return request.factory.process(response);
    }
}
