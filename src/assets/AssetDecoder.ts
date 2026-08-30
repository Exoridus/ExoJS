import type { AssetCache } from '#assets/cache/AssetCache';
import { AssetCacheError } from '#assets/cache/AssetCacheError';
import { AssetCacheMissError } from '#assets/cache/AssetCacheMissError';
import type { CacheLayout } from '#assets/cache/CacheLayout';
import { SingleEntryLayout } from '#assets/cache/SingleEntryLayout';
import type { Connectivity, NetworkSnapshot } from '#core/Connectivity';
import { unrestrictedNetwork } from '#core/Connectivity';

import { AssetDecodeError } from './AssetDecodeError';
import type { AssetFactoryContext } from './AssetFactory';
import { AssetNetworkError } from './AssetNetworkError';
import type { AssetSourceCodec, SourceCodecContext } from './AssetSourceCodec';
import type { AnyAssetType, AssetRequest } from './AssetType';
import type { AssetTypeRegistry } from './AssetTypeRegistry';
import { type CanonicalAsset, canonicalizeSource, resolveAssetUrl, type SourceKey } from './canonicalKey';
import { fetchAsset } from './fetchAsset';
import type { Loader } from './Loader';
import type { LoaderScope } from './LoaderScope';
import { isAbortError } from './SharedAbort';

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
  /**
   * The application's connectivity, or `null` when nothing configured one - in
   * which case every acquisition runs unrestricted.
   */
  connectivity: Connectivity | null;
}

/** The cache namespace asset containers are acquired under. */
const CONTAINER_NAMESPACE = 'exoa';

/** A container is acquired whole, so one record holds it. */
const containerLayout = SingleEntryLayout.version<ArrayBuffer>(1);

/** The shape an identity hook sees. Options are omitted entirely when the request carried none. */
const toRequest = (source: string, options: unknown): AssetRequest<unknown> => (options === undefined || options === null ? { source } : { source, options });

/**
 * Turns a canonical request into a built resource: URL resolution, acquisition
 * through the application's cache configuration, the type's codec, and its
 * factory - over the network or from container bytes.
 *
 * Deliberately does not know about claims, deferred handles, or the
 * resident-resource map: every method that resolves a resource hands it to the
 * `storeResource` callback its owner bound instead of storing it directly, so
 * this class stays "identity in, resource out."
 */
export class AssetDecoder {
  private readonly _loader: Loader;
  private readonly _typeRegistry: AssetTypeRegistry;
  private readonly _cache: AssetCache | null;
  private readonly _ownsCache: boolean;
  private readonly _connectivity: Connectivity | null;
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
    this._connectivity = options.connectivity;
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

