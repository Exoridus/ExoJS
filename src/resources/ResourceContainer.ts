import type { Texture } from 'rendering/texture/Texture';
import type { Music } from 'audio/Music';
import type { Sound } from 'audio/Sound';
import type { Video } from 'rendering/Video';
import { ResourceTypes } from 'types/types';

export interface IResourceTypeMap {
    [ResourceTypes.font]: FontFace;
    [ResourceTypes.image]: HTMLImageElement;
    [ResourceTypes.texture]: Texture;
    [ResourceTypes.json]: Record<string, unknown>;
    [ResourceTypes.music]: Music;
    [ResourceTypes.sound]: Sound;
    [ResourceTypes.video]: Video;
    [ResourceTypes.text]: string;
    [ResourceTypes.svg]: HTMLImageElement;
}

type ResourceMap = Map<string, unknown>;

export class ResourceContainer {

    private _resources: Map<ResourceTypes, ResourceMap> = new Map<ResourceTypes, ResourceMap>();

    public get resources(): ReadonlyMap<ResourceTypes, ReadonlyMap<string, unknown>> {
        return this._resources;
    }

    public get types(): Array<ResourceTypes> {
        return [...this._resources.keys()];
    }

    public addType(type: ResourceTypes): this {
        if (!this._resources.has(type)) {
            this._resources.set(type, new Map<string, unknown>());
        }

        return this;
    }

    public getResources(type: ResourceTypes): ResourceMap {
        const resources = this._resources.get(type);

        if (!resources) {
            throw new Error(`Unknown type "${type}".`);
        }

        return resources;
    }

    public has(type: ResourceTypes, name: string): boolean {
        return this.getResources(type).has(name);
    }

    public get<K extends ResourceTypes>(type: K, name: string): IResourceTypeMap[K] {
        const resources = this.getResources(type);

        if (!resources.has(name)) {
            throw new Error(`Missing resource "${name}" with type "${type}".`);
        }

        return resources.get(name) as IResourceTypeMap[K];
    }

    public set<K extends ResourceTypes>(type: K, name: string, resource: IResourceTypeMap[K]): this {
        this.getResources(type).set(name, resource);

        return this;
    }

    public remove(type: ResourceTypes, name: string): this {
        this.getResources(type).delete(name);

        return this;
    }

    public clear(): this {
        for (const container of this._resources.values()) {
            container.clear();
        }

        return this;
    }

    public destroy(): void {
        this.clear();

        this._resources.clear();
    }
}
