import { Signal } from '@/core/Signal';
import { Texture } from '@/rendering/texture/Texture';
import { Music } from '@/audio/Music';
import { Sound } from '@/audio/Sound';
import { Video } from '@/rendering/video/Video';
import { Json, TextAsset, SvgAsset, VttAsset } from './tokens';
import { FactoryRegistry } from './FactoryRegistry';
import { FontFactory } from './factories/FontFactory';
import { ImageFactory } from './factories/ImageFactory';
import { JsonFactory } from './factories/JsonFactory';
import { MusicFactory } from './factories/MusicFactory';
import { SoundFactory } from './factories/SoundFactory';
import { TextFactory } from './factories/TextFactory';
import { TextureFactory } from './factories/TextureFactory';
import { VideoFactory } from './factories/VideoFactory';
import { SvgFactory } from './factories/SvgFactory';
import { BinaryFactory } from './factories/BinaryFactory';
import { WasmFactory } from './factories/WasmFactory';
import { VttFactory } from './factories/VttFactory';
import { BundleLoadError, defineAssetManifest } from './AssetManifest';
import { CacheFirstStrategy } from './CacheFirstStrategy';
import type { AssetFactory } from './AssetFactory';
import type { AssetConstructor } from './FactoryRegistry';
import type { CacheStore } from './CacheStore';
import type { CacheStrategy } from './CacheStrategy';
import type { AssetManifest, LoadBundleOptions } from './AssetManifest';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Any abstract or concrete constructor that can be used as an asset type token
 * with {@link Loader.load} and related methods.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loadable = abstract new (...args: Array<any>) => any;

/**
 * Maps a {@link Loadable} constructor to the concrete type returned by
 * {@link Loader.load}.
 *
 * Token classes ({@link Json}, {@link TextAsset}, {@link SvgAsset},
 * {@link VttAsset}) are special-cased because their return types do not match
 * their constructor type. All other loadables return the instance type inferred
 * from the constructor.
 */
export type LoadReturn<T> =
    T extends typeof Json ? unknown :
    T extends typeof TextAsset ? string :
    T extends typeof SvgAsset ? HTMLImageElement :
    T extends typeof VttAsset ? Array<VTTCue> :
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends abstract new (...args: Array<any>) => infer R ? R :
    never;

/**
 * Construction options for {@link Loader}.
 *
 * `resourcePath` is prepended to relative asset paths at fetch time.
 * `cache` accepts one or more {@link CacheStore} instances. `cacheStrategy`
 * picks the policy used to consult them — defaults to
 * {@link CacheFirstStrategy} (check stores → network → write back).
 * `concurrency` caps the number of simultaneous background-queue fetches
 * (default `6`).
 */
