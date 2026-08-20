import { Signal } from '#core/Signal';
import type { AssetHandler } from '#extensions/Extension';

import { type Asset, AssetImpl, type ValueAsset } from './Asset';
import type { AssetCacheError } from './AssetCacheError';
import { parseContainer } from './AssetContainer';
import { AssetDecoder } from './AssetDecoder';
import type {
  AssetDefinitions,
  AssetInput,
  CatalogEntry,
  CoreValueAssetKind,
  InferLoadedEntry,
  KindByPath,
  LeafForPath,
  ResourceForKind,
} from './AssetDefinitions';
import { createLeaf, getAssetKind } from './assetKindRegistry';
import { _readMeta, type CatalogResourceLeaf, type CatalogValueLeaf } from './assetMeta';
import type { AssetRef } from './AssetRef';
import { type AssetInspection, AssetResidency, type AssetResidencySignals } from './AssetResidency';
import { _normalizeEntry, type Assets, AssetsImpl, type InferAssetsProperties } from './Assets';
import { AssetTypeRegistry, type HandlerEntry } from './AssetTypeRegistry';
import { CacheFirstStrategy } from './CacheFirstStrategy';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import { type CanonicalAsset, type CanonicalAssetKey, canonicalAssetKey, canonicalizeSource } from './canonicalKey';
import type { AssetConstructor } from './FactoryRegistry';
import { LoadBatch } from './LoadBatch';
import { LoaderScope } from './LoaderScope';
import { LoadingQueue } from './LoadingQueue';
import type { SeamlessAdapter } from './seamless';
import { isAbortError } from './SharedAbort';
import { BinaryAsset, CsvAsset, Json, SubtitleAsset, TextAsset, WasmAsset, XmlAsset } from './tokens';

/** Normalize the single-or-many `cache` option into the list the decoder takes. */
function toStoreList(cache: CacheStore | readonly CacheStore[]): readonly CacheStore[] {
  // `Array.isArray` widens a `readonly T[]` to `any[]`, so narrow explicitly.
  if (Array.isArray(cache)) {
    return cache as readonly CacheStore[];
  }
  return [cache as CacheStore];
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
 * `Asset` descriptors only) does not cover — the loader consumes the already
 * materialized leaves and must not re-validate the definition entries.
 */
export type InferLoadedMap<M extends Record<string, CatalogEntry>> = {
  [K in keyof M]: InferLoadedEntry<M[K]>;
};

/**
 * Context object passed to custom asset-type load handlers bound via
 * `bindAsset` / `defineAsset`.
 *
 * The `fetch*` helpers route through the loader's configured cache strategy
 * and IDB stores, giving custom handlers the same caching behaviour as
 * built-in asset types.
 */
export interface AssetLoaderContext {
  /**
   * The owning {@link Loader} instance, for configuration and registry reads.
   *
   * Do NOT load sub-assets through it: anything acquired on the loader itself is
   * held for the application's lifetime and outlives the asset being built. Use
   * {@link scope} instead.
   */
  readonly loader: Loader;
  /**
   * The claim scope that owns whatever sub-assets this handler loads. It lives
   * exactly as long as the asset being built: when that asset is released by its
   * last owner, everything loaded through this scope is released with it —
   * unless another owner still holds it independently.
   */
  readonly scope: LoaderScope;
  /**
   * The canonical key for this load. Useful for diagnostics; also the key the
   * loader dedupes in-flight requests and claims on.
   */
  readonly identityKey: string;
  /**
   * Cancellation signal for the load this handler invocation belongs to. It
   * aborts once no claim scope needs the result any more — a scene torn down
   * mid-navigation, or a {@link LoadingQueue.cancel} call.
   *
   * The `fetch*` helpers below already forward it, so a handler built out of
   * them needs no extra work. Forward it explicitly to any fetching or decoding
   * the handler performs itself; `undefined` means the caller started this load
   * without a cancellation channel.
   */
  readonly signal?: AbortSignal | undefined;
  /** Fetches `source` as UTF-8 text, routing through the loader's cache/IDB. */
  fetchText(source: string): Promise<string>;
  /** Fetches `source` as an `ArrayBuffer`, routing through the loader's cache/IDB. */
  fetchArrayBuffer(source: string): Promise<ArrayBuffer>;
  /**
   * Fetches `source` as parsed JSON, routing through the loader's cache/IDB.
   * Supply `T` to narrow the return type at the call site.
   */
  fetchJson<T = unknown>(source: string): Promise<T>;
}

/**
 * Construction options for {@link Loader}.
 *
 * `basePath` is prepended to relative asset paths at fetch time.
 * `cache` accepts one or more {@link CacheStore} instances. `cacheStrategy`
 * picks the policy used to consult them — defaults to
 * {@link CacheFirstStrategy} (check stores → network → write back).
 * `concurrency` caps the number of simultaneous background-queue fetches
 * (default `6`).
 */
