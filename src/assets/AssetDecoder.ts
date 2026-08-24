import type { AssetHandler } from '#extensions/Extension';

import type { AssetCache } from './AssetCache';
import type { AssetCacheError } from './AssetCacheError';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import type { CacheLayout } from './CacheLayout';
import { type CanonicalAsset, canonicalizeSource, resolveAssetUrl, type SourceKey } from './canonicalKey';
import { fetchAsset } from './fetchAsset';
import type { AssetLoaderContext, Loader } from './Loader';
import type { LoaderScope } from './LoaderScope';
import { isAbortError } from './SharedAbort';
import { SingleEntryLayout } from './SingleEntryLayout';

/** Sink a decoded resource is handed to, returning the value callers should see for it. */
export type ResourceStore = (asset: CanonicalAsset, resource: unknown) => unknown;

/** Construction options for {@link AssetDecoder}. Values are already resolved by `Loader` - see `Loader`'s constructor. */
export interface AssetDecoderOptions {
  basePath: string;
  fetchOptions: RequestInit;
  /** The application's caching configuration, or `null` when nothing is cached. */
  cache: AssetCache | null;
  /**
   * Whether tearing this decoder down also tears the cache down. True only for
   * a cache the loader built for itself out of the stores it was given.
   */
  ownsCache: boolean;
}

/**
 * The layout a source acquired through a handler context uses. Those fetches
 * hand back exactly what the response yielded, so one record holds it.
 */
const contextLayout = SingleEntryLayout.version(1);

