import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { AssetFactory } from './AssetFactory';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import type { AssetConstructor } from './FactoryRegistry';
import type { AssetLoaderContext, Loader } from './Loader';

/** Construction options for {@link AssetDecoder}. Values are already resolved by `Loader` — see `Loader`'s constructor. */
export interface AssetDecoderOptions {
  basePath: string;
  fetchOptions: RequestInit;
  stores: readonly CacheStore[];
  cacheStrategy: CacheStrategy;
}

/**
 * Turns "a type + a path, or a `bindAsset` handler" into a decoded resource:
 * URL resolution, cache-strategy dispatch, `bindAsset` handler invocation
 * (including the {@link AssetLoaderContext} handlers receive), and the
 * container byte-injection path. Extracted from `Loader` (Loader split,
 * Slice 2) — every method here is a direct, behavior-preserving relocation.
 *
 * Deliberately does not know about claims, deferred handles, or the
 * resident-resource map: every method that resolves a resource hands it to
 * the `storeResource` callback supplied at construction instead of storing
 * it directly, so this class stays "identity + bytes/handler in, resource
 * out."
 */
export class AssetDecoder {
  private readonly _loader: Loader;
  private readonly _typeRegistry: AssetTypeRegistry;
  private readonly _storeResource: (type: AssetConstructor, alias: string, resource: unknown) => unknown;
  private readonly _stores: readonly CacheStore[];
  private readonly _cacheStrategy: CacheStrategy;
  private _basePath: string;
  private _fetchOptions: RequestInit;

  public constructor(
    loader: Loader,
    typeRegistry: AssetTypeRegistry,
    storeResource: (type: AssetConstructor, alias: string, resource: unknown) => unknown,
    options: AssetDecoderOptions,
  ) {
    this._loader = loader;
    this._typeRegistry = typeRegistry;
    this._storeResource = storeResource;
    this._stores = options.stores;
    this._cacheStrategy = options.cacheStrategy;
    this._basePath = options.basePath;
    this._fetchOptions = options.fetchOptions;
  }

  /**
   * Base path prepended to every relative asset URL at fetch time.
   * Absolute URLs (starting with `http://`, `https://`, or `//`) are
   * passed through unchanged.
   */
  public get basePath(): string {
    return this._basePath;
  }

  public set basePath(value: string) {
    this._basePath = value;
  }

  /** Default `RequestInit` options merged into every `fetch` call. */
  public get fetchOptions(): RequestInit {
    return this._fetchOptions;
  }

  public set fetchOptions(value: RequestInit) {
    this._fetchOptions = value;
  }

