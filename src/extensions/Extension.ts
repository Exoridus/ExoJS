import type { AssetConstructor } from '#assets/AssetConstructor';
import type { AssetTypeName } from '#assets/AssetDefinitions';
import type { AnyAssetType } from '#assets/AssetType';
import type { AssetLoaderContext, Loader } from '#assets/Loader';
import type { SeamlessAdapter } from '#assets/seamless';
import type { Application } from '#core/Application';
import type { SceneNode } from '#core/SceneNode';
import type { NodeSerializer } from '#core/serialization/NodeSerializer';
import type { SceneNodeConstructor } from '#core/serialization/SerializationRegistry';
import type { System } from '#core/System';
import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';

/**
 * Per-load request passed to {@link AssetHandler.load} and
 * {@link AssetHandler.getIdentityDiscriminator}.
 *
 * `Options` is `undefined` by default - a handler without typed options receives
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
 * Sub-assets must be loaded via `context.scope.load(...)`: that scope lives
 * exactly as long as the asset being built, so its sub-assets are released with
 * it unless another owner also holds them. `context.loader.load(...)` would
 * instead claim them for the application's lifetime.
 * @advanced
 */
export interface AssetHandler<Result = unknown, Options = undefined> {
  /**
   * Returns the identity-relevant discriminator for a request: the part of an
   * asset's identity that the source alone does not capture.
   *
   * The loader always owns `type + canonical locator`; whatever this returns is
   * appended to it. Two requests for the same source that differ only in a
   * discriminator are two distinct resources, each with its own fetch, residency
   * entry and claims.
   *
   * Include every option that **changes the produced resource** (format, locale,
   * variant, color space, decoding mode, strictness when it affects output).
   * Exclude load policy (priority, `AbortSignal`, timeout) and per-consumer
   * presentation options (sampler state, placeholder size) - neither changes the
   * bytes, and folding them in would fetch and decode the same resource twice.
   *
   * Do **not** use `JSON.stringify(request.options)` - property-order instability,
   * control-only field inclusion, and unbounded key size make it unsuitable.
   * Explicitly select the identity-relevant fields instead.
   *
   * Omit this hook when the source alone identifies the resource.
   * @advanced
   */
  getIdentityDiscriminator?(request: AssetLoadRequest<Options>): string;
  /**
   * Returns the part of a request that changes WHICH SOURCE DATA is acquired -
   * a locale, a content variant, an explicit variant token.
   *
   * It is appended to the canonical locator to form this request's source
   * identity, which answers a different question than
   * {@link getIdentityDiscriminator}: two resources that differ only in how the
   * same download is interpreted are two resources over ONE source. An option
   * that changes only the interpretation therefore belongs in the resource
   * discriminator and must not appear here, or the same bytes would be fetched
   * once per interpretation.
   *
   * The value can outlive the session inside a persistent cache namespace, so
   * it must carry no credentials, tokens or request headers.
   *
   * Omit this hook when the locator alone identifies the source.
   * @advanced
   */
  getSourceIdentity?(request: AssetLoadRequest<Options>): string;
  load(request: AssetLoadRequest<Options>, context: AssetLoaderContext): Promise<Result>;
  /**
   * Optionally produce the asset directly from in-memory bytes, bypassing the
   * network and cache. This is what lets the type be packed into an asset
   * container ({@link Loader.loadContainer} - one fetch yields N assets): the
   * loader hands the handler the asset's slice instead of a URL.
   *
   * Implement it when the asset can be built from its raw bytes alone (the
   * factory-backed core handlers do). Omit it when loading needs a URL fetch,
   * sub-asset resolution, or anything bytes alone cannot supply - such types
   * cannot be embedded in a container and raise a clear error if attempted.
   * @advanced
   */
  createFromBytes?(bytes: ArrayBuffer, options: Options | undefined, context: AssetLoaderContext): Promise<Result>;
  /**
   * Releases the resources held by ONE loaded asset, called when the Loader
   * evicts it at refcount 0 (its last claim was released). The handler stays
   * alive; only that asset is torn down. A factory-backed handler forwards this
   * to `AssetFactory.dispose`.
   *
   * Optional and safe to omit - implement it only when the produced asset owns
   * something the garbage collector cannot reclaim on its own (a media element,
   * a `FontFace` registered on `document.fonts`, a GPU buffer, a worker). Must
   * be synchronous; use {@link destroy} for handler-wide teardown instead.
   * @advanced
   */
  dispose?(resource: Result): void;
  destroy?(): void;
}

/**
 * Binds one or more drawable constructors to a renderer factory.
 * Pure descriptor - no active renderer, no GPU resources, no side effects
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
 * typed options object, defaulting to `undefined` (no options). The runtime `ctor`
 * field must be a constructor that produces `Result`; the handler returned by
 * `create` must also produce `Result` - both relationships are enforced by TypeScript.
 *
 * Use `satisfies AssetBinding<MyAsset, MyLoadOptions>` on an object literal to get
 * typed options in the handler and enforce the result type without repeating it.
 * @advanced
 */
