import { AssetCache } from '#assets/cache/AssetCache';
import type { AssetCacheError } from '#assets/cache/AssetCacheError';
import type { CacheLayout } from '#assets/cache/CacheLayout';
import type { CacheStore } from '#assets/cache/CacheStore';
import { AssetManifest, type AssetManifestOptions, type ManifestPack } from '#assets/container/AssetManifest';
import type { ContainerBlockStore } from '#assets/container/containerBlockStore';
import { verifyPackBytes, verifyPackLength } from '#assets/container/containerIntegrity';
import { ContainerReader } from '#assets/container/ContainerReader';
import type { Connectivity } from '#core/Connectivity';
import { Signal } from '#core/Signal';
import { Texture } from '#rendering/texture/Texture';

import { ApplicationAssets } from './ApplicationAssets';
import type { AssetConstructor } from './AssetConstructor';
import { AssetDecoder } from './AssetDecoder';
import type {
  AssetDefinitions,
  AssetTypeName,
  CatalogEntry,
  InferLoadedEntry,
  KindByPath,
  LeafForPath,
  ResourceForKind,
} from './AssetDefinitions';
import {
  _describeTypeReference,
  _isAssetDescriptor,
  _splitAssetDescriptor,
  type AssetDescriptor,
  type AssetDescriptorLeaf,
  type AssetDescriptorResource,
  type LocatorAssetDescriptor,
  type SplitAssetDescriptor,
  type ValidatedAssetDescriptor,
  type ValidatedLeafDescriptor,
} from './AssetDescriptor';
import type { AssetLoadHandle, AssetLoadInput, LoadedAssets, ValidatedAssetLoadInput } from './assetLoadGroup';
import { _readMeta, type CatalogResourceLeaf, type CatalogValueLeaf } from './assetMeta';
import type { AssetRef } from './AssetRef';
import type { AssetReferenceLookup } from './AssetRequestLog';
import {
  type AssetInspection,
  AssetResidency,
  type AssetResidencySignals,
  type AssetStats,
  type ClaimParticipation,
} from './AssetResidency';
import { type Assets, AssetsImpl, type InferAssetsProperties } from './Assets';
import type { AnyAssetType, AssetLeaf } from './AssetType';
import { AssetTypeRegistry, type InstalledAssetType } from './AssetTypeRegistry';
import { AssetVariantSet } from './AssetVariantSet';
import {
  type AssetLocator,
  type CanonicalAsset,
  canonicalizeSource,
  type ResourceKey,
  resourceKey,
  type SourceKey,
  sourceKey,
} from './canonicalKey';
import { createLeaf } from './catalogLeaf';
import { LoadBatch } from './LoadBatch';
import { LoaderScope, type LoaderScopeOptions } from './LoaderScope';
import { LoadingQueue } from './LoadingQueue';
import { isAbortError } from './SharedAbort';

/**
 * The two identities a request resolves to, as reported by
 * {@link Loader.identify}.
 */
export interface AssetIdentity {
  /** Equal keys mean one resident resource, one in-flight fetch and one set of claims. */
  readonly resourceKey: ResourceKey;
  /** Equal keys mean one acquisition, however many resources are built from it. */
  readonly sourceKey: SourceKey;
  /** The canonical locator both are derived from. */
  readonly locator: AssetLocator;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Any abstract or concrete constructor that can be used as an asset type token
 * with {@link Loader.load} and related methods.
 */
export type Loadable = abstract new (...args: any[]) => unknown;

/**
 * Maps each key of a catalog DEFINITION record to its resolved runtime resource
 * type.
 *
 * Keyed on {@link CatalogEntry}, not `AssetInput`: a materialized catalog may
 * have been defined with bare path strings, which `AssetInput` (configs and
 * `Asset` descriptors only) does not cover - the loader consumes the already
 * materialized leaves and must not re-validate the definition entries.
 */
export type InferLoadedMap<M extends Record<string, CatalogEntry>> = {
  // `-readonly` is deliberate. A catalog definition record declares its keys
  // `readonly`, and a homomorphic mapping would carry that modifier into the
  // loaded map - but the map is built per call and handed to the caller, who
  // owns it. Stripping the modifier also keeps the type readable: a mapping
  // that is not homomorphic is written out eagerly instead of surfacing as
  // `InferLoadedMap<FlattenDefinition<...>>` on hover.
  -readonly [K in keyof M]: InferLoadedEntry<M[K]>;
};

/**
 * Construction options for {@link Loader}.
 *
 * `basePath` is prepended to relative asset paths at fetch time.
 * `concurrency` caps the number of simultaneous background-queue fetches
 * (default `6`).
 *
 * `cache` configures caching, and is optional: with nothing passed, every
 * acquisition goes straight to the network and no cache machinery runs at all.
 * One or more {@link CacheStore} instances configure a single cache-first
 * route over them; an {@link AssetCache} configures routes and policies
 * explicitly.
 *
 * `connectivity` is what makes an acquisition's network permission known to the
 * cache and to a streaming asset type. {@link Application} supplies its own, so
 * this is only for a loader built by hand.
 */
export interface LoaderOptions {
  basePath?: string;
  fetchOptions?: RequestInit;
  cache?: AssetCache | CacheStore | readonly CacheStore[];
  concurrency?: number;
  /**
   * Whether acquisitions may reach the network, and what the host reports.
   *
   * The loader never subscribes to it and never changes it: it reads a
   * snapshot when an acquisition starts, and passes that value on. Omitted,
   * every acquisition runs unrestricted.
   */
  connectivity?: Connectivity;
}

/**
 * How urgently a {@link Loader.load} call should fetch what it adopts.
 *
 * An enum rather than a boolean because priority is the axis a residency model
 * grows along: further levels (and, later, eviction or streaming policy) can be
 * added here without changing the shape of {@link LoadOptions}.
 */
export enum LoadPriority {
  /** Fetch now. The default, and what `load()` does with no options at all. */
  Immediate = 'immediate',
  /**
   * Route the fetch through the low-priority background queue. Every adopted
   * leaf is still claimed and registered - it heals in place and a later
   * {@link Loader.get} returns the same instance - but instead of starting
   * immediately it streams concurrency-capped, drops from the queue if released
   * at refcount 0, and is boosted to fetch now on a direct `get()`.
   */
  Background = 'background',
}

/** Options for the catalog/asset/leaf {@link Loader.load} forms. */
export interface LoadOptions {
  /** Defaults to {@link LoadPriority.Immediate}. */
  priority?: LoadPriority;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/** How {@link Loader.loadContainer} fetches a container. */
export interface LoadContainerOptions {
  /**
   * Where to keep the container's blocks between visits - `cacheApiBlockStore()`
   * for the browser's own storage, or any {@link ContainerBlockStore}.
   *
   * Supplying one selects the block-wise path: the head is read first and only
   * the blocks the store does not hold are fetched, so a revisit costs what
   * actually changed. It replaces the whole-file cache entry rather than adding
   * to it, since both hold the same bytes. Omit it to fetch and cache the file
   * whole.
   */
  readonly store?: ContainerBlockStore;
}

/** How {@link Loader.loadManifest} fetches a manifest. */
export interface LoadManifestOptions {
  /** Abandons the request; the rejection is an abort error, as everywhere else in the loader. */
  readonly signal?: AbortSignal;
  /**
   * HTTP cache mode for this one request, overriding the `'no-cache'` a
   * manifest is read with. The application's `fetchOptions.cache` deliberately
   * does not reach it: a manifest held by an HTTP cache pins the application to
   * an earlier deployment, which is the one thing content-addressed packs exist
   * to prevent.
   */
  readonly cache?: RequestCache;
}

/** One entry of a load, normalized: a leaf to adopt, or a canonical request to load directly. */
interface LoadUnit {
  /** Unique within the load; keys the result map. */
  readonly alias: string;
  /** What progress signals report the entry as. */
  readonly key: string;
  readonly src: string;
  readonly leaf?: object;
  readonly canonical?: CanonicalAsset;
  readonly options?: unknown;
  /** A value type's synchronous transform, applied to the loaded value. */
  readonly parse?: (raw: unknown) => unknown;
  /** Rejects the item instead of loading it. */
  readonly failure?: Error;
}

/** A descriptor whose type is installed on this loader. */
interface ResolvedDescriptor extends SplitAssetDescriptor {
  readonly installed: InstalledAssetType;
}

interface QueueItem {
  readonly alias: string;
  readonly key: string;
  readonly src: string;
  readonly participation: ClaimParticipation | undefined;
  readonly start: () => PromiseLike<unknown>;
}

/**
 * Central asset management hub for ExoJS applications.
 *
 * The `Loader` orchestrates fetching, processing, caching, and retrieval of
 * assets. An `Application` installs the first-party {@link AssetType}s
 * (Texture, Sound, AudioStream, Video, FontFace, ImageBitmap or
 * HTMLImageElement, JSON, text, SVG, subtitles, binary, and WASM). A standalone
 * `Loader` resolves no suffix until a type is registered on it; an application
 * adds its own types by listing them in an extension.
 *
 * Assets can be loaded in two ways:
 * - **Direct** - `loader.load(Assets.from({ hero: 'hero.png' }))` fetches
 *   immediately and resolves to the finished assets.
 * - **Background** - pass `{ priority: LoadPriority.Background }` to `load(...)` to pre-warm
 *   assets at low priority; {@link awaitBackground} resolves once the queue drains.
 *
 * Once loaded, assets are stored in memory and returned from cache on
 * subsequent `load` or {@link get} calls without re-fetching.
 *
 * @example
 * ```ts
 * // Access the application-installed loader.
 * // Its asset types were registered during Application construction.
 * // A standalone Loader requires explicit asset-type registration.
 * const loader = app.loader;
 * const { hero } = await loader.load(Assets.from({ hero: 'hero.png' }));
 * ```
 *
 * @remarks Internally, `Loader` is a thin orchestrator over three collaborators:
 * `AssetTypeRegistry` (installed types, their suffixes and factories),
 * `AssetDecoder` (URL resolution, acquisition, codec and factory dispatch),
 * and `AssetResidency` (claims, in-flight dedup, the resident-resource store,
 * deferred-handle healing, the background queue). `Loader` itself keeps the
 * public call-shape dispatch (`load`/`get`/`unload` and their internal scene-scope
 * entry points) and the foreground-batch progress signals.
 */
export class Loader {
  private readonly _typeRegistry = new AssetTypeRegistry();
  /** @internal */
  public readonly _assetTypes: ApplicationAssets = new ApplicationAssets(this._typeRegistry, this);
  private readonly _decoder: AssetDecoder;
  private readonly _residency: AssetResidency;
  private _destroyed = false;
  // Direct sources are identified by reference, never serialized: they can be
  // arbitrary objects, and two equal-looking ones may be distinct inputs.
  private readonly _directIds = new WeakMap<object, number>();
  private readonly _directSymbolIds = new Map<symbol, number>();
  private _nextDirectId = 0;

