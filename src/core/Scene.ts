import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import { UIRoot } from '#ui/UIRoot';

import type { Application } from './Application';
import { DisposalScope } from './DisposalScope';
import type { SceneAudio } from './scene/SceneAudio';
import type { SceneInputs } from './scene/SceneInputs';
import type { SceneInteraction } from './scene/SceneInteraction';
import type { SceneLoader } from './scene/SceneLoader';
import type { SceneTweens } from './scene/SceneTweens';
import type { SceneScope } from './SceneScope';
import type { SceneState } from './SceneState';
import type { ApplicationLike, ApplicationOf } from './SceneTypes';
import { deserializeInto, migrate, serializeTree } from './serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedScene } from './serialization/types';
import { Signal } from './Signal';
import type { SystemRegistry } from './SystemRegistry';
import type { Time } from './Time';
import type { Destroyable } from './types';

/**
 * A scene's lifecycle host. Subclass to define scene behavior:
 *
 *   class GameScene extends Scene {
 *       override init(): void { ... }
 *       override update(delta: Time): void { ... }
 *       override draw(context: RenderingContext): void { ... }
 *   }
 *
 * `Data` is this scene's activation-data type — the value passed to
 * {@link Scene.load} and {@link Scene.init}. Scenes that need no activation
 * data use the default:
 *
 *   class TitleScene extends Scene { ... }
 *
 * A scene that needs typed data declares it through the generic:
 *
 *   interface GameData { readonly level: number; }
 *   class GameScene extends Scene<GameData> { ... }
 *
 * `AppLike` (second generic, default {@link Application}) types
 * {@link Scene.app} as the concrete {@link Application} subclass the scene
 * runs under, so a project's own `Application` members are visible inside
 * scene code, not just at the call site that constructs it:
 *
 *   class AppScene<Data = void> extends Scene<Data, GameApplication> {}
 *   class TitleScene extends AppScene { ... } // this.app: GameApplication
 *
 * For a project whose own base scene needs `typeof app` (an already-
 * constructed `Application` instance) rather than a named subclass, see
 * {@link ApplicationOf}'s doc for the explicit-fixed-point pattern required
 * to avoid an unresolvable inference cycle.
 *
 * Scene-bound facilities ({@link Scene.systems}, {@link Scene.loader},
 * {@link Scene.inputs}, {@link Scene.interaction}, {@link Scene.tweens},
 * {@link Scene.audio}) are unavailable during construction and class-field
 * initialization — they become available once the scene is attached and
 * remain available through {@link Scene.load}, {@link Scene.init}, the frame
 * hooks, {@link Scene.unload}, and {@link Scene.destroy}.
 * @stable
 */
export class Scene<Data = void, AppLike extends ApplicationLike = Application> {
  /**
   * Type-only marker that keeps `Data` in the class's structural type so it
   * survives inference through a zero-argument constructor (used by scene
   * navigation typing). `declare`d — erased at runtime, never assigned, and
   * not part of authored code or autocomplete.
   */
  declare private readonly _sceneData?: Data;

  protected _app: ApplicationOf<AppLike> | null = null;
  protected readonly _root = new Container();

  /**
   * Dispatched after this scene becomes `Active` — a fresh activation
   * (`Ready` → `Active`) or a retention restore (`Suspended` → `Active`).
   * Exceptions thrown by a listener are isolated: reported through
   * {@link Application.onError}, never propagated back to whatever
   * triggered the activation, and never able to block the remaining
   * listeners or the activation itself.
   */
  public readonly onActivate = new Signal();
  /**
   * Dispatched after this scene is suspended for retention
   * (`Active` → `Suspended`). Same exception-isolation contract as
   * {@link Scene.onActivate}.
   */
  public readonly onSuspend = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is set. Same event as {@link SceneDirector.onPause}, exposed directly on the scene for convenience. */
  public readonly onPause = new Signal();
  /** Dispatched after this scene's {@link Scene.paused} flag is cleared. Same event as {@link SceneDirector.onResume}, exposed directly on the scene for convenience. */
  public readonly onResume = new Signal();

  private _scope: SceneScope<Data> | null = null;
  private readonly _disposal = new DisposalScope();

  /**
   * The {@link Application} this scene is attached to. The framework attaches a
   * scene before any lifecycle hook (`load`/`init`/`update`/`draw`) runs, so scene
   * code can read `this.app` inside those hooks without a null guard — consistent
   * with {@link Scene.inputs}/{@link Scene.tweens}/{@link Scene.loader}.
   *
   * Throws if accessed before the scene is attached (e.g. in a constructor). Use
   * {@link Scene.attached} for the rare "is it attached yet?" check that must not
   * throw.
   */
  public get app(): ApplicationOf<AppLike> {
    if (this._app === null) {
      throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
    }

    return this._app;
  }

