import type { Drawable } from '@/rendering/Drawable';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '@/rendering/Renderer';
import type { AssetConstructor } from '@/resources/FactoryRegistry';
import type { AssetLoaderContext, Loader } from '@/resources/Loader';

/**
 * Per-load request passed to {@link AssetHandler.load}.
 * @advanced
 */
export interface AssetLoadRequest {
  readonly source: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * A loader-local instance produced by {@link AssetBinding.create}; owned and destroyed
 * by the Loader. May hold state. Called once per `loader.load(...)` invocation.
 * Sub-assets loaded via `context.loader.load(...)` are owned by the Loader's cache —
 * NOT by this handler or the asset returned by `load`.
 * @advanced
 */
export interface AssetHandler<Result = unknown> {
  load(request: AssetLoadRequest, context: AssetLoaderContext): Promise<Result>;
  destroy?(): void;
}

/**
 * Binds one or more drawable constructors to a renderer factory.
 * Pure descriptor — no active renderer, no GPU resources, no side effects
 * until `create` is called once per backend during Application construction.
 *
 * `targets` must contain at least one entry. All targets share the single renderer
 * instance produced by `create`. Returning `undefined` from `create` means the
 * backend is unsupported; the entire binding is skipped for that backend.
 * @advanced
 */
export interface RendererBinding<Target extends Drawable = Drawable> {
  readonly targets: ReadonlyArray<DrawableConstructor<Target>>;
  create(backend: RenderBackend): Renderer<RenderBackend, Target> | undefined;
}

/**
 * Binds an asset type and its lookup keys to a loader-local handler factory.
 * `create(loader)` is called once per Loader at Application construction, producing
 * an {@link AssetHandler} instance that the Loader owns for its entire lifetime.
 * The handler may hold loader-local state (Workers, WASM modules, parsed caches).
 * @advanced
 */
export interface AssetBinding<Result = unknown> {
  readonly type: AssetConstructor<Result>;
  /** Primary type-name for config-map loading. Mutually exclusive with `typeNames`. */
  readonly typeName?: string;
  /** Multiple type-names mapping to this handler. Mutually exclusive with `typeName`. */
  readonly typeNames?: readonly string[];
  readonly extensions?: readonly string[];
  create(loader: Loader): AssetHandler<Result>;
}

/**
 * An ExoJS extension: an immutable descriptor that contributes renderer bindings
 * and/or asset bindings. Holds no Application, backend, GPU, or loader instances.
 * Register via {@link ExtensionRegistry.register} (official packages do this as
 * an import side effect), or pass explicitly via {@link ApplicationOptions.extensions}.
 * @advanced
 */
export interface Extension {
  readonly id: string;
  readonly renderers?: readonly RendererBinding[];
  readonly assets?: readonly AssetBinding[];
}
