import type { AnyAssetType } from '#assets/AssetType';
import type { Application } from '#core/Application';
import type { SceneNode } from '#core/SceneNode';
import type { NodeSerializer } from '#core/serialization/NodeSerializer';
import type { SceneNodeConstructor } from '#core/serialization/SerializationRegistry';
import type { System } from '#core/System';
import type { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';

/**
 * Binds one or more drawable constructors to a renderer factory.
 * Pure descriptor - no active renderer, no GPU resources, no side effects
 * until `create` is called once per backend during Application construction.
 *
 * `targets` must contain at least one entry. All targets share the single renderer
 * instance produced by `create`. Returning `undefined` from `create` means the
 * backend is unsupported; the entire binding is skipped for that backend.
 *
 * The declared type erases the pairing between `targets` and what `create`
 * returns, so write bindings with `defineRendererBinding`
 * (`@codexo/exojs/renderer-sdk`), which infers the drawable union from `targets`
 * and rejects a renderer that does not handle it.
 * @advanced
 */
export interface RendererBinding<Target extends Drawable = Drawable> {
  readonly targets: ReadonlyArray<DrawableConstructor<Target>>;
  create(backend: RenderBackend): Renderer<RenderBackend, Target> | undefined;
}

/**
 * One entry of an {@link Extension}'s `assets` list: a first-class
 * {@link AssetType}.
 *
 * The type carries its own stable identity, identity hooks, source codec and
 * factory provider, and is installed on the applications that list it and on no
 * other - importing the module that defines it installs nothing.
 * @advanced
 */
export type AssetEntry = AnyAssetType;

/**
 * Binds a {@link SceneNode} type to a {@link NodeSerializer} under a stable
 * type name, so an extension's own node types participate in
 * {@link Scene.serialize}/{@link Scene.deserialize}. Pure descriptor - the
 * serializer is a stateless write/read pair, materialised into the scene
 * serialization registry once at Application construction.
 *
 * `target` is the constructor serialize resolves via prototype walk; `typeName`
 * is the tag written to JSON and the key deserialize resolves by. Mirrors the
 * shape of {@link RendererBinding}.
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
   * system and every materialised binding already exists, and dependencies
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
