import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderingContext } from '#rendering/RenderingContext';

import type { Application } from './Application';
import { Color } from './Color';
import { logger } from './logging';
import { Scene } from './Scene';
import { SceneScope } from './SceneScope';
import type { SceneState } from './SceneState';
import {
  type AnySceneConstructor,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  resolveSetSceneArgs,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneTransition,
  type SetSceneArgs,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
import { Signal } from './Signal';
import type { Time } from './Time';

export type { FadeSceneTransition, RestoreSceneOptions, SceneTransition, SetSceneOptions } from './SceneTypes';
export { ConcurrentSceneNavigationError, RetainedSceneConflictError, RetainedSceneNotFoundError } from './SceneTypes';

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
  private readonly _registry: ReadonlyMap<AnySceneConstructor, string>;
  private _activeScope: SceneScope | null = null;
  private _activeScopeTarget: AnySceneConstructor | null = null;
  private readonly _retained = new Map<AnySceneConstructor, SceneScope>();
  private readonly _transitionOverlay: TransitionOverlayMesh = createOverlayMesh();
  private _transition: ActiveFadeTransition | null = null;
  private _inputGateDepth = 0;
  private _navigationInFlight = false;

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

  public constructor(app: Application, scenes?: Record<string, AnySceneConstructor>) {
    this._app = app;
    this._registry = validateSceneRegistry(scenes, Scene);
  }

  /** The active scene, or `null` when none is set. Read-only — see {@link SceneDirector.setScene} to change it. */
  public get currentScene(): Scene | null {
    return (this._activeScope?.scene as Scene | undefined) ?? null;
  }

  /** The active scene's current {@link SceneState}, or `null` when no scene is active. */
  public get state(): SceneState | null {
    return this._activeScope?.state ?? null;
  }

  /**
   * @internal `true` while an explicit fade transition is in flight — used
   * by {@link SceneInputs} (`when` policy) and {@link InteractionManager}
   * to suppress scene input/interaction dispatch for the transition's
   * duration, regardless of `when: 'always'` (definition §13.6). A
   * `setScene()` call with no `transition` option never opens this gate.
   */
  public get _transitionGateOpen(): boolean {
    return this._inputGateDepth > 0;
  }

  /**
   * Switch to a fresh instance of `target`, ending the previously active
   * scene permanently — unless `options.retainCurrent` is set, in which
   * case the outgoing scene is suspended and retained (keyed by its
   * constructor) for a later {@link SceneDirector.restoreScene} call
   * instead. Ordinary switching always creates a fresh instance (definition
   * §11.4) — this differs from the old instance-based API's same-instance
   * no-op check, which no longer applies. An optional fade transition runs
   * the swap at full opacity. The new scene completes `load()`+`init()`
   * before the old one is torn down, so there is no blank frame between
   * them, and the outgoing scene keeps running until the switch boundary is
   * crossed.
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight (dev and production builds — no
   * queueing, definition §11.5); with {@link UnregisteredSceneError} (dev
   * builds) when `target` is not present in `ApplicationOptions.scenes`;
   * with {@link RetainedSceneConflictError} when `target` already has a
   * retained instance (restore or release it first).
   */
  public async setScene<C extends AnySceneConstructor>(target: C, ...args: SetSceneArgs<InferSceneData<C>>): Promise<this> {
    const { data, options } = resolveSetSceneArgs(args);

    await this._runWithNavigation(async () => {
      if (__DEV__ && !this._registry.has(target)) {
        throw new UnregisteredSceneError(target.name, [...this._registry.values()]);
      }

      if (this._retained.has(target)) {
        throw new RetainedSceneConflictError(target.name);
      }

      const scene = new target();
      const newScope = await this._prepareScene(scene, data);
      const previousScope = this._activeScope;
      const previousTarget = this._activeScopeTarget;

      this._activeScope = newScope;
      this._activeScopeTarget = target;

      try {
        await this._handleOutgoingScope(previousScope, previousTarget, options.retainCurrent ?? false);
      } catch (error) {
        this._rollbackSwitch(previousScope, previousTarget);
        newScope.destroyFailedActivation();

        throw error;
      }

      newScope.activate();

      this.onChangeScene.dispatch(scene as Scene);
      this.onStartScene.dispatch(scene as Scene);
    }, options.transition);

    return this;
  }

  /**
   * @internal Clear the active scene (if any) without activating a new one.
   * Replaces the old `setScene(null)` path — used only by
   * {@link Application.stop} / {@link Application.destroy}, never part of
   * the public navigation surface (navigation always targets a registered
   * constructor).
   */
  public async _clearScene(): Promise<this> {
    await this._runWithNavigation(async () => {
      const previousScope = this._activeScope;

      this._activeScope = null;
      this._activeScopeTarget = null;

      if (previousScope !== null) {
        await this._disposeScene(previousScope);
      }

      this.onChangeScene.dispatch(null);
    });

    return this;
  }

  /**
   * Reactivate a scene previously retained via `setScene(..., { retainCurrent: true })`
   * or `restoreScene(..., { retainCurrent: true })` — the same instance,
   * returned to whichever of `Active`/`Paused` it had before suspension.
   * `load()`/`init()` do not run again (definition §14.3).
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight; with {@link RetainedSceneNotFoundError}
   * when `target` has no retained instance.
   */
  public async restoreScene<C extends AnySceneConstructor>(target: C, options: RestoreSceneOptions = {}): Promise<this> {
    const retainedScope = this._retained.get(target);

    if (retainedScope === undefined) {
      throw new RetainedSceneNotFoundError(target.name);
    }

    // Eager, synchronous claim: remove the scope from `_retained` before any
    // `await` so a concurrent restoreScene(target)/releaseScene(target) call
    // targeting the same constructor can never also see it — this closes
    // the race without needing releaseScene() to share the navigation lock.
    this._retained.delete(target);

    try {
      await this._runWithNavigation(async () => {
        const previousScope = this._activeScope;
        const previousTarget = this._activeScopeTarget;

        this._activeScope = retainedScope;
        this._activeScopeTarget = target;

        try {
          await this._handleOutgoingScope(previousScope, previousTarget, options.retainCurrent ?? false);
        } catch (error) {
          this._rollbackSwitch(previousScope, previousTarget);

          throw error;
        }

        const previousState = retainedScope.state;

        retainedScope.restore();

        this.onChangeScene.dispatch(retainedScope.scene as Scene);
        this.onStateChange.dispatch(previousState, retainedScope.state, retainedScope.scene as Scene);
      }, options.transition);
    } catch (error) {
      // Any failure (including a rejected concurrent-navigation guard, or
      // the inner rollback above already having restored `_activeScope`)
      // means the restore never committed — undo the eager claim so the
      // scope remains available for a future restoreScene/releaseScene call.
      this._retained.set(target, retainedScope);

      throw error;
    }

    return this;
  }

  /**
   * Permanently end a retained (suspended) scene without reactivating it.
   * Returns `true` if a retained instance existed for `target`, `false`
   * otherwise (no-op, not an error).
   */
  public async releaseScene<C extends AnySceneConstructor>(target: C): Promise<boolean> {
    const scope = this._retained.get(target);

    if (scope === undefined) {
      return false;
    }

    this._retained.delete(target);
    await this._disposeScene(scope);

    return true;
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
      this.onPause.dispatch(scope.scene as Scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene as Scene);
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
      this.onResume.dispatch(scope.scene as Scene);
      this.onStateChange.dispatch(previous, scope.state, scope.scene as Scene);
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
      this.onUpdateScene.dispatch(scope.scene as Scene);
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

  /**
   * Tear down every owned resource: reject an in-flight fade transition,
   * destroy the active scene, destroy every retained scene, then destroy
   * the overlay and all Signals. Fires `_dispose()` (async teardown) and
   * returns immediately — errors are reported through the app error
   * pipeline rather than propagated, matching every other synchronous
   * `destroy()` in the engine. An async shutdown path that needs to know
   * teardown has fully finished may `await` {@link SceneDirector._dispose}
   * directly instead of calling this method.
   */
  public destroy(): void {
    void this._dispose();
  }

  /**
   * @internal Awaited teardown, in order: reject any in-flight fade
   * transition → destroy the active scope (guarded, errors reported) →
   * destroy every retained scope in reverse insertion order (guarded,
   * errors reported) → destroy the transition overlay and every Signal.
   * Signals are destroyed last so scene teardown (`unload()`, `onStopScene`
   * listeners) can still use them while it runs. Does not participate in
   * the `_navigationInFlight` guard — teardown must always proceed
   * regardless of any in-flight navigation (definition §10.6).
   */
  public async _dispose(): Promise<void> {
    if (this._transition) {
      const transition = this._transition;

      this._transition = null;
      this._inputGateDepth--;
      transition.color.destroy();
      transition.reject(new Error('SceneDirector was destroyed while a transition was active.'));
    }

    const activeScope = this._activeScope;

    this._activeScope = null;
    this._activeScopeTarget = null;

    if (activeScope !== null) {
      try {
        await this._disposeScene(activeScope);
      } catch (error) {
        logger.error('SceneDirector.destroy() failed to unload the active scene.', { source: 'SceneDirector', ...(error instanceof Error && { error }) });
      }
    }

    const retainedInReverseInsertionOrder = [...this._retained.values()].reverse();

    this._retained.clear();

    for (const scope of retainedInReverseInsertionOrder) {
      try {
        await this._disposeScene(scope);
      } catch (error) {
        logger.error('SceneDirector.destroy() failed to destroy a retained scene.', { source: 'SceneDirector', ...(error instanceof Error && { error }) });
      }
    }

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
  private async _prepareScene<Data>(scene: Scene<Data>, data: Data): Promise<SceneScope<Data>> {
    const scope = new SceneScope(this._app, scene);

    try {
      await scope.prepare(data);

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
  private async _disposeScene(scope: SceneScope): Promise<void> {
    this.onStopScene.dispatch(scope.scene as Scene);
    await scope.destroy();
  }

  /**
   * Handle the outgoing scope at a switch boundary: suspend+retain it when
   * `retainCurrent` is set, otherwise permanently dispose it. No-op when
   * there is no outgoing scope (scene-less start). The only realistic
   * throw source here is a user `onStopScene` (dispose path) or
   * `onStateChange` (retain path) listener — `SceneScope.suspend()` and
   * `scope.destroy()` are both internally guarded and never throw
   * themselves.
   */
  private async _handleOutgoingScope(previousScope: SceneScope | null, previousTarget: AnySceneConstructor | null, retainCurrent: boolean): Promise<void> {
    if (previousScope === null) {
      return;
    }

    if (retainCurrent && previousTarget !== null) {
      this._suspendAndRetain(previousTarget, previousScope);

      return;
    }

    await this._disposeScene(previousScope);
  }

  /**
   * Suspend `scope` and store it in `_retained` under `target`. `scope` is
   * always the outgoing active scope here, which is always `Active` or
   * `Paused` — {@link SceneScope.suspend} is therefore guaranteed to
   * succeed (never skipped by its own state guard).
   */
  private _suspendAndRetain(target: AnySceneConstructor, scope: SceneScope): void {
    const previousState = scope.state;

    scope.suspend();
    this._retained.set(target, scope);

    this.onStateChange.dispatch(previousState, scope.state, scope.scene as Scene);
  }

  /**
   * Undo a switch-boundary reassignment after `_handleOutgoingScope` threw:
   * restore `_activeScope`/`_activeScopeTarget` to the previous scope, and —
   * if that scope had already been suspended+retained as part of this same
   * failed switch — remove it from `_retained` and un-suspend it. The
   * incoming scope's own cleanup (`destroyFailedActivation()`) is the
   * caller's responsibility (its exact call site differs between `setScene`,
   * which always has an incoming scope, and `restoreScene`, whose "incoming"
   * scope is the already-existing retained one and must not be destroyed on
   * this path).
   */
  private _rollbackSwitch(previousScope: SceneScope | null, previousTarget: AnySceneConstructor | null): void {
    this._activeScope = previousScope;
    this._activeScopeTarget = previousTarget;

    if (previousScope !== null && previousTarget !== null && this._retained.get(previousTarget) === previousScope) {
      this._retained.delete(previousTarget);
      previousScope.restore();
    }
  }

  /**
   * Run `action` as one atomic navigation step, guarded so at most one
   * navigation (`setScene`/`restoreScene`/`_clearScene`, transitioned or
   * not) is ever in flight at a time (definition §11.5 — a second request
   * rejects rather than queueing). Does not guard {@link SceneDirector._dispose},
   * which must always be able to proceed.
   */
  private async _runWithNavigation(action: () => Promise<void>, transition?: SceneTransition): Promise<void> {
    if (this._navigationInFlight) {
      throw new ConcurrentSceneNavigationError();
    }

    this._navigationInFlight = true;

    try {
      await this._runTransitionedAction(action, transition);
    } finally {
      this._navigationInFlight = false;
    }
  }

  private async _runTransitionedAction(action: () => Promise<void>, transition?: SceneTransition): Promise<void> {
    if (transition?.type !== 'fade') {
      await action();

      return;
    }

    const durationMs = Math.max(0, transition.duration ?? defaultFadeTransitionDuration);

    if (durationMs === 0) {
      await action();

      return;
    }

    await new Promise<void>((resolve, reject) => {
      this._inputGateDepth++;
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
        this._inputGateDepth--;
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
    this._inputGateDepth--;
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
