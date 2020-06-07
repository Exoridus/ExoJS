import { Signal } from 'core/Signal';
import { ResourceContainer } from './ResourceContainer';
import { FontFactory } from './factories/FontFactory';
import { ImageFactory } from './factories/ImageFactory';
import { JsonFactory } from './factories/JsonFactory';
import { MusicFactory } from './factories/MusicFactory';
import { SoundFactory } from './factories/SoundFactory';
import { TextFactory } from './factories/TextFactory';
import { TextureFactory } from './factories/TextureFactory';
import { VideoFactory } from './factories/VideoFactory';
import { SvgFactory } from './factories/SvgFactory';
import type { IDatabase } from 'types/IDatabase';
import type { IResourceFactory } from 'types/IResourceFactory';
import { ResourceTypes } from 'types/types';

export interface ILoaderOptions {
    resourcePath: string;
    requestOptions?: RequestInit;
    database?: IDatabase;
}

export interface IResourceQueueItem {
    type: ResourceTypes;
    name: string;
    path: string;
    options?: object;
}

export class Loader {

    private _factories: Map<ResourceTypes, IResourceFactory> = new Map<ResourceTypes, IResourceFactory>();
    private _resources: ResourceContainer = new ResourceContainer();
    private _queue: Array<IResourceQueueItem> = [];
    private _resourcePath: string;
    private _requestOptions: RequestInit;
    private _database: IDatabase | null;

    public readonly onQueueResource = new Signal();
    public readonly onStartLoading = new Signal();
    public readonly onLoadResource = new Signal();
    public readonly onFinishLoading = new Signal();

    public constructor(options: ILoaderOptions) {
        const { resourcePath, requestOptions, database } = options;

        this._resourcePath = resourcePath;
        this._requestOptions = requestOptions ?? {};
        this._database = database ?? null;

        this.addFactory(ResourceTypes.font, new FontFactory());
        this.addFactory(ResourceTypes.music, new MusicFactory());
        this.addFactory(ResourceTypes.sound, new SoundFactory());
        this.addFactory(ResourceTypes.video, new VideoFactory());
        this.addFactory(ResourceTypes.image, new ImageFactory());
        this.addFactory(ResourceTypes.texture, new TextureFactory());
        this.addFactory(ResourceTypes.text, new TextFactory());
        this.addFactory(ResourceTypes.json, new JsonFactory());
        this.addFactory(ResourceTypes.svg, new SvgFactory());
    }

    public get factories(): Map<string, IResourceFactory> {
        return this._factories;
    }

    public get queue(): Array<IResourceQueueItem> {
        return this._queue;
    }

    public get resources(): ResourceContainer {
        return this._resources;
    }

    public get resourcePath(): string {
        return this._resourcePath;
    }

    public set resourcePath(resourcePath: string) {
        this._resourcePath = resourcePath;
    }

    public get requestOptions(): RequestInit {
        return this._requestOptions;
    }

    public set requestOptions(requestOptions: RequestInit) {
        this._requestOptions = requestOptions;
    }

    public get database(): IDatabase | null {
        return this._database;
    }

    public set database(database: IDatabase | null) {
        this._database = database;
    }

    public addFactory(type: ResourceTypes, factory: IResourceFactory): this {
        this._factories.set(type, factory);
        this._resources.addType(type);

        return this;
    }

    public getFactory(type: ResourceTypes): IResourceFactory {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        return this._factories.get(type)!;
    }

    public add(type: ResourceTypes, items: object, options?: object): this {
        if (!this._factories.has(type)) {
            throw new Error(`No resource factory for type "${type}".`);
        }

        for (const [name, path] of Object.entries(items)) {
            this._queue.push({ type, name, path, options });
            this.onQueueResource.dispatch(this._queue[this._queue.length - 1]);
        }

        return this;
    }

    public async load(callback?: () => void): Promise<ResourceContainer> {
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

    public async loadItem(queueItem: IResourceQueueItem): Promise<any> {
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

    public reset({ signals = true, queue = true, resources = true } = {}): this {
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

    public destroy(): void {
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
