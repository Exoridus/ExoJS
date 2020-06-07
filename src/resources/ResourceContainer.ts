type ResourceMap = Map<string, any>;
type TypeMapping = Map<string, ResourceMap>;

export class ResourceContainer {

    private _resources: TypeMapping = new Map<string, Map<string, any>>();

    public get resources(): TypeMapping {
        return this._resources;
    }

    public get types(): Array<string> {
        return [...this._resources.keys()];
    }

    public addType(type: string): this {
        if (!this._resources.has(type)) {
            this._resources.set(type, new Map<string, any>());
        }

        return this;
    }

    public getResources(type: string): ResourceMap {
        if (!this._resources.has(type)) {
            throw new Error(`Unknown type "${type}".`);
        }

        return this._resources.get(type)!;
    }

    public has(type: string, name: string): boolean {
        return this.getResources(type).has(name);
    }

    public get<T = any>(type: string, name: string): T {
        const resources = this.getResources(type);

        if (!resources.has(name)) {
            throw new Error(`Missing resource "${name}" with type "${type}".`);
        }

        return resources.get(name);
    }

    public set<T = any>(type: string, name: string, resource: T): this {
        this.getResources(type).set(name, resource);

        return this;
    }

    public remove(type: string, name: string): this {
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
