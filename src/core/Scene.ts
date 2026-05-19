import type { Tween } from '@/animation/Tween';
import type { InputBinding, InputBindingOptions, InputChannel } from '@/input/InputBinding';
import { Container } from '@/rendering/Container';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { RenderNode } from '@/rendering/RenderNode';
import type { Loader } from '@/resources/Loader';

import type { Application } from './Application';
import type { Time } from './Time';

/**
 * Scene-bound input proxy. Bindings created here are automatically unbound
 * when the owning scene is destroyed. Access via {@link Scene.inputs}.
 */
class SceneInputs {
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

  /** @internal */
  public _disposeAll(): void {
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
class SceneTweens {
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

  /** @internal */
  public _disposeAll(): void {
    for (const tween of this._tweens) {
      tween.stop();
    }

    this._tweens.clear();
  }
}

/**
 * How a {@link Scene} composes with scenes already on the stack.
 * - `'overlay'`: render on top, scenes below also render and update.
 * - `'modal'`: render on top, scenes below render but do not update.
 * - `'opaque'`: render on top, scenes below neither render nor update.
 */
export type SceneStackMode = 'overlay' | 'modal' | 'opaque';

/** Bag of overrides for {@link Scene.setParticipationPolicy}. */
export interface SceneParticipationPolicy {
  mode?: SceneStackMode;
}

/**
 * A scene's lifecycle host. Subclass to define scene behavior:
 *
 *   class GameScene extends Scene {
 *       override init(loader: Loader): void { ... }
 *       override update(delta: Time): void { ... }
 *       override draw(backend: RenderBackend): void { ... }
 *   }
 *
 *   app.start(new GameScene());
 *
 * For one-off scenes, an anonymous subclass works just as well:
 *
 *   app.start(new class extends Scene {
 *       override update(delta) { ... }
 *       override draw(backend) { ... }
 *   });
 */
export class Scene {
  protected _app: Application | null = null;
  protected readonly _root = new Container();
  protected _stackMode: SceneStackMode = 'overlay';
  private _inputs: SceneInputs | null = null;
  private _tweens: SceneTweens | null = null;

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
   * `root.render(backend)` for you. `Scene.draw(backend)` is the
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

      this._inputs = new SceneInputs(this);
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

      this._tweens = new SceneTweens(this);
    }

    return this._tweens;
  }

  public get stackMode(): SceneStackMode {
    return this._stackMode;
  }

  public set stackMode(mode: SceneStackMode) {
    this._stackMode = mode;
  }

  public addChild(child: RenderNode): this {
    this._root.addChild(child);

    return this;
  }

  public removeChild(child: RenderNode): this {
    this._root.removeChild(child);

    return this;
  }

  public setParticipationPolicy(policy: SceneParticipationPolicy): this {
    if (policy.mode) {
      this._stackMode = policy.mode;
    }

    return this;
  }

  public getParticipationPolicy(): SceneParticipationPolicy {
    return {
      mode: this._stackMode,
    };
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
   * frame — `this.root.render(backend)` is one common pattern, but
   * selective rendering (e.g. `world.render(backend)` while skipping
   * `ui` for a given frame) is equally valid and intentionally
   * supported.
   *
   * @see Scene.root for why root is structural, not render-authoritative.
   */
  public draw(_backend: RenderBackend): void {
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
    this._inputs?._disposeAll();
    this._inputs = null;
    this._tweens?._disposeAll();
    this._tweens = null;
    this._root.destroy();
    this._app = null;
  }
}
