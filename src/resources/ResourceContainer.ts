type ResourceMap = Map<string, any>;
type TypeMapping = Map<string, ResourceMap>;

export class ResourceContainer {

    private _resources: TypeMapping = new Map<string, Map<string, any>>();

    get resources(): TypeMapping {
        return this._resources;
    }

    get types(): Array<string> {
        return [...this._resources.keys()];
    }

    addType(type: string): this {
        if (!this._resources.has(type)) {
            this._resources.set(type, new Map<string, any>());
        }

        return this;
    }

    getResources(type: string): ResourceMap {
        if (!this._resources.has(type)) {
            throw new Error(`Unknown type "${type}".`);
        }

        return this._resources.get(type)!;
    }

    has(type: string, name: string): boolean {
        return this.getResources(type).has(name);
    }

    get<T = any>(type: string, name: string): T {
        const resources = this.getResources(type);

        if (!resources.has(name)) {
            throw new Error(`Missing resource "${name}" with type "${type}".`);
        }

        return resources.get(name);
    }

    set<T = any>(type: string, name: string, resource: T): this {
        this.getResources(type).set(name, resource);

        return this;
    }

    remove(type: string, name: string): this {
        this.getResources(type).delete(name);

        return this;
    }

    clear(): this {
        for (const container of this._resources.values()) {
            container.clear();
        }

        return this;
    }

    destroy(): void {
        this.clear();

        this._resources.clear();
    }
}
