import type { Tween } from '#animation/Tween';
import type { Sound } from '#audio/Sound';
import type { InputBinding, InputBindingOptions, InputChannel } from '#input/InputBinding';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import type { Texture } from '#rendering/texture/Texture';
import type { Asset } from '#resources/Asset';
import type { AssetInput } from '#resources/AssetDefinitions';
import type { AssetRef } from '#resources/AssetRef';
import type { Assets, InferAssetsProperties } from '#resources/Assets';
import type { TextureFactoryOptions } from '#resources/factories/TextureFactory';
import type { BatchValue, ConstrainedLoadable, InferLoadedMap, Loadable, LoadByPath, Loader, LoadReturn, PathExtension } from '#resources/Loader';
import type { LoadingQueue } from '#resources/LoadingQueue';
import type { PreSizeOptions } from '#resources/seamless';
import type { BinaryAsset, CsvAsset, Json, SubtitleAsset, TextAsset, WasmAsset, XmlAsset } from '#resources/tokens';
import { UIRoot } from '#ui/UIRoot';

import type { Application } from './Application';
import { DisposalScope } from './DisposalScope';
import { deserializeInto, migrate, serializeTree } from './serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedScene } from './serialization/types';
import { Signal } from './Signal';
import { SystemRegistry } from './SystemRegistry';
import type { Time } from './Time';
import type { Destroyable } from './types';

/**
 * Scene-bound input proxy. Bindings created here are automatically unbound
 * when the owning scene is destroyed. Access via {@link Scene.inputs}.
 */
class SceneInputs implements Destroyable {
  private readonly _bindings = new Set<InputBinding>();

  public constructor(private readonly _scene: Scene) {}

  public onStart(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._scene.app!.input.onStart(channel, callback, options));
  }

  public onActive(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._scene.app!.input.onActive(channel, callback, options));
  }

  public onStop(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._scene.app!.input.onStop(channel, callback, options));
  }

  public onTrigger(channel: InputChannel | readonly InputChannel[], callback: (value: number) => void, options?: InputBindingOptions): InputBinding {
    return this._track(this._scene.app!.input.onTrigger(channel, callback, options));
  }

  public destroy(): void {
    for (const binding of this._bindings) {
      binding.unbind();
    }

    this._bindings.clear();
  }

  private _track(binding: InputBinding): InputBinding {
    this._bindings.add(binding);

    return binding;
  }
}

/**
 * Scene-bound tween proxy. Tweens created or added here are automatically
 * stopped when the owning scene is destroyed. Access via {@link Scene.tweens}.
 */
class SceneTweens implements Destroyable {
  private readonly _tweens = new Set<Tween>();

  public constructor(private readonly _scene: Scene) {}

  public create<T extends object>(target: T): Tween<T> {
    const tween = this._scene.app!.tweens.create(target);
    this._tweens.add(tween);

    return tween;
  }

  public add(tween: Tween): this {
    this._scene.app!.tweens.add(tween);
    this._tweens.add(tween);

    return this;
  }

  public destroy(): void {
    for (const tween of this._tweens) {
      tween.stop();
    }

    this._tweens.clear();
  }
}

/**
 * Scene-scoped claim view over the application {@link Loader}. Assets claimed
 * through `scene.loader.get/load(…)` are held under this scene's claim scope
 * and released automatically when the scene is destroyed (refcount −1), so
 * scene-private assets are evicted on unload without manual bookkeeping.
 * App-lifetime assets stay on `app.loader`.
 */
class SceneLoader implements Destroyable {
  private readonly _scope = Symbol('scene-loader');

  public constructor(private readonly _scene: Scene) {}

  private get _loader(): Loader {
    return this._scene.app!.loader;
  }

