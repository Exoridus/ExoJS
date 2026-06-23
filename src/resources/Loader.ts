import { Signal } from '#core/Signal';
import type { AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { type BmFont } from '#rendering/text/BmFont';

import { Asset, AssetImpl } from './Asset';
import type { AssetDefinitions, AssetInput, InferAssetResource } from './AssetDefinitions';
import type { AssetFactory } from './AssetFactory';
import type { AssetManifest, LoadBundleOptions } from './AssetManifest';
import { BundleLoadError, defineAssetManifest } from './AssetManifest';
import { type Assets, AssetsImpl } from './Assets';
import { CacheFirstStrategy } from './CacheFirstStrategy';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import type { AssetConstructor } from './FactoryRegistry';
import { FactoryRegistry } from './FactoryRegistry';
import { LoadingQueue } from './LoadingQueue';
import {
  type BinaryAsset,
  type CsvAsset,
  FontAsset,
  type ImageAsset,
  type Json,
  type SubtitleAsset,
  type SvgAsset,
  type TextAsset,
  type WasmAsset,
  type XmlAsset,
} from './tokens';

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
}

type PathExtension<S extends string> = S extends `${string}.${infer E}?${string}` ? Lowercase<E> : S extends `${string}.${infer E}` ? Lowercase<E> : never;

/**
 * Resolves the return type for {@link Loader.load} when called with a plain
 * path string. Returns `unknown` when the extension is not in
 * {@link ExtensionTypeMap} — the string-path overload rejects such paths at
 * compile time; use the token form (`load(MyType, path)`) instead.
 */
export type LoadByPath<S extends string> = PathExtension<S> extends keyof ExtensionTypeMap ? ExtensionTypeMap[PathExtension<S>] : unknown;

/**
 * Additional asset types accepted by the **token form** of {@link Loader.load}
 * (`load(MyType, 'file.ext')`) for a given file extension, beyond the
 * path-only type registered in {@link ExtensionTypeMap}.
 *
 * Augment via declaration merging when a format package ships an advanced
 * source-model token that shares a file extension with its common-case
 * runtime type. The path-only form (`load('file.ext')`) is unaffected and
 * keeps resolving to the {@link ExtensionTypeMap} entry alone:
 * ```ts
 * declare module '@codexo/exojs' {
 *   interface ExtensionTypeMap { tmj: TileMap }       // load('world.tmj') → TileMap
 *   interface ExtensionTokenTypeMap { tmj: TiledMap } // load(TiledMap, 'world.tmj') also allowed
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtensionTokenTypeMap {}

/** Resolves the additional token types allowed for extension `E`, or `never` when none are registered. */
type TokenTypesFor<E> = E extends keyof ExtensionTokenTypeMap ? ExtensionTokenTypeMap[E] : never;

/**
 * Constrains a {@link Loadable} token against the types registered for a
 * given path's extension. When the extension is in {@link ExtensionTypeMap},
 * `T` must produce a value assignable to the registered union (including any
 * extra token types from {@link ExtensionTokenTypeMap}) — otherwise resolves
 * to `never`, triggering a compile-time error.
 *
 * For paths with an unregistered extension — including non-literal `string`
 * paths and extension-less paths, where no extension can be derived — the
 * constraint is skipped and any `T` is accepted (runtime behaviour is
 * unchanged).
 *
 * ```ts
 * // ExtensionTypeMap: { ogg: Sound | Video }
 * loader.load(Sound, 'effect.ogg')      // ✓ Sound ∈ Sound | Video
 * loader.load(BitmapText, 'effect.ogg') // ✗ BitmapText ∉ Sound | Video
 * loader.load(Sound, 'theme.custom')    // ✓ .custom not in map → unconstrained
 * loader.load(Sound, dynamicPath)       // ✓ string path → unconstrained
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConstrainedLoadable<T extends abstract new (...args: any[]) => any, S extends string> = [PathExtension<S>] extends [never]
  ? T
  : PathExtension<S> extends keyof ExtensionTypeMap
    ? LoadReturn<T> extends ExtensionTypeMap[PathExtension<S>] | TokenTypesFor<PathExtension<S>>
      ? T
      : never
    : T;

/**
 * Context object passed to custom asset-type load handlers registered via
 * {@link Loader.registerAssetType}.
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
 * Accepted value types in the homogeneous batch load API.
 *
 * Either a raw source string or a flat config object containing at least
 * `source` plus any type-specific extra fields.
 */
export type BatchValue = string | ({ source: string } & Record<string, unknown>);

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

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  readonly path: string;
  readonly options?: unknown;
}