export interface AssetBinding<Result = unknown, Options = undefined> {
  readonly ctor: AssetConstructor<Result>;
  /**
   * Descriptor type names that resolve to this handler, e.g. `['tiledSource']`.
   * Most bindings declare exactly one name; a binding may declare several when a
   * single asset type is reachable under multiple aliases (e.g. `['vtt', 'srt']`).
   * Each name maps an `Asset.type(...)`/constructor descriptor's `type` field to
   * this handler. `defineAsset` supplies the canonical name automatically.
   */
  readonly typeNames?: readonly string[];
  readonly extensions?: readonly string[];
  /**
   * The {@link AssetDefinitions} key this binding produces. When present, the
   * binding was built by `defineAsset`, which registered the type's placeholder
   * strategy and suffix→type inference GLOBALLY at import (so loader-free
   * `Assets.from` resolves it). `materializeAssetBindings` forwards it into
   * `Loader.bindAsset`, which records it as the binding-declared type for every
   * declared extension - the middle tier of `AssetTypeRegistry.resolveExtensionType`,
   * below an explicit `Loader.registerType` override and above the global default.
   */
  readonly type?: AssetTypeName;
  /** Optional seamless-handle adapter (asset-system v2), registered alongside the handler. */
  readonly seamless?: SeamlessAdapter<Result>;
  /** Optional per-type IDB namespace for `context.fetchX()` calls made by this binding's handler. Defaults to the shared `__ctx_binary`/`__ctx_text`/`__ctx_json` namespace. */
  readonly storageName?: string;
  create(loader: Loader): AssetHandler<Result, Options>;
}

/**
 * One entry of an {@link Extension}'s `assets` list: a first-class
 * {@link AssetType}, or a constructor-bound {@link AssetBinding}.
 *
 * An `AssetType` carries its own stable identity, identity hooks, source codec
 * and factory provider, and is the form new types should take. An
 * `AssetBinding` binds a handler to a runtime constructor instead, and is what
 * the built-in types still use.
 * @advanced
 */
export type AssetEntry = AssetBinding | AnyAssetType;

/**
 * Binds a {@link SceneNode} type to a {@link NodeSerializer} under a stable
 * type name, so an extension's own node types participate in
 * {@link Scene.serialize}/{@link Scene.deserialize}. Pure descriptor - the
 * serializer is a stateless write/read pair, materialised into the scene
 * serialization registry once at Application construction.
 *
 * `target` is the constructor serialize resolves via prototype walk; `typeName`
 * is the tag written to JSON and the key deserialize resolves by. Mirrors the
 * shape of {@link RendererBinding}/{@link AssetBinding}.
 * @advanced
 */
export interface SerializerBinding<T extends SceneNode = SceneNode> {
  readonly typeName: string;
  readonly target: SceneNodeConstructor<T>;
  readonly serializer: NodeSerializer<T>;
}

/**
 * Undoes one {@link Extension.install} call, for the one {@link Application}
 * that call was made against. Returned by `install`, held by that Application,
 * and invoked exactly once during its teardown.
 *
 * Must be synchronous - {@link Application.destroy} does not await it. Work
 * that genuinely cannot finish synchronously belongs behind an
 * {@link AbortSignal} the extension owns, aborted from here.
 * @advanced
 */
export type ExtensionDisposer = () => void;

/**
 * An ExoJS extension: an immutable descriptor that contributes renderer bindings,
 * asset bindings, serializer bindings and/or app-level systems. Holds no Application,
 * backend, GPU, or loader instances. Pass it to the application that should have
 * it, via {@link ApplicationOptions.extensions} - that is the only way an
 * extension takes effect, so what an application can do is readable at its
 * construction rather than inferred from which modules were imported.
 *
 * The descriptor is a shared, frozen singleton: the same object equips any
 * number of Applications. Per-application state therefore never belongs on it
 * - it belongs in the closure {@link Extension.install} opens, which is also
 * what the returned {@link ExtensionDisposer} closes over.
 * @advanced
 */
export interface Extension {
  readonly id: string;
  readonly dependencies?: readonly Extension[];
  readonly renderers?: readonly RendererBinding[];
  readonly assets?: readonly AssetEntry[];
  readonly serializers?: readonly SerializerBinding[];
  /**
   * Set this application up for whatever the binding arrays cannot express - an
   * app-level {@link System} on {@link Application.systems}, a subscription on
   * {@link Application.onResize}, a `MutationObserver`, a worker, a debug
   * overlay appended next to the canvas.
   *
   * Runs once per Application, as the final construction step: every core
   * manager and every materialised binding already exists, and dependencies
   * listed in {@link Extension.dependencies} are installed first.
   *
   * Return an {@link ExtensionDisposer} to undo it. The Application holds the
   * disposers of everything it installed and runs them in reverse installation
   * order - during {@link Application.destroy}, or, if a later construction
   * step throws, during that constructor's rollback. Return nothing when there
   * is nothing to undo. A disposer that throws is reported and the remaining
   * ones still run.
   *
   * An extension's lifetime is its Application's lifetime: there is no
   * uninstall at runtime, and no scene-level scope - extensions equip an
   * application, not a scene.
   *
   * `install` throwing aborts construction, and whatever it had already done
   * before throwing is its own to undo: the disposer it never returned cannot
   * be run for it.
   */
  install?(app: Application): ExtensionDisposer | void;
}
