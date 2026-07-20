import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderingContext } from '#rendering/RenderingContext';

import type { Application } from './Application';
import { Color } from './Color';
import { logger } from './logging';
import { Scene } from './Scene';
import { SceneScope } from './SceneScope';
import { SceneState } from './SceneState';
import { Signal } from './Signal';
import type { Time } from './Time';

/**
 * Fade-to-color scene transition. The screen fades to `color` (default black)
 * over `duration` ms (default 220), the scene change happens at full
 * opacity, then the screen fades back in.
 */
export interface FadeSceneTransition {
  type: 'fade';
  duration?: number;
  color?: Color;
}

/** Discriminated union of supported {@link SceneDirector} transitions. */
export type SceneTransition = FadeSceneTransition;

/** Options passed to {@link SceneDirector.setScene}. */
export interface SetSceneOptions {
  transition?: SceneTransition;
}

interface ActiveFadeTransition {
  readonly type: 'fade';
  readonly durationMs: number;
  readonly action: () => Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly color: Color;
  elapsedMs: number;
  phase: 'out' | 'switching' | 'in';
}

class TransitionOverlayMesh extends Mesh {
  public override render(backend: RenderBackend): this {
    if (this.visible) {
      backend.draw(this);
    }

    return this;
  }
}

const createOverlayMesh = (): TransitionOverlayMesh =>
  new TransitionOverlayMesh({
    // 4 vertices (TL, TR, BL, BR) with 2 indexed triangles forming a screen quad.
    vertices: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
  });

const defaultFadeTransitionDuration = 220;

/**
 * Single-active-scene controller owned by {@link Application}. Holds at most one
 * active {@link Scene} (the current "screen"); {@link SceneDirector.setScene}
 * switches to a new scene — ending the previous one permanently — with an
 * optional fade transition.
 *
 * There is no scene stack: overlays, HUDs and pause menus belong on
 * {@link Scene.ui} (the screen-fixed UI layer). Each activation is owned
 * internally by a `SceneScope`, which attaches the scene's facilities, gates
 * per-frame dispatch by {@link SceneState}, and runs teardown in the
 * normative order; `SceneDirector` itself only tracks which scope is active
 * and drives the transition machinery.
 *
 * Per-frame dispatch is split into four entry points, called by
 * {@link Application.update} in normative order: {@link SceneDirector.fixedUpdate}
 * (zero or more times), {@link SceneDirector.update}, {@link SceneDirector.draw},
 * then {@link SceneDirector._drawTransition} last, so the fade overlay always
 * sits above both scene and app draw systems.
 */
export class SceneDirector {
  private readonly _app: Application;
  private _activeScope: SceneScope<void> | null = null;
  private readonly _transitionOverlay: TransitionOverlayMesh = createOverlayMesh();
  private _transition: ActiveFadeTransition | null = null;

  /** Fires whenever the active scene changes (set or clear). Payload is the new scene, or `null` when cleared. */
  public readonly onChangeScene = new Signal<[Scene | null]>();
  /** Fires after a scene's `init` resolves and it becomes active. */
  public readonly onStartScene = new Signal<[Scene]>();
  /** Fires once per frame for the active scene after its `update` ran. */
  public readonly onUpdateScene = new Signal<[Scene]>();
  /** Fires just before a scene is unloaded (`unload` then `destroy`). */
  public readonly onStopScene = new Signal<[Scene]>();
  /** Fires after `pause()` actually transitions the active scene to `Paused`. */
  public readonly onPause = new Signal<[Scene]>();
  /** Fires after `resume()` actually transitions the active scene back to `Active`. */
  public readonly onResume = new Signal<[Scene]>();
  /** Fires whenever the active scene's {@link SceneState} changes, as `(previous, next, scene)`. */
  public readonly onStateChange = new Signal<[SceneState, SceneState, Scene]>();

  public constructor(app: Application) {
    this._app = app;
  }

  /** The active scene, or `null` when none is set. */
  public get currentScene(): Scene | null {
    return this._activeScope?.scene ?? null;
  }

  /** The active scene's current {@link SceneState}, or `null` when no scene is active. */
  public get state(): SceneState | null {
    return this._activeScope?.state ?? null;
  }

  public set currentScene(scene: Scene | null) {
    void this.setScene(scene);
  }

