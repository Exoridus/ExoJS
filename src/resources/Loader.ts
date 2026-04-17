import { Signal } from 'core/Signal';
import { Texture } from 'rendering/texture/Texture';
import { Music } from 'audio/Music';
import { Sound } from 'audio/Sound';
import { Video } from 'rendering/video/Video';
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
import type { AssetFactory } from './AssetFactory';
import type { AssetConstructor } from './FactoryRegistry';
import type { CacheStore } from './CacheStore';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loadable = abstract new (...args: Array<any>) => any;

export type LoadReturn<T> =
    T extends typeof Json ? unknown :
    T extends typeof TextAsset ? string :
    T extends typeof SvgAsset ? HTMLImageElement :
    T extends typeof VttAsset ? Array<VTTCue> :
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends abstract new (...args: Array<any>) => infer R ? R :
    never;

export interface LoaderOptions {
    resourcePath?: string;
    requestOptions?: RequestInit;
    cache?: CacheStore | ReadonlyArray<CacheStore>;
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

export class Loader {

    private readonly _registry = new FactoryRegistry();
    private readonly _resources = new Map<AssetConstructor, Map<string, unknown>>();
    private readonly _manifest = new Map<AssetConstructor, Map<string, ManifestEntry>>();
    private readonly _inFlight = new Map<string, Promise<unknown>>();
    private readonly _typeIds = new WeakMap<AssetConstructor, number>();
    private readonly _preventStoreKeys = new Set<string>();
    private readonly _stores: ReadonlyArray<CacheStore>;

    private _resourcePath: string;
    private _requestOptions: RequestInit;
    private _concurrency: number;
    private _nextTypeId = 1;

    private _backgroundQueue: Array<QueueEntry> = [];
    private _backgroundActive = 0;
    private _backgroundTotal = 0;
    private _backgroundLoaded = 0;
    private _backgroundResolve: (() => void) | null = null;

    public readonly onProgress = new Signal<[loaded: number, total: number]>();
    public readonly onLoaded = new Signal<[type: AssetConstructor, alias: string, resource: unknown]>();
    public readonly onError = new Signal<[type: AssetConstructor, alias: string, error: Error]>();

    public constructor(options: LoaderOptions = {}) {
        this._resourcePath = options.resourcePath ?? '';
        this._requestOptions = options.requestOptions ?? {};
        this._concurrency = options.concurrency ?? 6;
        this._stores = options.cache
            ? (Array.isArray(options.cache) ? options.cache : [options.cache])
            : [];

        this._registerBuiltinFactories();
    }

    // -----------------------------------------------------------------------
    // Factory registration
    // -----------------------------------------------------------------------

    public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): this {
        this._registry.register(type, factory);

        return this;
    }

    // -----------------------------------------------------------------------
    // Alias registration (add without loading)
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // Loading — Json overloads (generic widening)
    // -----------------------------------------------------------------------

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

    public setConcurrency(n: number): this {
        this._concurrency = n;

        return this;
    }

    // -----------------------------------------------------------------------
    // Retrieval — Json overloads
    // -----------------------------------------------------------------------

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

    public peek<T = unknown>(type: typeof Json, alias: string): T | null;
    public peek<T extends Loadable>(type: T, alias: string): LoadReturn<T> | null;
    public peek(type: Loadable, alias: string): unknown {
        const ctor = type as AssetConstructor;

        return this._resources.get(ctor)?.get(alias) ?? null;
    }

    public has(type: Loadable, alias: string): boolean {
        const ctor = type as AssetConstructor;

        return this._resources.get(ctor)?.has(alias) ?? false;
    }

    // -----------------------------------------------------------------------
    // Unload
    // -----------------------------------------------------------------------

    public unload(type: Loadable, alias: string): this {
        const ctor = type as AssetConstructor;
        const key = this._key(ctor, alias);

        this._resources.get(ctor)?.delete(alias);

        if (this._inFlight.has(key)) {
            this._preventStoreKeys.add(key);
        }

        return this;
    }

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

    public get resourcePath(): string {
        return this._resourcePath;
    }

    public set resourcePath(value: string) {
        this._resourcePath = value;
    }

    public get requestOptions(): RequestInit {
        return this._requestOptions;
    }

    public set requestOptions(value: RequestInit) {
        this._requestOptions = value;
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public destroy(): void {
        this._registry.destroy();

        for (const store of this._stores) {
            store.destroy();
        }

        this._resources.clear();
        this._manifest.clear();
        this._inFlight.clear();
        this._preventStoreKeys.clear();
        this._backgroundQueue.length = 0;
        this.onProgress.destroy();
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

    private async _fetch(
        type: AssetConstructor,
        alias: string,
        path: string,
        options?: unknown,
    ): Promise<unknown> {
        const factory = this._registry.resolve(type);
        const url = this._resolveUrl(path);
        let source: unknown = null;

        // Check caches
        for (const store of this._stores) {
            source = await store.load(factory.storageName, alias);

            if (source !== null && source !== undefined) {
                try {
                    const resource = await factory.create(source, options);

                    this._storeResource(type, alias, resource);

                    return resource;
                } catch {
                    await store.delete(factory.storageName, alias);
                    source = null;
                }
            }
        }

        // Network fetch
        const response = await fetch(url, this._requestOptions);

        if (!response.ok) {
            throw new Error(
                `Failed to fetch "${alias}" from "${url}" (${response.status} ${response.statusText}).`,
            );
        }

        source = await factory.process(response);

        const resource = await factory.create(source, options).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to create "${alias}" from "${url}": ${message}`);
        });

        // Write to caches
        for (const store of this._stores) {
            try {
                await store.save(factory.storageName, alias, source);
            } catch {
                // Quota exceeded or non-cloneable — continue without caching.
            }
        }

        this._storeResource(type, alias, resource);

        return resource;
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