  /**
   * Resolve a bare path once for both `get()` and `load()`: normalize it to the
   * canonical descriptor fields, resolve the dispatch constructor, and verify
   * that this Loader actually has a handler for it.
   *
   * These are synchronous input/configuration checks. Once this method returns,
   * an actual handler failure is asynchronous: `get()` exposes it through the
   * returned handle plus {@link onError}; `load()` rejects and also dispatches
   * {@link onError}.
   */
  private _resolveBarePath(input: string): { type: AssetTypeName; source: string; ctor: AssetConstructor } {
    // Variant selection runs ahead of the type lookup, so the type follows the
    // file this device actually gets. A rule may legitimately swap a `.png` for a
    // `.ktx2`, and inferring the type from the name the caller wrote would then
    // hand compressed-container bytes to the image decoder.
    const source = this.variants.resolve(input);
    const named = source === input ? `"${input}"` : `"${source}" (selected as a variant of "${input}")`;
    const type = this._typeRegistry._resolveTypeForPath(source);

    if (type === undefined) {
      throw new Error(
        `Loader: no installed asset type claims any extension of ${named}. Install a type that does, map the suffix with ` +
          `loader.registerType(extension, type), or name the type with a descriptor: { type, source: "${source}" }.`,
      );
    }

    const ctor = this._typeRegistry.resolveTypeName(type);

    if (ctor === undefined) {
      throw new Error(`Loader: no asset type "${type}" is installed on this application (inferred from ${named}).`);
    }

    return { type, source, ctor };
  }

