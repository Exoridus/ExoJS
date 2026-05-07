/**
 * Contract that every asset factory must satisfy.
 *
 * A factory is responsible for two distinct steps: converting a raw HTTP
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Response | Response}
 * into a serialisable intermediate form (`process`), and then turning that
 * intermediate form into the final engine object (`create`). Separating the
 * two steps allows caching layers to persist the processed data and skip the
 * network on subsequent loads.
 */
export interface AssetFactory<T = unknown> {
    /**
     * Identifier used as the object-store / storage-namespace key when this
     * factory's assets are persisted to a {@link CacheStore}.
     */
    readonly storageName: string;

    /**
     * Converts a raw HTTP response into a serialisable intermediate value
     * suitable for cache storage and later passed to {@link create}.
     */
    process(response: Response): Promise<unknown>;

    /**
     * Constructs the final engine asset from the intermediate value produced
     * by {@link process} (or retrieved from cache).
     */
    create(source: unknown, options?: unknown): Promise<T>;

    /**
     * Releases all resources held by this factory, including any object URLs
     * created during asset loading.
     */
    destroy(): void;
}