export interface LoaderOptions {
  basePath?: string;
  fetchOptions?: RequestInit;
  cache?: CacheStore | readonly CacheStore[];
  cacheStrategy?: CacheStrategy;
  concurrency?: number;
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
   * leaf is still claimed and registered — it heals in place and a later
   * {@link Loader.get} returns the same instance — but instead of starting
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

/**
 * Central asset management hub for ExoJS applications.
 *
 * The `Loader` orchestrates fetching, processing, caching, and retrieval of
 * all engine asset types. It ships with built-in bindings for every first-party
 * type (Texture, Sound, AudioStream, Video, FontFace, HTMLImageElement, Json, text,
 * SVG, VTT, binary, and WASM) and allows registering custom types via
 * {@link bindAsset} (or the higher-level `defineAsset`).
 *
 * Assets can be loaded in two ways:
 * - **Direct** — `loader.load(Assets.from({ hero: 'hero.png' }))` fetches
 *   immediately and resolves to the finished assets.
 * - **Background** — pass `{ priority: LoadPriority.Background }` to `load(...)` to pre-warm
 *   assets at low priority; {@link awaitBackground} resolves once the queue drains.
 *
 * Once loaded, assets are stored in memory and returned from cache on
 * subsequent `load` or {@link get} calls without re-fetching.
 *
 * @example
 * ```ts
 * const loader = new Loader({ basePath: '/assets/', cache: new IndexedDbStore('game') });
 * const { hero } = await loader.load(Assets.from({ hero: 'hero.png' }));
 * ```
 *
 * @remarks Internally, `Loader` is a thin orchestrator over three collaborators:
 * `AssetTypeRegistry` (type/extension/handler registration), `AssetDecoder`
 * (URL resolution, cache-strategy dispatch, `bindAsset` handler invocation),
 * and `AssetResidency` (claims, in-flight dedup, the resident-resource store,
 * deferred-handle healing, the background queue). `Loader` itself keeps the
 * public call-shape dispatch (`load`/`get`/`unload` and their `@internal`
 * scene-scope entry points) and the foreground-batch progress signals.
 */
export class Loader {
  private readonly _typeRegistry = new AssetTypeRegistry();
  private readonly _decoder: AssetDecoder;
  private readonly _residency: AssetResidency;

  // Single source for the value type ↔ dispatch token mapping, and the
  // no-bindings fallback in `_resolveBarePath` leans on. Keyed by
  // `CoreValueAssetKind`, NOT `ValueAssetKind`: only the built-in tokens exist
  // without a binding installed, and the wider union is extensible by
  // declaration merging (a package's `isValue: true` type has no built-in
  // token, and requiring one here would break any build that sees the
  // augmentation). The `Record<CoreValueAssetKind, …>` stays compile-checked to
  // cover exactly the core value types (vtt + srt share the SubtitleAsset
  // token). @internal
  private readonly _valueTokenByKind: Readonly<Record<CoreValueAssetKind, AssetConstructor>> = {
    json: Json,
    text: TextAsset,
    csv: CsvAsset,
    xml: XmlAsset,
    vtt: SubtitleAsset,
    srt: SubtitleAsset,
    binary: BinaryAsset,
    wasm: WasmAsset,
  };

  /** The value-asset token for a value type name, or `undefined` for non-value / extension types. @internal */
  private _valueTokenForKind(kind: keyof AssetDefinitions): AssetConstructor | undefined {
    return (this._valueTokenByKind as Partial<Record<string, AssetConstructor>>)[kind];
  }

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
  private _resolveBarePath(input: string): { type: keyof AssetDefinitions; source: string; ctor: AssetConstructor } {
    const type = this._typeRegistry._resolveTypeForPath(input);

    if (type === undefined) {
      throw new Error(
        `Loader: no type registered for any extension of "${input}". Register one via defineAsset() (its extensions) or ` +
          `loader.registerType(extension, type), or name the type explicitly with Asset.type(type, "${input}").`,
      );
    }

    // A built-in value token exists even before core bindings are materialized,
    // so constructor resolution alone is not proof that the Loader can fetch it.
    const ctor = this._typeRegistry.resolveTypeName(type) ?? this._valueTokenForKind(type);

    if (ctor === undefined || !this._typeRegistry.hasLoadable(ctor)) {
      throw new Error(`Loader: no asset handler bound for type "${type}" (inferred from "${input}"). ` + `Bind it via defineAsset()/bindAsset() first.`);
    }

    return { type, source: input, ctor };
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
    const locator = canonicalizeSource(this._decoder.basePath, source);
    const discriminator = this._typeRegistry._identityDiscriminator(type, source, options);

    return { key: canonicalAssetKey(this._typeRegistry._getTypeId(type), locator, discriminator), locator, type, source };
  }

  // ── Refcount / claims ───────────────────────────────────────────────────────
  /**
   * Application-lifetime claim scope for direct `app.loader.get/load(…)` calls.
   * Deliberately not exposed: its claims are released only by {@link destroy},
   * so no caller can drop an app-lifetime claim another consumer relies on.
   */
  private readonly _appScope = new LoaderScope(this, 'app', '(app)');

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
   * Fires for cache failures the configured {@link CacheStrategy} degraded
   * instead of propagating — most commonly a persistent store hitting its
   * quota. Purely diagnostic: the affected load still succeeds from the
   * network, so without a listener the only symptom is that caching quietly
   * stopped working.
   *
   * Narrow on {@link AssetCacheError.operation} and read {@link Error.cause}
   * for the originating `DOMException` (`QuotaExceededError` and friends).
   *
   * Reports only failures caused by *this* loader's own requests, even when
   * its {@link CacheStrategy} instance is shared with other loaders — the
   * strategy is handed a per-request sink rather than subscribing to one.
   */
  public readonly onCacheError = new Signal<[error: AssetCacheError]>();