    return this._cache.resolve<T>({
      namespace,
      sourceKey,
      layout,
      network: this._network(),
      signal,
      fetch: fetchRepresentation,
      report: this._reportCacheError,
    });
  }

  /**
   * The connectivity facts this moment would run under.
   *
   * Read once per acquisition and passed on as a value, so nothing downstream
   * can observe a change that happened after the decision it was asked to make.
   * @internal
   */
  public _network(): NetworkSnapshot {
    return this._connectivity?.snapshot() ?? unrestrictedNetwork;
  }

  /**
   * Acquires the bytes of an asset container.
   *
   * A container is not an asset of any type - it is a transport that yields
   * several - so it caches under its own namespace rather than borrowing one
   * from whatever happens to be inside it.
   * @internal
   */
  public _acquireContainer(url: string): Promise<ArrayBuffer> {
    return this._acquire(url, CONTAINER_NAMESPACE, containerLayout, canonicalizeSource(this._basePath, url), response => response.arrayBuffer());
  }

  /** The context a factory sees for one request. */
  private _factoryContext(asset: CanonicalAsset, scope: LoaderScope, options: unknown, signal?: AbortSignal): AssetFactoryContext<unknown> {
    return {
      ...(options !== undefined && options !== null && { options }),
      signal,
      source: asset.source,
      locator: asset.locator,
      resourceKey: asset.key,
      sourceKey: asset.sourceKey,
      // A `LoaderScope` is structurally wider than the dependency seam; the
      // narrowing is what keeps release and teardown of the parent's scope out
      // of a factory's reach.
      dependencies: scope,
    };
  }

  /**
   * Acquires this request's representation, through the application's cache
   * configuration and the type's own codec.
   *
   * What the codec reads off the response is what a cache gets to keep, so it is
   * acquired in that form rather than decoded first and handed over afterwards.
   * @internal
   */
  public _acquireStored(asset: CanonicalAsset, type: AnyAssetType, signal?: AbortSignal): Promise<unknown> {
    const codec = type.codec as AssetSourceCodec<unknown, unknown> | undefined;

    if (codec === undefined) {
      throw new Error(`Asset type "${type.id}" declares no source codec, so "${asset.source}" cannot be acquired.`);
    }

    const context: SourceCodecContext = { locator: asset.locator, signal };

    return this._acquire(
      asset.source,
      type.id,
      type.layout as CacheLayout<unknown>,
      asset.sourceKey,
      response => codec.fromResponse(response, context),
      signal,
    );
  }

  /** Acquires this request's representation and reads it back as the source its factory consumes. */
  private async _acquireSource(asset: CanonicalAsset, type: AnyAssetType, signal?: AbortSignal): Promise<unknown> {
    const stored = await this._acquireStored(asset, type, signal);
    const codec = type.codec as AssetSourceCodec<unknown, unknown>;

    return codec.decode(stored, { locator: asset.locator, signal });
  }

  /**
   * Wraps a construction failure in the "which asset, from where" envelope
   * callers see.
   *
   * Failures that are already named are rethrown unwrapped, because the
   * envelope would cost more than it adds. A cancellation would lose the
   * `AbortError` name the residency dispatches on to tell a deliberate cancel
   * from a genuine failure. A cache miss, a store failure and a transport
   * failure carry the namespace, source or URL they concern and are the errors
   * an offline-capable caller dispatches on - `instanceof AssetCacheMissError`
   * is how "not cached" is told from "could not load", and wrapping it takes
   * that away.
   *
   * A decode failure is the one case that gains from the envelope and must
   * still survive as its own type, so it is rebuilt rather than replaced:
   * "these bytes are broken" is only actionable together with which asset they
   * belonged to.
   */
  private _describeFailure(asset: CanonicalAsset, error: unknown): unknown {
    if (isAbortError(error) || error instanceof AssetCacheMissError || error instanceof AssetCacheError || error instanceof AssetNetworkError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const envelope = `Failed to load "${asset.source}" from "${this._resolveUrl(asset.source)}": ${message}`;

    if (error instanceof AssetDecodeError) {
      return new AssetDecodeError({ message: envelope, assetType: error.assetType ?? undefined, cause: error });
    }

    return new Error(envelope, { cause: error });
  }

  /**
   * Builds one asset: acquire a representation, read it back as source, hand it
   * to the factory.
   *
   * A type that supplies its own source skips the first two steps - see
   * {@link AssetType.unacquiredSource} - and never touches the cache.
   *
   * `signal` cancels the dispatched work and reaches the network through the
   * acquisition.
   * @internal
   */
  public async _dispatchFetch(asset: CanonicalAsset, options: unknown, signal: AbortSignal | undefined, scope: LoaderScope): Promise<unknown> {
    const installed = this._typeRegistry.getInstalled(asset.type);

    if (installed === undefined) {
      throw this._typeRegistry._missingTypeError(asset.type);
    }

    const { type, factory } = installed;

    try {
      const unacquired = type.unacquiredSource?.(toRequest(asset.source, options), this._resolveUrl(asset.source), this._network()) as
        | { source: unknown }
        | undefined;
      const source = unacquired === undefined ? await this._acquireSource(asset, type, signal) : unacquired.source;

      return this._storeResource(asset, await factory.create(source, this._factoryContext(asset, scope, options, signal)));
    } catch (error: unknown) {
      throw this._describeFailure(asset, error);
    }
  }

  /**
   * Acquires and persists this request's representation, and stops there.
   *
   * No factory runs, no resource is built and nothing becomes resident: the
   * point is to fill the cache, not to hold anything in memory. The
   * representation is discarded once the route's policy has had its chance to
   * write it.
   *
   * Deliberately does not ask {@link AssetType.unacquiredSource} first. That
   * hook answers whether an ordinary load may skip the acquisition - streaming
   * media says yes while the network is available - and this operation is the
   * caller asking for the acquisition by name. A type with no source of its own
   * to acquire has no codec either, and says so.
   * @internal
   */
  public async _acquireOnly(asset: CanonicalAsset, _options: unknown, signal?: AbortSignal): Promise<void> {
    const installed = this._typeRegistry.getInstalled(asset.type);

    if (installed === undefined) {
      throw this._typeRegistry._missingTypeError(asset.type);
    }

    const { type } = installed;

    // Deliberately unwrapped. The "Failed to load X from Y" envelope belongs to
    // construction, and nothing is being built here: an acquisition failure is
    // already a typed `AssetNetworkError`, `AssetCacheError`,
    // `AssetCacheMissError` or `AbortError`, and hiding which one behind a
    // load-shaped message would cost the caller the only thing it can act on.
    await this._acquireStored(asset, type, signal);
  }

  /**
   * Builds one asset from bytes the application already holds - a container
   * slice - with no fetch and no cache in the path.
   *
   * The bytes go through the same codec and factory as a network load, so a
   * container entry is the same resource, built the same way, as the asset it
   * stands in for. A type whose codec cannot read bytes alone cannot be packed
   * into a container, and says so specifically rather than failing inside a
   * decode.
   *
   * `scope` owns whatever the construction loads, exactly as on the network
   * path: an entry unpacked from a container must not own its dependencies
   * differently from the same entry fetched over the network.
   * @internal
   */
  public async _injectSource(asset: CanonicalAsset, bytes: ArrayBuffer, scope: LoaderScope, options?: unknown): Promise<void> {
    const installed = this._typeRegistry.getInstalled(asset.type);

    if (installed === undefined) {
      throw this._typeRegistry._missingTypeError(asset.type);
    }

    const { type, factory } = installed;
    const codec = type.codec as AssetSourceCodec<unknown, unknown> | undefined;

    if (codec?.fromBytes === undefined) {
      throw new Error(`Asset type "${type.id}" cannot be built from container bytes: its source codec reads a response, not bytes.`);
    }

    const context: SourceCodecContext = { locator: asset.locator, signal: undefined };
    const source = await codec.decode(await codec.fromBytes(bytes, context), context);

    this._storeResource(asset, await factory.create(source, this._factoryContext(asset, scope, options)));
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
