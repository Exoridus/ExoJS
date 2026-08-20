import type { AssetHandler } from '#extensions/Extension';

import type { AssetCacheError } from './AssetCacheError';
import type { AssetFactory } from './AssetFactory';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import { type CanonicalAsset, resolveAssetUrl } from './canonicalKey';
import type { AssetLoaderContext, Loader } from './Loader';
import { isAbortError } from './SharedAbort';

/** Sink a decoded resource is handed to, returning the value callers should see for it. */
export type ResourceStore = (asset: CanonicalAsset, resource: unknown) => unknown;

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
 * container byte-injection path. Extracted from `Loader` — every method here
 * is a direct, behavior-preserving relocation.
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
  private readonly _stores: readonly CacheStore[];
  private readonly _cacheStrategy: CacheStrategy;
  private _basePath: string;
  private _fetchOptions: RequestInit;

  /**
   * Where decoded resources go. Bound by {@link _bindResourceStore} after the
   * owner has built the residency this forwards to, so it is deliberately not
   * a constructor parameter — see that method for why.
   */
  private _storeResource: ResourceStore = () => {
    throw new Error('AssetDecoder decoded a resource before its owner bound a resource store. Call _bindResourceStore() first.');
  };

  /**
   * Per-request diagnostic sink handed to the cache strategy. One stable
   * closure per decoder — a strategy shared between loaders reports each
   * degraded failure only to the loader whose request caused it, and holds no
   * reference to any loader between calls.
   */
  private readonly _reportCacheError = (error: AssetCacheError): void => {
    this._loader.onCacheError.dispatch(error);
  };

  public constructor(loader: Loader, typeRegistry: AssetTypeRegistry, options: AssetDecoderOptions) {
    this._loader = loader;
    this._typeRegistry = typeRegistry;
    this._stores = options.stores;
    this._cacheStrategy = options.cacheStrategy;
    this._basePath = options.basePath;
    this._fetchOptions = options.fetchOptions;
  }

  /**
   * Bind the sink decoded resources are handed to.
   *
   * Separate from construction because the two collaborators are mutually
   * dependent: the residency needs a decoder to dispatch fetches, and the
   * decoder needs the residency to store what it decodes. Passing the sink as a
   * constructor argument forced it to close over a field that was still
   * unassigned, which held only because nothing invoked it synchronously — a
   * guarantee no type could express and only a comment recorded. Binding it
   * afterwards makes the order structural, and the throwing default above turns
   * any future too-early call into an immediate, named failure.
   * @internal
   */
  public _bindResourceStore(storeResource: ResourceStore): void {
    this._storeResource = storeResource;
  }

  /** Base path prepended to relative asset URLs at fetch time. @see Loader.basePath for the full contract. */
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

  /**
   * The URL a source is fetched from. Shares its resolution with the canonical
   * locator, so what is fetched and what a load is keyed by can never diverge.
   */
  private _resolveUrl(path: string): string {
    return resolveAssetUrl(this._basePath, path);
  }

  /**
   * Fetches `source` through the loader's cache strategy with an inline
   * pass-through factory, using the resolved URL as the IDB key so the same
   * resource is never cached twice under two spellings.
   *
   * `process` converts the raw `Response` to the storable intermediate form
   * (e.g. `r.text()`, `r.arrayBuffer()`, `r.json()`).  `create` is always the
   * identity function — the cached value is returned unchanged.
   * @internal
   */
  public _contextFetch<T>(source: string, storageName: string, process: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const url = this._resolveUrl(source);
    const factory: AssetFactory<T> = {
      storageName,
      process,
      create: data => Promise.resolve(data as T),
      destroy() {
        // Nothing to release: this strategy hands back the decoded value as-is.
      },
    };
    // Spread only when a signal is actually threaded through, so a plain fetch
    // keeps handing the strategy the very `fetchOptions` object it always did.
    const requestOptions = signal === undefined ? this._fetchOptions : { ...this._fetchOptions, signal };

    return this._cacheStrategy.resolve(
      { storageName, key: url, url, requestOptions, factory, options: undefined, reportCacheError: this._reportCacheError },
      this._stores,
    ) as Promise<T>;
  }

  /**
   * Builds an {@link AssetLoaderContext} for a handler invocation.
   *
   * The `fetch*` helpers on the returned context route through the loader's
   * configured cache strategy and IDB stores, keyed by the resolved URL (so the
   * same resource is never fetched or cached twice, however it was spelled).
   *
   * `storageName`, when given (from the handler's `bindAsset`/`defineAsset`
   * binding), replaces the shared `__ctx_binary`/`__ctx_text`/`__ctx_json`
   * namespace for every `fetch*` call made through this context, giving the
   * binding its own IDB namespace instead of sharing one with every other
   * handler.
   *
   * `signal` is the cancellation signal of the load this handler invocation
   * belongs to. Every `fetch*` helper forwards it automatically; it is also
   * exposed on the context so a handler doing its own fetching or decoding can
   * honor it.
   * @internal
   */
  public _buildHandlerContext(identityKey: string, storageName?: string, signal?: AbortSignal): AssetLoaderContext {
    const ctx: AssetLoaderContext = {
      loader: this._loader,
      identityKey,
      signal,
      fetchText: (source: string) => this._contextFetch<string>(source, storageName ?? '__ctx_text', r => r.text(), signal),
      fetchArrayBuffer: (source: string) => this._contextFetch<ArrayBuffer>(source, storageName ?? '__ctx_binary', r => r.arrayBuffer(), signal),
      fetchJson: <T = unknown>(source: string) => this._contextFetch<T>(source, storageName ?? '__ctx_json', r => r.json() as Promise<T>, signal),
    };
    return ctx;
  }

  /**
   * Calls a handler-based custom asset loader and hands the result to the
   * `storeResource` callback.
   *
   * This does NOT automatically bypass caching — the handler controls caching
   * by calling `context.fetchText` /
   * `context.fetchArrayBuffer` / `context.fetchJson`, which route through
   * the loader's cache strategy.
   *
   * A cancellation rejection is rethrown unwrapped: the "Failed to load … from
   * …" envelope would hide the `AbortError` name the residency dispatches on to
   * tell a deliberate cancel apart from a genuine load failure.
   * @internal
   */
  public async _fetchWithHandler(
    asset: CanonicalAsset,
    fullConfig: unknown,
    handler: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>,
    context: AssetLoaderContext,
  ): Promise<unknown> {
    try {
      const resource = await handler(fullConfig, context);

      return this._storeResource(asset, resource);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load "${asset.source}" from "${this._resolveUrl(asset.source)}": ${message}`, { cause: error });
    }
  }

  /**
   * Dispatches a load through the `bindAsset` handler bound for `type`.
   * Shared by the foreground and background fetch dispatchers on `Loader` so
   * both honor `bindAsset` handlers identically.
   *
   * `signal` cancels the dispatched work — it reaches the network through the
   * handler context's `fetch*` helpers.
   * @internal
   */
  public _dispatchFetch(asset: CanonicalAsset, options?: unknown, signal?: AbortSignal): Promise<unknown> {
    const handlerEntry = this._typeRegistry.getHandler(asset.type);

    if (!handlerEntry) {
      return Promise.reject(this._typeRegistry._missingHandlerError(asset.type));
    }

    const config: Record<string, unknown> = { source: asset.source };

    if (options !== null && options !== undefined && typeof options === 'object') {
      Object.assign(config, options as Record<string, unknown>);
    }

    const context = this._buildHandlerContext(asset.key, handlerEntry.storageName, signal);

    return this._fetchWithHandler(asset, config, handlerEntry.load, context);
  }

  /**
   * Construct an asset from in-memory `bytes` (no fetch) and hand it to the
   * `storeResource` callback under `alias`. Uses the type's
   * {@link AssetHandler.createFromBytes} when present; throws if the bound
   * handler does not support byte-source construction. The backing path for
   * `Loader.loadContainer`.
   * @internal
   */
  public async _injectSource(asset: CanonicalAsset, bytes: ArrayBuffer, options?: unknown): Promise<void> {
    const handlerEntry = this._typeRegistry.getHandler(asset.type);

    if (!handlerEntry?.createFromBytes) {
      throw new Error(`Asset type "${asset.type.name}" cannot be built from container bytes (no createFromBytes handler).`);
    }

    const resource = await handlerEntry.createFromBytes(bytes, options);

    this._storeResource(asset, resource);
  }

  /** Destroys every configured cache store. */
  public destroy(): void {
    for (const store of this._stores) {
      store.destroy();
    }
  }
}