  public constructor(options: LoaderOptions = {}) {
    const cache = options.cache;
    const stores = cache === undefined ? [] : toStoreList(cache);
    const cacheStrategy = options.cacheStrategy ?? new CacheFirstStrategy();

    this._decoder = new AssetDecoder(this, this._typeRegistry, {
      basePath: options.basePath ?? '',
      fetchOptions: options.fetchOptions ?? {},
      stores,
      cacheStrategy,
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
   * Takes a new claim scope: an owner whose assets are freed when it is
   * destroyed, rather than when the application ends.
   *
   * Every call returns an independent owner. Two scopes taken under the same
   * name are still two owners — a name is a label for diagnostics, never a
   * lookup key — so one consumer can never release another's claim.
   *
   * Assets acquired directly on the loader are claimed for the application's
   * lifetime instead, and released only by {@link destroy}.
   *
   * @example
   * ```ts
   * const level = app.loader.scope('level-1');
   * const hud = app.loader.scope('ui:hud');
   *
   * const font = level.get('fonts/ui.png');
   * hud.get('fonts/ui.png'); // same instance, one fetch, two independent owners
   *
   * level.destroy(); // the font stays resident — the HUD still owns it
   * ```
   */
  public scope(name?: string): LoaderScope {
    return new LoaderScope(this, 'scope', name);
  }

  // -----------------------------------------------------------------------
  // Type registration
  // -----------------------------------------------------------------------

  /**
   * Registers the seamless-handle adapter for `type`, enabling the deferred
   * `get(type, source)` form for it. One adapter per type.
   * @advanced
   */
  public registerSeamlessAdapter<T>(type: AssetConstructor<T>, adapter: SeamlessAdapter<T>): this {
    this._typeRegistry.registerSeamlessAdapter(type, adapter);

    return this;
  }

  /** Whether `type` already has a seamless adapter. Used for atomic binding pre-validation. @internal */
  public _hasSeamlessAdapter(type: AssetConstructor): boolean {
    return this._typeRegistry.hasSeamlessAdapter(type);
  }

  /**
   * Registers an extension→type override for bare-path resolution, scoped to
   * **this Loader instance only**: it applies to bare paths passed to this
   * loader's `get(…)` / `load(…)`, and takes precedence over both the type
   * declared by the `bindAsset` binding that claimed the suffix and the global
   * `defineAsset` default.
   *
   * It does NOT affect loader-free catalog construction — `Assets.from('level.json')`
   * has no loader to consult and always resolves through the global table. Use
   * `Asset.type(type, source)` there instead.
   *
   * `type` is the string {@link AssetDefinitions} discriminator, not a
   * constructor. This call does not install a handler; a core/extension binding
   * must still provide the named type. Repeating the same pair is idempotent,
   * while changing an existing explicit override to another type throws. Use
   * `Asset.type(...)` for a one-off exception.
   *
   * @example
   * ```ts
   * app.loader.registerType('json', 'ldtkMap');
   * ```
   */
  public registerType(extension: string, type: keyof AssetDefinitions): this {
    this._typeRegistry.registerType(extension, type);

    return this;
  }

  /**
   * Load every asset packed into a binary container (`.exoa`) in a **single
   * request**. A container is one file with an embedded index: its bytes are
   * fetched once (and cached
   * cross-session like any asset), then each slice is unpacked through its
   * type's handler and stored under the entry's alias — retrievable with
   * {@link get} exactly as if it had been loaded individually.
   *
   * Each entry's asset type must support byte-source construction
   * ({@link AssetHandler.createFromBytes}); the factory-backed core types
   * (textures, audio, JSON, text, binary, …) do. Throws on a malformed
   * container, an unknown type, or a type that cannot be built from bytes.
   *
   * @param url Path to the container file, resolved against the loader base path.
   */
  public async loadContainer(url: string): Promise<void> {
    const buffer = await this._decoder._contextFetch<ArrayBuffer>(url, '__ctx_binary', response => response.arrayBuffer());
    const { entries, dataStart } = parseContainer(buffer);

    // Resolve every type up front so an unknown type fails before any asset is stored.
    const resolved = entries.map(entry => {
      const type = this._typeRegistry.resolveTypeName(entry.type);

      if (!type) {
        throw new Error(`Container "${url}" references unknown asset type "${entry.type}".`);
      }

      return { entry, type };
    });

    await Promise.all(
      resolved.map(({ entry, type }) => {
        const start = dataStart + entry.offset;
        const slice = buffer.slice(start, start + entry.length);

        return this._decoder._injectSource(this._canonicalize(type, entry.alias, entry.options), slice, entry.options);
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Loading — canonical Asset / Assets descriptor forms
  // -----------------------------------------------------------------------

  /**
   * Fetches and processes one or more assets.
   *
   * Every accepted input normalizes to the same canonical descriptor shape
   * (`{ type, source }`) before dispatch:
   *
   * - **Path string** — normalized by suffix through the app-local
   *   {@link registerType} override, then the binding-declared type, then the
   *   global `defineAsset` default
   *   (basename-only, longest-suffix-first). Only *leaf-capable* suffixes are
   *   accepted at compile time; a non-leaf type (`bmFont`, `font`, `svg`,
   *   `image`, `music`, `video`) must be named explicitly with `Asset.type(...)`.
   * - **Asset<T>** — an explicit descriptor from `Asset.type(...)`.
   * - **Assets<M>** — a typed catalog from `Assets.from(...)`; keys become aliases.
   * - **A catalog leaf** — an `Assets.from()` property, adopted and resolved.
   *
   * (The inline record-catalog form `{ alias: { type, source } }` is no longer a
   * public overload — build catalogs with `Assets.from(...)`; a runtime record
   * fallback is retained only for internal multi-alias plumbing.)
   *
   * In-flight and already-loaded assets are de-duplicated: calling `load`
   * for the same (type, alias) pair while a fetch is in progress attaches
   * to the existing promise rather than issuing a second request.
   * Handler/fetch failures reject the returned queue and are also dispatched
   * through {@link onError}. Invalid inputs or missing bindings throw
   * synchronously before a queue is created.
   *
   * Per-asset options ride on the `Asset.type(type, source, options)` descriptor
   * (or the extra fields of a config object).
   *
   * @example
   * ```ts
   * const texture = await loader.load('image/hero.png');                       // Texture
   * const font    = await loader.load(Asset.type('bmFont', 'fonts/ui.fnt'));   // BmFont
   * const level   = await loader.load(Asset.type<LevelData>('json', 'l1.json'));
   * ```
   */
  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, CatalogEntry>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  // Single value-leaf (an `Assets.from()` AssetRef property): `AssetRef.loaded` resolves
  // to the raw value, not the ref — this overload must win over the generic leaf one below.
  public load<T>(leaf: CatalogValueLeaf<T>, options?: LoadOptions): LoadingQueue<T>;
  // Single handle-hybrid leaf (an `Assets.from()` property): adopt + resolve its value.
  //
  // Both leaf overloads match on the CATALOG-LEAF BRAND — the type-level mirror
  // of the runtime `_assetMeta` stamp that `_loadClaimed` dispatches on — so a
  // raw `new Texture()` / `new AssetRef()`, or a non-leaf resource like an
  // `AudioStream`, is rejected here exactly as the runtime rejects it. `T` is
  // recovered from the brand's phantom field, so the queue resolves to the plain
  // resource rather than to the branded leaf type.
  public load<T extends object>(leaf: CatalogResourceLeaf<T>, options?: LoadOptions): LoadingQueue<T>;

  // -----------------------------------------------------------------------
  // Loading — bare path (type normalized from the file suffix)
  // -----------------------------------------------------------------------

  /**
   * Fetches an asset by path, normalizing the suffix to an
   * {@link AssetDefinitions} type before dispatch. Resolution is basename-only
   * and longest-suffix-first (`hero.aseprite.json` tries `aseprite.json` before
   * `json`), and consults the app-local {@link registerType} override, then the
   * binding-declared type, then the global `defineAsset` default.
   *
   * Only **leaf-capable** suffixes are accepted at compile time — those a
   * catalog can also materialize (`ExtensionKindMap`, the map to augment by
   * declaration merging). Non-leaf resource types (`bmFont`, `font`, `svg`,
   * `image`, `music`, `video`) and unregistered suffixes are rejected here;
   * name them with `load(Asset.type(type, path))` instead.
   *
   * ```ts
   * const texture = await loader.load('image/hero.png');                     // Texture
   * const level   = await loader.load('data/level.json');                    // unknown
   * const font    = await loader.load(Asset.type('bmFont', 'fonts/ui.fnt')); // BmFont
   * ```
   */
  // The `[KindByPath<S>] extends [never]` tuple guard is deliberate: the
  // distributive `never extends …` is vacuously TRUE, which would wrongly
  // ACCEPT paths whose suffix is unregistered.
  //
  // Single-arg only: per-asset options go through `Asset.type(type, src, opts)`,
  // so an `options?` param here would advertise a parameter the runtime ignores.
  public load<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): LoadingQueue<ResourceForKind<KindByPath<S>>>;

  // -----------------------------------------------------------------------
  // Loading — implementation
  // -----------------------------------------------------------------------

  public load(arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    return this._loadClaimed(this._appScope, arg0, arg1);
  }

  /**
   * Claimed variant of {@link load}: identical logic, but every resolved key is
   * claimed under `claimer` (refcount). The public {@link load} delegates here
   * under the app-lifetime {@link _rootClaimer}; the scene-scoped loader proxy
   * passes its own scope. Claiming under `_rootClaimer` (which only `release()`
   * frees) is observationally a no-op for existing callers.
   * @internal
   */
  public _loadClaimed(claimer: LoaderScope, arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    // 1. Single Asset<T>
    if (arg0 instanceof AssetImpl) {
      if (arg1 !== undefined) {
        throw new Error(
          'Loader: load(Asset.type(...), options) is not supported. Put per-asset options in Asset.type(type, path, options); ' +
            'LoadOptions apply only to Assets catalogs and their leaves.',
        );
      }

      const asset = arg0 as Asset<unknown>;
      const alias = asset._config.source;

      return this._createLoadingQueue(claimer, [{ alias, asset }], results => results.get(alias));
    }

    // 2. Assets<M> container — adopt every handle-hybrid leaf (fill in place,
    // claim under `claimer`) and resolve the adopted queue to a map of the
    // loaded values/handles. The container's own leaves heal in place.
    if (arg0 instanceof AssetsImpl) {
      const entries = Object.entries((arg0 as AssetsImpl<Record<string, AssetInput>>).entries) as Array<[string, object]>;
      const background = (arg1 as LoadOptions | undefined)?.priority === LoadPriority.Background;

      for (const [, leaf] of entries) {
        this._adopt(leaf, claimer, background);
      }

      return this._createAdoptedQueue(claimer, entries, results => {
        const out: Record<string, unknown> = {};

        for (const [alias] of entries) {
          out[alias] = results.get(alias);
        }

        return out;
      });
    }

    // 2a. Single meta-stamped leaf (e.g. `load(assets.ship)`) — adopt it and
    // resolve its loaded value/handle directly.
    if (_readMeta(arg0) !== undefined) {
      const leaf = arg0 as object;
      const background = (arg1 as LoadOptions | undefined)?.priority === LoadPriority.Background;
      this._adopt(leaf, claimer, background);

      return this._createAdoptedQueue(claimer, [['value', leaf]], results => results.get('value'));
    }

    // 2b. Bare path string — normalize it to a `{ type, source }` descriptor and
    // dispatch on the type's bound constructor.
    if (typeof arg0 === 'string') {
      if (arg1 !== undefined) {
        throw new Error(
          'Loader: load(path, options) is not supported. Put per-asset options on ' +
            'Asset.type(type, path, options), or pass LoadOptions with an Assets catalog/leaf.',
        );
      }

      const { type, source: path, ctor } = this._resolveBarePath(arg0);

      // The font type requires a family option — infer it from the filename when not provided
      const options: unknown = type === 'font' ? { family: (path.split('/').pop()?.split(/[?#]/)[0] ?? '').replace(/\.[^.]+$/, '') } : undefined;

      const canonical = this._canonicalize(ctor, path, options);

      this._claim(canonical, claimer);
      this._onFgBatchStart(claimer, path, path);
      let notifyFn: ((success: boolean) => void) | null = null;
      const promise = this._residency._loadSingle(canonical, options).then(
        v => {
          notifyFn?.(true);
          this._onFgBatchSettled(claimer, path, true);
          return v;
        },
        e => {
          notifyFn?.(false);
          this._onFgBatchSettled(claimer, path, false, this._settleError(e));
          throw e;
        },
      );
      const queue = new LoadingQueue(promise, 1, () => this._cancelClaims(claimer, [canonical.key]));
      notifyFn = queue._notifyItem.bind(queue);
      return queue;
    }

    // Internal record fallback: `Record<string, AssetInput>`. The TYPED inline
    // record-catalog overload is deliberately absent — public callers go through
    // `Assets.from({...})` — but this path preserves the Loader's internal
    // multi-alias/identity plumbing and its regression coverage.
    //
    // Every value is routed through the SAME `_normalizeEntry` used by
    // `Assets.from(...)`: a bare path string (`{ a: 'a.png' }`) is resolved to a
    // `{ type, source }` config by its suffix. An already-built `Asset` and a
    // full config pass through unchanged.
    const configMap = arg0 as Record<string, AssetInput>;
    const items = Object.entries(configMap).map(([alias, value]) => ({
      alias,
      asset: value instanceof AssetImpl ? (value as Asset<unknown>) : new AssetImpl(_normalizeEntry(value as CatalogEntry)),
    }));

    return this._createLoadingQueue(claimer, items, results => {
      const out: Record<string, unknown> = {};

      for (const { alias } of items) {
        out[alias] = results.get(alias);
      }

      return out;
    });
  }

  // -----------------------------------------------------------------------
  // Background loading
  // -----------------------------------------------------------------------

  /**
   * Resolves when the low-priority background queue has fully drained — every
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
   * Takes effect on the next {@link awaitBackground} call or `load(…, { background })`.
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
   * something is already in memory — without claiming it and without starting
   * a fetch — use {@link peek}.
   *
   * Failed loads switch the handle to its failed representation;
   * calling `get` again for a `'failed'` source retries and heals the same
   * handle in place. Invalid inputs and missing bindings throw synchronously
   * before a fetch starts.
   *
   * The path is normalized to an {@link AssetDefinitions} type by its suffix
   * (basename-only, longest-suffix-first), consulting the app-local
   * {@link registerType} override, then the binding-declared type, then the
   * global `defineAsset` default. A
   * resource suffix yields its heal-in-place handle; a value suffix (`json`,
   * `txt`, `csv`, …) yields a stable {@link AssetRef}. Only leaf-capable
   * suffixes are accepted at compile time (`ExtensionKindMap`); dynamic strings
   * resolving to an unregistered suffix or a non-leaf type throw with guidance.
   * The same source always yields the same instance — also across
   * {@link load} — and options are first-wins: conflicting options on a later
   * call are ignored with a one-time dev warning.
   *
   * @remarks For a seamless type, `get('sprite.png')` on an unloaded source
   * returns a `'loading'` placeholder and fetches URL `<source>` — it no longer
   * throws "missing resource". A bare alias that isn't a real path (a typo, or a
   * not-yet-preloaded alias) therefore fetches that string and can 404 quietly
   * instead of throwing; preloaded aliases still return the stored payload. This
   * is intended seamless-by-default behaviour — the note is for debuggability.
   * When such a fetch DOES fail, a **development build** logs a one-time
   * (per-source) warning naming the literal path and how to fix it, so the 404
   * is no longer completely silent; production builds stay quiet. For a dynamic
   * source, use `get(Asset.type('texture', dynamicPath))`.
   */
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;

  /**
   * Adopts an {@link Assets} catalog: every handle-hybrid leaf is registered,
   * claimed, and driven to load, and the same leaf objects are returned keyed by
   * their record key. The catalog's own properties heal in place as payloads
   * arrive — the returned map holds those very leaves.
   */
  public get<M extends Record<string, CatalogEntry>>(catalog: Assets<M>): InferAssetsProperties<M>;

  /**
   * Seamless/value access from an `Asset.type(...)` descriptor —
   * the replacement for the removed `get(Type, dynamicSource)` form. Builds and
   * adopts the descriptor's handle-hybrid leaf: a resource type yields its
   * heal-in-place handle, a value type a stable {@link AssetRef}. A type with
   * neither a seamless adapter nor a value channel throws with guidance to use
   * `load(Asset.type(...))`.
   *
   * The return type follows the {@link ValueAsset} brand (as {@link InferCatalogLeaf}
   * does): a value-type descriptor (`Asset.type<T>('json', …)`) returns
   * `AssetRef<T>` — even for an object payload — while a resource-type descriptor
   * returns the resource itself, so the type always matches the runtime value.
   * Both come back BRANDED, mirroring the `_assetMeta` stamp `createLeaf` applies,
   * so the returned leaf can be fed straight back into a single-leaf `load(…)`.
   *
   * Unlike bare-path `get('x.png')`, this form is **not instance-deduped by
   * source**: each call builds a fresh leaf, so repeated `get(Asset.type(type, sameSrc))`
   * accumulates distinct handles (all healing to the same deduped backend
   * payload). It is the dynamic-source escape hatch — capture the handle once.
   */
  // A materialized VALUE LEAF resolves exactly like a value descriptor — it is
  // adopted and handed back unchanged — so both share one signature.
  public get<T>(asset: ValueAsset<T> | CatalogValueLeaf<T>): CatalogValueLeaf<T>;
  public get<T>(asset: Asset<T>): CatalogResourceLeaf<T>;

  /**
   * Adopts a single handle-hybrid leaf (an `Assets.from()` property) and returns
   * it — the same object, healing in place once its payload arrives.
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
   * under the app-lifetime {@link _rootClaimer}; the scene-scoped loader proxy
   * passes its own scope. `_claim` runs AFTER `AssetResidency._getSeamless`/
   * `_getRef` so an evicted key's re-fetch is driven from here (the re-armed
   * handle reads `'loading'`, which `_getSeamless` alone would not re-fetch).
   * @internal
   */
  public _getClaimed(claimer: LoaderScope, input: string | object, options?: unknown): unknown {
    // Assets<M> container — adopt every handle-hybrid leaf (fill in place, claim
    // under `claimer`) and return the leaves keyed by their record key.
    if (input instanceof AssetsImpl) {
      const out: Record<string, unknown> = {};

      const entries = Object.entries((input as AssetsImpl<Record<string, AssetInput>>).entries) as Array<[string, object]>;
      for (const [k, leaf] of entries) {
        this._adopt(leaf, claimer);
        out[k] = leaf;
      }

      return out;
    }

    // Single `Asset.type(...)` descriptor (e.g. `get(Asset.type('json', 'x.json'))` /
    // `get(Asset.type('texture', dynamicPath))`) — build its handle-hybrid leaf from the
    // config, adopt it, and return it. A value type yields an AssetRef, a
    // resource type the seamless placeholder handle. Mirrors `load`'s AssetImpl
    // branch and the single-meta-leaf path below. Must precede the string branch
    // (an AssetImpl carries no stamped meta, so the guard above misses it).
    if (input instanceof AssetImpl) {
      if (options !== undefined) {
        throw new Error('Loader: get(Asset.type(...), options) is not supported. Put per-asset options in Asset.type(type, path, options).');
      }

      const { type, source: src, ...rest } = input._config;
      const opts = Object.keys(rest).length > 0 ? rest : undefined;

      let leaf: object;
      try {
        leaf = createLeaf(type, src, opts);
      } catch {
        throw new Error(`Loader: get() is for seamless/value assets; the "${type}" type has neither — use load(Asset.type('${type}', ...)) instead.`);
      }

      this._adopt(leaf, claimer);

      return leaf;
    }

    // Single meta-stamped leaf (e.g. `get(assets.ship)`) — adopt and return it.
    if (_readMeta(input) !== undefined) {
      this._adopt(input as object, claimer);

      return input;
    }

    // Anything left must be a bare path string: an object that reaches here is
    // neither a catalog, a descriptor, nor an adopted leaf.
    if (typeof input !== 'string') {
      throw new Error('Loader: get() accepts a path string, an Asset.type(...) descriptor, an Assets catalog, or one of its leaves.');
    }

    // Bare path string — normalize it to a `{ type, source }` descriptor, then
    // hand it to the SAME source-keyed dedup the catalog leaves use: a seamless
    // type yields its shared heal-in-place handle, a value type its shared
    // AssetRef. (This is deliberately NOT routed through `createLeaf` like the
    // `Asset.type(...)` branch above — a bare path is instance-deduped by
    // source, and `createLeaf` mints a fresh leaf per call.)
    const { type, source: path, ctor } = this._resolveBarePath(input);

    const adapter = this._typeRegistry.getSeamlessAdapter(ctor);
    const canonical = this._canonicalize(ctor, path, options);

    if (adapter !== undefined) {
      const handle = this._residency._getSeamless(canonical, adapter, options);
      this._claim(canonical, claimer);

      return handle;
    }

    if (getAssetKind(type)?.isValue === true) {
      const ref = this._residency._getRef(canonical, options);
      this._claim(canonical, claimer);

      return ref;
    }

    throw new Error(
      `Loader: type "${type}" inferred from "${path}" has no seamless adapter and is not a value type — ` +
        `use load(Asset.type('${type}', '${path}')) instead.`,
    );
  }

  /**
   * Pure in-memory lookup: the resource already stored for `path`, or
   * `undefined` if nothing is held for it.
   *
   * The counterpart to {@link get} — and the one to reach for when the answer
   * "not loaded" is a legitimate one rather than something to fix by loading.
   * Unlike `get`, this **never** starts a fetch, **never** mints a placeholder
   * handle, and **never** claims anything, so it cannot keep an asset alive by
   * accident. Calling it in a loop is free.
   *
   * Invalid usage still fails loudly, exactly as it does on `get`: a path
   * whose extension resolves to no registered type, or an input that is
   * neither a path string nor an `Asset.type(...)` descriptor, throws. Only
   * "the key is fine, nothing is stored under it" comes back as `undefined`.
   *
   * A catalog leaf needs no `peek`: the leaf *is* the handle, so read its
   * `loadState` / `loaded` directly.
   *
   * @example
   * ```ts
   * // Use the real texture if it happens to be resident, otherwise skip the
   * // decoration entirely — without pulling it into memory.
   * const sparkle = loader.peek('image/sparkle.png');
   * if (sparkle !== undefined) {
   *     stage.addChild(new Sprite(sparkle));
   * }
   * ```
   *
   * @remarks A custom type bound via `bindAsset` may legitimately store a
   * nullish payload; such an entry reports `undefined` here and is
   * indistinguishable from "not stored".
   */
  public peek<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): ResourceForKind<KindByPath<S>> | undefined;
  /** Pure in-memory lookup from an `Asset.type(...)` descriptor — see the path overload. */
  public peek<T>(asset: Asset<T>): T | undefined;
  public peek(input: string | object): unknown {
    let ctor: AssetConstructor;
    let source: string;
    let options: unknown;

    if (input instanceof AssetImpl) {
      const { type, source: src, ...rest } = input._config;
      const resolved = this._typeRegistry.resolveTypeName(type) ?? this._valueTokenForKind(type);

      if (resolved === undefined) {
        throw new Error(`Loader: peek(Asset.type('${String(type)}', …)) — no type is registered under "${String(type)}".`);
      }

      ctor = resolved;
      source = src;
      // Identity-relevant options are part of the canonical key, so a descriptor
      // carrying them must peek the key it would actually load.
      options = Object.keys(rest).length > 0 ? rest : undefined;
    } else if (typeof input === 'string') {
      const resolved = this._resolveBarePath(input);

      ctor = resolved.ctor;
      source = resolved.source;
    } else {
      throw new Error(
        'Loader: peek() accepts a path string or an Asset.type(...) descriptor. A catalog leaf is already a handle — read its loadState instead.',
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
   * as does a handle this loader has EVER issued — that check is deliberately
   * independent of current claim state, so the same object never throws or not
   * depending on unrelated internal teardown ordering.
   * @internal
   */
  public _releaseFrom(claimer: LoaderScope, handleOrType: object | AssetConstructor, source?: string): void {
    if (typeof source === 'string') {
      this._release(this._canonicalize(handleOrType as AssetConstructor, source).key, claimer);

      return;
    }

    // A catalog releases each of its leaves. A never-adopted leaf has no
    // registered key, so its release is a silent no-op.
    if (handleOrType instanceof AssetsImpl) {
      for (const leaf of Object.values((handleOrType as AssetsImpl<Record<string, AssetInput>>).entries)) {
        this._releaseFrom(claimer, leaf);
      }

      return;
    }

    // A descriptor resolves to the same canonical key the load path claimed it
    // under (see `_createLoadingQueue`).
    if (handleOrType instanceof AssetImpl) {
      const asset = handleOrType as Asset<unknown>;
      const ctor = this._typeRegistry.resolveTypeName(asset.type);

      if (ctor) {
        const { type: _type, source: assetSource, ...rest } = asset._config;
        const options = Object.keys(rest).length > 0 ? rest : undefined;

        this._release(this._canonicalize(ctor, assetSource, options).key, claimer);
      }

      return;
    }

    const key = this._residency._getHandleKey(handleOrType);

    if (key !== undefined) {
      this._release(key, claimer);
      return;
    }

    if (_readMeta(handleOrType) === undefined && !this._residency._wasEverRegisteredHandle(handleOrType)) {
      throw new Error(
        'LoaderScope.release(): this object has no claim identity. Release its descriptor, catalog leaf/catalog, or the (type, source) pair instead.',
      );
    }
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
   * Read-only, detached snapshot of every key this loader currently has a
   * claim on — one {@link AssetInspection} row per claimed `(type, source)`
   * key, sorted by key. Intended for diagnostics, support bundles, and
   * developer tooling: the returned array and every row are frozen, so
   * mutating (or attempting to mutate) the snapshot never touches residency,
   * and no internal `Set`, claim symbol, or live handle/ref object is exposed
   * — every field is plain data.
   *
   * @see {@link AssetInspection} for what each row reports.
   */
  public inspect(): readonly AssetInspection[] {
    return this._residency._inspect();
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
   */
  public get fetchOptions(): RequestInit {
    return this._decoder.fetchOptions;
  }

  public set fetchOptions(value: RequestInit) {
    this._decoder.fetchOptions = value;
  }

  // -----------------------------------------------------------------------
  // Extension binding — @internal / @advanced
  // -----------------------------------------------------------------------

  /**
   * Atomically bind all keys for one AssetBinding to a pre-created handler.
   * Validates binding-owned keys BEFORE mutating any map. A conflicting
   * constructor, type name, or binding extension throws before any mutation.
   * An explicit app-local {@link registerType} override is a separate,
   * higher-precedence decision and may coexist with the binding default.
   *
   * `Result` and `Options` are inferred from the binding's `AssetBinding<Result, Options>`
   * contract. A declarative handler's optional `getIdentityDiscriminator` is
   * forwarded into the internal {@link HandlerEntry} so it participates in the
   * canonical key.
   * @internal
   */
  public bindAsset<Result = unknown, Options = undefined>(
    keys: {
      ctor: AssetConstructor<Result>;
      type?: keyof AssetDefinitions;
      typeNames?: readonly string[];
      extensions?: readonly string[];
      seamless?: SeamlessAdapter<Result>;
      /** Optional per-type IDB namespace for `context.fetchX()` calls made by this binding's handler. Defaults to the shared `__ctx_binary`/`__ctx_text`/`__ctx_json` namespace. */
      storageName?: string;
    },
    handler: AssetHandler<Result, Options>,
  ): void {
    this._typeRegistry.bindAsset(keys, handler);
  }

  /**
   * Returns true if a handler is already registered for the given constructor.
   * @advanced
   */
  public hasLoadable(type: AssetConstructor): boolean {
    return this._typeRegistry.hasLoadable(type);
  }

  /**
   * Returns true if a type-name mapping is already registered.
   * @advanced
   */
  public hasAssetType(typeName: string): boolean {
    return this._typeRegistry.hasAssetType(typeName);
  }

  /**
   * Returns true if a file extension is already mapped to an asset type.
   * Extension is normalised (leading dot stripped, lower-cased).
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
   * Destroys every cache store, clears all in-memory assets and in-flight
   * tracking, and disconnects all signals. Also calls `destroy?.()` on every
   * handler registered via `bindAsset`.
   */
  public destroy(): void {
    // Order matters: bound-handler destroy must run after store destroy (via
    // this._decoder.destroy(), which mirrors the original inline teardown
    // order) — see the regression test in loader.test.ts.
    this._decoder.destroy();
    this._typeRegistry.destroyHandlers();
    this._residency.destroy();

    this.onProgress.destroy();
    this.onLoaded.destroy();
    this.onError.destroy();
    this.onLoadStart.destroy();
    this.onLoadProgress.destroy();
    this.onLoadComplete.destroy();
    this.onLoadError.destroy();
    this.onCacheError.destroy();
  }

  // -----------------------------------------------------------------------
  // Internal — loading
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
   * `AssetResidency._enqueueBackgroundFetch`) instead of started immediately —
   * `load(target, { priority: LoadPriority.Background })`.
   * @internal
   */
  public _adopt(handle: object, claimer: LoaderScope, background = false): void {
    this._residency._adopt(handle, claimer, background);
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
  public _release(key: CanonicalAssetKey, claimer: LoaderScope): void {
    this._residency._release(key, claimer);
  }

  /**
   * Release every claim held under a claim scope (a scene unloading its
   * scene-private assets). Collect the held keys first, then release —
   * `AssetResidency._release` mutates its own claim map, so we must not
   * delete during iteration.
   * @internal
   */
  public _releaseScope(claimer: LoaderScope): void {
    this._residency._releaseScope(claimer);
  }

  private _createLoadingQueue<T>(
    claimer: LoaderScope,
    items: Array<{ alias: string; asset: Asset<unknown> }>,
    buildResult: (results: Map<string, unknown>) => T,
  ): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    const claimedKeys: string[] = [];
    let notifyFn: ((success: boolean) => void) | null = null;

    const itemPromises = items.map(({ alias, asset }) => {
      this._onFgBatchStart(claimer, alias, asset.source);
      const ctor = this._typeRegistry.resolveTypeName(asset.type);

      if (!ctor) {
        // Must call _notifyItem(false) so LoadingProgress doesn't remain stuck.
        return Promise.reject<unknown>(
          new Error(`No constructor registered for asset type "${asset.type}". Bind it via defineAsset()/bindAsset() first.`),
        ).then(
          () => {
            notifyFn?.(true);
          },
          error => {
            notifyFn?.(false);
            this._onFgBatchSettled(claimer, alias, false, this._settleError(error));
            throw error;
          },
        );
      }

      const { type: _type, source: assetSource, ...rest } = asset._config;
      const options = Object.keys(rest).length > 0 ? rest : undefined;
      const canonical = this._canonicalize(ctor, assetSource, options);

      claimedKeys.push(canonical.key);
      this._claim(canonical, claimer);

      return this._residency._loadSingle(canonical, options).then(
        resource => {
          results.set(alias, resource);
          notifyFn?.(true);
          this._onFgBatchSettled(claimer, alias, true);
        },
        error => {
          notifyFn?.(false);
          this._onFgBatchSettled(claimer, alias, false, this._settleError(error));
          throw error;
        },
      );
    });

    const promise = Promise.all(itemPromises).then(() => buildResult(results));

    const queue = new LoadingQueue<T>(promise, items.length, () => this._cancelClaims(claimer, claimedKeys));
    notifyFn = queue._notifyItem.bind(queue);

    return queue;
  }

  /**
   * Progress-aware queue over already-{@link _adopt}ed handle-hybrid leaves.
   *
   * Mirrors {@link _createLoadingQueue}'s progress/settle machinery, but the
   * fetch is already driven by `_adopt`; each item's promise is simply the
   * leaf's own readiness promise (`leaf.loaded` — `Promise<this>` for a resource
   * handle, `Promise<T>` for an `AssetRef`). No `_claim` here: adoption already
   * claimed each key — `claimer` is carried only so {@link LoadingQueue.cancel}
   * can drop those very claims again. `buildResult` shapes the resolved values
   * into the return.
   * @internal
   */
  private _createAdoptedQueue<T>(claimer: LoaderScope, entries: Array<[string, object]>, buildResult: (results: Map<string, unknown>) => T): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    // Adoption registered every leaf under its residency key, so the reverse
    // lookup is the honest source for what this queue claimed — the Loader does
    // not re-derive the keys the residency just resolved.
    const claimedKeys = entries.map(([, leaf]) => this._residency._getHandleKey(leaf)).filter((key): key is string => key !== undefined);
    let notifyFn: ((success: boolean) => void) | null = null;

    const itemPromises = entries.map(([alias, leaf]) => {
      const src = _readMeta(leaf)?.src ?? alias;
      this._onFgBatchStart(claimer, alias, src);
      const loaded = (leaf as { loaded: Promise<unknown> }).loaded;

      return loaded.then(
        value => {
          results.set(alias, value);
          notifyFn?.(true);
          this._onFgBatchSettled(claimer, alias, true);
        },
        error => {
          notifyFn?.(false);
          this._onFgBatchSettled(claimer, alias, false, this._settleError(error));
          throw error;
        },
      );
    });

    const promise = Promise.all(itemPromises).then(() => buildResult(results));

    const queue = new LoadingQueue<T>(promise, entries.length, () => this._cancelClaims(claimer, claimedKeys));
    notifyFn = queue._notifyItem.bind(queue);

    return queue;
  }

  /**
   * Back {@link LoadingQueue.cancel}: drop the claims this load registered
   * under its own scope. Whether that actually stops a download is decided one
   * level down — the residency aborts the in-flight fetch only once the key has
   * no claim scope left, so a sibling scene loading the same asset keeps it.
   */
  private _cancelClaims(claimer: LoaderScope, keys: readonly CanonicalAssetKey[]): void {
    for (const key of keys) {
      this._release(key, claimer);
    }
  }

  // -----------------------------------------------------------------------
  // Internal — foreground batch tracking
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
   * a failure and must not reach {@link onLoadError} — the caller asked for it.
   */
  private _settleError(error: unknown): Error | undefined {
    return isAbortError(error) ? undefined : this._normalizeError(error);
  }
}
