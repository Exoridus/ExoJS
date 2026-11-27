import type { AssetTypeRegistry } from './AssetTypeRegistry';
import { AssetTypes } from './AssetTypes';
import type { Loader } from './Loader';
import type { LoaderScope } from './LoaderScope';

/**
 * Loading, releasing and child scopes on one asset owner. `app.assets`,
 * `scene.assets` and every scope created from them share this surface; only
 * the lifetime of the claims differs.
 */
export type AssetOwner = Pick<LoaderScope, 'load' | 'release' | 'createScope'>;

/**
 * The application's assets: the asset types it can load, and assets it owns
 * for its whole lifetime.
 *
 * Assets loaded here stay resident until the application is destroyed. Load
 * scene assets through `scene.assets` instead, and shorter-lived groups through
 * a scope from {@link createScope}.
 *
 * @example
 * ```ts
 * const { hero, config } = await app.assets.load({ hero: 'hero.png', config: 'config.json' });
 * ```
 */
export class ApplicationAssets extends AssetTypes implements AssetOwner {
  /** Loads into application ownership. See {@link LoaderScope.load} for the accepted input. */
  public readonly load: LoaderScope['load'];
  /** Drops the application's claim. See {@link LoaderScope.release}. */
  public readonly release: LoaderScope['release'];
  /** Creates an independent owner whose claims end when it is destroyed. */
  public readonly createScope: LoaderScope['createScope'];

  /** @internal */
  public constructor(registry: AssetTypeRegistry, loader: Loader) {
    super(registry);
    this.load = (input: never, options?: never) => loader._applicationScope.load(input, options);
    this.release = (input: never) => loader._applicationScope.release(input);
    this.createScope = options => loader.createScope(options);
  }
}
