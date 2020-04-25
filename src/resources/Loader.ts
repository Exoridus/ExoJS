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
import { DatabaseInterface } from "types/DatabaseInterface";
import { ResourceFactoryInterface } from "types/ResourceFactoryInterface";
import { ResourceTypes } from "types/types";

export interface LoaderOptions {
    resourcePath: string;
    requestOptions?: RequestInit;
    database?: DatabaseInterface;
}

export interface ResourceQueueItem {
    type: ResourceTypes;
    name: string;
    path: string;
    options?: object;
}

export class Loader {

    private _factories: Map<ResourceTypes, ResourceFactoryInterface> = new Map<ResourceTypes, ResourceFactoryInterface>();
    private _resources: ResourceContainer = new ResourceContainer();
    private _queue: Array<ResourceQueueItem> = [];
    private _resourcePath: string;
    private _requestOptions: RequestInit;
    private _database: DatabaseInterface | null;

    public readonly onQueueResource = new Signal();
    public readonly onStartLoading = new Signal();
    public readonly onLoadResource = new Signal();
    public readonly onFinishLoading = new Signal();

    constructor(options: LoaderOptions) {
        const { resourcePath, requestOptions, database } = options;

        this._resourcePath = resourcePath;
        this._requestOptions = requestOptions ?? {};
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

    get factories(): Map<string, ResourceFactoryInterface> {
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

    get requestOptions(): RequestInit {
        return this._requestOptions;
    }

    set requestOptions(requestOptions: RequestInit) {
        this._requestOptions = requestOptions;
    }

    get database(): DatabaseInterface | null {
        return this._database;
    }

    set database(database: DatabaseInterface | null) {
        this._database = database;
    }

    addFactory(type: ResourceTypes, factory: ResourceFactoryInterface) {
        this._factories.set(type, factory);
        this._resources.addType(type);

        return this;
    }

    getFactory(type: ResourceTypes): ResourceFactoryInterface {
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
                const request = await fetch(`${this._resourcePath}${path}`, this._requestOptions);

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