  /**
   * Switch to `scene` (or clear to `null`), ending the previously active
   * scene permanently. No-op when `scene` is already active. An optional
   * fade transition runs the swap at full opacity. The new scene completes
   * `load()`+`init()` before the old one is torn down, so there is no blank
   * frame between them, and the outgoing scene keeps running until the
   * switch boundary is crossed.
   */
  public async setScene(scene: Scene | null, options: SetSceneOptions = {}): Promise<this> {
    await this._runWithTransition(async () => {
      if (scene === (this._activeScope?.scene ?? null)) {
        return;
      }

      let newScope: SceneScope<void> | null = null;

      if (scene !== null) {
        newScope = await this._prepareScene(scene);
      }

      const previousScope = this._activeScope;

      this._activeScope = newScope;

      if (previousScope !== null) {
        await this._disposeScene(previousScope);
      }

      newScope?.activate();

      this.onChangeScene.dispatch(scene);

      if (scene !== null) {
        this.onStartScene.dispatch(scene);
      }
    }, options.transition);

    return this;
  }

  /**
   * Pause the active scene: `Active` → `Paused`. Its `fixedUpdate`/`update`
   * stop running, but `draw` keeps rendering and input/interaction stay live
   * — the canonical "pause menu drawn over a frozen world" shape. No-op
   * (returns `false`) when no scene is active or it is not currently `Active`.
   */
  public pause(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const previous = scope.state;
    const changed = scope.pause();

    if (changed) {
      this.onPause.dispatch(scope.scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene);
    }

    return changed;
  }

  /**
   * Resume a paused scene: `Paused` → `Active`. No-op (returns `false`) when
   * no scene is active or it is not currently `Paused`.
   */
  public resume(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const previous = scope.state;
    const changed = scope.resume();

    if (changed) {
      this.onResume.dispatch(scope.scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene);
    }

    return changed;
  }

  /**
   * Drive one fixed-timestep step on the active scene, gated by its
   * `SceneScope` state (only `Active` dispatches): the scene's
   * `fixedUpdate()` hook, then its systems' fixed-update phase. Called zero
   * or more times per frame by the {@link Application} loop, ahead of
   * {@link SceneDirector.update}. No drawing or transition advance happens
   * here — those are per-frame, not per fixed step.
   */
  public fixedUpdate(step: Time): this {
    this._activeScope?.fixedUpdate(step);

    return this;
  }

  /**
   * Per-frame logic entry point called by {@link Application.update}, after
   * this frame's fixed steps: for the active scene, gated by its
   * `SceneScope` state, runs `update()` then its systems' update phase.
   * Dispatches {@link SceneDirector.onUpdateScene} whenever a scene is
   * active, regardless of state. Drawing is a separate call — see
   * {@link SceneDirector.draw}.
   */
  public update(delta: Time): this {
    const scope = this._activeScope;

    if (scope !== null) {
      scope.update(delta);
      this.onUpdateScene.dispatch(scope.scene);
    }

    return this;
  }

  /**
   * Draw entry point called by {@link Application.update}, after this
   * frame's {@link SceneDirector.update}: draws the active scene — gated by
   * its `SceneScope` state — then its systems' draw phase, then its
   * screen-fixed UI layer on top. No-op when no scene is active or the
   * active scope's state does not permit drawing. The transition overlay is
   * drawn separately, last — see {@link SceneDirector._drawTransition}.
   */
  public draw(context: RenderingContext): this {
    this._activeScope?.draw(context);

    return this;
  }

  /**
   * @internal Advances the active fade transition by `delta` and, once it
   * has any visible opacity, draws the fullscreen overlay into `context`'s
   * backend. Called once per frame by the {@link Application} loop, after
   * Scene draw and app draw systems have rendered — the overlay is always
   * topmost (definition §10.5).
   */
  public _drawTransition(context: RenderingContext, delta: Time): this {
    this._advanceTransition(delta.milliseconds);

    const transitionAlpha = this._getTransitionAlpha();

    if (transitionAlpha > 0) {
      this._renderTransitionOverlay(transitionAlpha, context.backend);
    }

    return this;
  }

  /**
   * @internal Opens the active scope's systems registry mutation-buffering
   * window for this frame — forwards to {@link SystemRegistry._beginFrame}.
   * No-op when no scene is active.
   */
  public _beginFrame(): void {
    this._activeScope?._beginFrame();
  }

  /**
   * @internal Drains the active scope's systems registry buffered
   * mutations, closing this frame's window — forwards to
   * {@link SystemRegistry._endFrame}. No-op when no scene is active.
   */
  public _endFrame(): void {
    this._activeScope?._endFrame();
  }

  public destroy(): void {
    if (this._transition) {
      const transition = this._transition;

      this._transition = null;
      transition.color.destroy();
      transition.reject(new Error('SceneDirector was destroyed while a transition was active.'));
    }

    void this._unloadActiveSceneOnDestroy();

    this._transitionOverlay.destroy();
    this.onChangeScene.destroy();
    this.onStartScene.destroy();
    this.onUpdateScene.destroy();
    this.onStopScene.destroy();
    this.onPause.destroy();
    this.onResume.destroy();
    this.onStateChange.destroy();
  }