  /** Options a bare path implies for its type - shared by `load` and `peek` so both key identically. */
  private _barePathOptions(type: AssetTypeName, source: string): unknown {
    return type === 'font' ? { family: (source.split('/').pop()?.split(/[?#]/)[0] ?? '').replace(/\.[^.]+$/, '') } : undefined;
  }

  /**
   * Resolve a request to its one canonical identity. Called once per entry
   * point, always before a fetch can start, so no later layer can derive a
   * second identity for the same resource.
   *
   * The locator is resolved against the base path in force at this moment: a
   * `basePath` change does not retroactively re-key assets already resident
   * under their old locator.
   * @internal
   */
  public _canonicalize(type: AssetConstructor, source: string, options?: unknown): CanonicalAsset {
    // Variant selection happens here, ahead of the locator, so identity is keyed
    // on the file this device actually fetches. Resolving it any later would let
    // two devices share one cache entry whose contents depend on which of them
    // filled it, and would leave a reference the asset itself carries resolving
    // against a path that was never loaded.
    const variant = this.variants._resolveCandidate(source);
    const selected = variant?.source ?? source;
    const locator = canonicalizeSource(this._decoder.basePath, selected);
    // The resource discriminator is deliberately absent from the source key: two
    // resources that differ only in how one download is interpreted must resolve
    // to one acquisition, or the same bytes would be fetched once per
    // interpretation. The reverse containment is structural - the resource key is
    // built ON the source key - so distinct source data can never share a
    // resident resource even if a type forgets to repeat the distinction.
    const acquired = sourceKey(locator, this._typeRegistry._sourceDiscriminator(type, selected, options));

    return {
      key: resourceKey(
        this._typeRegistry._typeIdentity(type),
        acquired,
        this._typeRegistry._identityDiscriminator(type, selected, options),
      ),
      sourceKey: acquired,
      locator,
      type,
      source: selected,
      requested: source,
      ...(variant?.resolution !== undefined && { variantResolution: variant.resolution }),
      ...(options !== undefined && { options }),
    };
  }

  /** The loader-local number identifying a direct source or source-free descriptor by reference. */
  private _directId(value: object | symbol): number {
    const ids = typeof value === 'symbol' ? this._directSymbolIds : undefined;
    let id = ids === undefined ? this._directIds.get(value as object) : ids.get(value as symbol);

    if (id === undefined) {
      id = ++this._nextDirectId;

      if (ids === undefined) {
        this._directIds.set(value as object, id);
      } else {
        ids.set(value as symbol, id);
      }
    }

    return id;
  }

  /** The installed type a descriptor names, with its source and options; `undefined` when no such type is installed. */
  private _resolveDescriptor(descriptor: AssetDescriptor): ResolvedDescriptor | undefined {
    const split = _splitAssetDescriptor(descriptor);
    const installed = this._typeRegistry._resolveReference(split.type);

    return installed === undefined ? undefined : { ...split, installed };
  }

  private _requireDescriptor(descriptor: AssetDescriptor, api: string): ResolvedDescriptor {
    const resolved = this._resolveDescriptor(descriptor);

    if (resolved === undefined) {
      throw this._unknownDescriptorType(descriptor.type, api);
    }

    return resolved;
  }

  private _unknownDescriptorType(type: unknown, api: string): Error {
    if (typeof type === 'function') {
      return this._typeRegistry._missingTypeError(type as AssetConstructor);
    }

    return new Error(
      `Loader: ${api} - no asset type ${_describeTypeReference(type)} is installed on this application.${
        typeof type === 'string'
          ? ' A plain object with an own "type" property is always read as an asset descriptor, so a load group cannot use "type" as a key.'
          : ''
      }`,
    );
  }

  /**
   * The canonical identity of a resolved descriptor: a string source is a
   * locator and canonicalizes like a path; anything else is a direct source.
   */
  private _canonicalizeDescriptor(resolved: ResolvedDescriptor, descriptor: AssetDescriptor): CanonicalAsset {
    const { token } = resolved.installed;

    return typeof resolved.source === 'string'
      ? this._canonicalize(token, resolved.source, resolved.options)
      : this._canonicalizeDirect(token, resolved, descriptor);
  }

  /**
   * Identity for a factory source that is not fetched. It never touches the
   * base path, variants or caches; the `direct:` locator only names the claim.
   */
  private _canonicalizeDirect(token: AssetConstructor, resolved: SplitAssetDescriptor, descriptor: AssetDescriptor): CanonicalAsset {
    const { hasSource, source, options } = resolved;
    const discriminator = this._typeRegistry._identityDiscriminator(token, '', options);
    let identity: string;

    if (!hasSource) {
      // A type that declares a resource identity makes equal source-free
      // requests one resource; otherwise only the descriptor object itself can.
      identity = discriminator === undefined ? `descriptor-${this._directId(descriptor)}` : 'source-free';
    } else if ((typeof source === 'object' && source !== null) || typeof source === 'function' || typeof source === 'symbol') {
      identity = `value-${this._directId(source)}`;
    } else {
      identity = `${source === null ? 'null' : typeof source}-${String(source)}`;
    }

    const locator = `direct:${identity}`;
    const acquired = sourceKey(locator);

    return {
      key: resourceKey(this._typeRegistry._typeIdentity(token), acquired, discriminator),
      sourceKey: acquired,
      locator,
      type: token,
      source: locator,
      ...(options !== undefined && { options }),
      directSource: source,
    };
  }

  /**
   * The two identities a descriptor resolves to on this loader.
   *
   * Both are derived exactly as a real load derives them, against the base path
   * in force right now, so they can be compared to reason about what the loader
   * will deduplicate: equal {@link AssetIdentity.resourceKey} means one resident
   * resource, equal {@link AssetIdentity.sourceKey} means one acquisition.
   */
  public identify<const D extends AssetDescriptor>(descriptor: D & ValidatedAssetDescriptor<D>): AssetIdentity {
    const canonical = this._canonicalizeDescriptor(this._requireDescriptor(descriptor, 'identify()'), descriptor);

    return { resourceKey: canonical.key, sourceKey: canonical.sourceKey, locator: canonical.locator };
  }

  /**
   * Acquires an asset's SOURCE and lets the cache keep it, without building the
   * asset.
   *
   * This is how an application fills a persistent cache ahead of time - before
   * a level, before going offline, on a fast connection - for assets it does not
   * want resident yet. Nothing is constructed, nothing is claimed, and nothing
   * stays in memory: what remains afterwards is a cache record, which a later
   * `load()` of the same asset finds because both derive the same source
   * identity from the same descriptor.
   *
   * Whether a hit is served from the cache or the network comes down to the
   * route's policy, exactly as it does for a load. A cached source is not
   * re-fetched.
   *
   * This is the explicit acquisition, so it applies to streamed media too: an
   * ordinary `music` or `video` descriptor is fetched in full and persisted as a
   * blob here, while a plain `load()` of that same descriptor keeps streaming
   * for as long as the network is available. A type built entirely from other
   * assets has no source of its own to acquire, and rejects saying so.
   *
   * @example
   * ```ts
   * await app.loader.cacheSource({ type: worldType, source: 'levels/forest.world' });
   * await app.loader.cacheSource({ type: Music, source: 'theme.mp3' });
   * ```
   */
  public cacheSource<const D extends LocatorAssetDescriptor>(
    descriptor: D & ValidatedAssetDescriptor<D>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<void> {
    const resolved = this._requireDescriptor(descriptor, 'cacheSource()');

    if (typeof resolved.source !== 'string') {
      throw new TypeError('Loader: cacheSource() acquires a locator, so the descriptor needs a string source.');
    }

    return this._decoder._acquireOnly(
      this._canonicalize(resolved.installed.token, resolved.source, resolved.options),
      resolved.options,
      options?.signal,
    );
  }

  /**
   * Acquire a representation of `source` through the application's cache
   * configuration.
   *
   * `read` turns the raw response into the representation worth keeping. It is
   * the only route by which an asset type reaches the network, and it hands back
   * the representation rather than a resource: what to build from it stays with
   * the factory, and where it was served from stays with the loader.
   *
   * A cache record is identified by the type's `namespace`, the request's
   * source identity and the `layout` version - never by the source identity
   * alone, which carries no asset type and would let two types collide on one
   * URL.
   * @internal
   */
  public _fetchRepresentation<T>(
    source: string,
    read: (response: Response) => Promise<T>,
    namespace: string,
    layout: CacheLayout<T>,
    sourceIdentity: SourceKey,
    signal?: AbortSignal,
  ): Promise<T> {
    return this._decoder._acquire<T>(source, namespace, layout, sourceIdentity, read, signal);
  }

  // ── Refcount / claims ───────────────────────────────────────────────────────
  /**
   * Application-lifetime claim scope for direct `app.loader.get/load(...)` calls.
   * Deliberately not exposed: its claims are released only by {@link destroy},
   * so no caller can drop an app-lifetime claim another consumer relies on.
   */
  private readonly _appScope = new LoaderScope(this, 'app', '(app)');
  private _liveLoadScope: LoaderScope | undefined;

  /** Aggregate foreground progress across every scope. Each scope also reports its own. */
  private readonly _batch = new LoadBatch(this);

  /** Dispatched after each background-queue item completes, with the running loaded/total counts. */
  public readonly onProgress = new Signal<[loaded: number, total: number]>();
  /** Dispatched when any asset finishes loading and is stored in memory. */
  public readonly onLoaded = new Signal<[type: AssetConstructor, alias: string, resource: unknown]>();
  /**
   * Fires whenever an asynchronous asset fetch fails, in both development and
   * production builds.
   *
   * `get()` returns its placeholder / {@link AssetRef} synchronously; a later
   * fetch failure is reflected by that handle's state/`loaded` promise and by
   * this signal, not by a delayed throw from the original call. `load()` remains
   * awaitable and rejects with the same failure while also dispatching it here.
   * A later retry may heal the existing handle in place.
   *
   * Invalid inputs and missing registrations are configuration errors and can
   * still throw synchronously before either operation starts a fetch.
   */
  public readonly onError = new Signal<[type: AssetConstructor, alias: string, error: Error]>();

  /** Fired when the first asset in a new load batch starts fetching. */
  public readonly onLoadStart = new Signal<[key: string, url: string]>();
  /** Fired after each asset settles (loaded or failed). `loaded` = resolved count, `total` = batch size. */
  public readonly onLoadProgress = new Signal<[loaded: number, total: number, key: string]>();
  /** Fired when all queued assets in the batch have settled. */
  public readonly onLoadComplete = new Signal();
  /** Fired when an asset fails to load. Does NOT prevent onLoadComplete. */
  public readonly onLoadError = new Signal<[key: string, error: Error]>();

  /**
   * Fires for cache failures the configured {@link CachePolicy} degraded
   * instead of propagating - most commonly a persistent store hitting its
   * quota. Purely diagnostic: the affected load still succeeds from the
   * network, so without a listener the only symptom is that caching quietly
   * stopped working.
   *
   * Narrow on {@link AssetCacheError.operation} and read {@link Error.cause}
   * for the originating `DOMException` (`QuotaExceededError` and friends).
   *
   * Reports only failures caused by *this* loader's own requests, even when
   * its {@link AssetCache} or {@link CachePolicy} is shared with other loaders
   * - the cache is handed a per-acquisition sink rather than subscribing to one.
   */
  public readonly onCacheError = new Signal<[error: AssetCacheError]>();

  /**
   * Per-device selection between several files standing for one logical source -
   * a texture shipped once per compressed format family, once per display
   * density, or both.
   *
   * Empty by default, so a loader nobody configures resolves every source to
   * itself. The {@link Application} publishes the device profile here once its
   * render backend is up.
   */
  public readonly variants = new AssetVariantSet();

  public constructor(options: LoaderOptions = {}) {
    const cache = options.cache;

    this._decoder = new AssetDecoder(this, this._typeRegistry, {
      basePath: options.basePath ?? '',
      fetchOptions: options.fetchOptions ?? {},
      cache: cache === undefined ? null : AssetCache.from(cache),
      // Stores handed to one loader are wrapped in a cache that loader owns and
      // tears down with itself; an `AssetCache` handed in belongs to whoever
      // built it, and may well be serving other loaders.
      ownsCache: cache !== undefined && !(cache instanceof AssetCache),
      connectivity: options.connectivity ?? null,
    });

    const signals: AssetResidencySignals = { onProgress: this.onProgress, onLoaded: this.onLoaded, onError: this.onError };

    this._residency = new AssetResidency(this._typeRegistry, this._decoder, signals, options.concurrency ?? 6, {
      canonicalize: (type, source, assetOptions) => this._canonicalize(type, source, assetOptions),
      createDependencyScope: asset => new LoaderScope(this, 'dependency', asset.source),
    });

    // Bound last, once both collaborators exist: the decoder feeds what it
    // decodes back into the residency, which in turn needs the decoder to
    // dispatch fetches.
    this._decoder._bindResourceStore((asset, resource) => this._residency._storeResource(asset, resource));
  }

  /**
   * Creates a new claim scope: an owner whose assets are freed when it is
   * destroyed, rather than when the application ends.
   *
   * Every call returns a new, independent owner - never a lookup of an existing
   * one. Two scopes created under the same name are still two owners, because a
   * name is a label for diagnostics and never an identifier, so one consumer can
   * never release another's claim.
   *
   * Assets acquired directly on the loader are claimed for the application's
   * lifetime instead, and released only by {@link destroy}. Nest shorter
   * lifetimes with {@link LoaderScope.createScope}.
   *
   * @example
   * ```ts
   * const level = app.loader.createScope({ name: 'level-1' });
   * const hud = app.loader.createScope({ name: 'ui:hud' });
   *
   * const font = level.get('fonts/ui.png');
   * hud.get('fonts/ui.png'); // same instance, one fetch, two independent owners
   *
   * level.destroy(); // the font stays resident - the HUD still owns it
   * ```
   */
  public createScope(options?: LoaderScopeOptions): LoaderScope {
    return new LoaderScope(this, 'scope', options?.name);
  }

  // -----------------------------------------------------------------------
  // Type registration
  // -----------------------------------------------------------------------

  /**
   * Registers an extension→type override for bare-path resolution, scoped to
   * **this Loader instance only**: it applies to bare paths passed to this
   * loader's `get(...)` / `load(...)`, and takes precedence over the type that
   * claimed the suffix by declaring it.
   *
   * It does NOT affect loader-free catalog construction - `Assets.from('level.json')`
   * has no loader to consult and resolves through the built-in table alone. Name
   * the type with a descriptor (`{ type, source }`) there instead.
   *
   * `type` is the type's id, not a constructor. This call installs nothing; the
   * named type must still be installed on the application. Repeating the same pair is idempotent,
   * while changing an existing explicit override to another type throws. Use a
   * descriptor for a one-off exception.
   *
   * @example
   * ```ts
   * app.loader.registerType('json', 'ldtkMap');
   * ```
   */
  public registerType(extension: string, type: AssetTypeName): this {
    this._typeRegistry.registerType(extension, type);

    return this;
  }

  /**
   * Load every asset packed into a binary container (`.exoa`) and return the
   * scope that owns them.
   *
   * A container is one file with an embedded index: its slices are read through
   * each type's own codec and factory and stored under the entry's own logical
   * source. A container is therefore a transport, not a second naming system -
   * an entry resolves to exactly the same asset identity as a network load of
   * that source, so both can hold it and the payload is fetched and decoded
   * once.
   *
   * By default the file is fetched in a **single request** and cached whole,
   * cross-session, like any other asset. Passing a {@link ContainerBlockStore}
   * switches to the block-wise path instead: the head is read first, and only
   * the blocks the store does not already hold are fetched. That is what makes
   * a pack whose assets mostly did not change cost close to nothing on a second
   * visit - at the price of the whole-file cache entry, since the two cache the
   * same bytes at different granularity and keeping both would store them
   * twice. Servers that do not answer byte ranges degrade to one request
   * automatically.
   *
   * The returned scope holds one ordinary claim per entry. Destroying it frees
   * only the entries no other owner still holds, so unpacking a container can
   * never pull an asset out from under a scene that also uses it. Use
   * {@link LoaderScope.loadContainer} to claim the entries under an existing
   * scope instead.
   *
   * Each entry's asset type must be readable from bytes alone - its
   * {@link AssetSourceCodec} has to implement `fromBytes`, which every built-in
   * type does. Throws on a malformed container, an unsupported format version,
   * an unknown type, or a type that cannot be read from bytes.
   *
   * A {@link ManifestPack} may be passed instead of a path. The pack carries the
   * container's URL, length and hash, and the bytes are checked against that
   * record before anything is unpacked - a mismatch is an `AssetDecodeError`
   * and nothing is cached. How much is checked depends on how much is read: the
   * whole-file path holds the file and verifies the digest, while the
   * block-wise path never holds it and verifies only the length, leaving the
   * content-addressed URL as the statement about the bytes. The digest is also
   * skipped where `crypto.subtle` is unavailable, which is an insecure context;
   * the length check still runs.
   *
   * @param source Path to the container file, resolved against the loader base path, or a pack from a manifest.
   * @param options Where to keep blocks between visits; omitted, the whole file is fetched and cached.
   */
  public async loadContainer(source: string | ManifestPack, options?: LoadContainerOptions): Promise<LoaderScope> {
    const scope = new LoaderScope(this, 'container', `container:${typeof source === 'string' ? source : source.url}`);

    try {
      await this._loadContainerInto(scope, source, options);
    } catch (error: unknown) {
      // The scope never reaches the caller on this path, so every claim the
      // unpack already registered would stay held for the loader's lifetime
      // with nothing able to release it.
      scope.destroy();

      throw error;
    }

    return scope;
  }

  /**
   * Read the asset manifest at `url`: which packs this deployment holds, and
   * which file currently carries each of them.
   *
   * A pack file is named after the hash of its own bytes, so it can be cached
   * forever and the manifest is the one URL worth re-reading. Hand the pack to
   * {@link loadContainer}, which then checks the bytes against what the manifest
   * states.
   *
   * The manifest is read straight from the network with `cache: 'no-cache'`,
   * outside the loader's asset cache and outside its connectivity policy: it is
   * the one document whose whole purpose is to say what the current deployment
   * is, so a cached or policy-suppressed answer would be worse than none. The
   * application's `fetchOptions` are carried except for `cache`, which
   * {@link LoadManifestOptions.cache} is the only way to change. A manifest
   * request therefore fails offline rather than resolving from a store.
   *
   * Throws an `AssetNetworkError` when the manifest cannot be fetched, and an
   * `AssetDecodeError` when it is not JSON, states a version this build does
   * not read, or describes a pack it cannot address.
   *
   * @param url Path to the manifest, resolved against the loader base path.
   *
   * @example
   * ```ts
   * const manifest = await loader.loadManifest('assets.json');
   * const level = await loader.loadContainer(manifest.pack('level1'), { store: cacheApiBlockStore() });
   * ```
   */
  public async loadManifest(url: string, options?: LoadManifestOptions): Promise<AssetManifest> {
    const request = this._decoder._containerRequest(url, options?.signal);
    const manifestOptions: AssetManifestOptions = { init: { ...request.init, cache: options?.cache ?? 'no-cache' } };

    try {
      return await AssetManifest.open(request.url, manifestOptions);
    } finally {
      request.release?.();
    }
  }

  /**
   * Open the container `source` addresses, on whichever path `options` selects.
   *
   * Without a block store the bytes go through the ordinary asset acquisition -
   * one request, the application's cache configuration and connectivity policy.
   * With one, the reader fetches for itself so it can stop at the head and take
   * only the blocks the store lacks, which the whole-file cache could not
   * express.
   *
   * A pack from a manifest is checked against its record: the whole-file path
   * holds the bytes and verifies the digest before they are persisted, while
   * the block-wise path - which never holds the whole file - checks the length
   * and relies on the content-addressed URL for the rest.
   */
  private async _openContainer(source: string | ManifestPack, options?: LoadContainerOptions): Promise<ContainerReader> {
    const pack = typeof source === 'string' ? undefined : source;
    const url = typeof source === 'string' ? source : source.url;

    if (options?.store === undefined) {
      // Verification runs inside the acquisition, on the network leg, so bytes
      // that fail it are never written to the asset cache - a poisoned record
      // under a content-addressed key would fail every later load from cache,
      // where no network answer could correct it.
      const verify = pack === undefined ? undefined : async (bytes: ArrayBuffer): Promise<void> => verifyPackBytes(pack, bytes);

      return ContainerReader.fromBuffer(await this._decoder._acquireContainer(url, verify));
    }

    const request = this._decoder._containerRequest(url);
    const reader = await ContainerReader.open(request.url, { store: options.store, init: request.init });

    if (pack !== undefined) {
      verifyPackLength(pack, reader.byteLength);
    }

    return reader;
  }

  /** Backs {@link loadContainer} and {@link LoaderScope.loadContainer}: unpack `source` and claim every entry under `claimer`. @internal */
  public async _loadContainerInto(claimer: LoaderScope, source: string | ManifestPack, options?: LoadContainerOptions): Promise<void> {
    const reader = await this._openContainer(source, options);
    const url = typeof source === 'string' ? source : source.url;
    const { entries } = reader.container;

    // Resolve every type up front so an unknown type fails before any asset is stored.
    const resolved = entries.map(entry => {
      const type = this._typeRegistry.resolveTypeName(entry.type);

      if (!type) {
        throw new Error(`Container "${url}" references unknown asset type "${entry.type}".`);
      }

      return { entry, asset: this._canonicalize(type, entry.source, entry.options) };
    });

    // A new definition cannot switch the codec after these entries have been keyed.
    for (const { asset } of resolved) {
      this._typeRegistry.markUsed(asset.type);
    }

    // Reading happens before anything touches residency. It is the only
    // asynchronous step in the unpack, and the claim/inject loop below must run
    // without an await between the in-flight check and the injection it guards -
    // a `get()` slipping into that gap would build a second payload for one
    // identity.
    //
    // Every entry is read in one call because a block spans many of them:
    // reading per entry would decompress the same block once per asset it
    // holds.
    const payloads = await reader.readEntries(resolved.map(({ entry }) => entry));
    const unpacked = resolved.map(({ entry, asset }, index) => {
      const payload = payloads[index];

      if (payload === undefined) {
        throw new Error(`Container "${url}" produced no bytes for "${entry.source}".`);
      }

      return { entry, asset, payload };
    });

    // Claim before unpacking: an entry that is already resident (loaded over the
    // network earlier) is kept alive by this claim even though nothing stores it
    // again, and an entry nobody claims would otherwise be freed on arrival.
    for (const { asset } of unpacked) {
      this._claim(asset, claimer);
    }

    // An entry whose canonical asset is already resident (or on its way from the
    // network) is claimed above and nothing more: unpacking it again would build
    // a second payload for one identity, and for a resource that owns a device
    // or a media element the loser would never be released.
    //
    // Each injection registers as in-flight before the next entry is examined,
    // so a get()/load() reaching the same source mid-unpack joins the unpack
    // rather than racing it with a fetch of its own.
    const pending: Array<Promise<unknown>> = [];

    for (const { entry, asset, payload } of unpacked) {
      if (this._residency._isMaterializing(asset.key)) {
        continue;
      }

      const injection = this._decoder._injectSource(asset, payload, this._residency._dependencyScopeFor(asset), entry.options);

      pending.push(this._residency._trackInjection(asset, injection));
    }

    // Every injection is awaited, not just the ones before the first failure: an
    // entry that lands after the caller has already abandoned the container
    // would be resident with no owner left to release it.
    const settled = await Promise.allSettled(pending);
    const failed = settled.find(result => result.status === 'rejected');

    if (failed !== undefined) {
      throw failed.reason;
    }
  }

  // -----------------------------------------------------------------------
  // Loading - canonical Asset / Assets descriptor forms
  // -----------------------------------------------------------------------

  /**
   * Loads one asset or a group of assets into application ownership and
   * returns an awaitable queue with progress and cancellation.
   *
   * Accepts a path whose suffix names its type, a handle (`new Texture(path)`,
   * a catalog leaf), an asset descriptor (`{ type: Video, source: 'intro.mp4' }`;
   * see {@link AssetDescriptor}), or an array, tuple or named object of those. A
   * group resolves to the same shape with every entry replaced by its loaded
   * value; a handle heals in place as well. An {@link Assets} catalog resolves
   * to a new map of its finished values.
   *
   * In-flight and resident assets are shared: loading the same request again
   * joins the existing fetch. Invalid input throws synchronously before any
   * work starts; fetch and decode failures reject the queue and are also
   * reported through {@link onError}. Claims made here last until the loader is
   * destroyed; prefer a scene's or a child scope's `load` for shorter lifetimes.
   *
   * With `priority: LoadPriority.Background` the fetches go through the
   * background queue, and a later foreground request promotes them. Background
   * loading needs a type with a placeholder, so it rejects streamed media and
   * other types without one.
   *
   * @example
   * ```ts
   * const texture = await loader.load('image/hero.png');
   * const { hero, intro } = await loader.load({ hero: 'image/hero.png', intro: { type: Video, source: 'video/intro.mp4' } });
   * ```
   */
  public load<M extends Record<string, CatalogEntry>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  public load<const Input extends AssetLoadInput>(
    input: Input & ValidatedAssetLoadInput<Input>,
    options?: LoadOptions,
  ): LoadingQueue<LoadedAssets<Input>>;
  public load(input: unknown, options?: LoadOptions): LoadingQueue<unknown> {
    return this._loadClaimed(this._appScope, input, options);
  }

  /** The application-owned scope behind `app.assets`, created on first use. @internal */
  public get _applicationScope(): LoaderScope {
    if (this._destroyed) {
      throw new Error('Cannot load assets after the loader is destroyed.');
    }

    return (this._liveLoadScope ??= new LoaderScope(this, 'app', '(app assets)'));
  }

  /**
   * Claimed variant of {@link load}: identical logic, but every resolved key is
   * claimed under `claimer` (refcount). The public {@link load} delegates here
   * under the app-lifetime {@link _appScope}; the scene-scoped loader proxy
   * passes its own scope. Claiming under `_appScope` (whose claims only
   * {@link destroy} frees) is observationally a no-op for existing callers.
   * @internal
   */
  public _loadClaimed(claimer: LoaderScope, input: unknown, options?: unknown): LoadingQueue<unknown> {
    if (this._destroyed) {
      throw new Error('Cannot load assets after the loader is destroyed.');
    }

    if (
      options !== undefined &&
      (typeof options !== 'object' || options === null || Object.keys(options).some(key => key !== 'priority'))
    ) {
      // Silently dropping a per-asset option here would load the asset with defaults.
      throw new TypeError(
        'Loader.load(): the second argument only takes LoadOptions ({ priority }). Per-asset options belong on the descriptor, ' +
          'for example { type: Texture, source, textureOptions }.',
      );
    }

    const background = (options as LoadOptions | undefined)?.priority === LoadPriority.Background;

    // An Assets catalog adopts its own leaves, so they heal in place, and
    // resolves to a fresh map of the loaded values.
    if (input instanceof AssetsImpl) {
      const entries = Object.entries((input as AssetsImpl<Record<string, CatalogEntry>>).entries) as Array<[string, object]>;
      const participations = this._adoptAll(entries, claimer, background);

      return this._createAdoptedQueue(claimer, entries, participations, results => {
        const out: Record<string, unknown> = {};

        for (const [alias] of entries) {
          out[alias] = results.get(alias);
        }

        return out;
      });
    }

    let shape: 'single' | 'array' | 'record';
    let candidates: Array<[key: string | symbol, entry: unknown]>;

    if (Array.isArray(input)) {
      shape = 'array';
      candidates = Array.from(input as unknown[], (entry, index): [string, unknown] => [String(index), entry]);
    } else if (this._isLoadEntry(input)) {
      shape = 'single';
      candidates = [['0', input]];
    } else {
      const prototype: unknown = typeof input === 'object' && input !== null ? Object.getPrototypeOf(input) : undefined;

      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(
          `Loader.load() expects a path, an asset handle, an asset descriptor, or an array or plain object of those, got ${String(input)}.`,
        );
      }

      const record = input as Record<string | symbol, unknown>;
      shape = 'record';
      candidates = Reflect.ownKeys(record)
        .filter(key => Object.getOwnPropertyDescriptor(record, key)?.enumerable === true)
        .map(key => [key, record[key]]);
    }

    // Every entry is validated before the first claim opens, so a load that
    // throws leaves no stake behind.
    const units = candidates.map(([key, entry], index) =>
      this._loadUnit(String(index), String(key), entry, background, shape === 'record'),
    );
    const leaves = units.flatMap(unit => (unit.leaf === undefined ? [] : [[unit.alias, unit.leaf] as [string, object]]));
    const participations = this._adoptAll(leaves, claimer, background);
    const items: QueueItem[] = [];
    let leafIndex = 0;

    try {
      for (const unit of units) {
        if (unit.leaf !== undefined) {
          const leaf = unit.leaf;

          items.push({
            alias: unit.alias,
            key: unit.key,
            src: unit.src,
            participation: participations[leafIndex++],
            start: () => (leaf as AssetLoadHandle).loaded,
          });
        } else if (unit.canonical !== undefined) {
          const canonical = unit.canonical;
          const participation = this._residency._participate(canonical, claimer);
          const unitOptions = unit.options;
          const parse = unit.parse;

          participations.push(participation);
          items.push({
            alias: unit.alias,
            key: unit.key,
            src: unit.src,
            participation,
            start: () => {
              const loading = this._residency._loadSingle(canonical, unitOptions);

              return parse === undefined ? loading : loading.then(parse);
            },
          });
        } else {
          const failure = unit.failure ?? new Error(`The asset at "${unit.key}" could not be resolved.`);

          items.push({ alias: unit.alias, key: unit.key, src: unit.src, participation: undefined, start: () => Promise.reject(failure) });
        }
      }
    } catch (error) {
      this._cancelParticipations(participations);

      throw error;
    }

    return this._createItemQueue(
      claimer,
      items,
      participations,
      results => {
        if (shape === 'single') {
          return results.get('0');
        }

        if (shape === 'array') {
          return units.map(unit => results.get(unit.alias));
        }

        return Object.fromEntries(candidates.map(([key], index) => [key, results.get(String(index))]));
      },
      !background,
    );
  }

  private _isLoadEntry(input: unknown): boolean {
    return typeof input === 'string' || _readMeta(input) !== undefined || _isAssetDescriptor(input);
  }

  /** Normalize one descriptor to a leaf to adopt (background) or a canonical request to load. */
  private _descriptorUnit(alias: string, key: string, descriptor: AssetDescriptor, background: boolean, keyed: boolean): LoadUnit {
    const label = typeof descriptor.source === 'string' ? descriptor.source : _describeTypeReference(descriptor.type);
    const batchKey = keyed ? key : label;
    const resolved = this._resolveDescriptor(descriptor);

    if (resolved === undefined) {
      if (typeof descriptor.type !== 'string') {
        throw this._unknownDescriptorType(descriptor.type, 'load()');
      }

      // Reported through the queue like a fetch failure: an id may name a type
      // this application simply did not install.
      return { alias, key: batchKey, src: label, failure: this._unknownDescriptorType(descriptor.type, 'load()') };
    }

    const assetType = resolved.installed.type;
    let options = resolved.options;
    let parse: ((raw: unknown) => unknown) | undefined;

    if (options !== undefined && Object.hasOwn(options, 'parse')) {
      const { parse: transform, ...rest } = options;

      if (typeof transform !== 'function' || assetType.leaf !== 'ref') {
        throw new TypeError(`Loader: "parse" is a synchronous function for value asset types, which the "${assetType.id}" type is not.`);
      }

      parse = transform as (raw: unknown) => unknown;
      options = Object.keys(rest).length > 0 ? rest : undefined;
    }

    if (background) {
      if (typeof resolved.source !== 'string') {
        throw new TypeError(`Loader: ${label} has no string source, so it has no placeholder to load at background priority.`);
      }

      if (assetType.leaf === 'none') {
        throw new Error(
          `Asset type "${assetType.id}" has no placeholder, so "${resolved.source}" cannot load at background priority. Load it at normal priority.`,
        );
      }

      return {
        alias,
        key: batchKey,
        src: resolved.source,
        leaf: createLeaf(assetType.leaf as AssetLeaf<unknown>, assetType.id, resolved.source, resolved.options),
      };
    }

    const canonical = this._canonicalizeDescriptor({ ...resolved, options }, descriptor);

    return { alias, key: batchKey, src: label, canonical, options, ...(parse !== undefined && { parse }) };
  }

  /** Normalize one load entry to a leaf to adopt or a canonical request to load. */
  private _loadUnit(alias: string, key: string, entry: unknown, background: boolean, keyed: boolean): LoadUnit {
    const batchKey = (src: string): string => (keyed ? key : src);

    const meta = _readMeta(entry);

    if (meta !== undefined) {
      return { alias, key: batchKey(meta.src), src: meta.src, leaf: entry as object };
    }

    if (_isAssetDescriptor(entry)) {
      return this._descriptorUnit(alias, key, entry, background, keyed);
    }

    if (typeof entry !== 'string') {
      throw new TypeError(`The asset at "${key}" must be a path, an asset handle or an asset descriptor ({ type, source, ...options }).`);
    }

    const resolved = this._resolveBarePath(entry);
    const options = this._barePathOptions(resolved.type, resolved.source);

    if (background) {
      const leaf = this._typeRegistry.leafFor(resolved.type);

      if (leaf === undefined || leaf === 'none') {
        throw new Error(
          `Asset type "${resolved.type}" has no placeholder, so "${entry}" cannot load at background priority. Load it at normal priority.`,
        );
      }

      return { alias, key: batchKey(entry), src: entry, leaf: createLeaf(leaf, resolved.type, entry, options) };
    }

    // Canonicalized from the logical path, not the variant selected for it: the
    // selection happens again inside, and a saved reference repeats this name.
    return { alias, key: batchKey(entry), src: entry, canonical: this._canonicalize(resolved.ctor, entry, options), options };
  }

  // -----------------------------------------------------------------------
  // Background loading
  // -----------------------------------------------------------------------

  /**
   * Resolves when the low-priority background queue has fully drained - every
   * leaf enqueued via `load(target, { priority: LoadPriority.Background })` has finished loading
   * (successfully or not). Kicks the queue first, so a concurrency change that
   * left pending entries unstarted still makes progress.
   *
   * Individual asset errors are reported via {@link onError} but do not
   * reject the returned promise.
   */
  public awaitBackground(): Promise<void> {
    return this._residency.awaitBackground();
  }

  /**
   * Sets the maximum number of simultaneous background-queue fetches.
   * Requires a nonnegative integer; zero pauses queued fetches.
   * Takes effect at the next background-queue drain - on completion of a
   * running fetch, on enqueue, or on {@link awaitBackground} - and does not
   * start or abort a fetch that is already running.
   */
  public setConcurrency(n: number): this {
    this._residency.setConcurrency(n);

    return this;
  }

  // -----------------------------------------------------------------------
  // Retrieval
  // -----------------------------------------------------------------------

  /**
   * Seamless deferred access by path (asset-system v2). Returns SYNCHRONOUSLY:
   * an already-loaded source returns the stored resource; an unknown source
   * returns a placeholder handle immediately, starts the fetch, and fills the
   * handle in place when the payload arrives (track it via `loadState` /
   * `loaded`).
   *
   * **This is an acquiring call, not a plain lookup.** Besides possibly
   * starting a fetch it also **claims** the resolved key for this loader's
   * lifetime, so the asset stays resident until a matching {@link release}
   * (or, for `scene.loader`, until the scene tears down). That claim is the
   * reason `get` is the right default: you almost always want the thing you
   * are about to use to stay loaded. When you only want to know whether
   * something is already in memory - without claiming it and without starting
   * a fetch - use {@link peek}.
   *
   * Failed loads switch the handle to its failed representation;
   * calling `get` again for a `'failed'` source retries and heals the same
   * handle in place. Invalid inputs and missing bindings throw synchronously
   * before a fetch starts.
   *
   * The path is normalized to an {@link AssetDefinitions} type by its suffix
   * (basename-only, longest-suffix-first), consulting the app-local
   * {@link registerType} override, then the type that claimed the suffix. A
   * resource suffix yields its heal-in-place handle; a value suffix (`json`,
   * `txt`, `csv`, ...) yields a stable {@link AssetRef}. Only suffixes a catalog
   * can materialize are accepted at compile time (`ExtensionKindMap`); dynamic
   * strings resolving to an unclaimed suffix or a leafless type throw with
   * guidance.
   * The same source always yields the same instance - also across
   * {@link load} - and options are first-wins: conflicting options on a later
   * call are ignored with a one-time dev warning.
   *
   * @remarks For a seamless type, `get('sprite.png')` on an unloaded source
   * returns a `'loading'` placeholder and fetches URL `<source>` - it no longer
   * throws "missing resource". A bare alias that isn't a real path (a typo, or a
   * not-yet-preloaded alias) therefore fetches that string and can 404 quietly
   * instead of throwing; preloaded aliases still return the stored payload. This
   * is intended seamless-by-default behaviour - the note is for debuggability.
   * When such a fetch DOES fail, a **development build** logs a one-time
   * (per-source) warning naming the literal path and how to fix it, so the 404
   * is no longer completely silent; production builds stay quiet. For a dynamic
   * source, use `get({ type: Texture, source: dynamicPath })`.
   */
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;

  /**
   * Adopts an {@link Assets} catalog: every handle-hybrid leaf is registered,
   * claimed, and driven to load, and the same leaf objects are returned keyed by
   * their record key. The catalog's own properties heal in place as payloads
   * arrive - the returned map holds those very leaves.
   */
  public get<M extends Record<string, CatalogEntry>>(catalog: Assets<M>): InferAssetsProperties<M>;

  /**
   * Seamless/value access from a descriptor with a string source. Builds and
   * adopts the descriptor's handle-hybrid leaf: a resource type yields its
   * heal-in-place handle, a value type a stable {@link AssetRef}. A type without
   * a placeholder, or a descriptor without a string source, is rejected; load
   * those with {@link load} instead.
   *
   * The leaf comes back branded, mirroring the stamp a catalog leaf carries, so
   * it can be fed straight back into a single-leaf `load(...)`.
   *
   * Unlike bare-path `get('x.png')`, this form is **not instance-deduped by
   * source**: each call builds a fresh leaf, so repeated `get({ type, source })`
   * calls accumulate distinct handles (all healing to the same deduped backend
   * payload). It is the dynamic-source escape hatch - capture the handle once.
   */
  public get<const D extends LocatorAssetDescriptor>(descriptor: D & ValidatedLeafDescriptor<D>): AssetDescriptorLeaf<D>;

  /** Adopts a single value leaf (an `Assets.from()` property) and returns it unchanged. */
  public get<T>(leaf: CatalogValueLeaf<T>): CatalogValueLeaf<T>;

  /**
   * Adopts a single handle-hybrid leaf (an `Assets.from()` property) and returns
   * it - the same object, healing in place once its payload arrives.
   *
   * Matches on the catalog-leaf brand, so only a MATERIALIZED leaf is accepted;
   * a raw resource instance has no `_assetMeta` stamp and is rejected here as it
   * is at runtime. The brand rides along on the result: the returned leaf is the
   * very object that was passed in, stamp included, so it stays re-loadable.
   */
  public get<T extends object>(leaf: CatalogResourceLeaf<T>): CatalogResourceLeaf<T>;
  public get(input: string | object, options?: unknown): unknown {
    return this._getClaimed(this._appScope, input, options);
  }

  /**
   * Claimed variant of {@link get}: identical resolution, but each resolved key
   * is claimed under `claimer` (refcount). The public {@link get} delegates here
   * under the app-lifetime {@link _appScope}; the scene-scoped loader proxy
   * passes its own scope. `_claim` runs AFTER `AssetResidency._getSeamless`/
   * `_getRef` so an evicted key's re-fetch is driven from here (the re-armed
   * handle reads `'loading'`, which `_getSeamless` alone would not re-fetch).
   * @internal
   */
  public _getClaimed(claimer: LoaderScope, input: string | object, options?: unknown): unknown {
    // Assets<M> container - adopt every handle-hybrid leaf (fill in place, claim
    // under `claimer`) and return the leaves keyed by their record key.
    if (input instanceof AssetsImpl) {
      const out: Record<string, unknown> = {};

      const entries = Object.entries((input as AssetsImpl<Record<string, CatalogEntry>>).entries) as Array<[string, object]>;
      this._residency._bindLeaves(entries.map(([, leaf]) => leaf));

      for (const [k, leaf] of entries) {
        this._adopt(leaf, claimer);
        out[k] = leaf;
      }

      return out;
    }

    // A descriptor builds and adopts a fresh handle-hybrid leaf: a value type
    // yields an AssetRef, a resource type its heal-in-place placeholder.
    if (_isAssetDescriptor(input)) {
      if (options !== undefined) {
        throw new Error('Loader: get(descriptor, options) is not supported. Put per-asset options on the descriptor.');
      }

      const descriptor = input;
      const resolved = this._requireDescriptor(descriptor, 'get()');
      const assetType = resolved.installed.type;

      if (typeof resolved.source !== 'string') {
        throw new TypeError(
          `Loader: get() hands out a placeholder keyed by a locator, and this "${assetType.id}" descriptor has no string source. Load it with load() instead.`,
        );
      }

      if (assetType.leaf === 'none') {
        throw new Error(`Loader: get() hands out a catalog leaf, and the "${assetType.id}" type has none - load it with load() instead.`);
      }

      const leaf = createLeaf(assetType.leaf as AssetLeaf<unknown>, assetType.id, resolved.source, resolved.options);
      this._adopt(leaf, claimer);

      return leaf;
    }

    // Single meta-stamped leaf (e.g. `get(assets.ship)`) - adopt and return it.
    if (_readMeta(input) !== undefined) {
      this._adopt(input as object, claimer);

      return input;
    }

    // Anything left must be a bare path string: an object that reaches here is
    // neither a catalog, a descriptor, nor an adopted leaf.
    if (typeof input !== 'string') {
      throw new Error('Loader: get() accepts a path string, an asset descriptor, an Assets catalog, or one of its leaves.');
    }

    // Bare path string - normalize it to a `{ type, source }` descriptor, then
    // hand it to the SAME source-keyed dedup the catalog leaves use: a seamless
    // type yields its shared heal-in-place handle, a value type its shared
    // AssetRef. (This is deliberately NOT routed through `createLeaf` like the
    // descriptor branch above - a bare path is instance-deduped by
    // source, and `createLeaf` mints a fresh leaf per call.)
    const { type, source: path, ctor } = this._resolveBarePath(input);

    const adapter = this._typeRegistry.getSeamlessAdapter(ctor);
    const canonical = this._canonicalize(ctor, input, options);

    if (adapter !== undefined) {
      const handle = this._residency._getSeamless(canonical, adapter, options);
      this._claim(canonical, claimer);

      return handle;
    }

    if (this._typeRegistry.leafFor(type) === 'ref') {
      const ref = this._residency._getRef(canonical, options);
      this._claim(canonical, claimer);

      return ref;
    }

    throw new Error(
      `Loader: type "${type}" inferred from "${path}" hands out no catalog leaf - ` +
        `use load({ type: '${type}', source: '${path}' }) instead.`,
    );
  }

  /**
   * Pure in-memory lookup: the resource already stored for `path`, or
   * `undefined` if nothing is held for it.
   *
   * The counterpart to {@link get} - and the one to reach for when the answer
   * "not loaded" is a legitimate one rather than something to fix by loading.
   * Unlike `get`, this **never** starts a fetch, **never** mints a placeholder
   * handle, and **never** claims anything, so it cannot keep an asset alive by
   * accident. Calling it in a loop is free.
   *
   * Invalid usage still fails loudly, exactly as it does on `get`: a path
   * whose extension resolves to no registered type, or an input that is
   * neither a path string nor an asset descriptor, throws. Only
   * "the key is fine, nothing is stored under it" comes back as `undefined`.
   *
   * A catalog leaf needs no `peek`: the leaf *is* the handle, so read its
   * `loadState` / `loaded` directly.
   *
   * @example
   * ```ts
   * // Use the real texture if it happens to be resident, otherwise skip the
   * // decoration entirely - without pulling it into memory.
   * const sparkle = loader.peek('image/sparkle.png');
   * if (sparkle !== undefined) {
   *     stage.addChild(new Sprite(sparkle));
   * }
   * ```
   *
   * @remarks A custom type may legitimately store a nullish payload; such an
   * entry reports `undefined` here and is indistinguishable from "not stored".
   */
  public peek<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): ResourceForKind<KindByPath<S>> | undefined;
  /** Pure in-memory lookup from an asset descriptor - see the path overload. */
  public peek<const D extends AssetDescriptor>(descriptor: D & ValidatedAssetDescriptor<D>): AssetDescriptorResource<D> | undefined;
  public peek(input: string | object): unknown {
    let ctor: AssetConstructor;
    let source: string;
    let options: unknown;

    if (_isAssetDescriptor(input)) {
      const descriptor = input;
      // Identity-relevant options are part of the canonical key, so a descriptor
      // carrying them must peek the key it would actually load.
      const { key } = this._canonicalizeDescriptor(this._requireDescriptor(descriptor, 'peek()'), descriptor);

      return this._residency._hasStored(key) ? (this._residency._peekResource(key) ?? undefined) : undefined;
    }

    if (typeof input === 'string') {
      const resolved = this._resolveBarePath(input);

      ctor = resolved.ctor;
      source = input;
      options = this._barePathOptions(resolved.type, resolved.source);
    } else {
      throw new Error(
        'Loader: peek() accepts a path string or an asset descriptor. A catalog leaf is already a handle - read its loadState instead.',
      );
    }

    const { key } = this._canonicalize(ctor, source, options);

    return this._residency._hasStored(key) ? (this._residency._peekResource(key) ?? undefined) : undefined;
  }

  /**
   * Backs {@link LoaderScope.release}: resolve every accepted release form to a
   * canonical key and drop `claimer`'s claim on it.
   *
   * The handle form resolves through an internal handle → key map populated only
   * for adopted seamless handles and value-refs. A materialized-but-never-adopted
   * catalog leaf is recognized by its meta stamp and stays an idempotent no-op,
   * as does a handle this loader has EVER issued - that check is deliberately
   * independent of current claim state, so the same object never throws or not
   * depending on unrelated internal teardown ordering.
   * @internal
   */
  public _releaseFrom(claimer: LoaderScope, handleOrType: unknown): void {
    if (typeof handleOrType === 'string') {
      const { type, source: selected, ctor } = this._resolveBarePath(handleOrType);

      this._release(this._canonicalize(ctor, handleOrType, this._barePathOptions(type, selected)).key, claimer);

      return;
    }

    if (typeof handleOrType !== 'object' || handleOrType === null) {
      throw new TypeError(
        `LoaderScope.release(): ${String(handleOrType)} has no claim identity. Release a path, a handle, a descriptor or a catalog instead.`,
      );
    }

    if (this._releaseGroup(claimer, handleOrType)) {
      return;
    }

    // A catalog releases each of its leaves. A never-adopted leaf has no
    // registered key, so its release is a silent no-op.
    if (handleOrType instanceof AssetsImpl) {
      for (const leaf of Object.values((handleOrType as AssetsImpl<Record<string, CatalogEntry>>).entries)) {
        this._releaseFrom(claimer, leaf);
      }

      return;
    }

    const key = this._residency._getHandleKey(handleOrType);

    if (key !== undefined) {
      this._release(key, claimer);

      return;
    }

    if (_readMeta(handleOrType) === undefined && !this._residency._wasEverRegisteredHandle(handleOrType)) {
      throw new Error('LoaderScope.release(): this object has no claim identity. Release its descriptor, catalog leaf or catalog instead.');
    }
  }

  /**
   * Drop `claimer`'s claim on the key a descriptor loads under. A key it does
   * not hold is a no-op, and so is a type this loader never installed: a load
   * of it failed through its queue, so nothing can be held under it.
   */
  private _releaseDescriptor(claimer: LoaderScope, descriptor: AssetDescriptor): void {
    const resolved = this._resolveDescriptor(descriptor);

    if (resolved === undefined) {
      return;
    }

    const options =
      resolved.options === undefined ? undefined : Object.fromEntries(Object.entries(resolved.options).filter(([key]) => key !== 'parse'));

    this._release(
      this._canonicalizeDescriptor(
        { ...resolved, options: options !== undefined && Object.keys(options).length > 0 ? options : undefined },
        descriptor,
      ).key,
      claimer,
    );
  }

  /** Release a descriptor, an array or a plain group. */
  private _releaseGroup(claimer: LoaderScope, input: object): boolean {
    if (_isAssetDescriptor(input)) {
      this._releaseDescriptor(claimer, input);

      return true;
    }

    if (Array.isArray(input)) {
      for (const entry of input) {
        this._releaseFrom(claimer, entry);
      }

      return true;
    }

    const prototype: unknown = Object.getPrototypeOf(input);

    if ((prototype !== Object.prototype && prototype !== null) || _readMeta(input) !== undefined) {
      return false;
    }

    // Match load(): named records may use the alias "type" and enumerable
    // symbol keys. Object.values silently drops symbols, leaking their claims.
    const record = input as Record<string | symbol, unknown>;

    for (const key of Reflect.ownKeys(record)) {
      if (Object.getOwnPropertyDescriptor(record, key)?.enumerable === true) {
        this._releaseFrom(claimer, record[key]);
      }
    }

    return true;
  }

  /**
   * Reverse lookup: given a loaded resource object, return the asset type and
   * source key it was first loaded under, or `null` for runtime-created,
   * unloaded, or non-object resources.
   *
   * When a resource is shared across several aliases, the **first** alias it
   * was stored under is returned (the canonical key). Primitive results
   * (parsed JSON, text, CSV rows) are not keyable. Used by scene serialization
   * to turn a live asset reference back into a portable source key; the
   * contract is that the same asset is pre-loaded under that key before a
   * matching deserialize.
   */
  public keyFor(resource: object): { readonly type: AssetConstructor; readonly source: string } | null {
    return this._residency._keyFor(resource);
  }

  /**
   * The portable request a loaded resource can be referenced by in a saved
   * document: the logical source callers wrote (before variant selection) and
   * the identity-relevant options, so loading it again on another device
   * resolves the same interpretation. See {@link AssetResidency._referenceFor}.
   * @internal
   */
  public _assetReference(resource: object): AssetReferenceLookup | null {
    return this._residency._referenceFor(resource);
  }

  /**
   * Read-only, detached snapshot of every key this loader currently has a
   * claim on - one {@link AssetInspection} row per claimed `(type, source)`
   * key, sorted by key. Intended for diagnostics, support bundles, and
   * developer tooling: the returned array and every row are frozen, so
   * mutating (or attempting to mutate) the snapshot never touches residency,
   * and no internal `Set`, claim symbol, or live handle/ref object is exposed
   * - every field is plain data.
   *
   * @see {@link AssetInspection} for what each row reports.
   */
  public inspect(): readonly AssetInspection[] {
    return this._residency._inspect();
  }

  /**
   * Read-only, detached summary of what this loader holds: ready / pending /
   * failed counts, estimated resident bytes, the same split per asset type, and
   * the `topCount` heaviest resident assets.
   *
   * The counterpart to {@link inspect} for callers that want totals rather than
   * one row per asset - a debug HUD polling every frame, a memory dashboard, a
   * regression check on how much a scene keeps resident. Aggregating here rather
   * than over an `inspect()` result keeps a per-frame reader from rebuilding the
   * whole row snapshot itself.
   *
   * @see {@link AssetStats.bytes} for what the byte figures do and do not cover.
   */
  public stats(topCount = 5): AssetStats {
    return this._residency._stats(topCount);
  }

  /**
   * Non-throwing in-memory lookup: the resource stored for the canonical asset
   * `(type, source, options)` resolves to, or `null` if none is held. Reads the
   * store directly (no fetch, no seamless placeholder). Backs scene
   * deserialization, which resolves an asset reference to a pre-loaded resource.
   *
   * `options` matter only for a type whose handler declares an identity
   * discriminator; omitting them then addresses a different canonical key.
   * @internal
   */
  public _peekResource(type: AssetConstructor, source: string, options?: unknown): unknown {
    return this._residency._peekResource(this._canonicalize(type, source, options).key);
  }

  /** Give a serialized sampler a handle of its own, using only a resident payload. @internal */
  public _leaseTextureView(
    source: string,
    options: Readonly<Record<string, unknown>>,
  ): { readonly texture: Texture; readonly release: () => void } | null {
    if (this._destroyed) {
      return null;
    }

    const { key } = this._canonicalize(Texture, source, options);

    if (!(this._residency._peekResource(key) instanceof Texture)) {
      return null;
    }

    const texture = createLeaf(this._typeRegistry.getSeamlessAdapter(Texture), 'texture', source, options) as Texture;
    const scope = this.createScope();

    const release = (): void => {
      this._residency._forgetDeferredHandle(key, texture);

      try {
        texture.destroy();
      } finally {
        scope.destroy();
      }
    };

    try {
      this._adopt(texture, scope);

      return { texture, release };
    } catch (error) {
      release();

      throw error;
    }
  }

  /** @internal */
  public _matchesAssetType(type: AssetConstructor, id: string): boolean {
    return this._typeRegistry.resolveTypeName(id) === type;
  }

  /** @internal */
  public _referenceType(type: AssetConstructor, source: string, id?: string): string {
    if (id !== undefined && !this._typeRegistry.hasAssetType(id)) {
      throw new Error(`Cannot resolve asset "${source}": no asset type "${id}" is installed.`);
    }

    const expected = this._typeRegistry._typeIdentity(type);

    if (id !== undefined && id !== expected) {
      throw new TypeError(`Cannot resolve asset "${source}" of type "${id}" as "${expected}".`);
    }

    return expected;
  }

  /** @internal */
  public _createReferenceLeaf<T>(id: string, source: string, options?: unknown): CatalogResourceLeaf<T> | CatalogValueLeaf<T> {
    return createLeaf(this._typeRegistry.leafFor(id), id, source, options) as CatalogResourceLeaf<T> | CatalogValueLeaf<T>;
  }

  /** Reserve only after reading succeeds so a rejected document cannot leave claims. @internal */
  public _reserveReferenceLeaves(leaves: ReadonlyMap<string, object>, owner: LoaderScope = this._appScope): void {
    if (leaves.size === 0) {
      return;
    }

    const scope = owner.createScope();

    try {
      for (const leaf of leaves.values()) {
        this._residency._adopt(leaf, scope, false, undefined, true);
      }
    } catch (error) {
      scope.destroy();

      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  /**
   * Base path prepended to every relative asset URL at fetch time.
   * Absolute URLs (starting with `http://`, `https://`, or `//`) are
   * passed through unchanged.
   */
  public get basePath(): string {
    return this._decoder.basePath;
  }

  public set basePath(value: string) {
    this._decoder.basePath = value;
  }

  /**
   * Default `RequestInit` options merged into every `fetch` call.
   * Assign a new value to change the defaults for subsequent loads.
   *
   * A `signal` here is composed with the cancellation a load carries of its
   * own, so an application-wide abort and a per-load cancel both reach the
   * request and neither disables the other.
   */
  public get fetchOptions(): RequestInit {
    return this._decoder.fetchOptions;
  }

  public set fetchOptions(value: RequestInit) {
    this._decoder.fetchOptions = value;
  }

  // -----------------------------------------------------------------------
  // Extension binding - @internal / @advanced
  // -----------------------------------------------------------------------

  /**
   * Installs asset types on this loader, atomically: every key the set claims
   * is validated before anything is written, and each factory is built here so
   * the mutable half of a type is loader-local.
   *
   * An explicit app-local {@link registerType} override is a separate,
   * higher-precedence decision and may coexist with the type's own suffixes.
   * @internal
   */
  public _installAssetTypes(assetTypes: readonly AnyAssetType[]): void {
    this._typeRegistry.installAll(assetTypes);
  }

  /**
   * Whether an asset type is installed under this dispatch constructor.
   * @advanced
   */
  public hasLoadable(type: AssetConstructor): boolean {
    return this._typeRegistry.hasLoadable(type);
  }

  /**
   * Whether an asset type with this id is installed on this application.
   * @advanced
   */
  public hasAssetType(typeName: string): boolean {
    return this._typeRegistry.hasAssetType(typeName);
  }

  /**
   * The type a file suffix resolves to on this application, or `undefined`.
   * The suffix is normalised (leading dots stripped, lower-cased).
   * @advanced
   */
  public resolveExtensionType(extension: string): AssetTypeName | undefined {
    return this._typeRegistry.resolveExtensionType(extension);
  }

  /**
   * Whether an installed type claims this file suffix.
   * @advanced
   */
  public hasExtension(ext: string): boolean {
    return this._typeRegistry.hasExtension(ext);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Tears down the loader and all resources it owns.
   *
   * Clears all in-memory assets and in-flight tracking, and disconnects all
   * signals. Pending handles and refs reject with an `AbortError`.
   * Also calls `destroy?.()` on every installed type's factory.
   * Completes teardown before rethrowing the first cleanup failure, if any.
   *
   * Cache stores are destroyed only when this loader was given the stores
   * themselves, and therefore owns the cache it wrapped them in. An
   * {@link AssetCache} passed in belongs to its builder and may be serving
   * other loaders, so it is left alone - destroy it yourself when the
   * application is done with it.
   */
  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._assetTypes._close();

    // Order matters: factory teardown must run after store teardown (via
    // this._decoder.destroy()). Pending handles still need their registered adapters
    // while residency settles them, before factory teardown clears the registry.
    const errors: unknown[] = [];

    for (const stage of [this._liveLoadScope, this._decoder, this._residency, this._typeRegistry]) {
      try {
        stage?.destroy();
      } catch (error) {
        errors.push(error);
      }
    }

    this.onProgress.destroy();
    this.onLoaded.destroy();
    this.onError.destroy();
    this.onLoadStart.destroy();
    this.onLoadProgress.destroy();
    this.onLoadComplete.destroy();
    this.onLoadError.destroy();
    this.onCacheError.destroy();

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  // -----------------------------------------------------------------------
  // Internal - loading
  // -----------------------------------------------------------------------

  /**
   * Adopt an externally-created handle-hybrid leaf (from `Assets.from()`) into
   * this loader: register it as the deferred/ref handle under its normalized
   * key, claim it under `claimer`, and drive the fetch. The existing fill site
   * (`AssetResidency._storeResource`) transplants the fetched payload into this
   * exact object, so every consumer that already holds the leaf pops in.
   * Idempotent for a handle already adopted under the same key (no duplicate
   * fetch).
   *
   * With `background`, the leaf is still registered + claimed + healed in place,
   * but its fetch is diverted into the low-priority background queue (see
   * `AssetResidency._enqueueBackgroundFetch`) instead of started immediately -
   * `load(target, { priority: LoadPriority.Background })`.
   * @internal
   */
  public _adopt(handle: object, claimer: LoaderScope, background = false): void {
    this._residency._adopt(handle, claimer, background);
  }

  /** Validate a prospective claim without changing the handle or its owner. @internal */
  public _assertLeafOwner(leaf: object): void {
    this._residency._assertLeafOwner(leaf);
  }

  /** @internal */
  public get _ownershipRevision(): number {
    return this._residency._ownershipRevision;
  }

  /**
   * Register a claim on a resource key under a claim scope (idempotent per
   * scope). On an evicted key, kick a re-fetch into the existing, already
   * re-armed handle so every dangling consumer heals in place.
   * @internal
   */
  public _claim(asset: CanonicalAsset, claimer: LoaderScope): void {
    this._residency._claim(asset, claimer);
  }

  /**
   * Drop a claim scope from a key; when the last scope releases, evict the
   * payload immediately (refcount 0).
   * @internal
   */
  public _release(key: ResourceKey, claimer: LoaderScope): void {
    this._residency._release(key, claimer);
  }

  /**
   * Release every claim held under a claim scope (a scene unloading its
   * scene-private assets). Collect the held keys first, then release -
   * `AssetResidency._release` mutates its own claim map, so we must not
   * delete during iteration.
   * @internal
   */
  public _releaseScope(claimer: LoaderScope): void {
    this._residency._releaseScope(claimer);
  }

  /**
   * Adopt every leaf of a load under `claimer`, opening one participation per
   * leaf in entry order. A leaf that cannot be adopted withdraws the
   * participations already opened, so a load that throws leaves no stake behind.
   */
  private _adoptAll(entries: ReadonlyArray<readonly [string, object]>, claimer: LoaderScope, background: boolean): ClaimParticipation[] {
    const participations: ClaimParticipation[] = [];

    this._residency._bindLeaves(entries.map(([, leaf]) => leaf));

    try {
      for (const [, leaf] of entries) {
        this._residency._adopt(leaf, claimer, background, participations);
      }
    } catch (error) {
      this._cancelParticipations(participations);

      throw error;
    }

    return participations;
  }

  /** Progress-aware queue over already-{@link _adopt}ed leaves, each resolving to its own readiness value. */
  private _createAdoptedQueue<T>(
    claimer: LoaderScope,
    entries: Array<[string, object]>,
    participations: readonly ClaimParticipation[],
    buildResult: (results: Map<string, unknown>) => T,
    foreground = true,
  ): LoadingQueue<T> {
    const items = entries.map(([alias, leaf], index): QueueItem => ({
      alias,
      key: alias,
      src: _readMeta(leaf)?.src ?? alias,
      participation: participations[index],
      start: () => (leaf as AssetLoadHandle).loaded,
    }));

    return this._createItemQueue(claimer, items, participations, buildResult, foreground);
  }

  /**
   * Progress-aware queue over load items whose claims are already open. Each
   * item settles its own participation, so a cancelled queue withdraws only
   * the stakes still pending. `buildResult` shapes the resolved values.
   */
  private _createItemQueue<T>(
    claimer: LoaderScope,
    items: readonly QueueItem[],
    participations: readonly ClaimParticipation[],
    buildResult: (results: Map<string, unknown>) => T,
    foreground = true,
  ): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    let notifyFn: ((success: boolean) => void) | null = null;
    let cancellation: DOMException | undefined;
    let rejectCancelled!: (reason: DOMException) => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectCancelled = reject;
    });

    const itemPromises = items.map(({ alias, key, src, participation, start }) => {
      if (foreground) {
        this._onFgBatchStart(claimer, key, src);
      }

      const failItem = (error: unknown): never => {
        if (participation !== undefined) {
          this._residency._settleParticipation(participation);
        }

        notifyFn?.(false);

        if (foreground) {
          this._onFgBatchSettled(claimer, key, false, this._settleError(error));
        }

        throw error;
      };

      return Promise.race([start(), cancelled]).then(value => {
        if (cancellation !== undefined) {
          return failItem(cancellation);
        }

        if (participation !== undefined) {
          this._residency._settleParticipation(participation);
        }

        results.set(alias, value);
        notifyFn?.(true);

        if (foreground) {
          this._onFgBatchSettled(claimer, key, true);
        }
      }, failItem);
    });

    const promise = Promise.all(itemPromises).then(() => buildResult(results));

    const queue = new LoadingQueue<T>(promise, items.length, () => {
      cancellation = new DOMException('This operation was aborted', 'AbortError');

      try {
        this._cancelParticipations(participations);
      } finally {
        if (items.length > 0) {
          rejectCancelled(cancellation);
        }
      }
    });
    notifyFn = queue._notifyItem.bind(queue);

    return queue;
  }

  /**
   * Back {@link LoadingQueue.cancel}: withdraw the participations this load
   * still has open. A participation that already settled became its scope's
   * claim and is left alone, as is a claim the scope earned through another
   * load. Whether that actually stops a download is decided one level down -
   * the residency aborts the in-flight fetch only once no scope holds the key,
   * so a sibling scene loading the same asset keeps it.
   */
  private _cancelParticipations(participations: readonly ClaimParticipation[]): void {
    for (const participation of participations) {
      this._residency._cancelParticipation(participation);
    }
  }

  // -----------------------------------------------------------------------
  // Internal - foreground batch tracking
  // -----------------------------------------------------------------------

  /**
   * Report a started item to both the acquiring scope and the loader's aggregate
   * counter, so a scope sees exactly its own work while the loader keeps
   * reporting everything.
   */
  private _onFgBatchStart(claimer: LoaderScope, key: string, url: string): void {
    claimer._batch.start(key, url);
    this._batch.start(key, url);
  }

  private _onFgBatchSettled(claimer: LoaderScope, key: string, success: boolean, error?: Error): void {
    claimer._batch.settle(key, success, error);
    this._batch.settle(key, success, error);
  }

  private _normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * The error a settling batch item should REPORT, or `undefined` for a
   * cancellation. A cancelled load still settles the batch (so `onLoadProgress`
   * and `onLoadComplete` stay in lockstep with what was started), but it is not
   * a failure and must not reach {@link onLoadError} - the caller asked for it.
   */
  private _settleError(error: unknown): Error | undefined {
    return isAbortError(error) ? undefined : this._normalizeError(error);
  }
}