  private _resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('/')) {
      return path;
    }

    return `${this._basePath}${path}`;
  }

  /**
   * Fetches `source` through the loader's cache strategy with an inline
   * pass-through factory, using `source` as the IDB key.
   *
   * `process` converts the raw `Response` to the storable intermediate form
   * (e.g. `r.text()`, `r.arrayBuffer()`, `r.json()`).  `create` is always the
   * identity function — the cached value is returned unchanged.
   * @internal
   */
  public _contextFetch<T>(source: string, storageName: string, process: (response: Response) => Promise<T>): Promise<T> {
    const url = this._resolveUrl(source);
    const factory: AssetFactory<T> = {
      storageName,
      process,
      create: data => Promise.resolve(data as T),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      destroy() {},
    };
    return this._cacheStrategy.resolve(
      { storageName, key: source, url, requestOptions: this._fetchOptions, factory, options: undefined },
      this._stores,
    ) as Promise<T>;
  }

  /**
   * Builds an {@link AssetLoaderContext} for a handler invocation.
   *
   * The `fetch*` helpers on the returned context route through the loader's
   * configured cache strategy and IDB stores, using `source` as the IDB key
   * (so the same URL is never fetched twice regardless of the asset alias).
   * @internal
   */
  public _buildHandlerContext(identityKey: string): AssetLoaderContext {
    const ctx: AssetLoaderContext = {
      loader: this._loader,
      identityKey,
      fetchText: (source: string) => this._contextFetch<string>(source, '__ctx_text', r => r.text()),
      fetchArrayBuffer: (source: string) => this._contextFetch<ArrayBuffer>(source, '__ctx_binary', r => r.arrayBuffer()),
      fetchJson: <T = unknown>(source: string) => this._contextFetch<T>(source, '__ctx_json', r => r.json() as Promise<T>),
    };
    return ctx;
  }

  /**
   * Calls a handler-based custom asset loader and hands the result to the
   * `storeResource` callback.
   *
   * Unlike {@link _fetch}, this does NOT automatically bypass caching — the
   * handler controls caching by calling `context.fetchText` /
   * `context.fetchArrayBuffer` / `context.fetchJson`, which route through
   * the loader's cache strategy.
   * @internal
   */
  public async _fetchWithHandler(
    type: AssetConstructor,
    alias: string,
    source: string,
    fullConfig: unknown,
    handler: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>,
    context: AssetLoaderContext,
  ): Promise<unknown> {
    const url = this._resolveUrl(source);
    try {
      const resource = await handler(fullConfig, context);

      return this._storeResource(type, alias, resource);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load "${alias}" from "${url}": ${message}`, { cause: error });
    }
  }

  /** @internal */
  public async _fetch(type: AssetConstructor, alias: string, path: string, options?: unknown): Promise<unknown> {
    const factory = this._typeRegistry.resolveFactory(type);
    const url = this._resolveUrl(path);

    try {
      const resource = await this._cacheStrategy.resolve(
        {
          storageName: factory.storageName,
          key: path, // source-path as IDB key so same resource is not cached multiple times under different aliases
          url,
          requestOptions: this._fetchOptions,
          factory,
          options,
        },
        this._stores,
      );

      return this._storeResource(type, alias, resource);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to load "${alias}" from "${url}": ${message}`, {
        cause: error,
      });
    }
  }

  /**
   * Dispatches a load through the `bindAsset` handler path if one is
   * registered for `type`, otherwise through the plain `register()`-based
   * {@link _fetch}. Shared by the foreground and background fetch
   * dispatchers on `Loader` so both honor `bindAsset` handlers identically.
   * @internal
   */
  public _dispatchFetch(type: AssetConstructor, alias: string, path: string, options?: unknown): Promise<unknown> {
    const handlerEntry = this._typeRegistry.getHandler(type);

    if (!handlerEntry) {
      return this._fetch(type, alias, path, options);
    }

    const identityKey = this._typeRegistry._identityKey(type, path);
    const config: Record<string, unknown> = { source: path };

    if (options !== null && options !== undefined && typeof options === 'object') {
      Object.assign(config, options as Record<string, unknown>);
    }

    const context = this._buildHandlerContext(identityKey);

    return this._fetchWithHandler(type, alias, path, config, handlerEntry.load, context);
  }

  /**
   * Construct an asset from in-memory `bytes` (no fetch) and hand it to the
   * `storeResource` callback under `alias`. Uses the type's
   * {@link AssetHandler.createFromBytes} when present, otherwise a
   * `register()`-style factory; throws if neither can build from bytes. The
   * backing path for `Loader.loadContainer`.
   * @internal
   */
  public async _injectSource(type: AssetConstructor, alias: string, bytes: ArrayBuffer, options?: unknown): Promise<void> {
    const handlerEntry = this._typeRegistry.getHandler(type);
    let resource: unknown;

    if (handlerEntry?.createFromBytes) {
      resource = await handlerEntry.createFromBytes(bytes, options);
    } else if (this._typeRegistry.hasFactory(type)) {
      resource = await this._typeRegistry.resolveFactory(type).create(bytes, options);
    } else {
      throw new Error(`Asset type "${type.name}" cannot be built from container bytes (no createFromBytes handler).`);
    }

    this._storeResource(type, alias, resource);
  }

  /** Destroys every configured cache store. */
  public destroy(): void {
    for (const store of this._stores) {
      store.destroy();
    }
  }
}
