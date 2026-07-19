import type { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';
import type { Texture } from '#rendering/texture/Texture';
import type { Asset, ValueAsset } from '#resources/Asset';
import type { AssetInput } from '#resources/AssetDefinitions';
import type { AssetRef } from '#resources/AssetRef';
import type { Assets, InferAssetsProperties } from '#resources/Assets';
import type { InferLoadedMap, Loadable, LoadByPath, Loader, LoadOptions, LoadReturn, PathExtension } from '#resources/Loader';
import type { LoadingQueue } from '#resources/LoadingQueue';

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

  public get<S extends string>(path: LoadByPath<S> extends Texture | Sound ? S : never, options?: unknown): LoadByPath<S>;
  // Legacy in-memory lookup by type + alias (advanced — mirrors Loader.get; a cache
  // lookup, not a token fetch, which was removed).
  public get<T extends Loadable>(type: T, alias: string): LoadReturn<T>;
  // Seamless/value access from an `Asset.kind()` descriptor (mirrors Loader.get(asset)):
  // a value-kind descriptor returns AssetRef<T>, a resource-kind descriptor the resource.
  public get<T>(asset: ValueAsset<T>): AssetRef<T>;
  public get<T>(asset: Asset<T>): T;
  // Adopts an Assets catalog under the scene scope (mirrors Loader.get(catalog)).
  public get<M extends Record<string, AssetInput>>(catalog: Assets<M>): InferAssetsProperties<M>;
  // Adopts a single handle-hybrid leaf under the scene scope (mirrors Loader.get(leaf)).
  public get<T extends object>(leaf: T): T;
  public get(typeOrPath: Loadable | string | object, source?: unknown): unknown {
    return this._loader._getClaimed(this._scope, typeOrPath, source);
  }

  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, AssetInput>>(assets: Assets<M>, options?: LoadOptions): LoadingQueue<InferLoadedMap<M>>;
  // Single value-leaf (an `Assets.from()` AssetRef property): mirrors Loader.load(leaf).
  public load<T>(leaf: AssetRef<T>, options?: LoadOptions): LoadingQueue<T>;
  // Single handle-hybrid leaf (an `Assets.from()` property): mirrors Loader.load(leaf).
  public load<T extends object>(leaf: T, options?: LoadOptions): LoadingQueue<T>;
  public load<R, S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<R>;
  public load<S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<LoadByPath<S>>;
  public load(arg0: unknown, arg1?: unknown): LoadingQueue<unknown> {
    return this._loader._loadClaimed(this._scope, arg0, arg1);
  }

  public destroy(): void {
    this._loader._releaseScope(this._scope);
  }
}
