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
   * Releases the resources held by ONE asset this factory produced — the
   * per-resource counterpart of {@link destroy}. Called when the loader evicts
   * that asset at refcount 0; the factory stays alive and keeps serving every
   * other asset it created.
   *
   * Optional, and safe to omit: implement it only when a produced asset owns
   * something the garbage collector cannot reclaim on its own (a media element
   * to detach, a `FontFace` registered on `document.fonts`, a GPU buffer, a
   * worker). A decoded `AudioBuffer`, a parsed JSON object or a compiled
   * `WebAssembly.Module` needs nothing, so most factories do not implement it.
   *
   * Must be synchronous and must tolerate being called for a resource that was
   * already released. `resource` is never handed back to a consumer afterwards:
   * the loader drops it from the resident store and re-arms every live ref for
   * the asset in the same step.
   */
  dispose?(resource: T): void;

  /**
   * Releases everything this factory owns ACROSS ALL the assets it ever
   * produced — every object URL it created, every media element it still
   * tracks — and leaves the factory unusable. Called once, when the owning
   * loader/handler is destroyed, not per asset; use {@link dispose} for the
   * teardown of a single evicted resource.
   */
  destroy(): void;
}