interface QueueEntry {
  readonly type: AssetConstructor;
  readonly alias: string;
  readonly path: string;
  readonly options?: unknown;
}

/** Stored entry for handler-based {@link Loader.registerAssetType} registrations. */
interface HandlerEntry {
  load: (config: unknown, ctx: AssetLoaderContext) => Promise<unknown>;
  /** Optional discriminator for in-flight identity keying; overrides source-only default. */
  getIdentityKey?: (config: unknown) => string;
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
 * Assets can be loaded in three ways:
 * - **Direct** — `loader.load(Texture, 'hero.png')` fetches immediately and
 *   resolves to the finished asset.
 * - **Bundle** — declare assets in a manifest with {@link registerManifest},
 *   then call {@link loadBundle} to load groups on demand.
 * - **Background** — call {@link backgroundLoad} or {@link loadAll} to
 *   pre-warm everything registered in the manifest at low priority.
 *
 * Once loaded, assets are stored in memory and returned from cache on
 * subsequent `load` or {@link get} calls without re-fetching.
 *
 * @example
 * ```ts
 * const loader = new Loader({ basePath: '/assets/', cache: new IndexedDbStore('game') });
 * const texture = await loader.load(Texture, 'hero.png');
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
  private readonly _manifest = new Map<AssetConstructor, Map<string, ManifestEntry>>();
  private readonly _bundles = new Map<string, readonly QueueEntry[]>();
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
  // Handler entries registered via the handler-based registerAssetType overload
  private readonly _handlerFunctions = new Map<AssetConstructor, HandlerEntry>();
  // Maps lower-case file extensions (without dot) to the constructor to use
  private readonly _extensionMap = new Map<string, AssetConstructor>();

  // Handlers registered via bindAsset — owned for their full lifecycle
  private readonly _boundHandlers: AssetHandler[] = [];

  private _basePath: string;
  private _fetchOptions: RequestInit;
  private _concurrency: number;
  private _nextTypeId = 1;

  private _backgroundQueue: QueueEntry[] = [];
  private _backgroundActive = 0;
  private _backgroundTotal = 0;
  private _backgroundLoaded = 0;
  private _backgroundResolve: (() => void) | null = null;

  /** Dispatched after each background-queue item completes, with the running loaded/total counts. */
  public readonly onProgress = new Signal<[loaded: number, total: number]>();
  /** Dispatched after each asset within a named bundle completes loading. */
  public readonly onBundleProgress = new Signal<[name: string, loaded: number, total: number]>();
  /** Dispatched when any asset finishes loading and is stored in memory. */
  public readonly onLoaded = new Signal<[type: AssetConstructor, alias: string, resource: unknown]>();
  /** Dispatched when an asset fails to load during background or bundle loading. */
  public readonly onError = new Signal<[type: AssetConstructor, alias: string, error: Error]>();

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
   * Associates a string type name with a simple load handler.
   *
   * The handler's `load` method receives the full config object (including
   * `source` and every extra field declared via `AssetDefinitions` augmentation)
   * plus a {@link AssetLoaderContext} containing the loader instance.
   *
   * This form is intended for custom asset types that manage their own
   * network access; the persistent cache layer is bypassed.
   *
   * @example
   * ```ts
   * loader.registerAssetType('tileMap', {
   *   load(config, { loader }) {
   *     return loadTileMap({ source: config.source, format: config.format, loader });
   *   },
   * });
   * ```
   */
  public registerAssetType<K extends keyof AssetDefinitions>(
    typeName: K,
    handler: {
      /**
       * Optional discriminator for in-flight dedup and identity tracking.
       *
       * Return a string that uniquely identifies the conceptual asset given its
       * full config.  The default (when omitted) is `config.source`, which is
       * correct for assets where the source URL alone determines the result.
       * Supply this when extra config fields affect the loaded output — e.g.
       * `\`${config.source}:${config.format}\`` — so that two assets with the
       * same source but different format are kept separate in the in-flight map.
       */
      getIdentityKey?(config: AssetDefinitions[K]['config']): string;
      load(config: AssetDefinitions[K]['config'], context: AssetLoaderContext): Promise<AssetDefinitions[K]['resource']>;
    },
  ): this;

  /**
   * Associates a string type name (e.g. `'tileMap'`) with the constructor
   * used as the asset token and, optionally, registers a factory for it.
   *
   * Required for declaration-merge extensions of {@link AssetDefinitions}
   * so that `loader.load({ map: { type: 'tileMap', source: '…' } })` works.
   */
  public registerAssetType(typeName: string, ctor: AssetConstructor, factory?: AssetFactory): this;

  public registerAssetType(
    typeName: string,
    ctorOrHandler:
      | AssetConstructor
      | {
          getIdentityKey?(config: unknown): string;
          load(config: unknown, context: AssetLoaderContext): Promise<unknown>;
        },
    factory?: AssetFactory,
  ): this {
    if (typeof ctorOrHandler === 'function') {
      this._assetTypeMap.set(typeName, ctorOrHandler);

      if (factory) {
        this._registry.register(ctorOrHandler, factory);
      }
    } else {
      // Handler-based form: create a synthetic constructor for type identity
      const syntheticCtor = class {} as unknown as AssetConstructor;

      Object.defineProperty(syntheticCtor, 'name', { value: typeName });
      this._assetTypeMap.set(typeName, syntheticCtor);
      this._handlerFunctions.set(syntheticCtor, {
        load: (config, ctx) => ctorOrHandler.load(config, ctx),
        getIdentityKey: ctorOrHandler.getIdentityKey?.bind(ctorOrHandler),
      });
    }

    return this;
  }

  // -----------------------------------------------------------------------
  // Extension registration
  // -----------------------------------------------------------------------

  /**
   * Associates a file extension with an asset type so that
   * `loader.load('path.ext')` (the single-string overload) can infer the
   * type automatically.
   *
   * `ext` is matched case-insensitively and the leading dot is optional.
   * The type must already have a registered factory (via {@link register} or
   * {@link registerAssetType}).
   *
   * ```ts
   * loader.registerExtension('tmj', TiledMap);
   * const map = await loader.load('world.tmj'); // TiledMap
   * ```
   */
  public registerExtension(ext: string, type: AssetConstructor): this {
    this._extensionMap.set(ext.replace(/^\./, '').toLowerCase(), type);
    return this;
  }

  // -----------------------------------------------------------------------
  // Alias registration (add without loading)
  // -----------------------------------------------------------------------

  /**
   * Registers one or more asset aliases in the manifest without immediately
   * loading them.
   *
   * - Single path: the path is used as both the alias and the URL.
   * - Array of paths: each path becomes its own alias.
   * - Record: keys are aliases, values are URLs.
   *
   * Assets pre-registered here can later be loaded by alias, included in
   * background loads via {@link backgroundLoad}, or used as the source of
   * truth when resolving conflicts in {@link registerManifest}.
   */
  public add(type: Loadable, path: string): this;
  public add(type: Loadable, paths: readonly string[]): this;
  public add(type: Loadable, items: Readonly<Record<string, string>>): this;
  public add(type: Loadable, source: string | readonly string[] | Readonly<Record<string, string>>): this {
    const ctor = type;

    if (typeof source === 'string') {
      this._addManifestEntry(ctor, source, source);
    } else if (Array.isArray(source)) {
      // `Array.isArray` narrows the union to `any[]`, dropping the element type;
      // the only array member of the union is `readonly string[]`.
      const paths: readonly string[] = source;
      for (const path of paths) {
        this._addManifestEntry(ctor, path, path);
      }
    } else {
      for (const [alias, path] of Object.entries(source)) {
        this._addManifestEntry(ctor, alias, path);
      }
    }

    return this;
  }

  /**
   * Validates and registers an {@link AssetManifest}, making its bundles
   * available to {@link loadBundle}.
   *
   * Throws if any bundle name is already registered or if two entries for
   * the same (type, alias) pair have conflicting paths or options.
   * Equivalent definitions (same path, deeply-equal options) are allowed
   * and de-duplicated silently.
   */
  public registerManifest(manifest: AssetManifest): this {
    const normalizedManifest = defineAssetManifest(manifest);
    const plannedDefinitions = new Map<string, ManifestEntry>();
    const pendingBundles = new Array<[name: string, entries: QueueEntry[]]>();

    for (const [bundleName, bundleEntries] of Object.entries(normalizedManifest.bundles)) {
      if (this._bundles.has(bundleName)) {
        throw new Error(`Bundle "${bundleName}" is already registered.`);
      }

      const normalizedEntries = new Array<QueueEntry>();

      for (const bundleEntry of bundleEntries) {
        const type = bundleEntry.type;
        const key = this._key(type, bundleEntry.alias);
        const existingDefinition = plannedDefinitions.get(key) ?? this._getManifestEntry(type, bundleEntry.alias);

        if (existingDefinition && !this._isManifestDefinitionEquivalent(existingDefinition, bundleEntry.path, bundleEntry.options)) {
          throw new Error(`Conflicting asset definition for (${this._describeType(type)}, "${bundleEntry.alias}") while registering bundle "${bundleName}".`);
        }

        plannedDefinitions.set(key, {
          path: bundleEntry.path,
          options: bundleEntry.options,
        });

        normalizedEntries.push({
          type,
          alias: bundleEntry.alias,
          path: bundleEntry.path,
          options: bundleEntry.options,
        });
      }

      pendingBundles.push([bundleName, normalizedEntries]);
    }

    for (const [bundleName, bundleEntries] of pendingBundles) {
      for (const entry of bundleEntries) {
        this._addManifestEntry(entry.type, entry.alias, entry.path, entry.options);
      }

      this._bundles.set(bundleName, bundleEntries);
    }

    return this;
  }

  /**
   * Loads all assets declared in the named bundle concurrently.
   *
   * Dispatches {@link onBundleProgress} (and the optional `onProgress`
   * callback) after each asset completes. If any assets fail, a
   * {@link BundleLoadError} is thrown after all assets have settled,
   * containing every individual failure. Throws immediately if `name` has
   * not been registered.
   */
  public async loadBundle(name: string, options: LoadBundleOptions = {}): Promise<void> {
    const bundle = this._bundles.get(name);

    if (!bundle) {
      throw new Error(`Unknown bundle "${name}".`);
    }

    const total = bundle.length;
    let loaded = 0;
    const failures = new Array<{
      type: Loadable;
      alias: string;
      error: Error;
    }>();

    if (total === 0) {
      this._emitBundleProgress(name, 0, 0, options.onProgress);

      return;
    }

    await Promise.all(
      bundle.map(async entry => {
        try {
          await (options.background
            ? this._loadSingleBackground(entry.type, entry.alias, entry.path, entry.options)
            : this._loadSingle(entry.type, entry.alias, entry.options, entry.path));
        } catch (error: unknown) {
          failures.push({
            type: entry.type,
            alias: entry.alias,
            error: this._normalizeError(error),
          });
        } finally {
          loaded++;
          this._emitBundleProgress(name, loaded, total, options.onProgress);
        }
      }),
    );

    if (failures.length > 0) {
      throw new BundleLoadError(name, failures);
    }
  }

  /**
   * Returns `true` if every asset in the named bundle has been loaded and is
   * currently held in the in-memory resource store.
   */
  public hasBundle(name: string): boolean {
    const bundle = this._bundles.get(name);

    if (!bundle) {
      return false;
    }

    return bundle.every(entry => this._hasResource(entry.type, entry.alias));
  }

  // -----------------------------------------------------------------------
  // Loading — Json overloads (generic widening)
  // -----------------------------------------------------------------------

  /**
   * Fetches and processes one or more assets of the given type.
   *
   * - **Single path** — resolves with the finished asset.
   * - **Array of paths** — resolves with an ordered array of assets.
   * - **Record** — resolves with a record whose keys match the input keys.
   * - **Asset<T>** — single typed asset reference.
   * - **Assets<M>** — typed asset container; keys become aliases.
   * - **Config map** — inline `{ alias: { type, source, … } }` definition.
   *
   * In-flight and already-loaded assets are de-duplicated: calling `load`
   * for the same (type, alias) pair while a fetch is in progress attaches
   * to the existing promise rather than issuing a second request.
   *
   * Supply a custom `options` object to pass factory-specific configuration
   * (e.g. audio decoding hints or image format overrides).
   */
  public load<T = unknown>(type: typeof Json, path: string, options?: unknown): LoadingQueue<T>;
  public load<T = unknown>(type: typeof Json, paths: readonly string[], options?: unknown): LoadingQueue<T[]>;
  public load<T = unknown, K extends string = string>(type: typeof Json, items: Readonly<Record<K, string>>, options?: unknown): LoadingQueue<Record<K, T>>;

  // -----------------------------------------------------------------------
  // Loading — new Asset / Assets / config-map overloads
  // -----------------------------------------------------------------------

  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, AssetInput>>(assets: Assets<M>): LoadingQueue<InferLoadedMap<M>>;
  public load<M extends Record<string, AssetInput>>(config: M): LoadingQueue<InferLoadedMap<M>>;

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
   * Register additional mappings via {@link registerExtension}.
   * Extend the return type by augmenting {@link ExtensionTypeMap}.
   *
   * Paths whose extension is **not** in {@link ExtensionTypeMap} are rejected at
   * compile time — use the token form (`load(MyType, path)`) for unregistered
   * extensions.
   *
   * ```ts
   * const font = await loader.load('fonts/ui.fnt');           // BmFont
   * const face = await loader.load('fonts/Roboto.woff2');     // FontFace, family='Roboto'
   * const bm   = await loader.load<BmFont>('fonts/ui.fnt');   // validated cast
   * ```
   */
  // Generic form — caller narrows R while extension still must be registered.

  public load<R, S extends string>(path: PathExtension<S> extends keyof ExtensionTypeMap ? S : never): LoadingQueue<R>;
  // Inferred form — R comes from ExtensionTypeMap.
  public load<S extends string>(path: PathExtension<S> extends keyof ExtensionTypeMap ? S : never): LoadingQueue<LoadByPath<S>>;

  // -----------------------------------------------------------------------
  // Loading — generic overloads (return type inferred from class)
  // -----------------------------------------------------------------------

  public load<T extends Loadable, S extends string>(type: ConstrainedLoadable<T, S>, path: S, options?: unknown): LoadingQueue<LoadReturn<T>>;
  public load<T extends Loadable>(type: T, paths: readonly string[], options?: unknown): LoadingQueue<Array<LoadReturn<T>>>;
  public load<T extends Loadable, K extends string>(type: T, items: Readonly<Record<K, BatchValue>>, options?: unknown): LoadingQueue<Record<K, LoadReturn<T>>>;

  // -----------------------------------------------------------------------
  // Loading — implementation
  // -----------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public load(arg0: unknown, arg1?: unknown, arg2?: unknown): LoadingQueue<any> {
    // 1. Single Asset<T>
    if (arg0 instanceof AssetImpl) {
      const asset = arg0 as Asset<unknown>;
      const alias = asset._config.source;

      return this._createLoadingQueue([{ alias, asset }], results => results.get(alias));
    }

    // 2. Assets<M> container
    if (arg0 instanceof AssetsImpl) {
      const container = arg0 as Assets<Record<string, AssetInput>>;
      const items = Object.entries(container.entries).map(([alias, a]) => ({
        alias,
        asset: a,
      }));

      return this._createLoadingQueue(items, results => {
        const out: Record<string, unknown> = {};

        for (const { alias } of items) {
          out[alias] = results.get(alias);
        }

        return out;
      });
    }

    // 2b. Extension-based: single path string with no type token
    if (typeof arg0 === 'string' && arg1 === undefined) {
      const path = arg0;
      const ext = path.match(/\.([^./?#]+)(?:[?#]|$)/)?.[1]?.toLowerCase();
      const ctor = ext ? this._extensionMap.get(ext) : undefined;

      if (ctor === undefined) {
        throw new Error(`Loader: no type registered for extension ".${ext ?? '?'}" in "${path}". ` + 'Register one via loader.registerExtension().');
      }

      // FontAsset requires a family option — infer it from the filename when not provided
      const options: unknown = ctor === FontAsset ? { family: (path.split('/').pop()?.split(/[?#]/)[0] ?? '').replace(/\.[^.]+$/, '') } : undefined;

      let notifyFn: ((success: boolean) => void) | null = null;
      const promise = this._loadSingle(ctor, path, options).then(
        v => {
          notifyFn?.(true);
          return v;
        },
        e => {
          notifyFn?.(false);
          throw e;
        },
      );
      const queue = new LoadingQueue(promise, 1);
      notifyFn = queue._notifyItem.bind(queue);
      return queue;
    }

    // 3. Old path: first arg is a Loadable constructor
    if (typeof arg0 === 'function') {
      const ctor = arg0 as Loadable;
      const source = arg1 as string | readonly string[] | Readonly<Record<string, string>>;
      const options = arg2;

      if (typeof source === 'string') {
        let notifyFn: ((success: boolean) => void) | null = null;
        const promise = this._loadSingle(ctor, source, options).then(
          v => {
            notifyFn?.(true);
            return v;
          },
          e => {
            notifyFn?.(false);
            throw e;
          },
        );

        const queue = new LoadingQueue(promise, 1);
        notifyFn = queue._notifyItem.bind(queue);

        return queue;
      }

      if (Array.isArray(source)) {
        const paths = source as readonly string[];
        let notifyFn: ((success: boolean) => void) | null = null;
        const results: unknown[] = new Array(paths.length);
        const promises = paths.map((path, i) =>
          this._loadSingle(ctor, path, options).then(
            v => {
              results[i] = v;
              notifyFn?.(true);
            },
            e => {
              notifyFn?.(false);
              throw e;
            },
          ),
        );

        const promise = Promise.all(promises).then(() => results);

        const queue = new LoadingQueue(promise, paths.length);
        notifyFn = queue._notifyItem.bind(queue);

        return queue;
      }

      // Record<string, BatchValue>
      const entries = Object.entries(source as Record<string, BatchValue>);
      const result: Record<string, unknown> = {};
      let notifyFn: ((success: boolean) => void) | null = null;
      const promises = entries.map(([alias, pathOrConfig]) => {
        const path = typeof pathOrConfig === 'string' ? pathOrConfig : pathOrConfig.source;
        const itemOptions =
          typeof pathOrConfig === 'string'
            ? options
            : { ...pathOrConfig, ...(typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}) };

        return this._loadSingle(ctor, alias, itemOptions, path).then(
          v => {
            result[alias] = v;
            notifyFn?.(true);
          },
          e => {
            notifyFn?.(false);
            throw e;
          },
        );
      });

      const promise = Promise.all(promises).then(() => result);

      const queue = new LoadingQueue(promise, entries.length);
      notifyFn = queue._notifyItem.bind(queue);

      return queue;
    }

    // 4. Plain config map: Record<string, AssetInput>
    const configMap = arg0 as Record<string, AssetInput>;
    const items = Object.entries(configMap).map(([alias, value]) => ({
      alias,
      asset: value instanceof AssetImpl ? value : new (Asset as new (c: AssetInput) => Asset<unknown>)(value),
    }));

    return this._createLoadingQueue(items, results => {
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
   * Enqueues all manifest-registered assets that have not yet been loaded
   * into the background fetch queue and begins draining the queue up to
   * {@link setConcurrency | concurrency} simultaneous connections.
   *
   * Progress is reported via {@link onProgress}. In-flight assets and
   * already-loaded assets are skipped automatically. Call {@link loadAll}
   * instead if you need to await completion.
   */
  public backgroundLoad(): void {
    for (const [type, entries] of this._manifest) {
      for (const [alias, entry] of entries) {
        if (this._hasResource(type, alias)) continue;

        const key = this._key(type, alias);

        if (this._inFlight.has(key)) continue;

        this._backgroundQueue.push({
          type,
          alias,
          path: entry.path,
          options: entry.options,
        });
      }
    }

    this._backgroundTotal = this._backgroundQueue.length;
    this._backgroundLoaded = 0;

    this._drainBackground();
  }

  /**
   * Starts {@link backgroundLoad} and returns a promise that resolves when
   * every queued background asset has finished loading (successfully or not).
   *
   * Individual asset errors are reported via {@link onError} but do not
   * reject the returned promise.
   */
  public loadAll(): Promise<void> {
    return new Promise<void>(resolve => {
      this._backgroundResolve = resolve;
      this.backgroundLoad();

      if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
        this._backgroundResolve = null;
        resolve();
      }
    });
  }

  /**
   * Sets the maximum number of simultaneous background-queue fetches.
   * Takes effect on the next {@link backgroundLoad} or {@link loadAll} call.
   */
  public setConcurrency(n: number): this {
    this._concurrency = n;

    return this;
  }

  // -----------------------------------------------------------------------
  // Retrieval — Json overloads
  // -----------------------------------------------------------------------

  /**
   * Retrieves a previously loaded asset by type and alias.
   *
   * Throws if the asset has not been loaded. Use {@link peek} for a
   * non-throwing alternative, or {@link has} to guard the call.
   */
  public get<T = unknown>(type: typeof Json, alias: string): T;
  public get<T extends Loadable>(type: T, alias: string): LoadReturn<T>;
  public get(type: Loadable, alias: string): unknown {
    const ctor = type;
    const typeMap = this._resources.get(ctor);

    if (!typeMap?.has(alias)) {
      throw new Error(`Missing resource "${alias}" for type ${ctor.name}.`);
    }

    return typeMap.get(alias);
  }

  /**
   * Returns the loaded asset for `alias`, or `null` if it has not been
   * loaded yet. Non-throwing alternative to {@link get}.
   */
  public peek<T = unknown>(type: typeof Json, alias: string): T | null;
  public peek<T extends Loadable>(type: T, alias: string): LoadReturn<T> | null;
  public peek(type: Loadable, alias: string): unknown {
    const ctor = type;

    return this._resources.get(ctor)?.get(alias) ?? null;
  }

  /** Returns `true` if the asset is currently held in the in-memory store. */
  public has(type: Loadable, alias: string): boolean {
    const ctor = type;

    return this._resources.get(ctor)?.has(alias) ?? false;
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
      const ctor = this._assetTypeMap.get(asset.type);

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
      const container = arg0 as Assets<Record<string, AssetInput>>;

      for (const [alias, a] of Object.entries(container.entries)) {
        const assetRef = a;
        const ctor = this._assetTypeMap.get(assetRef.type);

        if (!ctor) continue;

        const identityKey = this._resolveAssetIdentityKey(ctor, assetRef);
        const aliasSet = this._identityKeyToAliases.get(identityKey);

        if (aliasSet?.has(alias)) {
          // Also remove all other aliases that share this resource identity
          for (const a2 of [...aliasSet]) {
            this._unloadOne(ctor, a2);
          }
        } else {
          this._unloadOne(ctor, alias);
        }
      }

      return this;
    }

    return this._unloadOne(arg0 as Loadable, arg1 as string);
  }

  private _unloadOne(type: Loadable, alias: string): this {
    const ctor = type;
    const aliasKey = this._key(ctor, alias);

    this._resources.get(ctor)?.delete(alias);

    // If a fetch is in flight (via legacy or identity-based map), prevent the
    // result from being written to _resources once it arrives.
    const identityKey = this._aliasKeyToIdentityKey.get(aliasKey);
    if (this._inFlight.has(aliasKey) || (identityKey !== undefined && this._inFlightByIdentity.has(identityKey))) {
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

    return this;
  }

  /**
   * Removes all loaded assets from the in-memory store.
   *
   * If `type` is provided, only that type's assets are cleared; otherwise
   * all types are flushed. Does not cancel in-flight fetches.
   */
  public unloadAll(type?: Loadable): this {
    if (type) {
      this._resources.get(type)?.clear();
    } else {
      for (const typeMap of this._resources.values()) {
        typeMap.clear();
      }
    }

    return this;
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
    keys: { type: AssetConstructor<Result>; typeNames?: readonly string[]; extensions?: readonly string[] },
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

    this._handlerFunctions.set(keys.type, {
      load: (config, ctx) => handler.load(toRequest(config), ctx),
      getIdentityKey: boundIdentityKey ? config => boundIdentityKey(toRequest(config)) : undefined,
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
   * cache store, clears all in-memory assets, manifest entries, bundle
   * definitions, and in-flight tracking, and disconnects all signals.
   * Also calls `destroy?.()` on every handler registered via `bindAsset`.
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
    this._manifest.clear();
    this._bundles.clear();
    this._inFlight.clear();
    this._preventStoreKeys.clear();
    this._inFlightByIdentity.clear();
    this._aliasKeyToIdentityKey.clear();
    this._identityKeyToAliases.clear();
    this._handlerFunctions.clear();
    this._backgroundQueue.length = 0;
    this.onProgress.destroy();
    this.onBundleProgress.destroy();
    this.onLoaded.destroy();
    this.onError.destroy();
  }

  // -----------------------------------------------------------------------
  // Internal — loading
  // -----------------------------------------------------------------------

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

    const entry = this._getManifestEntry(type, alias);
    const path = explicitPath ?? entry?.path ?? alias;
    const resolvedOptions = options ?? entry?.options;

    // Check handler path first (for extension types registered via bindAsset)
    const handlerEntry = this._handlerFunctions.get(type);

    if (handlerEntry) {
      const identityKey = this._identityKey(type, path);
      const config: Record<string, unknown> = { source: path };

      if (resolvedOptions !== null && resolvedOptions !== undefined && typeof resolvedOptions === 'object') {
        Object.assign(config, resolvedOptions as Record<string, unknown>);
      }

      const context = this._buildHandlerContext(identityKey);

      return this._trackInFlight(key, this._fetchWithHandler(type, alias, path, config, handlerEntry.load, context));
    }

    return this._trackInFlight(key, this._fetch(type, alias, path, resolvedOptions));
  }

  private _loadSingleBackground(type: AssetConstructor, alias: string, path: string, options?: unknown): Promise<unknown> {
    if (this._hasResource(type, alias)) {
      const typeMap = this._resources.get(type);
      if (typeMap?.has(alias) === true) {
        return Promise.resolve(typeMap.get(alias));
      }
    }

    const key = this._key(type, alias);
    const inFlight = this._inFlight.get(key);

    if (inFlight) {
      return inFlight;
    }

    if (!this._isQueuedInBackground(type, alias)) {
      if (this._backgroundQueue.length === 0 && this._backgroundActive === 0) {
        this._backgroundLoaded = 0;
        this._backgroundTotal = 0;
      }

      this._backgroundQueue.push({ type, alias, path, options });
      this._backgroundTotal++;
    }

    this._drainBackground();

    const started = this._inFlight.get(key);

    if (started) {
      return started;
    }

    return this._waitForBackgroundEntry(type, alias);
  }

  private _createLoadingQueue<T>(items: Array<{ alias: string; asset: Asset<unknown> }>, buildResult: (results: Map<string, unknown>) => T): LoadingQueue<T> {
    const results = new Map<string, unknown>();
    let notifyFn: ((success: boolean) => void) | null = null;

    const itemPromises = items.map(({ alias, asset }) => {
      const ctor = this._assetTypeMap.get(asset.type);

      if (!ctor) {
        // Must call _notifyItem(false) so LoadingProgress doesn't remain stuck.
        return Promise.reject<unknown>(new Error(`No constructor registered for asset type "${asset.type}". Call registerAssetType() first.`)).then(
          () => {
            notifyFn?.(true);
          },
          error => {
            notifyFn?.(false);
            throw error;
          },
        );
      }

      return this._loadSingleAsset(ctor, alias, asset).then(
        resource => {
          results.set(alias, resource);
          notifyFn?.(true);
        },
        error => {
          notifyFn?.(false);
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
    const { type: _type, source: _src, ...extraOnly } = rawConfig;

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
      return existing.then(resource => {
        this._storeResource(type, alias, resource);
        return resource;
      });
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
      this._storeResource(type, alias, resource);
      return resource;
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

      this._storeResource(type, alias, resource);

      return resource;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`Failed to load "${alias}" from "${url}": ${message}`, {
        cause: error,
      });
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

    this._startBackgroundEntry(entry);
  }

  private _isQueuedInBackground(type: AssetConstructor, alias: string): boolean {
    return this._backgroundQueue.some(entry => entry.type === type && entry.alias === alias);
  }

  private _waitForBackgroundEntry(type: AssetConstructor, alias: string): Promise<unknown> {
    if (this._hasResource(type, alias)) {
      const typeMap = this._resources.get(type);
      if (typeMap?.has(alias) === true) {
        return Promise.resolve(typeMap.get(alias));
      }
    }

    const key = this._key(type, alias);
    const inFlight = this._inFlight.get(key);

    if (inFlight) {
      return inFlight;
    }

    return new Promise<unknown>((resolve, reject) => {
      const onLoaded = (loadedType: AssetConstructor, loadedAlias: string, resource: unknown): void => {
        if (loadedType !== type || loadedAlias !== alias) return;

        cleanup();
        resolve(resource);
      };
      const onError = (errorType: AssetConstructor, errorAlias: string, error: Error): void => {
        if (errorType !== type || errorAlias !== alias) return;

        cleanup();
        reject(error);
      };
      const cleanup = (): void => {
        this.onLoaded.remove(onLoaded);
        this.onError.remove(onError);
      };

      this.onLoaded.add(onLoaded);
      this.onError.add(onError);

      const pending = this._inFlight.get(key);

      if (pending) {
        cleanup();
        pending.then(resolve, reject);

        return;
      }

      if (this._hasResource(type, alias)) {
        cleanup();
        const typeMap = this._resources.get(type);
        resolve(typeMap?.get(alias));
      }
    });
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
    const key = this._key(entry.type, entry.alias);

    this._backgroundActive++;

    this._trackInFlight(key, this._fetch(entry.type, entry.alias, entry.path, entry.options))
      .catch(error => {
        const err = error instanceof Error ? error : new Error(String(error));

        this.onError.dispatch(entry.type, entry.alias, err);
      })
      .finally(() => {
        this._backgroundActive--;
        this._backgroundLoaded++;
        this._onBackgroundItemDone();
        this._drainBackground();
      });
  }

  private _trackInFlight(key: string, promise: Promise<unknown>): Promise<unknown> {
    const trackedPromise = promise.finally(() => {
      this._inFlight.delete(key);
      this._preventStoreKeys.delete(key);
    });

    this._inFlight.set(key, trackedPromise);

    return trackedPromise;
  }

  private _emitBundleProgress(name: string, loaded: number, total: number, onProgress?: (loaded: number, total: number) => void): void {
    this.onBundleProgress.dispatch(name, loaded, total);

    if (onProgress) {
      onProgress(loaded, total);
    }
  }

  // -----------------------------------------------------------------------
  // Internal — manifest & storage
  // -----------------------------------------------------------------------

  private _addManifestEntry(type: AssetConstructor, alias: string, path: string, options?: unknown): void {
    if (!this._manifest.has(type)) {
      this._manifest.set(type, new Map());
    }

    const typeManifest = this._manifest.get(type);
    if (!typeManifest) {
      return;
    }
    typeManifest.set(alias, { path, options });
  }

  private _getManifestEntry(type: AssetConstructor, alias: string): ManifestEntry | undefined {
    return this._manifest.get(type)?.get(alias);
  }

  private _isManifestDefinitionEquivalent(entry: ManifestEntry, path: string, options?: unknown): boolean {
    return entry.path === path && this._areOptionsEquivalent(entry.options, options);
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

    if (leftPrototype !== Object.prototype && leftPrototype !== null) {
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

  private _storeResource(type: AssetConstructor, alias: string, resource: unknown): void {
    const key = this._key(type, alias);

    if (this._preventStoreKeys.delete(key)) {
      return;
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
}