  public get(type: typeof Texture, source: string, options?: TextureFactoryOptions & PreSizeOptions): Texture;
  public get(type: typeof Texture, sources: readonly string[], options?: TextureFactoryOptions & PreSizeOptions): Texture[];
  public get<K extends string>(type: typeof Texture, items: Readonly<Record<K, string>>, options?: TextureFactoryOptions & PreSizeOptions): Record<K, Texture>;
  public get<S extends string>(path: LoadByPath<S> extends Texture | Sound ? S : never, options?: unknown): LoadByPath<S>;
  public get<T = unknown>(type: typeof Json, source: string, options?: unknown): AssetRef<T>;
  public get(type: typeof TextAsset, source: string, options?: unknown): AssetRef<string>;
  public get(type: typeof CsvAsset, source: string, options?: unknown): AssetRef<string[][]>;
  public get(type: typeof XmlAsset, source: string, options?: unknown): AssetRef<Document>;
  public get(type: typeof SubtitleAsset, source: string, options?: unknown): AssetRef<VTTCue[]>;
  public get(type: typeof BinaryAsset, source: string, options?: unknown): AssetRef<ArrayBuffer>;
  public get(type: typeof WasmAsset, source: string, options?: unknown): AssetRef<WebAssembly.Module>;
  public get<T extends Loadable>(type: T, alias: string): LoadReturn<T>;
  // Adopts an Assets catalog under the scene scope (mirrors Loader.get(catalog)).
  public get<M extends Record<string, AssetInput>>(catalog: Assets<M>): InferAssetsProperties<M>;
  // Adopts a single handle-hybrid leaf under the scene scope (mirrors Loader.get(leaf)).
  public get<T extends object>(leaf: T): T;
  public get(typeOrPath: Loadable | string | object, source?: unknown, options?: unknown): unknown {
    return this._loader._getClaimed(this._scope, typeOrPath, source, options);
  }

  public load<T = unknown>(type: typeof Json, path: string, options?: unknown): LoadingQueue<T>;
  public load<T = unknown>(type: typeof Json, paths: readonly string[], options?: unknown): LoadingQueue<T[]>;
  public load<T = unknown, K extends string = string>(type: typeof Json, items: Readonly<Record<K, string>>, options?: unknown): LoadingQueue<Record<K, T>>;
  public load<T>(asset: Asset<T>): LoadingQueue<T>;
  public load<M extends Record<string, AssetInput>>(assets: Assets<M>): LoadingQueue<InferLoadedMap<M>>;
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- mirrors Loader.load verbatim (rule disabled there too)
  public load<M extends Record<string, AssetInput>>(config: M): LoadingQueue<InferLoadedMap<M>>;
  // Single value-leaf (an `Assets.from()` AssetRef property): mirrors Loader.load(leaf).
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- mirrors Loader.load verbatim (rule disabled there too)
  public load<T>(leaf: AssetRef<T>): LoadingQueue<T>;
  // Single handle-hybrid leaf (an `Assets.from()` property): mirrors Loader.load(leaf).
  public load<T extends object>(leaf: T): LoadingQueue<T>;
  public load<R, S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<R>;
  public load<S extends string>(path: [PathExtension<S>] extends [never] ? never : S): LoadingQueue<LoadByPath<S>>;
  public load<T extends Loadable, S extends string>(type: ConstrainedLoadable<T, S>, path: S, options?: unknown): LoadingQueue<LoadReturn<T>>;
  public load<T extends Loadable>(type: T, paths: readonly string[], options?: unknown): LoadingQueue<Array<LoadReturn<T>>>;
  public load<T extends Loadable, K extends string>(type: T, items: Readonly<Record<K, BatchValue>>, options?: unknown): LoadingQueue<Record<K, LoadReturn<T>>>;
  public load(arg0: unknown, arg1?: unknown, arg2?: unknown): LoadingQueue<unknown> {
    return this._loader._loadClaimed(this._scope, arg0, arg1, arg2);
  }

  public backgroundLoad(): void;
  public backgroundLoad(type: Loadable, source: string, options?: unknown): void;
  // eslint-disable-next-line @typescript-eslint/unified-signatures -- mirrors Loader.backgroundLoad verbatim (rule disabled there too)
  public backgroundLoad(type: Loadable, sources: readonly string[], options?: unknown): void;
  public backgroundLoad(type?: Loadable, source?: string | readonly string[], options?: unknown): void {
    this._loader._backgroundClaimed(this._scope, type, source, options);
  }

  public destroy(): void {
    this._loader._releaseScope(this._scope);
  }
}

/**
 * A scene's lifecycle host. Subclass to define scene behavior:
 *
 *   class GameScene extends Scene {
 *       override init(loader: Loader): void { ... }
 *       override update(delta: Time): void { ... }
 *       override draw(context: RenderingContext): void { ... }
 *   }
 *
 *   app.start(new GameScene());
 *
 * For one-off scenes, an anonymous subclass works just as well:
 *
 *   app.start(new class extends Scene {
 *       override update(delta) { ... }
 *       override draw(context) { ... }
 *   });
 * @stable
 */
export class Scene {
  protected _app: Application | null = null;
  protected readonly _root = new Container();

  /**
   * When `true`, the scene's `update` and systems are skipped each frame while
   * it keeps drawing — the simple way to freeze gameplay behind a pause menu
   * (show a panel on `scene.ui`, then set `scene.paused = true`).
   */
  public paused = false;

  /** Dispatched after the scene finishes loading (after load() and init() complete). */
  public readonly onLoad = new Signal();
  /** Dispatched when the scene is about to be unloaded. */
  public readonly onUnload = new Signal();

