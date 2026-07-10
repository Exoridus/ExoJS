import type { Sound } from '#audio/Sound';
import { logger } from '#core/logging';
import { Signal } from '#core/Signal';
import type { AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { type BmFont } from '#rendering/text/BmFont';
import type { Texture } from '#rendering/texture/Texture';

import { type Asset, AssetImpl, type ValueAsset } from './Asset';
import { parseContainer } from './AssetContainer';
import type { AssetDefinitions, AssetInput, CatalogEntry, InferAssetResource, KindByPath, LeafForPath, ResourceForKind, ValueAssetKind } from './AssetDefinitions';
import type { AssetFactory } from './AssetFactory';
import { createLeaf } from './assetKindRegistry';
import { _readMeta } from './assetMeta';
import { AssetRef } from './AssetRef';
import { _normalizeEntry,type Assets, AssetsImpl, type InferAssetsProperties } from './Assets';
import { CacheFirstStrategy } from './CacheFirstStrategy';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import { resolveKindByPath } from './extensionKindRegistry';
import type { AssetConstructor } from './FactoryRegistry';
import { FactoryRegistry } from './FactoryRegistry';
import { LoadingQueue } from './LoadingQueue';
import type { SeamlessAdapter } from './seamless';
import { BinaryAsset, CsvAsset, FontAsset, type ImageAsset, Json, SubtitleAsset, type SvgAsset, TextAsset, WasmAsset, XmlAsset } from './tokens';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Any abstract or concrete constructor that can be used as an asset type token
 * with {@link Loader.load} and related methods.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loadable = abstract new (...args: any[]) => unknown;

/** Maps each key of an `AssetInput` map to its resolved runtime resource type. */
export type InferLoadedMap<M extends Record<string, AssetInput>> = {
  [K in keyof M]: InferAssetResource<M[K]>;
};

/**
 * Maps a {@link Loadable} constructor to the concrete type returned by
 * {@link Loader.load}.
 *
 * Token classes ({@link Json}, {@link TextAsset}, {@link SvgAsset},
 * {@link VttAsset}) are special-cased because their return types do not match
 * their constructor type. All other loadables return the instance type inferred
 * from the constructor.
 */

export type LoadReturn<T> = T extends typeof Json
  ? unknown
  : T extends typeof TextAsset
    ? string
    : T extends typeof SvgAsset
      ? HTMLImageElement
      : T extends typeof SubtitleAsset
        ? VTTCue[]
        : T extends typeof XmlAsset
          ? Document
          : T extends typeof CsvAsset
            ? string[][]
            : T extends typeof ImageAsset
              ? HTMLImageElement
              : T extends typeof FontAsset
                ? FontFace
                : T extends typeof BinaryAsset
                  ? ArrayBuffer
                  : T extends typeof WasmAsset
                    ? WebAssembly.Module
                    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      T extends abstract new (...args: any[]) => infer R
                      ? R
                      : never;

/**
 * Maps file extensions (without leading dot, lower-case) to the asset type
 * returned by {@link Loader.load} when called with a plain path string.
 *
 * Extend via declaration merging to register custom extension → type mappings:
 * ```ts
 * declare module 'exojs' {
 *   interface ExtensionTypeMap { tmj: TiledMap; }
 * }
 * ```
 */
export interface ExtensionTypeMap {
  fnt: BmFont;
  woff: FontFace;
  woff2: FontFace;
  ttf: FontFace;
  otf: FontFace;
  png: Texture;
  jpg: Texture;
  jpeg: Texture;
  webp: Texture;
  avif: Texture;
  gif: Texture;
  ogg: Sound;
  mp3: Sound;
  wav: Sound;
  m4a: Sound;
  aac: Sound;
}

/** Last path segment of `S` (everything after the final `/`). */
type Basename<S extends string> = S extends `${string}/${infer Rest}` ? Basename<Rest> : S;

/** `S` without a trailing `?query` or `#fragment` part. */
type StripQueryHash<S extends string> = S extends `${infer P}?${string}` ? P : S extends `${infer P}#${string}` ? P : S;

/**
 * Longest registered dot-suffix of a basename. Walks dots left to right, so
 * the longest candidate (`aseprite.json`) is checked before shorter ones
 * (`json`); resolves to `never` when no suffix is a registered extension.
 */
type MatchExtension<S extends string> = S extends `${string}.${infer Rest}`
  ? Lowercase<Rest> extends keyof ExtensionTypeMap
    ? Lowercase<Rest>
    : MatchExtension<Rest>
  : never;

/**
 * The registered extension key inferred from a path literal — basename-only,
 * longest-suffix-first (Entscheidung #14) — or `never` when no dot-suffix of
 * the basename is registered in {@link ExtensionTypeMap}.
 */
export type PathExtension<S extends string> = MatchExtension<Basename<StripQueryHash<S>>>;

/**
 * Resolves the return type for {@link Loader.load} when called with a plain
 * path string. Returns `unknown` when the extension is not in
 * {@link ExtensionTypeMap} — the string-path overload rejects such paths at
 * compile time; use the descriptor form (`load(Asset.kind(kind, path))`) instead.
 *
 * The `[PathExtension<S>] extends [never]` guard is load-bearing: indexing
 * {@link ExtensionTypeMap} with `never` would silently produce `never` rather
 * than the intended `unknown` fallback.
 */
export type LoadByPath<S extends string> = [PathExtension<S>] extends [never] ? unknown : ExtensionTypeMap[PathExtension<S>];

/**
 * Context object passed to custom asset-type load handlers bound via
 * `bindAsset` / `defineAsset`.
 *
 * The `fetch*` helpers route through the loader's configured cache strategy
 * and IDB stores, giving custom handlers the same caching behaviour as
 * built-in asset types.
 */
export interface AssetLoaderContext {
  /** The owning {@link Loader} instance. */
  readonly loader: Loader;
  /**
   * The identity key for this load — `id:<typeId>:<discriminator>`.
   * Useful for diagnostics; also equals the key used for in-flight dedup.
   */
  readonly identityKey: string;
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
 * Options for the catalog/asset/leaf {@link Loader.load} forms.
 *
 * With `background: true` every adopted leaf is still claimed and registered
 * (so it heals in place and a later {@link Loader.get} returns the same
 * instance), but its fetch is routed through the low-priority background queue
 * instead of started immediately: it streams concurrency-capped, drops from the
 * queue if released at refcount 0, and is boosted to fetch now on a direct
 * `get()`. Foreground loading (no options) is unaffected.
 */
export interface LoadOptions {
  background?: boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface QueueEntry {
  readonly type: AssetConstructor;
  readonly alias: string;
  readonly path: string;
  readonly options?: unknown;
}

/** Stored entry for handler-based asset bindings (via `bindAsset`). */
interface HandlerEntry {
  load: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>;
  /** Optional discriminator for in-flight identity keying; overrides source-only default. */
  getIdentityKey?: (config: unknown) => string;
  /** Optional byte-source constructor used by container loading (bypasses fetch). */
  createFromBytes?: (bytes: ArrayBuffer, options?: unknown) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Central asset management hub for ExoJS applications.
 *
 * The `Loader` orchestrates fetching, processing, caching, and retrieval of
 * all engine asset types. It ships with built-in factories for every first-party
 * type (Texture, Sound, AudioStream, Video, FontFace, HTMLImageElement, Json, text,
 * SVG, VTT, binary, and WASM) and allows registering custom factories via
 * {@link register}.
 *
 * Assets can be loaded in two ways:
 * - **Direct** — `loader.load(Assets.from({ hero: 'hero.png' }))` fetches
 *   immediately and resolves to the finished assets.
 * - **Background** — pass `{ background: true }` to `load(...)` to pre-warm
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
 */
export class Loader {
  private readonly _registry = new FactoryRegistry();
  private readonly _assetTypeMap = new Map<string, AssetConstructor>();
  private readonly _resources = new Map<AssetConstructor, Map<string, unknown>>();
  // Reverse lookup: loaded resource object → the (type, source) it was first
  // stored under. Backs {@link Loader.keyFor} for scene serialization. A
  // WeakMap so it never retains resources; only object resources participate
  // (primitive results like parsed JSON/text are not keyable → null).
  private readonly _resourceKeys = new WeakMap<object, { type: AssetConstructor; source: string }>();
  private readonly _inFlight = new Map<string, Promise<unknown>>();
  private readonly _typeIds = new WeakMap<AssetConstructor, number>();
  private readonly _preventStoreKeys = new Set<string>();
  private readonly _stores: readonly CacheStore[];
  private readonly _cacheStrategy: CacheStrategy;

  // ── Identity / alias tracking for the new Asset API ───────────────────────
  // Maps alias key (`${typeId}:${alias}`) to an identity key (`id:${typeId}:${source}`)
  private readonly _aliasKeyToIdentityKey = new Map<string, string>();
  // Maps identity key to the set of aliases registered under that identity (within same type)
  private readonly _identityKeyToAliases = new Map<string, Set<string>>();
  // In-flight promises keyed by identity (source-based) for cross-alias dedup
  private readonly _inFlightByIdentity = new Map<string, Promise<unknown>>();
  // Handler entries bound via bindAsset (the AssetBinding handler form)
  private readonly _handlerFunctions = new Map<AssetConstructor, HandlerEntry>();
  // Maps lower-case file extensions (without dot) to the constructor to use
  private readonly _extensionMap = new Map<string, AssetConstructor>();

  // Handlers registered via bindAsset — owned for their full lifecycle
  private readonly _boundHandlers: AssetHandler[] = [];

  // ── Seamless deferred handles (asset-system v2) ───────────────────────────
  // Adapter per seamless type; handles pending or failed, keyed by _key(type, source).
  // Each entry tracks the SET of distinct handles in flight for the key (§7
  // multi-handle fill): two catalog leaves for one source share a single
  // source-keyed decode yet are each filled in place. The first handle inserted
  // is the representative — the object that becomes the canonical `_resources`
  // entry on store, mirroring the old single-handle contract. Successful fills
  // remove the entry (the representative moves to _resources); failed entries
  // stay so a later get() retries and heals the SAME handles in place.
  private readonly _seamlessAdapters = new Map<AssetConstructor, SeamlessAdapter<unknown>>();
  private readonly _deferred = new Map<string, { readonly handles: Set<object>; readonly options: unknown }>();

  // Value-asset refs (asset-system v2 §4.6): the ref is the stable identity —
  // entries persist for the loader's lifetime (fill keeps them, fail keeps
  // them for retry), unlike _deferred whose handles move into _resources. Like
  // _deferred, an entry tracks the SET of distinct refs adopted for one source
  // so a single fetch fills every in-flight ref (§7 multi-handle fill).
  private readonly _refs = new Map<string, { readonly refs: Set<AssetRef<unknown>>; readonly options: unknown }>();
  // Single source for the value kind ↔ dispatch token mapping: both the
  // membership set below and `_valueTokenForKind` derive from it, and a
  // `Record<ValueAssetKind, …>` is compile-checked to cover exactly the value
  // kinds (vtt + srt share the SubtitleAsset token). @internal
  private readonly _valueTokenByKind: Readonly<Record<ValueAssetKind, AssetConstructor>> = {
    json: Json,
    text: TextAsset,
    csv: CsvAsset,
    xml: XmlAsset,
    vtt: SubtitleAsset,
    srt: SubtitleAsset,
    binary: BinaryAsset,
    wasm: WasmAsset,
  };

  /** The value-asset token for a value kind name, or `undefined` for non-value / extension kinds. @internal */
  private _valueTokenForKind(kind: keyof AssetDefinitions): AssetConstructor | undefined {
    return (this._valueTokenByKind as Partial<Record<string, AssetConstructor>>)[kind];
  }

  // ── Refcount / claims (asset-system v2 §4.7) ──────────────────────────────
  /** App-lifetime claim scope for direct `app.loader.get/load(…)` calls. @internal */
  private readonly _rootClaimer = Symbol('app-loader');
  /** Resource key → claim scopes + the type/source needed to evict/re-fetch; refcount = scopes.size. @internal */
  private readonly _claims = new Map<string, { scopes: Set<symbol>; type: AssetConstructor; source: string }>();
  /** Keys evicted at refcount 0 (handle re-registered in `_deferred`); the next claim re-fetches into it. @internal */
  private readonly _evicted = new Set<string>();
  /** Deferred handle / value-ref → its resource key, for `release(handle)`. @internal */
  private readonly _handleKeys = new WeakMap<object, string>();

  private _basePath: string;
  private _fetchOptions: RequestInit;
  private _concurrency: number;
  private _nextTypeId = 1;

  private _fgBatchActive = 0;
  private _fgBatchLoaded = 0;
  private _fgBatchTotal = 0;

  private _backgroundQueue: QueueEntry[] = [];
  private _backgroundActive = 0;
  private _backgroundTotal = 0;
  private _backgroundLoaded = 0;
  private _backgroundResolve: (() => void) | null = null;

  /** Dispatched after each background-queue item completes, with the running loaded/total counts. */
  public readonly onProgress = new Signal<[loaded: number, total: number]>();
  /** Dispatched when any asset finishes loading and is stored in memory. */
  public readonly onLoaded = new Signal<[type: AssetConstructor, alias: string, resource: unknown]>();
  /** Dispatched when an asset fails to load during background or bundle loading. */
  public readonly onError = new Signal<[type: AssetConstructor, alias: string, error: Error]>();

  /** Fired when the first asset in a new load batch starts fetching. */
  public readonly onLoadStart = new Signal<[key: string, url: string]>();
  /** Fired after each asset settles (loaded or failed). `loaded` = resolved count, `total` = batch size. */
  public readonly onLoadProgress = new Signal<[loaded: number, total: number, key: string]>();
  /** Fired when all queued assets in the batch have settled. */
  public readonly onLoadComplete = new Signal();
  /** Fired when an asset fails to load. Does NOT prevent onLoadComplete. */
  public readonly onLoadError = new Signal<[key: string, error: Error]>();

  public constructor(options: LoaderOptions = {}) {
    this._basePath = options.basePath ?? '';
    this._fetchOptions = options.fetchOptions ?? {};
    this._concurrency = options.concurrency ?? 6;
    this._stores = options.cache ? (Array.isArray(options.cache) ? options.cache : [options.cache]) : [];
    this._cacheStrategy = options.cacheStrategy ?? new CacheFirstStrategy();
  }

  // -----------------------------------------------------------------------
  // Factory registration
  // -----------------------------------------------------------------------

  /**
   * Registers a custom {@link AssetFactory} for `type`.
   *
   * Registration is prototype-chain aware: the factory will also handle any
   * subclass of `type` that does not have its own explicit registration.
   * Built-in types can be overridden by registering a replacement factory
   * for the same constructor.
   */
  public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): this {
    this._registry.register(type, factory);

    return this;
  }

  /**
   * Registers the seamless-handle adapter for `type`, enabling the deferred
   * `get(type, source)` form for it. One adapter per type.
   * @advanced
   */
  public registerSeamlessAdapter<T>(type: AssetConstructor<T>, adapter: SeamlessAdapter<T>): this {
    if (this._seamlessAdapters.has(type)) {
      throw new Error(`A seamless adapter is already registered for ${this._describeType(type)}.`);
    }

    this._seamlessAdapters.set(type, adapter);

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
    const buffer = await this._contextFetch<ArrayBuffer>(url, '__ctx_binary', response => response.arrayBuffer());
    const { entries, dataStart } = parseContainer(buffer);

    // Resolve every type up front so an unknown type fails before any asset is stored.
    const resolved = entries.map(entry => {
      const type = this._assetTypeMap.get(entry.type);

      if (!type) {
        throw new Error(`Container "${url}" references unknown asset type "${entry.type}".`);
      }

      return { entry, type };
    });

    await Promise.all(
      resolved.map(({ entry, type }) => {
        const start = dataStart + entry.offset;
        const slice = buffer.slice(start, start + entry.length);

        return this._injectSource(type, entry.alias, slice, entry.options);
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Loading — new Asset / Assets / config-map overloads
  // -----------------------------------------------------------------------

  /**
   * Fetches and processes one or more assets.
   *
   * - **Path string** — inferred from the file extension; resolves the asset.
   * - **Asset<T>** — a single typed asset reference from `Asset.kind(...)`.
   * - **Assets<M>** — a typed catalog from `Assets.from(...)`; keys become aliases.
   *
   * (The inline record-catalog form `{ alias: { kind, source } }` is no longer a
   * public overload — build catalogs with `Assets.from(...)`; a runtime record
   * fallback is retained only for internal multi-alias plumbing.)
   *
   * In-flight and already-loaded assets are de-duplicated: calling `load`
   * for the same (type, alias) pair while a fetch is in progress attaches
   * to the existing promise rather than issuing a second request.
   *
   * Per-asset options ride on the `Asset.kind(kind, source, options)` descriptor
   * (or the extra fields of a config object).
   */
  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, AssetInput>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  // Single value-leaf (an `Assets.from()` AssetRef property): `AssetRef.loaded` resolves
  // to the raw value, not the ref — this overload must win over the generic leaf one below.
  public load<T>(leaf: AssetRef<T>, options?: LoadOptions): LoadingQueue<T>;
  // Single handle-hybrid leaf (an `Assets.from()` property): adopt + resolve its value.
  public load<T extends object>(leaf: T, options?: LoadOptions): LoadingQueue<T>;

  // -----------------------------------------------------------------------
  // Loading — extension-based (type inferred from file extension)
  // -----------------------------------------------------------------------

  /**
   * Fetches an asset by path, inferring the type from the file extension.
   *
   * Built-in extension mappings:
   * - `.fnt` → {@link BmFont}
   * - `.woff`, `.woff2`, `.ttf`, `.otf` → `FontFace` (family inferred from filename)
   *
   * Register additional mappings via `defineAsset` (its `extensions`).
   * Extend the return type by augmenting {@link ExtensionTypeMap}.
   *
   * Paths whose extension is **not** in {@link ExtensionTypeMap} are rejected at
   * compile time — use the descriptor form (`load(Asset.kind(kind, path))`) for
   * unregistered extensions.
   *
   * ```ts
   * const font = await loader.load('fonts/ui.fnt');           // BmFont
   * const face = await loader.load('fonts/Roboto.woff2');     // FontFace, family='Roboto'
   * const bm   = await loader.load<BmFont>('fonts/ui.fnt');   // validated cast
   * ```
   */
  // Generic form — caller narrows R while extension still must be registered.

  // The `[PathExtension<S>] extends [never]` tuple guard is deliberate: the
  // distributive `never extends keyof …` is vacuously TRUE, which would wrongly
  // ACCEPT paths whose extension is unregistered.
  public load<R, S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<R>;
  // Inferred form — R comes from ExtensionTypeMap.
  public load<S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<LoadByPath<S>>;
  // Value-inclusive form — a bare value suffix (json/txt/csv/…) resolves the raw
  // resource value (asset-system v2 §4.4); `ResourceForKind<'json'>` = `unknown`.
  // Single-arg only: the runtime bare-path branch fires solely for
  // `arg1 === undefined`, so an `options?` param here would advertise a
  // parameter the runtime ignores (per-asset options go through `Asset.kind(kind, src, opts)`).
  public load<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): LoadingQueue<ResourceForKind<KindByPath<S>>>;

  // -----------------------------------------------------------------------
  // Loading — implementation
  // -----------------------------------------------------------------------

  public load(arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    return this._loadClaimed(this._rootClaimer, arg0, arg1);
  }

  /**
   * Claimed variant of {@link load}: identical logic, but every resolved key is
   * claimed under `claimer` (refcount). The public {@link load} delegates here
   * under the app-lifetime {@link _rootClaimer}; the scene-scoped loader proxy
   * passes its own scope. Claiming under `_rootClaimer` (which only `release()`
   * frees) is observationally a no-op for existing callers.
   * @internal
   */
  public _loadClaimed(claimer: symbol, arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    // 1. Single Asset<T>
    if (arg0 instanceof AssetImpl) {
      const asset = arg0 as Asset<unknown>;
      const alias = asset._config.source;

      return this._createLoadingQueue(claimer, [{ alias, asset }], results => results.get(alias));
    }

    // 2. Assets<M> container — adopt every handle-hybrid leaf (fill in place,
    // claim under `claimer`) and resolve the adopted queue to a map of the
    // loaded values/handles. The container's own leaves heal in place.
    if (arg0 instanceof AssetsImpl) {
      const entries = Object.entries((arg0 as AssetsImpl<Record<string, AssetInput>>).entries) as Array<[string, object]>;
      const background = (arg1 as LoadOptions | undefined)?.background === true;

      for (const [, leaf] of entries) {
        this._adopt(leaf, claimer, background);
      }

      return this._createAdoptedQueue(entries, results => {
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
      const background = (arg1 as LoadOptions | undefined)?.background === true;
      this._adopt(leaf, claimer, background);

      return this._createAdoptedQueue([['value', leaf]], results => results.get('value'));
    }

    // 2b. Extension-based: single path string with no type token
    if (typeof arg0 === 'string' && arg1 === undefined) {
      const path = arg0;
      let ctor = this._resolveExtensionType(path);

      // Value-kind fallback: a bare path whose suffix maps to a value kind
      // resolves the raw value via the value token (asset-system v2 §4.4).
      if (ctor === undefined) {
        const kind = resolveKindByPath(path);
        const valueToken = kind !== undefined ? this._valueTokenForKind(kind) : undefined;

        if (valueToken !== undefined) ctor = valueToken;
      }

      if (ctor === undefined) {
        throw new Error(`Loader: no type registered for any extension of "${path}". Register one via defineAsset() (its extensions).`);
      }

      // FontAsset requires a family option — infer it from the filename when not provided
      const options: unknown = ctor === FontAsset ? { family: (path.split('/').pop()?.split(/[?#]/)[0] ?? '').replace(/\.[^.]+$/, '') } : undefined;

      this._claim(this._key(ctor, path), ctor, path, claimer);
      this._onFgBatchStart(path, path);
      let notifyFn: ((success: boolean) => void) | null = null;
      const promise = this._loadSingle(ctor, path, options).then(
        v => {
          notifyFn?.(true);
          this._onFgBatchSettled(path, true);
          return v;
        },
        e => {
          notifyFn?.(false);
          this._onFgBatchSettled(path, false, this._normalizeError(e));
          throw e;
        },
      );
      const queue = new LoadingQueue(promise, 1);
      notifyFn = queue._notifyItem.bind(queue);
      return queue;
    }

    // Internal/legacy record fallback: `Record<string, AssetInput>`. The TYPED
    // inline record-catalog overload was removed (asset-system v2 delta §5/§14) —
    // typed callers go through `Assets.from({...})` — but the runtime path is kept
    // for internal multi-alias/identity plumbing and its coverage.
    //
    // Every value is routed through the SAME `_normalizeEntry` used by
    // `Assets.from(...)`: a bare path string (`{ a: 'a.png' }`) is resolved to a
    // `{ kind, source }` config by its suffix instead of being wrapped raw as
    // `new Asset('a.png')` (which left `kind === undefined` and threw the cryptic
    // "No constructor registered for asset type undefined"). An already-built
    // `Asset` and a full config pass through unchanged (A1).
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
   * leaf enqueued via `load(target, { background: true })` has finished loading
   * (successfully or not). Kicks the queue first, so a concurrency change that
   * left pending entries unstarted still makes progress.
   *
   * Individual asset errors are reported via {@link onError} but do not
   * reject the returned promise.
   */
  public awaitBackground(): Promise<void> {
    return new Promise<void>(resolve => {
      this._drainBackground();

      if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
        resolve();

        return;
      }

      this._backgroundResolve = resolve;
    });
  }

  /**
   * Sets the maximum number of simultaneous background-queue fetches.
   * Takes effect on the next {@link awaitBackground} call or `load(…, { background })`.
   */
  public setConcurrency(n: number): this {
    this._concurrency = n;

    return this;
  }

  // -----------------------------------------------------------------------
  // Retrieval
  // -----------------------------------------------------------------------

  /**
   * Seamless deferred access by path (asset-system v2). Returns SYNCHRONOUSLY
   * and never throws: an already-loaded source returns the stored resource; an
   * unknown source returns a placeholder handle immediately, starts the
   * fetch, and fills the handle in place when the payload arrives (track it
   * via {@link Texture.loadState} / {@link Texture.loaded}). Failed loads
   * show the {@link Texture.missing} checker; calling `get` again for a
   * `'failed'` source retries and heals the same handle in place.
   *
   * The asset type is inferred from the file extension (basename-only,
   * longest-suffix-first; see {@link ExtensionTypeMap}). Accepts only paths
   * whose inferred type has a seamless adapter (compile-time gate); dynamic
   * strings resolving to an unregistered extension or a non-seamless type throw
   * with guidance. The same source always yields the same instance — also
   * across {@link load} — and options are first-wins: conflicting options on a
   * later call are ignored with a one-time dev warning.
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
   * source, use `get(Asset.kind('texture', dynamicPath))`.
   */
  public get<S extends string>(path: LoadByPath<S> extends Texture | Sound ? S : never, options?: unknown): LoadByPath<S>;

  /**
   * Bare-path seamless/value access: a resource suffix yields its handle, a
   * value suffix yields a stable {@link AssetRef}, inferred from the file
   * extension. Broader fallback below the resource-only overload above.
   */
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;

  /**
   * Legacy in-memory lookup: retrieves a previously loaded asset by type + alias
   * (for non-seamless types and `loadContainer`-loaded assets). This is a cache
   * lookup, NOT a fetch — the token *fetch* forms `get(Type, src)` were removed.
   * Prefer bare-path `get('x.png')` or `get(Asset.kind(...))`.
   * @advanced
   */
  public get<T extends Loadable>(type: T, alias: string): LoadReturn<T>;

  /**
   * Adopts an {@link Assets} catalog: every handle-hybrid leaf is registered,
   * claimed, and driven to load, and the same leaf objects are returned keyed by
   * their record key. The catalog's own properties heal in place as payloads
   * arrive — the returned map holds those very leaves.
   */
  public get<M extends Record<string, AssetInput>>(catalog: Assets<M>): InferAssetsProperties<M>;

  /**
   * Seamless/value access from an `Asset.kind(...)` descriptor (asset-system v2 §4.2) —
   * the replacement for the removed `get(Type, dynamicSource)` form. Builds and
   * adopts the descriptor's handle-hybrid leaf: a resource kind yields its
   * heal-in-place handle, a value kind a stable {@link AssetRef}. A kind with
   * neither a seamless adapter nor a value channel throws with guidance to use
   * `load(Asset.kind(...))`.
   *
   * The return type follows the {@link ValueAsset} brand (as {@link InferCatalogLeaf}
   * does): a value-kind descriptor (`Asset.kind<T>('json', …)`) returns
   * `AssetRef<T>` — even for an object payload — while a resource-kind descriptor
   * returns the resource itself, so the type always matches the runtime value.
   *
   * Unlike bare-path `get('x.png')`, this form is **not instance-deduped by
   * source**: each call builds a fresh leaf, so repeated `get(Asset.kind(kind, sameSrc))`
   * accumulates distinct handles (all healing to the same deduped backend
   * payload). It is the dynamic-source escape hatch — capture the handle once.
   */
  public get<T>(asset: ValueAsset<T>): AssetRef<T>;
  public get<T>(asset: Asset<T>): T;

  /**
   * Adopts a single handle-hybrid leaf (an `Assets.from()` property) and returns
   * it — the same object, healing in place once its payload arrives.
   */
  public get<T extends object>(leaf: T): T;
  public get(typeOrPath: Loadable | string | object, source?: unknown): unknown {
    return this._getClaimed(this._rootClaimer, typeOrPath, source);
  }

  /**
   * Claimed variant of {@link get}: identical resolution, but each resolved key
   * is claimed under `claimer` (refcount). The public {@link get} delegates here
   * under the app-lifetime {@link _rootClaimer}; the scene-scoped loader proxy
   * passes its own scope. `_claim` runs AFTER `_getSeamless`/`_getRef` so an
   * evicted key's re-fetch is driven from here (the re-armed handle reads
   * `'loading'`, which `_getSeamless` alone would not re-fetch).
   * @internal
   */
  public _getClaimed(claimer: symbol, typeOrPath: Loadable | string | object, source?: unknown): unknown {
    // Assets<M> container — adopt every handle-hybrid leaf (fill in place, claim
    // under `claimer`) and return the leaves keyed by their record key.
    if (typeOrPath instanceof AssetsImpl) {
      const out: Record<string, unknown> = {};

      const entries = Object.entries((typeOrPath as AssetsImpl<Record<string, AssetInput>>).entries) as Array<[string, object]>;
      for (const [k, leaf] of entries) {
        this._adopt(leaf, claimer);
        out[k] = leaf;
      }

      return out;
    }

    // Single `Asset.kind(...)` descriptor (e.g. `get(Asset.kind('json', 'x.json'))` /
    // `get(Asset.kind('texture', dynamicPath))`) — build its handle-hybrid leaf from the
    // config, adopt it, and return it. A value kind yields an AssetRef, a
    // resource kind the seamless placeholder handle. Mirrors `load`'s AssetImpl
    // branch and the single-meta-leaf path below. Must precede the string branch
    // (an AssetImpl carries no stamped meta, so the guard above misses it).
    if (typeOrPath instanceof AssetImpl) {
      const { kind, source: src, ...rest } = typeOrPath._config;
      const opts = Object.keys(rest).length > 0 ? rest : undefined;

      let leaf: object;
      try {
        leaf = createLeaf(kind, src, opts);
      } catch {
        throw new Error(`Loader: get() is for seamless/value assets; the "${kind}" kind has neither — use load(Asset.kind('${kind}', ...)) instead.`);
      }

      this._adopt(leaf, claimer);

      return leaf;
    }

    // Single meta-stamped leaf (e.g. `get(assets.ship)`) — adopt and return it.
    if (_readMeta(typeOrPath) !== undefined) {
      this._adopt(typeOrPath as object, claimer);

      return typeOrPath;
    }

    if (typeof typeOrPath === 'string') {
      const path = typeOrPath;
      const ctor = this._resolveExtensionType(path);

      if (ctor !== undefined) {
        const pathAdapter = this._seamlessAdapters.get(ctor);

        if (pathAdapter !== undefined) {
          const handle = this._getSeamless(ctor, pathAdapter, path, source);
          this._claim(this._key(ctor, path), ctor, path, claimer);

          return handle;
        }
      }

      // Value-kind fallback: a bare path whose suffix maps to a value kind →
      // stable AssetRef (asset-system v2 §4.2/§4.4). get()'s string overload
      // passes the second arg as options via `source`.
      const kind = resolveKindByPath(path);
      const valueToken = kind !== undefined ? this._valueTokenForKind(kind) : undefined;

      if (valueToken !== undefined) {
        const ref = this._getRef(valueToken, path, source);
        this._claim(this._key(valueToken, path), valueToken, path, claimer);

        return ref;
      }

      // Neither seamless nor value: keep the existing guidance errors.
      if (ctor === undefined) {
        throw new Error(`Loader: no type registered for any extension of "${path}". Register one via defineAsset() (its extensions).`);
      }

      throw new Error(`Loader: type ${this._describeType(ctor)} inferred from "${path}" has no seamless adapter — use load() instead.`);
    }

    // Not a container, meta-leaf, or path string: a Loadable type token.
    // In-memory lookup for a non-seamless / non-value type (e.g. a bindAsset-
    // bound custom type populated by loadContainer): read the stored resource by
    // source key. Seamless/value fetch-by-token has been removed — use `Asset.kind(...)`
    // or a bare path for those.
    const ctor = typeOrPath as Loadable;
    const src = source as string;
    const typeMap = this._resources.get(ctor);

    if (!typeMap?.has(src)) {
      throw new Error(`Missing resource "${src}" for type ${ctor.name}.`);
    }

    this._claim(this._key(ctor, src), ctor, src, claimer);

    return typeMap.get(src);
  }

  /**
   * Releases the app-lifetime claim on an asset. When the released claim is the
   * last one on that key, the payload is evicted immediately: a seamless
   * handle's payload is dropped in place (identity preserved, `loadState` →
   * `'loading'`) so a later {@link get} heals every dangling consumer, and a
   * not-yet-started background entry is dropped from the queue.
   *
   * Accepts either the deferred handle / value-ref returned by {@link get}, or
   * the `(type, source)` pair. Releasing an unclaimed or unknown asset is a
   * no-op.
   *
   * @remarks The `release(handle)` form resolves the key via an internal handle
   * → key map that is populated ONLY for seamless handles and value-refs. A
   * non-seamless legacy asset (e.g. `get(SomeNonSeamlessType, alias)`) has no
   * such entry, so `release(handle)` silently can't find its key and won't drop
   * the claim — use the `release(type, source)` form for those.
   */
  public release(handle: object): void;
  public release(type: AssetConstructor, source: string): void;
  public release(handleOrType: object | AssetConstructor, source?: string): void {
    const key = typeof source === 'string' ? this._key(handleOrType as AssetConstructor, source) : this._handleKeys.get(handleOrType);

    if (key !== undefined) {
      this._release(key, this._rootClaimer);
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
    // WeakMap.get returns undefined for any non-registered or non-weakly-holdable
    // key, so primitive/unkeyed inputs safely resolve to null without a guard.
    return this._resourceKeys.get(resource) ?? null;
  }

  /**
   * Non-throwing in-memory lookup: the resource stored under `(type, source)`,
   * or `null` if none is held. Reads the store directly (no fetch, no seamless
   * placeholder). Backs scene deserialization, which resolves an asset
   * reference to a pre-loaded resource. @internal
   */
  public _peekResource(type: AssetConstructor, source: string): unknown {
    return this._resources.get(type)?.get(source) ?? null;
  }

  // -----------------------------------------------------------------------
  // Unload
  // -----------------------------------------------------------------------

  /**
   * Removes a single asset from the in-memory resource store.
   *
   * If a fetch for this asset is still in flight, the result will be
   * discarded once it arrives rather than written to the store, preventing
   * a stale value from being committed after an explicit unload.
   */
  public unload<T>(asset: Asset<T>): this;
  public unload<M extends Record<string, AssetInput>>(assets: Assets<M>): this;
  public unload(type: Loadable, alias: string): this;
  public unload(arg0: unknown, arg1?: unknown): this {
    if (arg0 instanceof AssetImpl) {
      const asset = arg0 as Asset<unknown>;
      const ctor = this._assetTypeMap.get(asset.kind);

      if (!ctor) return this;

      const identityKey = this._resolveAssetIdentityKey(ctor, asset);
      const aliasSet = this._identityKeyToAliases.get(identityKey);

      if (aliasSet && aliasSet.size > 0) {
        // Snapshot the set because _unloadOne modifies it during iteration
        for (const alias of [...aliasSet]) {
          this._unloadOne(ctor, alias);
        }
      } else {
        // Asset was loaded without alias-map tracking (e.g. single-asset load).
        // Fall back to using the source as the alias.
        this._unloadOne(ctor, asset._config.source);
      }

      return this;
    }

    if (arg0 instanceof AssetsImpl) {
      // Under adoption a catalog no longer maps to legacy alias entries: its
      // leaves are handle-hybrids claimed under the app-lifetime root scope by
      // `get`/`load`. Unloading a catalog therefore RELEASES each leaf's root
      // claim — the last release evicts the payload in place (resource handles
      // heal to 'loading'). A never-adopted leaf has no registered key, so its
      // release is a silent no-op.
      const container = arg0 as AssetsImpl<Record<string, AssetInput>>;

      for (const leaf of Object.values(container.entries)) {
        this.release(leaf as object);
      }

      return this;
    }

    return this._unloadOne(arg0 as Loadable, arg1 as string);
  }

  private _unloadOne(type: Loadable, alias: string): this {
    const ctor = type;
    const aliasKey = this._key(ctor, alias);

    // Snapshot BEFORE the delete: a key whose resource is already stored has a
    // SETTLED fetch — any lingering `_inFlight` entry for it is stale (its
    // `.finally` cleanup microtask has not yet run), not a live fetch. This is
    // the signal that separates a genuine in-flight unload (fail-in-place, keep
    // the handle) from a settled one (forget it, drop the stale entry).
    const hadResource = this._resources.get(ctor)?.has(alias) ?? false;

    this._resources.get(ctor)?.delete(alias);

    // A genuine in-flight fetch (not yet stored) is prevented from writing its
    // result once it arrives, so a deferred handle fails in place instead of
    // silently resurrecting the asset.
    const identityKey = this._aliasKeyToIdentityKey.get(aliasKey);
    const liveFetch = !hadResource && (this._inFlight.has(aliasKey) || (identityKey !== undefined && this._inFlightByIdentity.has(identityKey)));
    if (liveFetch) {
      this._preventStoreKeys.add(aliasKey);
    }

    // Clean up alias ↔ identity tracking
    if (identityKey !== undefined) {
      this._aliasKeyToIdentityKey.delete(aliasKey);
      const aliasSet = this._identityKeyToAliases.get(identityKey);
      if (aliasSet) {
        aliasSet.delete(alias);
        if (aliasSet.size === 0) {
          this._identityKeyToAliases.delete(identityKey);
        }
      }
    }

    this._forgetKey(aliasKey, liveFetch);

    return this;
  }

  /**
   * Removes loaded assets from the in-memory store.
   *
   * If `type` is provided, only that type's assets are cleared; otherwise all
   * types are flushed. Does not cancel in-flight fetches — but, like
   * {@link unload}, it forgets each key's claim/handle bookkeeping so repeated
   * load→unloadAll cycles cannot accumulate stale entries (A3).
   */
  public unloadAll(type?: Loadable): this {
    if (type) {
      // Route every stored alias — and any claim-tracked key of this type that
      // never reached _resources (in-flight / deferred-only) — through
      // _unloadOne so the claim/handle maps are cleared, not just _resources.
      const aliases = new Set<string>(this._resources.get(type)?.keys());

      for (const [, entry] of this._claims) {
        if (entry.type === type) aliases.add(entry.source);
      }

      for (const alias of aliases) {
        this._unloadOne(type, alias);
      }

      return this;
    }

    // Global reset. Snapshot the keys with a stored resource first: their
    // in-flight entries (if any) are stale (resolved-but-uncleaned), so they can
    // be dropped, while a not-yet-stored key with a live `_inFlight` entry is a
    // genuine fetch that must be preserved (its handle fills or fails in place) —
    // honoring "does not cancel in-flight fetches".
    const settledKeys = new Set<string>();
    for (const [ctor, typeMap] of this._resources) {
      for (const alias of typeMap.keys()) settledKeys.add(this._key(ctor, alias));
    }

    for (const typeMap of this._resources.values()) {
      typeMap.clear();
    }

    for (const [key, entry] of this._deferred) {
      if (this._inFlight.has(key) && !settledKeys.has(key)) {
        this._preventStoreKeys.add(key); // genuine in-flight: fail/heal in place on arrival
        continue;
      }

      for (const handle of entry.handles) this._handleKeys.delete(handle);
      this._deferred.delete(key);
      this._inFlight.delete(key);
    }

    for (const [key, entry] of this._refs) {
      if (this._inFlight.has(key) && !settledKeys.has(key)) {
        this._preventStoreKeys.add(key);
        continue;
      }

      for (const ref of entry.refs) this._handleKeys.delete(ref);
      this._refs.delete(key);
      this._inFlight.delete(key);
    }

    // Drop stale in-flight entries for settled keys that had no deferred/ref
    // (e.g. a completed seamless get), so a later same-source get re-fetches
    // instead of deduping onto the resolved-but-uncleaned promise.
    for (const key of settledKeys) {
      this._inFlight.delete(key);
    }

    this._claims.clear();
    this._evicted.clear();
    this._aliasKeyToIdentityKey.clear();
    this._identityKeyToAliases.clear();

    return this;
  }

  /**
   * Drop a key's claim/handle bookkeeping for the legacy `unload`/`unloadAll`
   * verbs — a HARD, global removal, unlike scope-aware {@link release}: it forgets
   * the claim entirely (across every scope) so a stale claim can no longer hold
   * refcount > 0 and keep a key from ever evicting (A3).
   *
   * A key with a genuine `liveFetch` keeps its deferred handle / value-ref so the
   * prevented store can fail it (and a later `get()` heals the SAME handle) — only
   * a SETTLED key's handles are forgotten here, and its stale `_inFlight` entry
   * dropped so a same-source re-get re-fetches rather than deduping onto the
   * resolved promise. @internal
   */
  private _forgetKey(key: string, liveFetch: boolean): void {
    this._claims.delete(key);
    this._evicted.delete(key);

    if (liveFetch) {
      return;
    }

    this._inFlight.delete(key);
    this._preventStoreKeys.delete(key);

    const deferred = this._deferred.get(key);
    if (deferred !== undefined) {
      for (const handle of deferred.handles) this._handleKeys.delete(handle);
      this._deferred.delete(key);
    }

    const refEntry = this._refs.get(key);
    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) this._handleKeys.delete(ref);
      this._refs.delete(key);
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
    return this._basePath;
  }

  public set basePath(value: string) {
    this._basePath = value;
  }

  /**
   * Default `RequestInit` options merged into every `fetch` call.
   * Override per-load with the `options` argument of {@link load}.
   */
  public get fetchOptions(): RequestInit {
    return this._fetchOptions;
  }

  public set fetchOptions(value: RequestInit) {
    this._fetchOptions = value;
  }

  // -----------------------------------------------------------------------
  // Extension binding — @internal / @advanced
  // -----------------------------------------------------------------------

  /**
   * Atomically bind all keys for one AssetBinding to a pre-created handler.
   * Validates all keys BEFORE mutating any map. Any already-registered key
   * throws before any mutation (no override in 0.12).
   *
   * `Result` and `Options` are inferred from the binding's `AssetBinding<Result, Options>`
   * contract. A declarative handler's optional `getIdentityKey` is forwarded into
   * the internal {@link HandlerEntry} so it participates in in-flight deduplication.
   * @internal
   */
  public bindAsset<Result = unknown, Options = undefined>(
    keys: { type: AssetConstructor<Result>; typeNames?: readonly string[]; extensions?: readonly string[]; seamless?: SeamlessAdapter<Result> },
    handler: AssetHandler<Result, Options>,
  ): void {
    const normalizedExts: string[] = [];
    const resolvedNames: string[] = keys.typeNames !== undefined ? [...keys.typeNames] : [];

    // Normalise extension keys
    for (const ext of keys.extensions ?? []) {
      normalizedExts.push(ext.replace(/^\./, '').toLowerCase());
    }

    // Validate: detect duplicates within this binding
    const seenExts = new Set<string>();

    for (const ext of normalizedExts) {
      if (seenExts.has(ext)) {
        throw new Error(`Duplicate extension key ".${ext}" within a single asset binding.`);
      }

      seenExts.add(ext);
    }

    // Validate: detect conflicts with already-registered keys — throw before any mutation
    if (this._handlerFunctions.has(keys.type)) {
      throw new Error(`An asset handler is already registered for ${keys.type.name}.`);
    }

    for (const name of resolvedNames) {
      if (this._assetTypeMap.has(name)) {
        throw new Error(`Asset type name "${name}" is already registered.`);
      }
    }

    for (const ext of normalizedExts) {
      if (this._extensionMap.has(ext)) {
        throw new Error(`File extension ".${ext}" is already mapped to an asset type.`);
      }
    }

    // All validation passed — install atomically.
    //
    // Localized type-erasure boundary: the internal Loader uses a flat config
    // `{ source, ...fields }`. The public AssetHandler<Result, Options> interface
    // uses `AssetLoadRequest<Options> = { source, options? }`. This single `toRequest`
    // helper is the only place where the erased flat config is cast to the typed
    // request — justified by the `AssetBinding<Result, Options>` contract that
    // associates this handler's Options with the registered constructor.
    //
    // `options` is intentionally omitted (not set to `undefined`) when the flat
    // config carries no extra fields, keeping the object compatible with a future
    // `exactOptionalPropertyTypes` migration.
    const toRequest = (config: unknown): AssetLoadRequest<Options> => {
      const { source, ...rest } = config as { source: string } & Record<string, unknown>;

      if (Object.keys(rest).length === 0) {
        return { source };
      }

      return { source, options: rest as Options };
    };

    const boundIdentityKey = handler.getIdentityKey?.bind(handler);
    const boundCreateFromBytes = handler.createFromBytes?.bind(handler);

    this._handlerFunctions.set(keys.type, {
      load: (config, ctx) => handler.load(toRequest(config), ctx),
      ...(boundIdentityKey && { getIdentityKey: (config: unknown) => boundIdentityKey(toRequest(config)) }),
      ...(boundCreateFromBytes && { createFromBytes: (bytes: ArrayBuffer, options?: unknown) => boundCreateFromBytes(bytes, options as Options) }),
    });

    for (const name of resolvedNames) {
      this._assetTypeMap.set(name, keys.type);
    }

    for (const ext of normalizedExts) {
      this._extensionMap.set(ext, keys.type);
    }

    // Own this handler for lifecycle management.
    // Cast to the erased AssetHandler for storage; destroy() is the only method
    // called on entries in this array.
    this._boundHandlers.push(handler as AssetHandler);

    if (keys.seamless !== undefined) {
      this.registerSeamlessAdapter(keys.type, keys.seamless);
    }
  }

  /**
   * Returns true if a handler or factory is already registered for the given constructor.
   * @advanced
   */
  public hasLoadable(type: AssetConstructor): boolean {
    return this._handlerFunctions.has(type) || this._registry.has(type);
  }

  /**
   * Returns true if a type-name mapping is already registered.
   * @advanced
   */
  public hasAssetType(typeName: string): boolean {
    return this._assetTypeMap.has(typeName);
  }

  /**
   * Returns true if a file extension is already mapped to an asset type.
   * Extension is normalised (leading dot stripped, lower-cased).
   * @advanced
   */
  public hasExtension(ext: string): boolean {
    return this._extensionMap.has(ext.replace(/^\./, '').toLowerCase());
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Tears down the loader and all resources it owns.
   *
   * Destroys the factory registry (releasing object URLs), destroys every
   * cache store, clears all in-memory assets and in-flight tracking, and
   * disconnects all signals. Also calls `destroy?.()` on every handler
   * registered via `bindAsset`.
   */
  public destroy(): void {
    this._registry.destroy();

    for (const store of this._stores) {
      store.destroy();
    }

    // Call destroy on all bound handlers (deduplicated by identity)
    const destroyedHandlers = new Set<AssetHandler>();

    for (const handler of this._boundHandlers) {
      if (!destroyedHandlers.has(handler)) {
        destroyedHandlers.add(handler);
        handler.destroy?.();
      }
    }

    this._boundHandlers.length = 0;
    this._resources.clear();
    this._inFlight.clear();
    this._preventStoreKeys.clear();
    this._inFlightByIdentity.clear();
    this._aliasKeyToIdentityKey.clear();
    this._identityKeyToAliases.clear();
    this._handlerFunctions.clear();
    this._deferred.clear();
    this._refs.clear();
    this._seamlessAdapters.clear();
    this._backgroundQueue.length = 0;
    this.onProgress.destroy();
    this.onLoaded.destroy();
    this.onError.destroy();
    this.onLoadStart.destroy();
    this.onLoadProgress.destroy();
    this.onLoadComplete.destroy();
    this.onLoadError.destroy();
  }

  // -----------------------------------------------------------------------
  // Internal — loading
  // -----------------------------------------------------------------------

  /**
   * Adopt an externally-created handle-hybrid leaf (from `Assets.from()`) into
   * this loader: register it as the deferred/ref handle under its normalized
   * key, claim it under `claimer`, and drive the fetch. The existing fill site
   * ({@link _storeResource}) transplants the fetched payload into this exact
   * object, so every consumer that already holds the leaf pops in. Idempotent
   * for a handle already adopted under the same key (no duplicate fetch).
   *
   * With `background`, the leaf is still registered + claimed + healed in place,
   * but its fetch is diverted into the low-priority background queue (see
   * {@link _enqueueBackgroundFetch}) instead of started immediately —
   * `load(target, { background: true })`.
   * @internal
   */
  public _adopt(handle: object, claimer: symbol, background = false): void {
    const meta = _readMeta(handle);

    if (meta === undefined) {
      throw new Error('Loader._adopt: value is not an Assets.from() leaf (no assetMeta).');
    }

    const ctor = this._assetTypeMap.get(meta.kind);

    if (ctor === undefined) {
      throw new Error(`Loader._adopt: no constructor registered for kind "${meta.kind}".`);
    }

    // A freshly-created catalog leaf is 'idle' until adopted; entering the loader
    // here transitions it to 'loading' (asset-system v2 §7). A re-adopted handle
    // already loading/ready/failed is left untouched.
    const leafState = (handle as { _loadState?: { value: string; begin(): void } })._loadState;
    if (leafState?.value === 'idle') leafState.begin();

    const key = this._key(ctor, meta.src);

    if (handle instanceof AssetRef) {
      const existingRef = this._refs.get(key);
      const stored = this._resources.get(ctor)?.get(meta.src);

      if (existingRef === undefined) {
        this._refs.set(key, { refs: new Set([handle]), options: meta.opts });
        this._handleKeys.set(handle, key);

        // Mirrors _getRef's stored-fast-path: a value already sitting in
        // `_resources` (stored elsewhere before this leaf was adopted) fills
        // this ref immediately instead of leaving it 'loading' forever.
        if (stored !== undefined) {
          handle._fill(stored);
        } else if (background) {
          this._enqueueBackgroundFetch(ctor, meta.src, meta.opts);
        } else {
          this._startRefFetch(ctor, meta.src, meta.opts);
        }
      } else if (!existingRef.refs.has(handle)) {
        // A distinct ref for a key already in flight (or already stored): join
        // the key's ref set so the single fetch fills it too (§7 multi-handle
        // fill). If the value already converged, fill immediately; otherwise a
        // conflicting FETCH option (source-keyed decode can't differ) warns.
        existingRef.refs.add(handle);
        this._handleKeys.set(handle, key);

        if (stored !== undefined) {
          handle._fill(stored);
        } else {
          this._warnOnFetchOptionConflict(ctor, meta.src, key, existingRef.options, meta.opts);
        }
      }
      // else: the SAME ref re-adopted — Set membership makes this a no-op.

      this._claim(key, ctor, meta.src, claimer);

      return;
    }

    const deferredEntry = this._deferred.get(key);
    const stored = this._resources.get(ctor)?.get(meta.src);

    if (deferredEntry === undefined && stored === undefined) {
      this._deferred.set(key, { handles: new Set([handle]), options: meta.opts });
      this._handleKeys.set(handle, key);
      this._claim(key, ctor, meta.src, claimer);

      if (background) {
        this._enqueueBackgroundFetch(ctor, meta.src, meta.opts);
      } else {
        this._startSeamlessFetch(ctor, meta.src, meta.opts);
      }

      return;
    }

    if (stored !== undefined && this._handleKeys.get(handle) !== key) {
      // Already stored for this key (e.g. loaded elsewhere before this leaf was
      // adopted — the core catalog scenario) and this exact handle has not been
      // filled/registered yet: transplant the stored donor into THIS handle in
      // place (per-catalog identity — do NOT swap to the stored object; the
      // caller already holds this leaf) and register it so `release(handle)`
      // can resolve its key.
      //
      // §7 remainder: this co-handle fills once from the stored payload but is
      // NOT entered into the (already-cleared) deferred set, so a LATER
      // evict+heal of this key will not touch it (it keeps the stale payload).
      // Weak-retention over the full lifetime is the §7 follow-up; out of scope.
      const adapter = this._seamlessAdapters.get(ctor);

      adapter?.fill(handle, stored);
      this._handleKeys.set(handle, key);
    } else if (deferredEntry !== undefined && stored === undefined && !deferredEntry.handles.has(handle)) {
      // A distinct handle is in flight for this key and nothing is stored yet:
      // join the key's handle set so `_storeResource` fills THIS handle too
      // (§7 multi-handle fill — this is the former silent hang). A conflicting
      // FETCH option (source-keyed decode can't differ) warns; differing
      // per-handle sampler options are fine (each handle carries its own).
      deferredEntry.handles.add(handle);
      this._handleKeys.set(handle, key);
      this._warnOnFetchOptionConflict(ctor, meta.src, key, deferredEntry.options, meta.opts);
    }
    // else: the SAME handle re-adopted, or already filled — a no-op.

    this._claim(key, ctor, meta.src, claimer);
  }

  /**
   * Seamless single-source resolution: an already-stored asset, an existing
   * deferred handle (retried in place when `'failed'`), or a fresh
   * placeholder whose fetch starts now.
   */
  private _getSeamless(type: AssetConstructor, adapter: SeamlessAdapter<unknown>, source: string, options?: unknown): unknown {
    const stored = this._resources.get(type)?.get(source);

    if (stored !== undefined) {
      return stored;
    }

    const key = this._key(type, source);
    const entry = this._deferred.get(key);

    if (entry !== undefined) {
      // get() reuses the representative handle (first-wins); only a conflicting
      // FETCH option warns — per-handle sampler/pre-size differences are fine.
      this._warnOnFetchOptionConflict(type, source, key, entry.options, options);

      const representative = this._representative(entry.handles);

      if (representative !== undefined) {
        if (adapter.stateOf(representative) === 'failed') {
          adapter.begin(representative);
          this._startSeamlessFetch(type, source, entry.options);
        } else {
          // A background-adopted source (`load(catalog, { background: true })`)
          // is registered here yet still parked in the queue; a direct get()
          // promotes it to fetch now. No-op when the source is not queued.
          this._boostFromQueue(type, source);
        }

        return representative;
      }
      // else: the handle set is (unexpectedly) empty — fall through and treat
      // this as no live handle, creating a fresh placeholder below.
    }

    // Bake the raw `get()` options into the placeholder so a bare `get()`
    // renders with the requested sampler options instead of the default.
    const handle = adapter.createPlaceholder(options);

    this._deferred.set(key, { handles: new Set([handle as object]), options });
    this._handleKeys.set(handle as object, key);
    this._startSeamlessFetch(type, source, options);

    return handle;
  }

  /**
   * Start (or on retry, restart) the fetch backing a deferred handle or value
   * ref. Failure handling (adapter/ref fail + onError) lives centrally in
   * {@link _onTrackedFailure}; the catch here only silences the void'd rejection.
   */
  private _startSeamlessFetch(type: AssetConstructor, source: string, options: unknown): void {
    void this._loadSingle(type, source, options).catch(() => {
      /* Failure handled centrally in _onTrackedFailure. */
    });
  }

  /** Value-asset twin of {@link _getSeamless}: stable ref, options first-wins, retry-on-failed. */
  private _getRef(type: AssetConstructor, source: string, options?: unknown): AssetRef<unknown> {
    const key = this._key(type, source);
    const entry = this._refs.get(key);

    if (entry !== undefined) {
      // get() reuses the representative ref (first-wins); only a conflicting
      // FETCH option warns.
      this._warnOnFetchOptionConflict(type, source, key, entry.options, options);

      const representative = this._representative(entry.refs);

      if (representative !== undefined) {
        if (representative.loadState === 'failed') {
          representative._begin();
          this._startRefFetch(type, source, entry.options);
        } else {
          // A background-adopted value ref parked in the queue is boosted to
          // fetch now on a direct get(). No-op when the source is not queued.
          this._boostFromQueue(type, source);
        }

        return representative;
      }
    }

    const ref = new AssetRef<unknown>();

    this._refs.set(key, { refs: new Set([ref]), options });
    this._handleKeys.set(ref, key);

    const stored = this._resources.get(type)?.get(source);

    if (stored !== undefined) {
      ref._fill(stored);

      return ref;
    }

    this._startRefFetch(type, source, options);

    return ref;
  }

  /** Start (or restart) the fetch backing a value ref; the fill happens in
   *  {@link _storeResource} and failure handling in {@link _onTrackedFailure}. */
  private _startRefFetch(type: AssetConstructor, source: string, options: unknown): void {
    void this._loadSingle(type, source, options).catch(() => {
      /* Failure handled centrally in _onTrackedFailure. */
    });
  }

  /**
   * Divert an adopted leaf's fetch into the low-priority background queue
   * (the `background: true` path of {@link _adopt}). The leaf is already
   * registered in `_deferred`/`_refs` and claimed, so the fetch — whenever the
   * queue drains it, or a `get()` boosts it — fills that same handle in place
   * via {@link _storeResource}. A fresh progress batch starts only while idle,
   * and the drain kicks the concurrency-capped processor.
   */
  private _enqueueBackgroundFetch(type: AssetConstructor, source: string, options: unknown): void {
    if (this._hasResource(type, source)) return;
    if (this._inFlight.has(this._key(type, source))) return;
    if (this._isQueuedInBackground(type, source)) return;

    if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
      this._backgroundLoaded = 0;
      this._backgroundTotal = 0;
    }

    this._backgroundQueue.push({ type, alias: source, path: source, options });
    this._backgroundTotal++;
    this._drainBackground();
  }

  /**
   * Register a claim on a resource key under a claim scope (idempotent per
   * scope). On an evicted key, kick a re-fetch into the existing, already
   * re-armed handle so every dangling consumer heals in place.
   * @internal
   */
  public _claim(key: string, type: AssetConstructor, source: string, claimer: symbol): void {
    let entry = this._claims.get(key);

    if (entry === undefined) {
      entry = { scopes: new Set<symbol>(), type, source };
      this._claims.set(key, entry);
    }

    entry.scopes.add(claimer);

    if (this._evicted.has(key)) {
      this._evicted.delete(key);

      // The handle was re-armed to 'loading' during eviction; just re-drive the fetch.
      if (this._seamlessAdapters.has(type)) {
        this._startSeamlessFetch(type, source, this._deferred.get(key)?.options);
      }
    }
  }

  /**
   * Drop a claim scope from a key; when the last scope releases, evict the
   * payload immediately (refcount 0).
   * @internal
   */
  public _release(key: string, claimer: symbol): void {
    const entry = this._claims.get(key);

    if (entry === undefined) {
      return;
    }

    entry.scopes.delete(claimer);

    if (entry.scopes.size === 0) {
      this._claims.delete(key);
      this._evictKey(key, entry.type, entry.source);
    }
  }

  /**
   * Release every claim held under a claim scope (a scene unloading its
   * scene-private assets). Collect the held keys first, then release — `_release`
   * mutates `_claims`, so we must not delete during iteration.
   * @internal
   */
  public _releaseScope(claimer: symbol): void {
    const held: string[] = [];

    for (const [key, entry] of this._claims) {
      if (entry.scopes.has(claimer)) {
        held.push(key);
      }
    }

    for (const key of held) {
      this._release(key, claimer);
    }
  }

  /**
   * Free a key's payload while keeping its handle identity: find the handle
   * (post-fill in `_resources`, or in-flight in `_deferred`), adapter-evict it
   * (drops payload + re-arms to 'loading'), remove the stored resource, and
   * re-register the handle in `_deferred` so the next claim heals in place.
   * Also drops a not-yet-started background-queue entry. Seamless payloads only
   * this slice — value-ref eviction is an accepted gap (§6 follow-up).
   * @internal
   */
  private _evictKey(key: string, type: AssetConstructor, source: string): void {
    const adapter = this._seamlessAdapters.get(type);
    // A still-deferred handle means the fetch is in flight and has not filled
    // yet: leave it to the running fetch (which completes and fills the — now
    // unclaimed — handle; §4.7 minimal). Only a payload that already converged
    // into `_resources` is dropped in place here.
    const deferred = this._deferred.get(key);
    const handle = this._representative(deferred?.handles) ?? this._resources.get(type)?.get(source);

    if (adapter !== undefined && deferred === undefined && handle !== undefined) {
      adapter.evict(handle);
      this._resources.get(type)?.delete(source);
      // The original options were consumed when the payload converged into
      // `_resources` (the pre-fill `_deferred` entry is gone); the re-fetch
      // re-derives them from the manifest entry, if any. Only the canonical
      // representative is re-armed here — co-handles filled alongside it keep
      // their payload (the §7 remainder gap).
      this._deferred.set(key, { handles: new Set([handle as object]), options: undefined });
      this._handleKeys.set(handle as object, key);
      this._evicted.add(key);
      // A load that just settled may leave a resolved-but-not-yet-cleaned
      // in-flight entry (its `.finally` cleanup is a pending microtask). Drop it
      // so the reclaim's re-fetch starts fresh instead of deduping onto that
      // stale resolved promise, which would never re-fill the re-armed handle.
      // The reclaim's fresh entry is protected from this stale `.finally` by the
      // self-entry identity guard in `_trackInFlight`.
      this._inFlight.delete(key);
    }

    // Drop a not-yet-started background entry (only possible while still queued;
    // once _startBackgroundEntry ran it is in _inFlight and cannot be cancelled).
    const queued = this._backgroundQueue.findIndex(entry => this._key(entry.type, entry.alias) === key);

    if (queued !== -1) {
      this._backgroundQueue.splice(queued, 1);
    }
  }

  private async _loadSingle(type: AssetConstructor, alias: string, options?: unknown, explicitPath?: string): Promise<unknown> {
    if (this._hasResource(type, alias)) {
      const typeMap = this._resources.get(type);
      if (typeMap?.has(alias) === true) {
        return typeMap.get(alias);
      }
    }

    const key = this._key(type, alias);

    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    this._boostFromQueue(type, alias);

    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    const path = explicitPath ?? alias;

    return this._trackInFlight(type, alias, this._dispatchFetch(type, alias, path, options));
  }

  private _createLoadingQueue<T>(
    claimer: symbol,
    items: Array<{ alias: string; asset: Asset<unknown> }>,
    buildResult: (results: Map<string, unknown>) => T,
  ): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    let notifyFn: ((success: boolean) => void) | null = null;

    const itemPromises = items.map(({ alias, asset }) => {
      this._onFgBatchStart(alias, asset.source);
      const ctor = this._assetTypeMap.get(asset.kind);

      if (!ctor) {
        // Must call _notifyItem(false) so LoadingProgress doesn't remain stuck.
        return Promise.reject<unknown>(
          new Error(`No constructor registered for asset type "${asset.kind}". Bind it via defineAsset()/bindAsset() first.`),
        ).then(
          () => {
            notifyFn?.(true);
          },
          error => {
            notifyFn?.(false);
            this._onFgBatchSettled(alias, false, this._normalizeError(error));
            throw error;
          },
        );
      }

      this._claim(this._key(ctor, alias), ctor, alias, claimer);

      return this._loadSingleAsset(ctor, alias, asset).then(
        resource => {
          results.set(alias, resource);
          notifyFn?.(true);
          this._onFgBatchSettled(alias, true);
        },
        error => {
          notifyFn?.(false);
          this._onFgBatchSettled(alias, false, this._normalizeError(error));
          throw error;
        },
      );
    });

    const promise = Promise.all(itemPromises).then(() => buildResult(results));

    const queue = new LoadingQueue<T>(promise, items.length);
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
   * claimed each key. `buildResult` shapes the resolved values into the return.
   * @internal
   */
  private _createAdoptedQueue<T>(entries: Array<[string, object]>, buildResult: (results: Map<string, unknown>) => T): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    let notifyFn: ((success: boolean) => void) | null = null;

    const itemPromises = entries.map(([alias, leaf]) => {
      const src = _readMeta(leaf)?.src ?? alias;
      this._onFgBatchStart(alias, src);
      const loaded = (leaf as { loaded: Promise<unknown> }).loaded;

      return loaded.then(
        value => {
          results.set(alias, value);
          notifyFn?.(true);
          this._onFgBatchSettled(alias, true);
        },
        error => {
          notifyFn?.(false);
          this._onFgBatchSettled(alias, false, this._normalizeError(error));
          throw error;
        },
      );
    });

    const promise = Promise.all(itemPromises).then(() => buildResult(results));

    const queue = new LoadingQueue<T>(promise, entries.length);
    notifyFn = queue._notifyItem.bind(queue);

    return queue;
  }

  /**
   * Loads a single asset from an `Asset<T>` reference using identity-based
   * in-flight deduplication.
   *
   * Multiple aliases that point to the same source share a single network
   * fetch.  Each alias is stored independently in `_resources` so that
   * `get(type, alias)` works for all of them.
   */
  private async _loadSingleAsset(type: AssetConstructor, alias: string, asset: Asset<unknown>): Promise<unknown> {
    if (this._hasResource(type, alias)) {
      return this._resources.get(type)?.get(alias);
    }

    const source = asset.source;
    const rawConfig = asset._config as Record<string, unknown>;
    const { kind: _kind, source: _src, ...extraOnly } = rawConfig;

    // Identity key: use handler's getIdentityKey if provided (config-sensitive dedup),
    // otherwise fall back to source-based identity (correct for URL-only assets).
    const handlerEntry = this._handlerFunctions.get(type);
    const discriminator = handlerEntry?.getIdentityKey?.(rawConfig) ?? source;
    const identityKey = `id:${this._getTypeId(type)}:${discriminator}`;
    const aliasKey = this._key(type, alias);

    // Register alias → identity mapping for unload() semantics
    this._aliasKeyToIdentityKey.set(aliasKey, identityKey);
    let aliasSet = this._identityKeyToAliases.get(identityKey);
    if (!aliasSet) {
      aliasSet = new Set<string>();
      this._identityKeyToAliases.set(identityKey, aliasSet);
    }
    aliasSet.add(alias);

    // Same identity already in flight? Attach to the existing promise.
    const existing = this._inFlightByIdentity.get(identityKey);
    if (existing) {
      return existing.then(resource => this._storeResource(type, alias, resource));
    }

    // Build load promise.
    let fetchPromise: Promise<unknown>;
    if (handlerEntry) {
      const fullConfig = { source, ...extraOnly };
      const context = this._buildHandlerContext(identityKey);
      fetchPromise = this._fetchWithHandler(type, alias, source, fullConfig, handlerEntry.load, context);
    } else {
      const options = Object.keys(extraOnly).length > 0 ? extraOnly : undefined;
      fetchPromise = this._fetch(type, alias, source, options);
    }

    const tracked: Promise<unknown> = fetchPromise
      .finally(() => {
        this._inFlightByIdentity.delete(identityKey);
      })
      .then(
        v => v,
        error => {
          // On failure, immediately clean up alias ↔ identity tracking so
          // stale entries don't accumulate for assets that never loaded.
          const failedAliases = this._identityKeyToAliases.get(identityKey);
          if (failedAliases) {
            for (const fa of failedAliases) {
              const faKey = this._key(type, fa);
              this._aliasKeyToIdentityKey.delete(faKey);
              this._preventStoreKeys.delete(faKey);
            }
            this._identityKeyToAliases.delete(identityKey);
          }
          throw error;
        },
      );

    this._inFlightByIdentity.set(identityKey, tracked);
    return tracked;
  }

  /**
   * Calls a handler-based custom asset loader and stores the result.
   *
   * Unlike `_fetch`, this does NOT automatically bypass caching — the handler
   * controls caching by calling `context.fetchText` / `context.fetchArrayBuffer`
   * / `context.fetchJson`, which route through the loader's cache strategy.
   */
  private async _fetchWithHandler(
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

  /**
   * Builds an {@link AssetLoaderContext} for a handler invocation.
   *
   * The `fetch*` helpers on the returned context route through the loader's
   * configured cache strategy and IDB stores, using `source` as the IDB key
   * (so the same URL is never fetched twice regardless of the asset alias).
   */
  private _buildHandlerContext(identityKey: string): AssetLoaderContext {
    const ctx: AssetLoaderContext = {
      loader: this,
      identityKey,
      fetchText: (source: string) => this._contextFetch<string>(source, '__ctx_text', r => r.text()),
      fetchArrayBuffer: (source: string) => this._contextFetch<ArrayBuffer>(source, '__ctx_binary', r => r.arrayBuffer()),
      fetchJson: <T = unknown>(source: string) => this._contextFetch<T>(source, '__ctx_json', r => r.json() as Promise<T>),
    };
    return ctx;
  }

  /**
   * Fetches `source` through the loader's cache strategy with an inline
   * pass-through factory, using `source` as the IDB key.
   *
   * `process` converts the raw `Response` to the storable intermediate form
   * (e.g. `r.text()`, `r.arrayBuffer()`, `r.json()`).  `create` is always the
   * identity function — the cached value is returned unchanged.
   */
  private _contextFetch<T>(source: string, storageName: string, process: (response: Response) => Promise<T>): Promise<T> {
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
   * Construct an asset from in-memory `bytes` (no fetch) and store it under
   * `alias`. Uses the type's {@link AssetHandler.createFromBytes} when present,
   * otherwise a `register()`-style factory; throws if neither can build from
   * bytes. The backing path for {@link loadContainer}.
   */
  private async _injectSource(type: AssetConstructor, alias: string, bytes: ArrayBuffer, options?: unknown): Promise<void> {
    const handlerEntry = this._handlerFunctions.get(type);
    let resource: unknown;

    if (handlerEntry?.createFromBytes) {
      resource = await handlerEntry.createFromBytes(bytes, options);
    } else if (this._registry.has(type)) {
      resource = await this._registry.resolve(type).create(bytes, options);
    } else {
      throw new Error(`Asset type "${type.name}" cannot be built from container bytes (no createFromBytes handler).`);
    }

    this._storeResource(type, alias, resource);
  }

  /**
   * Dispatches a load through the `bindAsset` handler path if one is
   * registered for `type`, otherwise through the plain `register()`-based
   * {@link _fetch}. Shared by the foreground ({@link _loadSingle}) and
   * background ({@link _startBackgroundEntry}) fetch dispatchers so both
   * honor `bindAsset` handlers identically.
   */
  private _dispatchFetch(type: AssetConstructor, alias: string, path: string, options?: unknown): Promise<unknown> {
    const handlerEntry = this._handlerFunctions.get(type);

    if (!handlerEntry) {
      return this._fetch(type, alias, path, options);
    }

    const identityKey = this._identityKey(type, path);
    const config: Record<string, unknown> = { source: path };

    if (options !== null && options !== undefined && typeof options === 'object') {
      Object.assign(config, options as Record<string, unknown>);
    }

    const context = this._buildHandlerContext(identityKey);

    return this._fetchWithHandler(type, alias, path, config, handlerEntry.load, context);
  }

  private async _fetch(type: AssetConstructor, alias: string, path: string, options?: unknown): Promise<unknown> {
    const factory = this._registry.resolve(type);
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

  // -----------------------------------------------------------------------
  // Internal — foreground batch tracking
  // -----------------------------------------------------------------------

  private _onFgBatchStart(key: string, url: string): void {
    if (this._fgBatchActive === 0) {
      this._fgBatchLoaded = 0;
    }

    this._fgBatchActive++;
    this._fgBatchTotal++;

    if (this._fgBatchActive === 1) {
      this.onLoadStart.dispatch(key, url);
    }
  }

  private _onFgBatchSettled(key: string, success: boolean, error?: Error): void {
    if (success) {
      this._fgBatchLoaded++;
    } else if (error !== undefined) {
      this.onLoadError.dispatch(key, error);
    }

    this._fgBatchActive--;
    this.onLoadProgress.dispatch(this._fgBatchLoaded, this._fgBatchTotal, key);

    if (this._fgBatchActive === 0) {
      this._fgBatchTotal = 0;
      this.onLoadComplete.dispatch();
    }
  }

  // -----------------------------------------------------------------------
  // Internal — background queue
  // -----------------------------------------------------------------------

  private _drainBackground(): void {
    while (this._backgroundActive < this._concurrency && this._backgroundQueue.length > 0) {
      const entry = this._backgroundQueue.shift();
      if (!entry) {
        continue;
      }
      const key = this._key(entry.type, entry.alias);

      if (this._hasResource(entry.type, entry.alias) || this._inFlight.has(key)) {
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        continue;
      }

      this._startBackgroundEntry(entry);
    }
  }

  private _boostFromQueue(type: AssetConstructor, alias: string): void {
    const index = this._backgroundQueue.findIndex(e => e.type === type && e.alias === alias);

    if (index === -1) return;

    const [entry] = this._backgroundQueue.splice(index, 1);
    if (entry === undefined) return;

    this._startBackgroundEntry(entry);
  }

  private _isQueuedInBackground(type: AssetConstructor, alias: string): boolean {
    return this._backgroundQueue.some(entry => entry.type === type && entry.alias === alias);
  }

  private _onBackgroundItemDone(): void {
    this.onProgress.dispatch(this._backgroundLoaded, this._backgroundTotal);

    if (this._backgroundResolve && this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
      const resolve = this._backgroundResolve;

      this._backgroundResolve = null;
      resolve();
    }
  }

  private _startBackgroundEntry(entry: QueueEntry): void {
    this._backgroundActive++;

    this._trackInFlight(entry.type, entry.alias, this._dispatchFetch(entry.type, entry.alias, entry.path, entry.options))
      .catch(error => {
        const err = this._normalizeError(error);
        const key2 = this._key(entry.type, entry.alias);

        if (!this._deferred.has(key2) && !this._refs.has(key2)) {
          this.onError.dispatch(entry.type, entry.alias, err);
        }
      })
      .finally(() => {
        this._backgroundActive--;
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        this._drainBackground();
      });
  }

  private _trackInFlight(type: AssetConstructor, alias: string, promise: Promise<unknown>): Promise<unknown> {
    const key = this._key(type, alias);
    const trackedPromise = promise.finally(() => {
      // Clear only our OWN entry: a superseding load (e.g. a reclaim re-fetch
      // after an eviction dropped and re-added this key) may already own the
      // slot. Deleting it unconditionally would un-dedup a concurrent load and
      // let a second fetch overwrite the healed handle with its raw donor.
      if (this._inFlight.get(key) === trackedPromise) {
        this._inFlight.delete(key);
      }

      this._preventStoreKeys.delete(key);
    });

    // Non-swallowing observer: fails deferred handles / value refs (fresh
    // error each attempt) and dispatches onError for entry-backed fetches —
    // regardless of which verb (get/load/background) started the attempt.
    trackedPromise.catch((error: unknown) => this._onTrackedFailure(type, alias, key, error));
    this._inFlight.set(key, trackedPromise);

    return trackedPromise;
  }

  private _onTrackedFailure(type: AssetConstructor, alias: string, key: string, error: unknown): void {
    const err = this._normalizeError(error);
    const deferredEntry = this._deferred.get(key);

    if (deferredEntry !== undefined) {
      const adapter = this._seamlessAdapters.get(type);

      // Fail EVERY in-flight handle for the key so all co-adopters settle.
      for (const handle of deferredEntry.handles) {
        adapter?.fail(handle, err);
      }

      this._warnMissingSource(alias, key, err);
      this.onError.dispatch(type, alias, err);

      return;
    }

    const refEntry = this._refs.get(key);

    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) {
        ref._fail(err);
      }

      this._warnMissingSource(alias, key, err);
      this.onError.dispatch(type, alias, err);
    }
  }

  /**
   * Dev-only diagnostic for the seamless silent-404 trap (F7 / DX-1): a
   * `get('x.png')` / adopted-catalog / `Assets.from(...)` leaf whose fetch ends
   * in a 404 or network error only ever surfaces a `'failed'` placeholder — the
   * caller holds a handle, not the rejection, so a typo'd or un-preloaded source
   * would otherwise 404 completely silently (checkerboard, no message). This
   * warns ONCE per source (keyed on `key`, the type+source pair) naming the
   * literal path and how to fix it. Stripped in production (`logger.warn` below
   * `Error` severity is dropped when `__DEV__` is `false`); the once-dedup means
   * a later retry of the same source never re-warns. Placeholder / heal-in-place
   * behaviour is unchanged — this is purely additive diagnostics.
   *
   * A plain `load('x.png')` failure does NOT reach here (no deferred handle /
   * value-ref is registered for it), so the caller's own rejection stays the
   * single signal. @internal
   */
  private _warnMissingSource(source: string, key: string, error: Error): void {
    logger.warn(
      `Asset "${source}" failed to load: ${error.message} ` +
        `Seamless get()/Assets.from() fetch the literal path and heal a placeholder in place, so a typo or an ` +
        `un-preloaded alias 404s without throwing. Check the path and the loader basePath, and preload it via Assets.from() / load().`,
      { source: 'Loader', once: `loader:missing-source:${key}` },
    );
  }

  /** The representative (first-inserted) member of a handle/ref set, or `undefined` if empty. @internal */
  private _representative<T>(members: ReadonlySet<T> | undefined): T | undefined {
    return members === undefined ? undefined : members.values().next().value;
  }

  /**
   * Warn once per key when a second handle/ref for the same source carries an
   * incompatible FETCH option (e.g. a different `mimeType`): the decode is
   * source-keyed, so only the first call's fetch options take effect and the
   * later one is silently dropped. Per-handle sampler / pre-size options never
   * conflict — each handle carries its own — so they are stripped before the
   * comparison and never warn. A `undefined` second option is a plain reuse.
   * @internal
   */
  private _warnOnFetchOptionConflict(type: AssetConstructor, source: string, key: string, existingOptions: unknown, newOptions: unknown): void {
    if (newOptions === undefined || this._fetchOptionsEquivalent(existingOptions, newOptions)) {
      return;
    }

    logger.warn(`get(${this._describeType(type)}, "${source}"): conflicting options ignored — the first call's options win.`, {
      source: 'Loader',
      once: `loader:seamless-options:${key}`,
    });
  }

  /** Structural equality of the FETCH-relevant option subset (per-handle sampler / pre-size keys stripped). @internal */
  private _fetchOptionsEquivalent(left: unknown, right: unknown): boolean {
    return this._areOptionsEquivalent(this._stripPerHandleOptions(left), this._stripPerHandleOptions(right));
  }

  /** Drop the per-handle option keys (`samplerOptions`, `width`, `height`) that never gate the shared decode. @internal */
  private _stripPerHandleOptions(options: unknown): unknown {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      return options;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
      if (key === 'samplerOptions' || key === 'width' || key === 'height') {
        continue;
      }

      result[key] = value;
    }

    return result;
  }

  private _areOptionsEquivalent(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
      return true;
    }

    if (typeof left !== typeof right) {
      return false;
    }

    if (left === null || right === null) {
      return false;
    }

    if (typeof left !== 'object' || typeof right !== 'object') {
      return false;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
      }

      for (let i = 0; i < left.length; i++) {
        if (!this._areOptionsEquivalent(left[i], right[i])) {
          return false;
        }
      }

      return true;
    }

    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);

    if (leftPrototype !== rightPrototype) {
      return false;
    }

    // Same-prototype instances compare structurally by their own enumerable
    // keys — deeply-equal options of any shared class, not just plain objects,
    // count as equivalent. Built-ins whose state is NOT
    // carried in enumerable own keys need explicit handling: Dates compare by
    // timestamp; other exotic containers stay reference-only (Object.is above)
    // so two distinct-but-similar instances never count as equivalent.
    if (left instanceof Date) {
      return left.getTime() === (right as Date).getTime();
    }

    if (left instanceof Map || left instanceof Set || left instanceof RegExp || left instanceof ArrayBuffer || ArrayBuffer.isView(left)) {
      return false;
    }

    const leftObject = left as Record<string, unknown>;
    const rightObject = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftObject);
    const rightKeys = Object.keys(rightObject);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!Object.hasOwn(rightObject, key)) {
        return false;
      }

      if (!this._areOptionsEquivalent(leftObject[key], rightObject[key])) {
        return false;
      }
    }

    return true;
  }

  private _normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private _describeType(type: AssetConstructor): string {
    return type.name.length > 0 ? type.name : '(anonymous type)';
  }

  private _hasResource(type: AssetConstructor, alias: string): boolean {
    return this._resources.get(type)?.has(alias) ?? false;
  }

  private _storeResource(type: AssetConstructor, alias: string, resource: unknown): unknown {
    const key = this._key(type, alias);

    if (this._preventStoreKeys.delete(key)) {
      // The asset was unloaded while its fetch was in flight. A deferred handle
      // waiting on this key must not stay 'loading' forever: fail it so
      // `.loaded` rejects. The entry stays (like any failed fetch) so a later
      // get() retries and heals the SAME handle in place.
      const preventedEntry = this._deferred.get(key);

      if (preventedEntry !== undefined) {
        const adapter = this._seamlessAdapters.get(type);
        const unloadError = new Error(`Asset "${alias}" was unloaded while its fetch was in flight.`);

        for (const handle of preventedEntry.handles) {
          adapter?.fail(handle, unloadError);
        }
      }

      const preventedRef = this._refs.get(key);

      if (preventedRef !== undefined) {
        for (const ref of preventedRef.refs) {
          if (ref.loadState === 'loading') {
            ref._fail(new Error(`Asset "${alias}" was unloaded while its fetch was in flight.`));
          }
        }
      }

      return resource;
    }

    // Seamless intercept: a deferred handle registered for this (type, source)
    // absorbs the fetched payload in place and becomes the stored resource, so
    // every consumer — get() before or after load(), and load()'s own promise —
    // sees exactly ONE instance per source.
    const deferredEntry = this._deferred.get(key);
    let filledDeferredHandle = false;

    if (deferredEntry !== undefined) {
      const adapter = this._seamlessAdapters.get(type);
      let representative: object | undefined;

      // Fill EVERY in-flight handle for the key from the single decoded donor
      // (§7 multi-handle fill). The first handle is the representative — it
      // becomes the canonical `_resources` entry, mirroring the old
      // single-handle contract (which object is canonical for eviction).
      for (const handle of deferredEntry.handles) {
        representative ??= handle;

        if (handle === resource || adapter === undefined) {
          continue;
        }

        // A non-get producer (load(), bundle, background) may store into a key
        // whose handle is 'failed' (e.g. an earlier get() 404'd). fill() → settle()
        // must run from a re-armed state so `.loaded` re-materializes a resolved
        // promise; without begin() the handle would read 'ready' while its cached
        // `.loaded` stayed permanently rejected. Skip a handle already 'ready'
        // (filled by an earlier producer) — filling twice is a no-op at best.
        const state = adapter.stateOf(handle);

        if (state === 'ready') {
          continue;
        }

        if (state === 'failed') {
          adapter.begin(handle);
        }

        adapter.fill(handle, resource);
      }

      this._deferred.delete(key);

      if (representative !== undefined && representative !== resource) {
        resource = representative;
        filledDeferredHandle = true;
      }
    }

    // Value-asset refs fill from whatever producer stores the value; the raw
    // value stays the stored resource (load() keeps resolving it). Fill every
    // in-flight ref for the key (§7 multi-handle fill).
    const refEntry = this._refs.get(key);

    if (refEntry !== undefined) {
      for (const ref of refEntry.refs) {
        if (ref.loadState !== 'ready') {
          ref._fill(resource);
        }
      }
    }

    let typeResources = this._resources.get(type);
    if (!typeResources) {
      typeResources = new Map();
      this._resources.set(type, typeResources);
    }

    typeResources.set(alias, resource);

    // Record the canonical reverse key (first alias wins) for object resources.
    if (typeof resource === 'object' && resource !== null && !this._resourceKeys.has(resource)) {
      this._resourceKeys.set(resource, { type, source: alias });
    }

    this.onLoaded.dispatch(type, alias, resource);

    // §4.7 free-on-arrival: a deferred handle whose every claimer released
    // during the in-flight fetch has now converged into `_resources` at
    // refcount 0. `.loaded` was already settled by the fill above, so an
    // awaiter holding that promise still resolves (the asset WAS complete);
    // evicting here drops the payload in place (re-arming `.loaded` to
    // 'loading') so it does not linger unclaimed. Gated on an actual deferred
    // fill: a never-claimed bundle/container store (no `_deferred` entry) must
    // persist, not be freed on arrival.
    if (filledDeferredHandle && !this._claims.has(key)) {
      this._evictKey(key, type, alias);
    }

    return resource;
  }

  private _getTypeId(type: AssetConstructor): number {
    let typeId = this._typeIds.get(type);

    if (typeId === undefined) {
      typeId = this._nextTypeId++;
      this._typeIds.set(type, typeId);
    }

    return typeId;
  }

  private _key(type: AssetConstructor, alias: string): string {
    return `${this._getTypeId(type)}:${alias}`;
  }

  private _identityKey(type: AssetConstructor, source: string): string {
    return `id:${this._getTypeId(type)}:${source}`;
  }

  /**
   * Resolves the effective identity key for an `Asset<T>` reference, mirroring
   * the logic used in `_loadSingleAsset`.
   *
   * For handler types with `getIdentityKey`, the config-sensitive discriminator
   * is used; otherwise source is the discriminator (same as `_identityKey`).
   */
  private _resolveAssetIdentityKey(type: AssetConstructor, asset: Asset<unknown>): string {
    const rawConfig = asset._config as Record<string, unknown>;
    const handlerEntry = this._handlerFunctions.get(type);
    const discriminator = handlerEntry?.getIdentityKey?.(rawConfig) ?? asset.source;
    return `id:${this._getTypeId(type)}:${discriminator}`;
  }

  private _resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('/')) {
      return path;
    }

    return `${this._basePath}${path}`;
  }

  /**
   * Resolve the registered asset type for a path by matching the basename's
   * dot-suffixes longest-first (Entscheidung #14): `hero.aseprite.json` tries
   * `aseprite.json` before `json`. Query/hash suffixes are ignored.
   */
  private _resolveExtensionType(path: string): AssetConstructor | undefined {
    const [withoutQueryHash = ''] = path.split(/[?#]/, 1);
    const basename = withoutQueryHash.split('/').pop() ?? '';
    const parts = basename.split('.');

    for (let i = 1; i < parts.length; i++) {
      const ctor = this._extensionMap.get(parts.slice(i).join('.').toLowerCase());

      if (ctor !== undefined) {
        return ctor;
      }
    }

    return undefined;
  }
}