/**
 * Turns "a type + a path, or a `bindAsset` handler" into a decoded resource:
 * URL resolution, cache-strategy dispatch, `bindAsset` handler invocation
 * (including the {@link AssetLoaderContext} handlers receive), and the
 * container byte-injection path. Extracted from `Loader` - every method here
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
  private readonly _cache: AssetCache | null;
  private readonly _ownsCache: boolean;
  private _basePath: string;
  private _fetchOptions: RequestInit;

  /**
   * Where decoded resources go. Bound by {@link _bindResourceStore} after the
   * owner has built the residency this forwards to, so it is deliberately not
   * a constructor parameter - see that method for why.
   */
  private _storeResource: ResourceStore = () => {
    throw new Error('AssetDecoder decoded a resource before its owner bound a resource store. Call _bindResourceStore() first.');
  };

  /**
   * Per-acquisition diagnostic sink handed to the cache. One stable closure
   * per decoder - a cache or policy shared between loaders reports each failure
   * only to the loader whose request caused it, and holds no reference to any
   * loader between calls.
   */
  private readonly _reportCacheError = (error: AssetCacheError): void => {
    this._loader.onCacheError.dispatch(error);
  };

  public constructor(loader: Loader, typeRegistry: AssetTypeRegistry, options: AssetDecoderOptions) {
    this._loader = loader;
    this._typeRegistry = typeRegistry;
    this._cache = options.cache;
    this._ownsCache = options.ownsCache;
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
   * unassigned, which held only because nothing invoked it synchronously - a
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
   * Acquire the representation of `source` through the application's cache
   * configuration, or straight from the network when there is none.
   *
   * `read` turns the raw response into the representation worth keeping. It
   * runs only on the network leg: a cache hit hands back what was persisted,
   * without a `Response` ever existing.
   *
   * `namespace` and `layout` decide where the representation is persisted;
   * `sourceKey` decides what identifies it. Keying by the source identity
   * rather than by the URL is what keeps two source variants negotiated on one
   * URL from overwriting each other.
   * @internal
   */
  public _acquire<T>(
    source: string,
    namespace: string,
    layout: CacheLayout<T>,
    sourceKey: SourceKey,
    read: (response: Response) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = this._resolveUrl(source);
    // Spread only when a signal is actually threaded through, so a plain fetch
    // keeps handing `fetch` the very `fetchOptions` object it always did.
    const requestOptions = signal === undefined ? this._fetchOptions : { ...this._fetchOptions, signal };
    const fetchRepresentation = async (): Promise<T> => read(await fetchAsset(url, requestOptions));

    if (this._cache === null) {
      return fetchRepresentation();
    }

    return this._cache.resolve<T>({ namespace, sourceKey, layout, signal, fetch: fetchRepresentation, report: this._reportCacheError });
  }

  /**
   * The acquisition a handler context's `fetch*` helpers perform: one record,
   * keyed by the canonical locator of the source they were given.
   * @internal
   */
  public _acquireForContext<T>(source: string, namespace: string, read: (response: Response) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this._acquire(source, namespace, contextLayout as CacheLayout<T>, canonicalizeSource(this._basePath, source), read, signal);
  }

  /**
   * Builds an {@link AssetLoaderContext} for a handler invocation.
   *
   * The `fetch*` helpers on the returned context route through the
   * application's cache configuration, keyed by the canonical locator of the
   * source, so the same representation is never fetched or cached twice
   * however it was spelled.
   *
   * `storageName`, when given by the handler's binding, replaces the shared
   * `__ctx_binary`/`__ctx_text`/`__ctx_json` namespace for every `fetch*` call
   * made through this context, giving the binding its own cache namespace
   * instead of sharing one with every other handler.
   *
   * `signal` is the cancellation signal of the load this handler invocation
   * belongs to. Every `fetch*` helper forwards it automatically; it is also
   * exposed on the context so a handler doing its own fetching or decoding can
   * honor it.
   *
   * `scope` owns whatever sub-assets this handler loads, and lives exactly as
   * long as the asset being built.
   * @internal
   */
  public _buildHandlerContext(asset: CanonicalAsset, scope: LoaderScope, storageName?: string, signal?: AbortSignal): AssetLoaderContext {
    const ctx: AssetLoaderContext = {
      loader: this._loader,
      scope,
      resourceKey: asset.key,
      sourceKey: asset.sourceKey,
      locator: asset.locator,
      signal,
      resolveUrl: (source: string) => this._resolveUrl(source),
      fetchText: (source: string) => this._acquireForContext<string>(source, storageName ?? '__ctx_text', r => r.text(), signal),
      fetchArrayBuffer: (source: string) => this._acquireForContext<ArrayBuffer>(source, storageName ?? '__ctx_binary', r => r.arrayBuffer(), signal),
      fetchJson: <T = unknown>(source: string) => this._acquireForContext<T>(source, storageName ?? '__ctx_json', r => r.json() as Promise<T>, signal),
    };
    return ctx;
  }

  /**
   * Calls a handler-based custom asset loader and hands the result to the
   * `storeResource` callback.
   *
   * This does NOT automatically bypass caching - the handler controls caching
   * by calling `context.fetchText` / `context.fetchArrayBuffer` /
   * `context.fetchJson`, which route through the application's cache
   * configuration.
   *
   * A cancellation rejection is rethrown unwrapped: the "Failed to load ... from
   * ..." envelope would hide the `AbortError` name the residency dispatches on to
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
   * `signal` cancels the dispatched work - it reaches the network through the
   * handler context's `fetch*` helpers.
   * @internal
   */
  public _dispatchFetch(asset: CanonicalAsset, options: unknown, signal: AbortSignal | undefined, scope: LoaderScope): Promise<unknown> {
    const handlerEntry = this._typeRegistry.getHandler(asset.type);

    if (!handlerEntry) {
      return Promise.reject(this._typeRegistry._missingHandlerError(asset.type));
    }

    const config: Record<string, unknown> = { source: asset.source };

    if (options !== null && options !== undefined && typeof options === 'object') {
      Object.assign(config, options as Record<string, unknown>);
    }

    const context = this._buildHandlerContext(asset, scope, handlerEntry.storageName, signal);

    return this._fetchWithHandler(asset, config, handlerEntry.load, context);
  }

  /**
   * Construct an asset from in-memory `bytes` (no fetch) and hand it to the
   * `storeResource` callback under `alias`. Uses the type's
   * {@link AssetHandler.createFromBytes} when present; throws if the bound
   * handler does not support byte-source construction. The backing path for
   * `Loader.loadContainer`.
   *
   * `scope` owns whatever sub-assets the construction loads, exactly as on the
   * network path: an entry unpacked from a container must not own its
   * dependencies differently from the same entry fetched over the network.
   * @internal
   */
  public async _injectSource(asset: CanonicalAsset, bytes: ArrayBuffer, scope: LoaderScope, options?: unknown): Promise<void> {
    const handlerEntry = this._typeRegistry.getHandler(asset.type);

    if (!handlerEntry?.createFromBytes) {
      throw new Error(`Asset type "${asset.type.name}" cannot be built from container bytes (no createFromBytes handler).`);
    }

    const context = this._buildHandlerContext(asset, scope, handlerEntry.storageName);
    const resource = await handlerEntry.createFromBytes(bytes, options, context);

    this._storeResource(asset, resource);
  }

  /**
   * Destroys the cache, but only one this decoder's loader built for itself.
   *
   * An {@link AssetCache} handed in is an application-level object, and
   * sharing one between loaders is what routes and tiers are for - so tearing
   * down one loader must not close stores another is still reading.
   */
  public destroy(): void {
    if (this._ownsCache) {
      this._cache?.destroy();
    }
  }
}
