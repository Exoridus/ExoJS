import { Registry } from '#core/Registry';

import type { AssetFactory } from './AssetFactory';

/**
 * Any abstract or concrete constructor whose instances are the asset type
 * produced by a factory (e.g. `typeof Texture`, `typeof Sound`).
 */
export type AssetConstructor<T = unknown> = abstract new (...args: any[]) => T;

/** Climbs one step up the prototype chain, returning the parent constructor. */
const parentConstructor = (type: AssetConstructor): AssetConstructor | null => {
  const prototype = Object.getPrototypeOf(type.prototype) as { constructor?: AssetConstructor } | null;

  return prototype?.constructor ?? null;
};

/**
 * Maps {@link AssetConstructor} tokens to their corresponding
 * {@link AssetFactory} instances.
 *
 * Resolution is prototype-chain aware: if no factory is registered for the
 * exact constructor, the registry walks up the prototype chain and returns the
 * first ancestor match. This means registering a factory for a base class
 * automatically handles all subclasses.
 *
 * @internal Standalone constructor→factory map; not wired into `Loader` or
 * `AssetTypeRegistry` - kept as a reusable utility for anything that needs
 * prototype-chain-aware factory resolution.
 */
export class FactoryRegistry {
  private readonly _factories = new Registry<AssetConstructor, AssetFactory>({
    walk: parentConstructor,
    dispose: factory => factory.destroy(),
  });

  /** Registers `factory` as the handler for `type` and its subclasses. */
  public register<T>(type: AssetConstructor<T>, factory: AssetFactory<T>): void {
    this._factories.set(type, factory);
  }

  /**
   * Returns the factory registered for `type`, walking up the prototype
   * chain if necessary. Throws if no matching factory is found.
   */
  public resolve<T>(type: AssetConstructor<T>): AssetFactory<T> {
    const factory = this._factories.resolve(type);

    if (!factory) {
      throw new Error(`No factory registered for ${type.name}. Register one with register() before resolving.`);
    }

    return factory as AssetFactory<T>;
  }

  /**
   * Returns `true` if a factory is registered for `type` or any of its
   * prototype-chain ancestors.
   */
  public has(type: AssetConstructor): boolean {
    return this._factories.has(type);
  }

  /**
   * Calls {@link AssetFactory.destroy} on every registered factory and
   * clears the registry.
   */
  public destroy(): void {
    this._factories.destroy();
  }
}
