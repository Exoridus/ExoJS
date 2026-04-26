import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import type { CacheStore } from './CacheStore';

export class NetworkOnlyStrategy implements CacheStrategy {

    public async resolve(request: CacheRequest, _stores: ReadonlyArray<CacheStore>): Promise<unknown> {
        const response = await fetch(request.url, request.requestOptions);

        if (!response.ok) {
            throw new Error(`Failed to fetch "${request.url}" (${response.status} ${response.statusText}).`);
        }

        return request.factory.process(response);
    }
}