  private _inputs: SceneInputs | null = null;
  private _tweens: SceneTweens | null = null;
  private _loader: SceneLoader | null = null;
  private _systems: SystemRegistry | null = null;
  private readonly _disposal = new DisposalScope();

  public get app(): Application | null {
    return this._app;
  }

  public set app(app: Application | null) {
    this._app = app;
  }

  /**
   * Structural root container for this scene's hierarchy.
   *
   * `Scene.root` is an **ownership and traversal anchor**, not an
   * automatic render-authoritative root. The framework never calls
   * `root.render(backend)` for you. `Scene.draw(context)` is the
   * explicit orchestration point — see {@link Scene.draw}.
   *
   * The root exists eagerly so `addChild` / `removeChild` can proxy
   * to a known container, and so transform/bounds traversal has a
   * stable parent. Selecting what to render each frame remains the
   * scene's responsibility.
   */
  public get root(): Container {
    return this._root;
  }

  /**
   * Scene-bound input registry. Bindings created via `this.inputs.onTrigger(...)`
   * etc. are automatically unbound when the scene is destroyed — no manual
   * cleanup required.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get inputs(): SceneInputs {
    if (this._inputs === null) {
      if (this._app === null) {
        throw new Error('Scene.inputs is unavailable before the scene is attached to an Application.');
      }

      this._inputs = this._disposal.track(new SceneInputs(this));
    }

    return this._inputs;
  }

  /**
   * Scene-bound tween registry. Tweens created via `this.tweens.create(...)`
   * are automatically stopped when the scene is destroyed — no manual cleanup
   * required.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get tweens(): SceneTweens {
    if (this._tweens === null) {
      if (this._app === null) {
        throw new Error('Scene.tweens is unavailable before the scene is attached to an Application.');
      }

      this._tweens = this._disposal.track(new SceneTweens(this));
    }

    return this._tweens;
  }

  /**
   * Scene-scoped claim view over the application {@link Loader}. Assets
   * claimed via `this.loader.get/load(...)` are held under this scene's own
   * claim scope and released automatically when the scene is destroyed —
   * scene-private assets are evicted on unload with zero manual bookkeeping.
   * App-lifetime assets stay on `app.loader`.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get loader(): SceneLoader {
    if (this._loader === null) {
      if (this._app === null) {
        throw new Error('Scene.loader is unavailable before the scene is attached to an Application.');
      }

      this._loader = this._disposal.track(new SceneLoader(this));
    }

    return this._loader;
  }

  /**
   * Register a {@link Destroyable} to be destroyed automatically when this
   * scene is destroyed (reverse registration order). Returns its argument for
   * fluent capture: `const world = this.track(new PhysicsWorld())`. The
   * scene-bound `tweens` and `inputs` registries are tracked the same way.
   */
  public track<T extends Destroyable>(item: T): T {
    return this._disposal.track(item);
  }

  /**
   * Scene-bound system registry. Add tickable {@link System}s (e.g. a physics
   * world) via `this.systems.add(world)`; each is updated once per frame after
   * {@link Scene.update} (ascending `order`) and destroyed with the scene — no
   * manual `step()` / `destroy()` wiring. Available before the scene is
   * attached to an Application (systems tick only while the scene is active).
   */
  public get systems(): SystemRegistry {
    if (this._systems === null) {
      this._systems = this._disposal.track(new SystemRegistry());
    }

    return this._systems;
  }

  /** @internal — called by {@link SceneManager} each frame after `update`. */
  public _tickSystems(delta: Time): void {
    this._systems?._tick(delta);
  }

  private _ui: UIRoot | null = null;

  /**
   * Scene-bound UI layer, rendered screen-fixed on top of the scene content
   * (after {@link Scene.draw}). Lazily created and destroyed with the scene;
   * add widgets via `this.ui.addChild(...)`.
   *
   * Unlike {@link Scene.root}, the UI layer **is** auto-rendered each frame — a
   * first-class overlay that always sits above the world. Its children live in
   * screen space (origin top-left, `0..width` × `0..height`); pointer and
   * keyboard input route to them ahead of the world layer.
   */
  public get ui(): UIRoot {
    if (this._ui === null) {
      this._ui = this._disposal.track(new UIRoot());

      // If the scene is already active (its root carries a stage), bind the UI
      // layer now; otherwise SceneManager attaches it when the scene activates.
      if (this._root._getStage() !== null) {
        this._app?.interaction.attachUIRoot(this._ui);
      }
    }

    return this._ui;
  }

