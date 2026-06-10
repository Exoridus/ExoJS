import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';
import type { AssetConstructor } from '#resources/FactoryRegistry';
import type { AssetLoaderContext, Loader } from '#resources/Loader';

/**
 * Per-load request passed to {@link AssetHandler.load} and
 * {@link AssetHandler.getIdentityKey}.
 *
 * `Options` is `undefined` by default — a handler without typed options receives
 * `request.options: undefined`. A handler with typed options receives
 * `request.options: Options | undefined` (options remain optional even when typed).
 * @advanced
 */
export interface AssetLoadRequest<Options = undefined> {
  readonly source: string;
  readonly options?: Options;
}

/**
 * A loader-local instance produced by {@link AssetBinding.create}; owned and destroyed
 * by the Loader. May hold state. Called once per `loader.load(...)` invocation.
 * Sub-assets loaded via `context.loader.load(...)` are owned by the Loader's cache —
 * NOT by this handler or the asset returned by `load`.
 * @advanced
 */
export interface AssetHandler<Result = unknown, Options = undefined> {
  /**
   * Returns the deterministic identity key used for in-flight deduplication and
   * loaded-resource reuse (and cache/resource-store identity where applicable).
   *
   * Include every option that **changes the produced resource** (format, locale,
   * variant, color space, decoding mode, strictness when it affects output).
   * Exclude control-only values that do not alter the resource (callbacks,
   * `AbortSignal`, logger, request priority, timeout).
   *
   * Do **not** use `JSON.stringify(request.options)` — property-order instability,
   * control-only field inclusion, and unbounded key size make it unsuitable.
   * Explicitly select the identity-relevant fields instead.
   *
   * The Loader namespaces the key with the asset type, so the returned string may
   * be type-local. Omit this hook to use the default (source-only) identity.
   * @advanced
   */
  getIdentityKey?(request: AssetLoadRequest<Options>): string;
  load(request: AssetLoadRequest<Options>, context: AssetLoaderContext): Promise<Result>;
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
 *
 * `Result` is the produced asset instance type (e.g. `TileMap`). `Options` is the
 * typed options object, defaulting to `undefined` (no options). The runtime `type`
 * field must be a constructor that produces `Result`; the handler returned by
 * `create` must also produce `Result` — both relationships are enforced by TypeScript.
 *
 * Use `satisfies AssetBinding<MyAsset, MyLoadOptions>` on an object literal to get
 * typed options in the handler and enforce the result type without repeating it.
 * @advanced
 */
export interface AssetBinding<Result = unknown, Options = undefined> {
  readonly type: AssetConstructor<Result>;
  /**
   * Config-map type names that resolve to this handler, e.g. `['tiledMap']`.
   * Most bindings declare exactly one name; a binding may declare several when a
   * single asset type is reachable under multiple aliases (e.g. `['vtt', 'srt']`).
   * Each name maps the config-map form `{ type: '<name>', source }` to this handler.
   */
  readonly typeNames?: readonly string[];
  readonly extensions?: readonly string[];
  create(loader: Loader): AssetHandler<Result, Options>;
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
  readonly dependencies?: readonly Extension[];
  readonly renderers?: readonly RendererBinding[];
  readonly assets?: readonly AssetBinding[];
}