  /**
   * Construct a `SceneScope` for `scene` and run its activation sequence
   * (attach → `Preparing` → `load()` → `init()`). On failure, runs the
   * definition §16 failed-activation cleanup — engine-managed registrations
   * destroyed, loader claims released, `scene.destroy()` invoked, but
   * `unload()` is never called — and rethrows the original error unchanged.
   */
  private async _prepareScene(scene: Scene): Promise<SceneScope<void>> {
    const scope = new SceneScope(this._app, scene);

    try {
      await scope.prepare();

      if (scene.root.children.length > 0 && scene.draw === Scene.prototype.draw) {
        logger.warn(
          `Scene.root has ${scene.root.children.length} child(ren) after init() but draw() is not overridden. Scene.root is not auto-rendered — call context.render(this.root) inside draw().`,
          { source: 'SceneDirector' },
        );
      }

      return scope;
    } catch (error) {
      scope.destroyFailedActivation();

      throw error;
    }
  }

  /** Permanently end `scope`'s scene: dispatch {@link SceneDirector.onStopScene}, then run the scope's teardown sequence (definition §17). */
  private async _disposeScene(scope: SceneScope<void>): Promise<void> {
    this.onStopScene.dispatch(scope.scene);
    await scope.destroy();
  }

  private async _unloadActiveSceneOnDestroy(): Promise<void> {
    const scope = this._activeScope;

    if (scope === null) {
      return;
    }

    this._activeScope = null;

    try {
      await this._disposeScene(scope);
    } catch (error) {
      logger.error('SceneDirector.destroy() failed to unload the active scene.', { source: 'SceneDirector', ...(error instanceof Error && { error }) });
    }
  }

  private async _runWithTransition(action: () => Promise<void>, transition?: SceneTransition): Promise<void> {
    if (transition?.type !== 'fade') {
      await action();

      return;
    }

    if (this._transition) {
      throw new Error('Scene transition is already in progress.');
    }

    const durationMs = Math.max(0, transition.duration ?? defaultFadeTransitionDuration);

    if (durationMs === 0) {
      await action();

      return;
    }

    await new Promise<void>((resolve, reject) => {
      this._transition = {
        type: 'fade',
        durationMs,
        action,
        resolve,
        reject,
        color: (transition.color ?? Color.black).clone(),
        elapsedMs: 0,
        phase: 'out',
      };
    });
  }

  private _advanceTransition(deltaMs: number): void {
    if (!this._transition) {
      return;
    }

    if (this._transition.phase === 'out') {
      this._transition.elapsedMs = Math.min(this._transition.durationMs, this._transition.elapsedMs + Math.max(0, deltaMs));

      if (this._transition.elapsedMs >= this._transition.durationMs) {
        this._transition.phase = 'switching';
        void this._executeTransitionAction();
      }

      return;
    }

    if (this._transition.phase === 'in') {
      this._transition.elapsedMs = Math.min(this._transition.durationMs, this._transition.elapsedMs + Math.max(0, deltaMs));

      if (this._transition.elapsedMs >= this._transition.durationMs) {
        this._finishTransition();
      }
    }
  }

  private async _executeTransitionAction(): Promise<void> {
    const transition = this._transition;

    if (transition?.phase !== 'switching') {
      return;
    }

    try {
      await transition.action();
    } catch (error) {
      if (this._transition === transition) {
        this._transition = null;
        transition.color.destroy();
        transition.reject(error);
      }

      return;
    }

    if (this._transition !== transition) {
      return;
    }

    transition.phase = 'in';
    transition.elapsedMs = 0;
  }

  private _finishTransition(): void {
    if (!this._transition) {
      return;
    }

    const transition = this._transition;

    this._transition = null;
    transition.color.destroy();
    transition.resolve();
  }

  private _getTransitionAlpha(): number {
    if (!this._transition) {
      return 0;
    }

    if (this._transition.phase === 'switching') {
      return 1;
    }

    const progress = this._transition.durationMs > 0 ? this._transition.elapsedMs / this._transition.durationMs : 1;

    return this._transition.phase === 'out' ? progress : 1 - progress;
  }

  private _renderTransitionOverlay(alpha: number, backend: RenderBackend): void {
    const transition = this._transition;
    const overlayColor = transition ? transition.color : Color.black;
    const bounds = backend.view.getBounds();
    const overlay = this._transitionOverlay;
    const vertices = overlay.vertices;

    vertices[0] = bounds.left;
    vertices[1] = bounds.top;
    vertices[2] = bounds.right;
    vertices[3] = bounds.top;
    vertices[4] = bounds.left;
    vertices[5] = bounds.bottom;
    vertices[6] = bounds.right;
    vertices[7] = bounds.bottom;

    overlay.tint.set(overlayColor.r, overlayColor.g, overlayColor.b, Math.max(0, Math.min(1, alpha)));
    overlay.render(backend);
  }
}