  /** @internal — the UI layer if materialized, else `null` (no lazy allocation). */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
  public _peekUI(): UIRoot | null {
    return this._ui;
  }

  public addChild(child: RenderNode): this {
    this._root.addChild(child);

    return this;
  }

  public removeChild(child: RenderNode): this {
    this._root.removeChild(child);

    return this;
  }

  /**
   * Serialize this scene's structural root subtree to a plain, JSON-able
   * {@link SerializedScene} descriptor.
   *
   * Captures **data, not behaviour**: structure, transforms, visuals and asset
   * references — never update logic, signal handlers, tweens or systems. When
   * the scene is attached to an {@link Application}, texture/asset references
   * resolve to their {@link Loader} source keys. Reattach behaviour in code
   * after {@link Scene.deserialize}.
   */
  public serialize(): SerializedScene {
    const loader = this._app?.loader ?? null;
    const registry = this._app?.serializers;
    const data: SerializedScene = { version: SERIALIZATION_VERSION, root: serializeTree(this._root, loader, registry) };
    const ui = this._peekUI();

    if (ui !== null) {
      data.ui = serializeTree(ui, loader, registry);
    }

    return data;
  }

  /**
   * Rebuild this scene's root subtree from a {@link SerializedScene} produced
   * by {@link Scene.serialize}. Existing root children are removed first, then
   * the descriptor's children are reconstructed under {@link Scene.root}.
   *
   * Assets referenced by the data must already be loaded into the
   * application's {@link Loader} (pre-load contract). Older documents are
   * migrated to the current format; documents newer than the running engine
   * throw. Returns `this`.
   */
  public deserialize(data: SerializedScene): this {
    const migrated = migrate(data);
    const loader = this._app?.loader ?? null;
    const registry = this._app?.serializers;

    deserializeInto(this._root, migrated.root, loader, registry);

    if (migrated.ui !== undefined) {
      deserializeInto(this.ui, migrated.ui, loader, registry);
    }

    return this;
  }

  /**
   * Async asset preload hook. Called once before {@link Scene.init} the
   * first time the scene is pushed. Use the loader to register and
   * resolve assets needed by the scene; await any returned promise from
   * `loader.load()`.
   */
  public load(_loader: Loader): Promise<void> | void {
    // override in subclass
  }

  /**
   * One-shot setup hook. Called after {@link Scene.load} resolves, before
   * the first update. Build the scene-graph subtree, register signal
   * handlers, etc. Override in subclass.
   */
  public init(_loader: Loader): Promise<void> | void {
    // override in subclass
  }

  /**
   * Per-frame logic hook. Receives the time elapsed since the previous
   * frame. The scene-graph transforms are still authoritative — mutate
   * positions, advance timers, drive AI here. Override in subclass.
   */
  public update(_delta: Time): void {
    // override in subclass
  }

  /**
   * Fixed-timestep logic hook. Called zero or more times per frame with a
   * constant `delta` ({@link Application.fixedTimeStep}) before {@link Scene.update},
   * so physics and deterministic gameplay advance at a frame-rate-independent
   * rate. Put `physicsWorld.step(delta)` and movement here; leave camera, UI and
   * purely visual work in {@link Scene.update}. Default is a no-op. Override in
   * subclass.
   */
  public fixedUpdate(_delta: Time): void {
    // override in subclass
  }

  /**
   * Explicit per-frame rendering entry point. Override to choose
   * what gets rendered.
   *
   * The default body is intentionally empty: `Scene` does not
   * automatically traverse {@link Scene.root}. Auto-rendering the
   * full hierarchy would conflict with ExoJS's "explicit instead of
   * implicit" identity. Users decide which subtree(s) render each
   * frame — `context.render(this.root)` is the recommended high-level
   * path, but selective rendering (e.g. `context.render(world)` while
   * skipping `ui` for a given frame) is equally valid and intentionally
   * supported.
   *
   * @see Scene.root for why root is structural, not render-authoritative.
   */
  public draw(_context: RenderingContext): void {
    // override in subclass
  }

  /**
   * Async asset teardown hook. Called when the scene is finally popped
   * off the stack. Use the loader to release assets that are scene-private
   * and not shared with another scene still on the stack.
   */
  public unload(_loader: Loader): Promise<void> | void {
    // override in subclass
  }

  public destroy(): void {
    // Destroys everything tracked (scene-bound tweens/inputs + user-tracked
    // resources) in reverse registration order, then the scene-graph root.
    this._disposal.destroy();
    this._inputs = null;
    this._tweens = null;
    this._loader = null;
    this._systems = null;
    this.onLoad.destroy();
    this.onUnload.destroy();
    this._root.destroy();
    this._app = null;
  }
}
