import type { Asset, ValueAsset } from '#assets/Asset';
import type { CatalogEntry, KindByPath, LeafForPath, ResourceForKind } from '#assets/AssetDefinitions';
import type { CatalogResourceLeaf, CatalogValueLeaf } from '#assets/assetMeta';
import type { Assets, InferAssetsProperties } from '#assets/Assets';
import type { InferLoadedMap, Loader, LoadOptions } from '#assets/Loader';
import type { LoadingQueue } from '#assets/LoadingQueue';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';

/**
 * Scene-scoped claim view over the application {@link Loader}. Assets claimed
 * through `scene.loader.get/load(…)` are held under this scene's claim scope
 * and released automatically when the scene ends permanently (refcount −1),
 * so scene-private assets are evicted on unload without manual bookkeeping.
 * App-lifetime assets stay on `app.loader`. Access via {@link Scene.loader}.
 */
export class SceneLoader implements Destroyable {
  private readonly _scope = Symbol('scene-loader');

  public constructor(private readonly _app: Application) {}

  private get _loader(): Loader {
    return this._app.loader;
  }

  // Bare path (mirrors Loader.get(path)): a resource suffix yields its heal-in-place
  // handle, a value suffix a stable AssetRef. Leaf-capable suffixes only.
  public get<S extends string>(path: [KindByPath<S>] extends [never] ? never : S, options?: unknown): LeafForPath<S>;
  // Seamless/value access from an `Asset.type()` descriptor (mirrors Loader.get(asset)):
  // a value-kind descriptor returns a value leaf, a resource-kind descriptor a resource
  // leaf. A materialized VALUE LEAF resolves the same way, so both share one signature.
  public get<T>(asset: ValueAsset<T> | CatalogValueLeaf<T>): CatalogValueLeaf<T>;
  public get<T>(asset: Asset<T>): CatalogResourceLeaf<T>;
  // Adopts an Assets catalog under the scene scope (mirrors Loader.get(catalog)).
  public get<M extends Record<string, CatalogEntry>>(catalog: Assets<M>): InferAssetsProperties<M>;
  // Adopts a single handle-hybrid leaf under the scene scope (mirrors Loader.get(leaf)).
  // Brand-matched: only a materialized catalog leaf, never a raw resource.
  public get<T extends object>(leaf: CatalogResourceLeaf<T>): CatalogResourceLeaf<T>;
  public get(input: string | object, options?: unknown): unknown {
    return this._loader._getClaimed(this._scope, input, options);
  }

  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, CatalogEntry>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  // Single value-leaf (an `Assets.from()` AssetRef property): mirrors Loader.load(leaf).
  public load<T>(leaf: CatalogValueLeaf<T>, options?: LoadOptions): LoadingQueue<T>;
  // Single handle-hybrid leaf (an `Assets.from()` property): mirrors Loader.load(leaf).
  public load<T extends object>(leaf: CatalogResourceLeaf<T>, options?: LoadOptions): LoadingQueue<T>;
  // Bare path (mirrors Loader.load(path)): leaf-capable suffixes only.
  public load<S extends string>(path: [KindByPath<S>] extends [never] ? never : S): LoadingQueue<ResourceForKind<KindByPath<S>>>;
  public load(arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    return this._loader._loadClaimed(this._scope, arg0, arg1);
  }

  public destroy(): void {
    this._loader._releaseScope(this._scope);
  }
}