  /** `true` once the scene is attached to an {@link Application} — a non-throwing lifecycle probe (see {@link Scene.app}). */
  public get attached(): boolean {
    return this._app !== null;
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
   * Scene-bound system registry. Add tickable {@link System}s (e.g. a physics
   * world) via `this.systems.add(world)`; each participates in the scheduler
   * phases it implements (`fixedUpdate`/`update`/`draw`, ascending `order`)
   * and is destroyed with the scene — no manual `step()` / `destroy()`
   * wiring.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get systems(): SystemRegistry {
    return this._requireScope('systems').systems;
  }

  /**
   * Scene-scoped claim view over the application {@link Loader}. Assets
   * claimed via `this.loader.get/load(...)` are held under this scene's own
   * claim scope and released automatically when the scene ends permanently —
   * scene-private assets are evicted on unload with zero manual bookkeeping.
   * App-lifetime assets stay on `app.loader`.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get loader(): SceneLoader {
    return this._requireScope('loader').loader;
  }

  /**
   * Scene-bound input facade. Bindings created via `this.inputs.onTrigger(...)`
   * etc. are automatically unbound when the scene ends permanently — no manual
   * cleanup required.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get inputs(): SceneInputs {
    return this._requireScope('inputs').inputs;
  }

  /**
   * Scene-bound interaction facade. `this.root` and a materialized `this.ui`
   * are attached automatically; use `this.interaction.observe(root)` for any
   * additional root that needs pointer/focus routing. Observations are
   * detached automatically when the scene ends permanently.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get interaction(): SceneInteraction {
    return this._requireScope('interaction').interaction;
  }

  /**
   * Scene-bound tween facade. Tweens created via `this.tweens.create(...)`
   * are automatically stopped when the scene ends permanently — no manual
   * cleanup required.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get tweens(): SceneTweens {
    return this._requireScope('tweens').tweens;
  }

  /**
   * Scene-bound audio facade. Playback started via `this.audio.play(...)` is
   * automatically stopped when the scene ends permanently — no manual
   * cleanup required.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get audio(): SceneAudio {
    return this._requireScope('audio').audio;
  }

  /**
   * This scene's current lifecycle state. Read-only — state changes only in
   * response to director-driven lifecycle events, never by direct
   * assignment.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get state(): SceneState {
    return this._requireScope('state').state;
  }

  /**
   * `true` while this scene is paused — only meaningful while {@link
   * Scene.state} is `Active`; freezes `fixedUpdate`/`update` but not `draw`.
   * Read-only — see {@link SceneDirector.pause}/{@link SceneDirector.resume}.
   *
   * Throws if accessed before the scene is attached to an {@link Application}.
   */
  public get paused(): boolean {
    return this._requireScope('paused').paused;
  }

  /**
   * Register a {@link Destroyable} to be destroyed automatically when this
   * scene ends permanently (reverse registration order). Returns its argument
   * for fluent capture: `const world = this.track(new PhysicsWorld())`.
   */
  public track<T extends Destroyable>(item: T): T {
    return this._disposal.track(item);
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
      // layer now; otherwise the director attaches it when the scene activates.
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
   * Optional asynchronous loading hook. Runs once per activation, before
   * {@link Scene.init}: initial asset loading, activation-data-dependent
   * asset selection, remote/storage reads, or any other work that must
   * complete before synchronous setup. Reach the loader via `this.loader`
   * (scene lifetime) or `this.app.loader` (app lifetime). Override in
   * subclass.
   */
  public load(_data: Readonly<Data>): Promise<void> | void {
    // override in subclass
  }

  /**
   * Optional synchronous setup hook. Runs once per activation, after the
   * Promise returned by {@link Scene.load} has fulfilled and before the
   * scene becomes active: register scene systems, connect stable scene
   * objects, bind input, register interaction roots, start scene audio.
   * Must remain synchronous — development builds detect a returned thenable
   * and fail activation with a lifecycle error. Override in subclass.
   */
  public init(_data: Readonly<Data>): void {
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
  public fixedUpdate(_step: Time): void {
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
   * Optional asynchronous teardown hook for a scene that completed
   * activation successfully and is ending permanently. Use the loader to
   * release assets that are scene-private and not shared with a scene that
   * remains active. Not called for a scene that never completed activation
   * (see the definition spec's failed-activation cleanup). Override in
   * subclass.
   */
  public unload(): Promise<void> | void {
    // override in subclass
  }

  /**
   * Optional synchronous cleanup hook for ordinary objects created directly
   * by the scene and not managed by a scene facility (facility-tracked work —
   * systems, loader claims, input bindings, interaction observations, tweens,
   * audio playback — is cleaned up automatically). Engine-owned scene
   * internals are torn down separately; subclasses never need
   * `super.destroy()`. Override in subclass.
   */
  public destroy(): void {
    // override in subclass
  }

  /**
   * Attach this scene to `app` and its owning `scope`, making every
   * scene-bound facility getter resolve. Called once by `SceneScope` at the
   * start of activation.
   *
   * `app`'s parameter type stays the bare {@link Application} (not
   * `AppLike`) because `SceneScope` — this method's only caller — is not
   * itself parametrized over `AppLike`. The cast below reflects a
   * construction invariant the framework guarantees (a scene is always
   * attached to the actual `Application` instance it runs under; `AppLike`
   * only names that instance's type more precisely for `this.app`'s
   * callers), not a real type hole.
   * @internal
   */
  public _attach(app: Application, scope: SceneScope<Data>): void {
    this._app = app as ApplicationOf<AppLike>;
    this._scope = scope;
  }

  /**
   * Tear down engine-owned scene internals that are not part of the user
   * `destroy()` hook: the tracked-resource disposal scope (which also
   * destroys a materialized {@link Scene.ui}), the lifecycle signals, the
   * structural root, and the attachment to `app`/`scope`. Called once by
   * `SceneScope` immediately after `scene.destroy()`, on both the normal
   * teardown path and the failed-activation cleanup path.
   * @internal
   */
  public _teardownInternals(): void {
    this._disposal.destroy();
    this.onActivate.destroy();
    this.onSuspend.destroy();
    this.onPause.destroy();
    this.onResume.destroy();
    this._root.destroy();
    this._app = null;
    this._scope = null;
  }

  private _requireScope(name: string): SceneScope<Data> {
    if (this._scope === null) {
      throw new Error(
        `Scene.${name} is unavailable during construction and field initialization. Scene-bound facilities become available in load() and init().`,
      );
    }

    return this._scope;
  }
}
