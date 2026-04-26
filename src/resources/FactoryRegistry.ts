import type { AssetFactory } from './AssetFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AssetConstructor<T = unknown> = abstract new (...args: Array<any>) => T;

export class FactoryRegistry {

    private readonly _factories = new Map<AssetConstructor, AssetFactory>();

    public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): void {
        this._factories.set(type, factory as AssetFactory);
    }

    public resolve<T>(type: AssetConstructor<T>): AssetFactory<T> {
        let constructor: AssetConstructor | null = type;
        let factory: AssetFactory | undefined = undefined;

        while (constructor !== null && !factory) {
            factory = this._factories.get(constructor);

            if (!factory) {
                const prototype = Object.getPrototypeOf(constructor.prototype) as { constructor?: AssetConstructor } | null;

                constructor = prototype?.constructor ?? null;
            }
        }

        if (!factory) {
            throw new Error(
                `No factory registered for ${type.name}. `
                + 'Register one with loader.register() before loading.',
            );
        }

        return factory as AssetFactory<T>;
    }

    public has(type: AssetConstructor): boolean {
        let constructor: AssetConstructor | null = type;

        while (constructor !== null) {
            if (this._factories.has(constructor)) {
                return true;
            }

            const prototype = Object.getPrototypeOf(constructor.prototype) as { constructor?: AssetConstructor } | null;

            constructor = prototype?.constructor ?? null;
        }

        return false;
    }

    public destroy(): void {
        for (const factory of this._factories.values()) {
            factory.destroy();
        }

        this._factories.clear();
    }
}
