import type { CacheStore } from './CacheStore';
import type { CacheRequest, CacheStrategy } from './CacheStrategy';
import { fetchAsset } from './fetchAsset';

/**
 * {@link CacheStrategy} that always fetches from the network and never reads
 * from or writes to any {@link CacheStore}.
 *
 * Useful for assets that must always be fresh (e.g. live configuration files)
 * or for environments where persistent storage is unavailable. The `stores`
 * argument is accepted but intentionally ignored.
 *
 * A failing network leg rejects with an {@link AssetNetworkError} carrying the
 * URL, the HTTP status (when one arrived) and the original rejection as
 * `cause`; a cancelled load still rejects with the platform `AbortError`.
 *
 * Returns the fully constructed resource - callers do not need to call
 * `request.factory.create` again.
 */
export class NetworkOnlyStrategy implements CacheStrategy {
  public async resolve(request: CacheRequest, _stores: readonly CacheStore[]): Promise<unknown> {
    const { url, requestOptions, factory, options } = request;
    const response = await fetchAsset(url, requestOptions);
    const source = await factory.process(response);

    return factory.create(source, options);
  }
}
