import type { AssetFactory } from './AssetFactory';

/**
 * Any abstract or concrete constructor whose instances are the asset type
 * produced by a factory (e.g. `typeof Texture`, `typeof Sound`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AssetConstructor<T = unknown> = abstract new (...args: any[]) => T;

/**
 * Maps {@link AssetConstructor} tokens to their corresponding
 * {@link AssetFactory} instances.
 *
 * Resolution is prototype-chain aware: if no factory is registered for the
 * exact constructor, the registry walks up the prototype chain and returns the
 * first ancestor match. This means registering a factory for a base class
 * automatically handles all subclasses.
 *
 * @internal Used by {@link Loader}; consumers interact through `loader.register()`.
 */
export class FactoryRegistry {
  private readonly _factories = new Map<AssetConstructor, AssetFactory>();

  /** Registers `factory` as the handler for `type` and its subclasses. */
  public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): void {
    this._factories.set(type, factory);
  }

  /**
   * Returns the factory registered for `type`, walking up the prototype
   * chain if necessary. Throws if no matching factory is found.
   */
  public resolve<T>(type: AssetConstructor<T>): AssetFactory<T> {
    let constructor: AssetConstructor | null = type;
    let factory: AssetFactory | undefined;

    while (constructor !== null && !factory) {
      factory = this._factories.get(constructor);

      if (!factory) {
        const prototype = Object.getPrototypeOf(constructor.prototype) as { constructor?: AssetConstructor } | null;

        constructor = prototype?.constructor ?? null;
      }
    }

    if (!factory) {
      throw new Error(`No factory registered for ${type.name}. ` + 'Register one with loader.register() before loading.');
    }

    return factory as AssetFactory<T>;
  }

  /**
   * Returns `true` if a factory is registered for `type` or any of its
   * prototype-chain ancestors.
   */
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

  /**
   * Calls {@link AssetFactory.destroy} on every registered factory and
   * clears the registry.
   */
  public destroy(): void {
    for (const factory of this._factories.values()) {
      factory.destroy();
    }

    this._factories.clear();
  }
}