export interface LoaderOptions {
    resourcePath?: string;
    requestOptions?: RequestInit;
    cache?: CacheStore | ReadonlyArray<CacheStore>;
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

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Central asset management hub for ExoJS applications.
 *
 * The `Loader` orchestrates fetching, processing, caching, and retrieval of
 * all engine asset types. It ships with built-in factories for every first-party
 * type (Texture, Sound, Music, Video, FontFace, HTMLImageElement, Json, text,
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
 * const loader = new Loader({ resourcePath: '/assets/', cache: new IndexedDbStore('game') });
 * const texture = await loader.load(Texture, 'hero.png');
 * ```
 */
export class Loader {

    private readonly _registry = new FactoryRegistry();
    private readonly _resources = new Map<AssetConstructor, Map<string, unknown>>();
    private readonly _manifest = new Map<AssetConstructor, Map<string, ManifestEntry>>();
    private readonly _bundles = new Map<string, ReadonlyArray<QueueEntry>>();
    private readonly _inFlight = new Map<string, Promise<unknown>>();
    private readonly _typeIds = new WeakMap<AssetConstructor, number>();
    private readonly _preventStoreKeys = new Set<string>();
    private readonly _stores: ReadonlyArray<CacheStore>;
    private readonly _cacheStrategy: CacheStrategy;

    private _resourcePath: string;
    private _requestOptions: RequestInit;
    private _concurrency: number;
    private _nextTypeId = 1;

    private _backgroundQueue: Array<QueueEntry> = [];
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
        this._resourcePath = options.resourcePath ?? '';
        this._requestOptions = options.requestOptions ?? {};
        this._concurrency = options.concurrency ?? 6;
        this._stores = options.cache
            ? (Array.isArray(options.cache) ? options.cache : [options.cache])
            : [];
        this._cacheStrategy = options.cacheStrategy ?? new CacheFirstStrategy();

        this._registerBuiltinFactories();
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
    public add(type: Loadable, paths: ReadonlyArray<string>): this;
    public add(type: Loadable, items: Readonly<Record<string, string>>): this;
    public add(type: Loadable, source: string | ReadonlyArray<string> | Readonly<Record<string, string>>): this {
        const ctor = type as AssetConstructor;

        if (typeof source === 'string') {
            this._addManifestEntry(ctor, source, source);
        } else if (Array.isArray(source)) {
            for (const path of source) {
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
        const pendingBundles = new Array<[name: string, entries: Array<QueueEntry>]>();

        for (const [bundleName, bundleEntries] of Object.entries(normalizedManifest.bundles)) {
            if (this._bundles.has(bundleName)) {
                throw new Error(`Bundle "${bundleName}" is already registered.`);
            }

            const normalizedEntries = new Array<QueueEntry>();

            for (const bundleEntry of bundleEntries) {
                const type = bundleEntry.type as AssetConstructor;
                const key = this._key(type, bundleEntry.alias);
                const existingDefinition = plannedDefinitions.get(key) ?? this._getManifestEntry(type, bundleEntry.alias);

                if (
                    existingDefinition
                    && !this._isManifestDefinitionEquivalent(existingDefinition, bundleEntry.path, bundleEntry.options)
                ) {
                    throw new Error(
                        `Conflicting asset definition for (${this._describeType(type)}, "${bundleEntry.alias}") while registering bundle "${bundleName}".`,
                    );
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

        await Promise.all(bundle.map(async (entry) => {
            try {
                if (options.background) {
                    await this._loadSingleBackground(entry.type, entry.alias, entry.path, entry.options);
                } else {
                    await this._loadSingle(entry.type, entry.alias, entry.options, entry.path);
                }
            } catch (error: unknown) {
                failures.push({
                    type: entry.type as Loadable,
                    alias: entry.alias,
                    error: this._normalizeError(error),
                });
            } finally {
                loaded++;
                this._emitBundleProgress(name, loaded, total, options.onProgress);
            }
        }));

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
     *
     * In-flight and already-loaded assets are de-duplicated: calling `load`
     * for the same (type, alias) pair while a fetch is in progress attaches
     * to the existing promise rather than issuing a second request.
     *
     * Supply a custom `options` object to pass factory-specific configuration
     * (e.g. audio decoding hints or image format overrides).
     */
    public load<T = unknown>(type: typeof Json, path: string, options?: unknown): Promise<T>;
    public load<T = unknown>(type: typeof Json, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<T>>;
    public load<T = unknown, K extends string = string>(type: typeof Json, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, T>>;

    // -----------------------------------------------------------------------
    // Loading — generic overloads (return type inferred from class)
    // -----------------------------------------------------------------------

    public load<T extends Loadable>(type: T, path: string, options?: unknown): Promise<LoadReturn<T>>;
    public load<T extends Loadable>(type: T, paths: ReadonlyArray<string>, options?: unknown): Promise<Array<LoadReturn<T>>>;
    public load<T extends Loadable, K extends string>(type: T, items: Readonly<Record<K, string>>, options?: unknown): Promise<Record<K, LoadReturn<T>>>;

    // -----------------------------------------------------------------------
    // Loading — implementation
    // -----------------------------------------------------------------------

    public async load(
        type: Loadable,
        source: string | ReadonlyArray<string> | Readonly<Record<string, string>>,
        options?: unknown,
    ): Promise<unknown> {
        const ctor = type as AssetConstructor;

        if (typeof source === 'string') {
            return this._loadSingle(ctor, source, options);
        }

        if (Array.isArray(source)) {
            return Promise.all(
                (source as ReadonlyArray<string>).map(path => this._loadSingle(ctor, path, options)),
            );
        }

        const entries = Object.entries(source as Record<string, string>);
        const result: Record<string, unknown> = {};

        await Promise.all(entries.map(async ([alias, path]) => {
            result[alias] = await this._loadSingle(ctor, alias, options, path);
        }));

        return result;
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
                    type, alias, path: entry.path, options: entry.options,
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
        return new Promise<void>((resolve) => {
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
        const ctor = type as AssetConstructor;
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
        const ctor = type as AssetConstructor;

        return this._resources.get(ctor)?.get(alias) ?? null;
    }

    /** Returns `true` if the asset is currently held in the in-memory store. */
    public has(type: Loadable, alias: string): boolean {
        const ctor = type as AssetConstructor;

        return this._resources.get(ctor)?.has(alias) ?? false;
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
    public unload(type: Loadable, alias: string): this {
        const ctor = type as AssetConstructor;
        const key = this._key(ctor, alias);

        this._resources.get(ctor)?.delete(alias);

        if (this._inFlight.has(key)) {
            this._preventStoreKeys.add(key);
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
            this._resources.get(type as AssetConstructor)?.clear();
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
    public get resourcePath(): string {
        return this._resourcePath;
    }

    public set resourcePath(value: string) {
        this._resourcePath = value;
    }

    /**
     * Default `RequestInit` options merged into every `fetch` call.
     * Override per-load with the `options` argument of {@link load}.
     */
    public get requestOptions(): RequestInit {
        return this._requestOptions;
    }

    public set requestOptions(value: RequestInit) {
        this._requestOptions = value;
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
     */
    public destroy(): void {
        this._registry.destroy();

        for (const store of this._stores) {
            store.destroy();
        }

        this._resources.clear();
        this._manifest.clear();
        this._bundles.clear();
        this._inFlight.clear();
        this._preventStoreKeys.clear();
        this._backgroundQueue.length = 0;
        this.onProgress.destroy();
        this.onBundleProgress.destroy();
        this.onLoaded.destroy();
        this.onError.destroy();
    }

    // -----------------------------------------------------------------------
    // Internal — loading
    // -----------------------------------------------------------------------

    private async _loadSingle(
        type: AssetConstructor,
        alias: string,
        options?: unknown,
        explicitPath?: string,
    ): Promise<unknown> {
        if (this._hasResource(type, alias)) {
            return this._resources.get(type)!.get(alias);
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

        return this._trackInFlight(key, this._fetch(type, alias, path, resolvedOptions));
    }

    private _loadSingleBackground(
        type: AssetConstructor,
        alias: string,
        path: string,
        options?: unknown,
    ): Promise<unknown> {
        if (this._hasResource(type, alias)) {
            return Promise.resolve(this._resources.get(type)!.get(alias));
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

    private async _fetch(
        type: AssetConstructor,
        alias: string,
        path: string,
        options?: unknown,
    ): Promise<unknown> {
        const factory = this._registry.resolve(type);
        const url = this._resolveUrl(path);

        try {
            const resource = await this._cacheStrategy.resolve({
                storageName: factory.storageName,
                key: alias,
                url,
                requestOptions: this._requestOptions,
                factory,
                options,
            }, this._stores);

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
            const entry = this._backgroundQueue.shift()!;
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
        const index = this._backgroundQueue.findIndex(
            e => e.type === type && e.alias === alias,
        );

        if (index === -1) return;

        const [entry] = this._backgroundQueue.splice(index, 1);

        this._startBackgroundEntry(entry);
    }

    private _isQueuedInBackground(type: AssetConstructor, alias: string): boolean {
        return this._backgroundQueue.some(entry => entry.type === type && entry.alias === alias);
    }

    private _waitForBackgroundEntry(type: AssetConstructor, alias: string): Promise<unknown> {
        if (this._hasResource(type, alias)) {
            return Promise.resolve(this._resources.get(type)!.get(alias));
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
                resolve(this._resources.get(type)!.get(alias));
            }
        });
    }

    private _onBackgroundItemDone(): void {
        this.onProgress.dispatch(this._backgroundLoaded, this._backgroundTotal);

        if (
            this._backgroundResolve
            && this._backgroundQueue.length === 0
            && this._backgroundActive === 0
        ) {
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

    private _emitBundleProgress(
        name: string,
        loaded: number,
        total: number,
        onProgress?: (loaded: number, total: number) => void,
    ): void {
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

        this._manifest.get(type)!.set(alias, { path, options });
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

        if (
            leftPrototype !== Object.prototype
            && leftPrototype !== null
        ) {
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

        if (!this._resources.has(type)) {
            this._resources.set(type, new Map());
        }

        this._resources.get(type)!.set(alias, resource);
        this.onLoaded.dispatch(type, alias, resource);
    }

    private _key(type: AssetConstructor, alias: string): string {
        let typeId = this._typeIds.get(type);

        if (typeId === undefined) {
            typeId = this._nextTypeId++;
            this._typeIds.set(type, typeId);
        }

        return `${typeId}:${alias}`;
    }

    private _resolveUrl(path: string): string {
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return path;
        }

        return `${this._resourcePath}${path}`;
    }

    // -----------------------------------------------------------------------
    // Internal — built-in factory registration
    // -----------------------------------------------------------------------

    private _registerBuiltinFactories(): void {
        this._registry.register(Texture, new TextureFactory() as AssetFactory<Texture>);
        this._registry.register(Sound, new SoundFactory() as AssetFactory<Sound>);
        this._registry.register(Music, new MusicFactory() as AssetFactory<Music>);
        this._registry.register(Video, new VideoFactory() as AssetFactory<Video>);
        this._registry.register(Json, new JsonFactory() as AssetFactory<Json>);
        this._registry.register(TextAsset, new TextFactory() as AssetFactory<TextAsset>);
        this._registry.register(SvgAsset, new SvgFactory() as AssetFactory<SvgAsset>);
        this._registry.register(VttAsset, new VttFactory() as AssetFactory<VttAsset>);
        this._registry.register(ArrayBuffer, new BinaryFactory() as AssetFactory<ArrayBuffer>);

        if (typeof FontFace !== 'undefined') {
            this._registry.register(FontFace, new FontFactory() as AssetFactory<FontFace>);
        }

        if (typeof HTMLImageElement !== 'undefined') {
            this._registry.register(HTMLImageElement, new ImageFactory() as AssetFactory<HTMLImageElement>);
        }

        if (typeof WebAssembly !== 'undefined') {
            this._registry.register(WebAssembly.Module as AssetConstructor, new WasmFactory() as AssetFactory);
        }
    }
}
