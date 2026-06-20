import type { Tween } from '#animation/Tween';
import type { InputBinding, InputBindingOptions, InputChannel } from '#input/InputBinding';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import type { Loader } from '#resources/Loader';
import { UIRoot } from '#ui/UIRoot';

import type { Application } from './Application';
import { DisposalScope } from './DisposalScope';
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

  private _inputs: SceneInputs | null = null;
  private _tweens: SceneTweens | null = null;
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
    this._systems = null;
    this._root.destroy();
    this._app = null;
  }
}
