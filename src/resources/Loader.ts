import { Signal } from 'core/Signal';
import { ResourceContainer } from './ResourceContainer';
import { FontFactory } from './factories/FontFactory';
import { ImageFactory } from './factories/ImageFactory';
import { JSONFactory } from './factories/JSONFactory';
import { MusicFactory } from './factories/MusicFactory';
import { SoundFactory } from './factories/SoundFactory';
import { TextFactory } from './factories/TextFactory';
import { TextureFactory } from './factories/TextureFactory';
import { VideoFactory } from './factories/VideoFactory';
import { SVGFactory } from './factories/SVGFactory';
import { IDatabase } from "interfaces/IDatabase";
import { IResourceFactory } from "interfaces/IResourceFactory";
import { ResourceTypes } from "const/core";

export interface LoaderOptions {
    database?: IDatabase;
    cache?: RequestCache;
    mode?: RequestMode;
    resourcePath?: string;
    method?: string;
}

export interface ResourceQueueItem {
    type: ResourceTypes;
    name: string;
    path: string;
    options?: object;
}

export class Loader {

    private _resourcePath: string;
    private _factories: Map<ResourceTypes, IResourceFactory> = new Map<ResourceTypes, IResourceFactory>();
    private _resources: ResourceContainer = new ResourceContainer();
    private _queue: Array<ResourceQueueItem> = [];
    private _method: string;
    private _mode: RequestMode;
    private _cache: RequestCache;
    private _database: IDatabase | null;

    public readonly onQueueResource = new Signal();
    public readonly onStartLoading = new Signal();
    public readonly onLoadResource = new Signal();
    public readonly onFinishLoading = new Signal();

    constructor(options: LoaderOptions = {}) {

        const { resourcePath, mode, cache, database, method } = options;

        this._resourcePath = resourcePath ?? '';

        this._method = method ?? 'GET';
        this._mode = mode ?? 'cors';
        this._cache = cache ?? 'default';
        this._database = database ?? null;

        this.addFactory(ResourceTypes.Font, new FontFactory());
        this.addFactory(ResourceTypes.Music, new MusicFactory());
        this.addFactory(ResourceTypes.Sound, new SoundFactory());
        this.addFactory(ResourceTypes.Video, new VideoFactory());
        this.addFactory(ResourceTypes.Image, new ImageFactory());
        this.addFactory(ResourceTypes.Texture, new TextureFactory());
        this.addFactory(ResourceTypes.Text, new TextFactory());
        this.addFactory(ResourceTypes.Json, new JSONFactory());
        this.addFactory(ResourceTypes.Svg, new SVGFactory());
    }

    get factories(): Map<string, IResourceFactory> {
        return this._factories;
    }

    get queue(): Array<ResourceQueueItem> {
        return this._queue;
    }

    get resources(): ResourceContainer {
        return this._resources;
    }

    get resourcePath(): string {
        return this._resourcePath;
    }

    set resourcePath(resourcePath: string) {
        this._resourcePath = resourcePath;
    }

    get database(): IDatabase | null {
        return this._database;
    }

    set database(database: IDatabase | null) {
        this._database = database;
    }

    get method(): string {
        return this._method;
    }

    set method(method: string) {
        this._method = method;
    }

    get mode(): RequestMode {
        return this._mode;
    }

    set mode(mode: RequestMode) {
        this._mode = mode;
    }

    get cache(): RequestCache {
        return this._cache;
    }

    set cache(cache: RequestCache) {
        this._cache = cache;
    }

    addFactory(type: ResourceTypes, factory: IResourceFactory) {
        this._factories.set(type, factory);
        this._resources.addType(type);

        return this;
    }

    getFactory(type: ResourceTypes): IResourceFactory {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        return this._factories.get(type)!;
    }

    add(type: ResourceTypes, items: object, options?: object): this {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        for (const [name, path] of Object.entries(items)) {
            this._queue.push({ type, name, path, options });
            this.onQueueResource.dispatch(this._queue[this._queue.length - 1]);
        }

        return this;
    }

    async load(callback?: () => void): Promise<ResourceContainer> {
        const queue = this._queue.splice(0);
        const length = queue.length;

        let itemsLoaded = 0;

        if (callback) {
            this.onFinishLoading.once(callback, this);
        }

        this.onStartLoading.dispatch(length, itemsLoaded, queue);

        for (const item of queue) {
            this.onLoadResource.dispatch(length, ++itemsLoaded, await this.loadItem(item));
        }

        this.onFinishLoading.dispatch(length, itemsLoaded, this._resources);

        return this._resources;
    }

    async loadItem(queueItem: ResourceQueueItem): Promise<any> {
        const { type, name, path, options } = queueItem;

        if (!this._resources.has(type, name)) {
            const factory = this.getFactory(type);

            let source = this._database ? (await this._database.load(factory.storageName, name)) : null;

            if (!source) {
                const request = await fetch(`${this._resourcePath}${path}`, {
                    method: this._method,
                    mode: this._mode,
                    cache: this._cache,
                });

                source = await factory.process(request);

                if (this._database) {
                    await this._database.save(factory.storageName, name, source);
                }
            }

            this._resources.set(type, name, await factory.create(source, options));
        }

        return this._resources.get(type, name);
    }

    reset({ signals = true, queue = true, resources = true } = {}): this {
        if (signals) {
            this.onQueueResource.clear();
            this.onStartLoading.clear();
            this.onLoadResource.clear();
            this.onFinishLoading.clear();
        }

        if (queue) {
            this._queue.length = 0;
        }

        if (resources) {
            this._resources.clear();
        }

        return this;
    }

    destroy(): void {
        for (const factory of this._factories.values()) {
            factory.destroy();
        }

        if (this._database) {
            this._database.destroy();
            this._database = null;
        }

        this._factories.clear();
        this._queue.length = 0;
        this._resources.destroy();
        this.onQueueResource.destroy();
        this.onStartLoading.destroy();
        this.onLoadResource.destroy();
        this.onFinishLoading.destroy();
    }
}
