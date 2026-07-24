import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderingContext } from '#rendering/RenderingContext';

import type { Application } from './Application';
import { Color } from './Color';
import { logger } from './logging';
import { Scene } from './Scene';
import { SceneNavigationTransaction } from './scene/SceneNavigationTransaction';
import { SceneScope } from './SceneScope';
import type { SceneState } from './SceneState';
import {
  type AnySceneConstructor,
  type ChangeSceneArgs,
  type ChangeSceneCallOptions,
  ConcurrentSceneNavigationError,
  type InferSceneData,
  type PreloadArgs,
  type RegistryKeyOf,
  resolvePreloadArgs,
  type RestoreSceneCallOptions,
  type RestoreSceneOptions,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  type SceneRegistryIndex,
  type SceneRegistryShape,
  type SceneTransition,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
import { Signal } from './Signal';
import type { Time } from './Time';

export type { ChangeSceneOptions, FadeSceneTransition, RestoreSceneOptions, SceneTransition } from './SceneTypes';
export { ConcurrentSceneNavigationError, RetainedSceneConflictError, RetainedSceneNotFoundError } from './SceneTypes';

type PreloadStatus = 'loading' | 'ready' | 'claimed' | 'cancelling' | 'failed';

/** Internal `_preloaded` entry — same "small internal-only interface colocated with the class that uses it" convention as {@link ActiveFadeTransition}. */
interface PreloadEntry {
  readonly scope: SceneScope;
  readonly data: unknown;
  readonly ready: Promise<void>;
  status: PreloadStatus;
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
 * active {@link Scene} (the current "screen"); {@link SceneDirector.change}
 * switches to a new scene — ending the previous one permanently — with an
 * optional fade transition.
 *
 * The `Registry` generic (inferred from `ApplicationOptions.scenes`, spec
 * §6.1) types the scene registry passed at construction. This class stores
 * it bidirectionally (`byConstructor`/`byKey`) — `byConstructor` backs
 * constructor-target registration/diagnostics checks, `byKey` backs
 * key-based navigation (`change`/`restore` given a registered string key
 * instead of a constructor).
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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty registry is a valid default
export class SceneDirector<Registry extends SceneRegistryShape<Registry> = {}> {
  private readonly _app: Application;
  private readonly _registry: SceneRegistryIndex;
  private _activeScope: SceneScope | null = null;
  private _activeScopeTarget: AnySceneConstructor | null = null;
  private readonly _retained = new Map<AnySceneConstructor, SceneScope>();
  private readonly _preloaded = new Map<AnySceneConstructor, PreloadEntry>();
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
  /** Fires after `pause()` actually sets the active scene's `paused` flag. */
  public readonly onPause = new Signal<[Scene]>();
  /** Fires after `resume()` actually clears the active scene's `paused` flag. */
  public readonly onResume = new Signal<[Scene]>();
  /**
   * Fires whenever a scene's {@link SceneState} changes, as
   * `(previous, next, scene)` — every edge in the state graph, including
   * `Preparing` → `Ready`, `Ready` → `Active`, and the terminal
   * `Destroying` → `Destroyed` teardown, not just pause/resume/retention.
   * Pure observation: a throwing listener is reported through
   * {@link Application.onError} and never aborts the transition or blocks
   * the remaining listeners (definition §2.2/§2.2.1).
   */
  public readonly onStateChange = new Signal<[SceneState, SceneState, Scene]>();

  // Relies on class field initializers running top-to-bottom in declaration
  // order — `_retained`/`onStopScene`/`onStateChange` above are already
  // assigned by the time this initializer runs.
  private readonly _navigation = new SceneNavigationTransaction(this._retained, this.onStopScene, this.onStateChange, error =>
    this._reportLifecycleError(error),
  );

  public constructor(app: Application, scenes?: Registry) {
    this._app = app;
    this._registry = validateSceneRegistry(scenes, Scene);
  }

  /** The active scene, or `null` when none is set. Read-only — see {@link SceneDirector.change} to change it. */
  public get currentScene(): Scene | null {
    return (this._activeScope?.scene as Scene | undefined) ?? null;
  }

  /** The active scene's current {@link SceneState}, or `null` when no scene is active. */
  public get state(): SceneState | null {
    return this._activeScope?.state ?? null;
  }

  /** `true` while the active scene is paused, or `false` when no scene is active. See {@link SceneDirector.pause}/{@link SceneDirector.resume}. */
  public get paused(): boolean {
    return this._activeScope?.paused ?? false;
  }

  /**
   * @internal `true` while an explicit fade transition is in flight — used
   * by {@link SceneInputs} (`when` policy) and {@link InteractionManager}
   * to suppress scene input/interaction dispatch for the transition's
   * duration, regardless of `when: 'always'` (definition §13.6). A
   * `change()` call with no `transition` option never opens this gate.
   */
  public get _transitionGateOpen(): boolean {
    return this._inputGateDepth > 0;
  }

  /**
   * Switch to a fresh instance of `target` (a registered key or a
   * constructor), ending the previously active scene permanently — unless
   * `options.suspendCurrent` is set, in which case the outgoing scene is
   * suspended and retained (keyed by its constructor) for a later
   * {@link SceneDirector.restore} call instead. Ordinary switching always
   * creates a fresh instance (definition §11.4). The new scene completes
   * `load()`+`init()` while the outgoing scene is still fully live and
   * driving frames; the switch itself is then atomic (definition §3.5):
   * once the incoming scope has been prepared, nothing past that point can
   * fail or roll back — the outgoing scope is suspended or torn down and
   * the incoming scope activated as one uninterruptible step, and the
   * returned promise additionally waits for the outgoing scope's permanent
   * teardown to fully settle (skipped when `suspendCurrent` is set, since
   * there is nothing to tear down).
   *
   * A `transition` option shaped like today's hardcoded fade transition
   * (`{ type: 'fade', duration?, color? }`) is still accepted and runs
   * exactly as it does today — a temporary bridge to the pre-existing fade
   * machinery, removed once a later slice lands the real transition
   * runtime and adds a `transition` field to {@link ChangeSceneOptions}
   * itself. It is intentionally not part of {@link ChangeSceneOptions}'s
   * documented public shape.
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight (dev and production builds — no
   * queueing, definition §11.5); with {@link UnregisteredSceneError} (dev
   * builds for a constructor target, every build for an unresolvable
   * registry key) when `target` is not present in
   * `ApplicationOptions.scenes`; with {@link RetainedSceneConflictError}
   * when `target` already has a retained instance (restore or release it
   * first).
   */
  public async change<K extends RegistryKeyOf<Registry>>(target: K, ...args: ChangeSceneArgs<InferSceneData<Registry[K]>>): Promise<this>;
  public async change<C extends AnySceneConstructor>(target: C, ...args: ChangeSceneArgs<InferSceneData<C>>): Promise<this>;
  public async change(target: AnySceneConstructor | string, ...args: readonly unknown[]): Promise<this> {
    const options = ((args[0] as ChangeSceneCallOptions<unknown> | undefined) ?? {}) as ChangeSceneCallOptions<unknown>;
    const data = (options as { data?: unknown }).data;

    await this._runWithNavigation(async () => {
      // Resolved inside the navigation lock, deliberately — this preserves
      // the existing check order (concurrent-navigation guard first, then
      // target validation) for both a bad key and an unregistered
      // constructor alike, rather than only for the latter.
      const resolvedTarget = this._resolveNavigationTarget(target);

      if (__DEV__ && !this._registry.byConstructor.has(resolvedTarget)) {
        throw new UnregisteredSceneError(resolvedTarget.name, [...this._registry.byConstructor.values()]);
      }

      if (this._retained.has(resolvedTarget)) {
        throw new RetainedSceneConflictError(resolvedTarget.name);
      }

      // Synchronous, before-first-await claim of a matching `_preloaded`
      // entry (Object.is() on the activation data) — mirrors restore()'s
      // eager claim-before-await pattern for `_retained`. A claimed-but-
      // uncommitted entry that fails to reach the commit boundary below
      // would, per spec §3.5.1, go back into `_preloaded` as `ready` rather
      // than being destroyed — but the only way to reach that case is
      // §3.7's frame-loop abort scenario, which does not exist yet (Slice
      // 7, built on Slice 5's transition sessions); change()'s current body
      // has no pre-commit failure point past this claim for that
      // restoration to guard, so there is nothing to wire up here yet.
      const preloadEntry = this._preloaded.get(resolvedTarget);
      const claimedEntry = preloadEntry !== undefined && preloadEntry.status !== 'cancelling' && Object.is(preloadEntry.data, data) ? preloadEntry : null;

      if (claimedEntry !== null) {
        this._preloaded.delete(resolvedTarget);
        claimedEntry.status = 'claimed';
      }

      const scene = claimedEntry !== null ? (claimedEntry.scope.scene as Scene) : new resolvedTarget();
      const newScope = claimedEntry !== null ? await this._awaitClaimedPreload(claimedEntry) : await this._prepareScene(scene, data);

      // Atomic commit boundary (definition §3.5, steps 5-7) — nothing past
      // this point can fail or roll back.
      const previousScope = this._activeScope;
      const previousTarget = this._activeScopeTarget;
      const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget! };
      const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);

      this._activeScope = newScope;
      this._activeScopeTarget = resolvedTarget;
      newScope.activate();

      this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);
      this.onStartScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);

      // Not rollback-able (definition §3.5, steps 8-9).
      this._navigation.finishOutgoingDisposition(pendingStopScene);
      await teardown;
    }, options.transition);

    return this;
  }

  /**
   * @internal Clear the active scene (if any) without activating a new one.
   * Used by {@link Application.stop}/{@link Application.destroy} (no
   * transition, the default), and by {@link SceneDirector.unload}'s
   * active-scope match (an explicit `transition` may apply there — spec §5).
   * Never part of the public navigation surface itself (navigation always
   * targets a registered constructor).
   */
  public async _clearScene(transition?: SceneTransition): Promise<this> {
    await this._runWithNavigation(async () => {
      const previousScope = this._activeScope;

      this._activeScope = null;
      this._activeScopeTarget = null;

      if (previousScope !== null) {
        await this._disposeScene(previousScope);
      }

      this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), null);
    }, transition);

    return this;
  }

  /**
   * Reactivate a scene previously retained via
   * `change(..., { suspendCurrent: true })` or
   * `restore(..., { suspendCurrent: true })` — the same instance, returned
   * to whichever of `Active`/`Paused` it had before suspension. `load()`/
   * `init()` do not run again (definition §14.3). Shares the same atomic
   * commit boundary as {@link SceneDirector.change} — see its doc comment
   * for the exact guarantee and the temporary fade-transition bridge.
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight; with {@link RetainedSceneNotFoundError}
   * when `target` has no retained instance.
   */
  public async restore<K extends RegistryKeyOf<Registry>>(target: K, options?: RestoreSceneOptions): Promise<this>;
  public async restore<C extends AnySceneConstructor>(target: C, options?: RestoreSceneOptions): Promise<this>;
  public async restore(target: AnySceneConstructor | string, options: RestoreSceneCallOptions = {}): Promise<this> {
    const resolvedTarget = this._resolveNavigationTarget(target);
    const retainedScope = this._retained.get(resolvedTarget);

    if (retainedScope === undefined) {
      throw new RetainedSceneNotFoundError(resolvedTarget.name);
    }

    // Eager, synchronous claim: removed from `_retained` before any `await`
    // so a concurrent restore(target)/releaseScene(target) call targeting
    // the same constructor can never also see it.
    this._retained.delete(resolvedTarget);

    try {
      await this._runWithNavigation(async () => {
        const previousScope = this._activeScope;
        const previousTarget = this._activeScopeTarget;
        const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget! };
        const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);

        // Atomic commit boundary — restore() has no async prepare step, so
        // this reaches the commit point immediately.
        const previousState = retainedScope.state;

        this._activeScope = retainedScope;
        this._activeScopeTarget = resolvedTarget;
        retainedScope.restore();

        this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), retainedScope.scene as Scene);
        this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previousState, retainedScope.state, retainedScope.scene as Scene);

        this._navigation.finishOutgoingDisposition(pendingStopScene);
        await teardown;
      }, options.transition);
    } catch (error) {
      // Only reachable here via a rejected concurrent-navigation guard —
      // retainedScope.restore() itself never throws (SceneScope guards
      // every facility call). Put the eager claim back so the scope
      // remains available for a future restore()/releaseScene() call.
      this._retained.set(resolvedTarget, retainedScope);

      throw error;
    }

    return this;
  }

  /**
   * Transparently pre-warm a fresh instance of `target` into {@link SceneState.Ready}
   * — fully prepared (`load()` + `init()` complete), but never activated. A
   * later {@link SceneDirector.change} call for the same constructor with
   * `Object.is()`-matching data consumes it automatically, skipping `load()`/
   * `init()` entirely. Not exclusive of an active or retained instance of the
   * same constructor — preloading "the next `GameScene`" while a different
   * `GameScene` instance is currently playing, or already retained, is fully
   * supported.
   *
   * A racing second `preload()` call for the same constructor shares this
   * same in-flight preparation when its data matches (`Object.is()`); a call
   * with different data discards the stale entry (once its own preparation
   * settles) and starts a fresh one with the new data — the newest call's
   * data always wins, never silently ignored.
   *
   * Rejects with {@link UnregisteredSceneError} (dev builds) when `target` is
   * not present in `ApplicationOptions.scenes`.
   */
  public async preload<C extends AnySceneConstructor>(target: C, ...args: PreloadArgs<InferSceneData<C>>): Promise<void> {
    const { data } = resolvePreloadArgs(args);
    const existing = this._preloaded.get(target);

    if (existing !== undefined && existing.status !== 'cancelling') {
      if (Object.is(existing.data, data)) {
        return existing.ready;
      }

      this._preloaded.delete(target);
      this._discardStalePreload(existing);
    }

    if (__DEV__ && !this._registry.byConstructor.has(target)) {
      throw new UnregisteredSceneError(target.name, [...this._registry.byConstructor.values()]);
    }

    const scene = new target();
    const scope = new SceneScope(this._app, scene, (previous, next) =>
      this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previous, next, scene as Scene),
    );
    const entry = {
      scope,
      data,
      status: 'loading',
      ready: undefined,
    } as unknown as { scope: SceneScope; data: unknown; ready: Promise<void>; status: PreloadStatus };

    entry.ready = this._runPreloadPrepare(target, entry, scene as Scene, data);

    this._preloaded.set(target, entry);

    return entry.ready;
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
   * Pause the active scene. Its `fixedUpdate`/`update` stop running, but
   * `draw` keeps rendering and input/interaction stay live — the canonical
   * "pause menu drawn over a frozen world" shape. This does not change
   * {@link SceneDirector.state} — see {@link SceneDirector.paused} instead.
   * No-op (returns `false`) when no scene is active, it is not currently
   * `Active`, or it is already paused.
   */
  public pause(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const changed = scope.pause();

    if (changed) {
      this.onPause.dispatch(scope.scene as Scene);
    }

    return changed;
  }

  /**
   * Resume a paused scene, undoing {@link SceneDirector.pause}. No-op
   * (returns `false`) when no scene is active or it is not currently paused.
   */
  public resume(): boolean {
    const scope = this._activeScope;

    if (scope === null) {
      return false;
    }

    const changed = scope.resume();

    if (changed) {
      this.onResume.dispatch(scope.scene as Scene);
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
   * Report an exception thrown by a lifecycle Signal listener — used as the
   * `onError` callback for every `dispatchIsolated` call in this class
   * (definition §2.2/§2.2.1): logged, then forwarded to
   * {@link Application.onError}. Never propagates itself; `Signal.dispatchIsolated`
   * additionally guards against a throwing `onError` callback, but this
   * implementation does not throw regardless.
   */
  private _reportLifecycleError(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));

    logger.error('A SceneDirector lifecycle signal listener threw.', { source: 'SceneDirector', error: normalized });
    this._app.onError.dispatch(normalized);
  }

  /**
   * Resolve a `change()`/`restore()` navigation target: a constructor
   * passes through unchanged; a registered key resolves to its constructor
   * via the bidirectional registry. An unresolvable key is always an
   * error, in every build — unlike an unregistered *constructor* (checked
   * separately, dev-only), there is no constructor to fall back to for an
   * unresolvable key.
   *
   * Callers resolve at different points relative to the navigation lock:
   * `change()` resolves inside `_runWithNavigation`, deliberately, to
   * preserve its existing check order (concurrent-navigation guard first,
   * then target validation); `restore()` resolves eagerly, before the lock,
   * so a `restore('missing-key')` call rejects with
   * {@link UnregisteredSceneError} even while another navigation is already
   * in flight, rather than {@link ConcurrentSceneNavigationError}.
   */
  private _resolveNavigationTarget(target: AnySceneConstructor | string): AnySceneConstructor {
    if (typeof target !== 'string') {
      return target;
    }

    const resolved = this._registry.byKey.get(target);

    if (resolved === undefined) {
      throw new UnregisteredSceneError(target, [...this._registry.byConstructor.values()]);
    }

    return resolved;
  }

  /**
   * Construct (unless `scope` is already supplied — used by
   * {@link SceneDirector.preload}, which needs the `SceneScope` reference to
   * exist before `prepare()` resolves) and run its activation sequence
   * (attach → `Preparing` → `load()` → `init()`). On failure, runs the
   * definition §16 failed-activation cleanup — engine-managed registrations
   * destroyed, loader claims released, `scene.destroy()` invoked, but
   * `unload()` is never called — and rethrows the original error unchanged.
   */
  private async _prepareScene<Data>(
    scene: Scene<Data>,
    data: Data,
    scope = new SceneScope<Data>(this._app, scene, (previous, next) =>
      this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previous, next, scene as Scene),
    ),
  ): Promise<SceneScope<Data>> {
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

  /**
   * Await a claimed `_preloaded` entry's own `ready` — already resolved if
   * the preload had reached `Ready`, still pending if it was mid-`load()`/
   * `init()` when claimed (spec §3.5 step 4: "an already-preloaded target
   * reaches the commit boundary almost immediately since there's nothing
   * left to await"). If `ready` rejects, the preload's own preparation
   * failure already ran the ordinary failed-preparation cleanup
   * (`_runPreloadPrepare`'s catch, see above) — nothing further to restore
   * here, this call simply propagates the same rejection `change()` would
   * have produced for a fresh `prepare()` failure.
   */
  private async _awaitClaimedPreload(entry: PreloadEntry): Promise<SceneScope> {
    await entry.ready;

    return entry.scope;
  }

  /**
   * Runs the actual `prepare()` for a `preload()` entry. Marks the entry
   * `ready` on success (unless a racing `unload()` already marked it
   * `cancelling` — in that case `unload()` itself owns the final teardown;
   * this method leaves it alone), or removes it from `_preloaded` and
   * rethrows on failure (ordinary failed-preparation cleanup — no `unload()`,
   * spec §3.5.1).
   */
  private async _runPreloadPrepare(target: AnySceneConstructor, entry: PreloadEntry, scene: Scene, data: unknown): Promise<void> {
    try {
      await this._prepareScene(scene, data, entry.scope);
    } catch (error) {
      if (this._preloaded.get(target) === entry) {
        this._preloaded.delete(target);
      }

      throw error;
    }

    if (entry.status === 'cancelling') {
      return;
    }

    entry.status = 'ready';
  }

  /**
   * Discard a `_preloaded` entry that a newer `preload()`/`change()` call
   * superseded (mismatched data). Never destroys the scope while its own
   * `prepare()` is still in flight — waits for `ready` to settle first, then
   * tears it down through the normal "Ready-scope cleanup" path (`unload()`
   * runs, `onStopScene` does not — spec §2.1/§3.5.1). A failed `prepare()`
   * already cleaned itself up via `_runPreloadPrepare`'s own catch above —
   * nothing further to do in that case.
   */
  private _discardStalePreload(entry: PreloadEntry): void {
    entry.status = 'cancelling';

    void entry.ready
      .then(() => this._disposeScene(entry.scope, { dispatchStopScene: false }))
      .catch(() => {
        /* prepare() itself failed — already cleaned up */
      });
  }

  /**
   * Permanently end `scope`'s scene: dispatch {@link SceneDirector.onStopScene}
   * (unless `dispatchStopScene: false` — used by {@link SceneDirector.unload}
   * for a preloaded scope that never reached `Active`; spec §2.1:
   * "`onStopScene` fires only for a scope activated at least once"), then run
   * the scope's teardown sequence (definition §17).
   */
  private async _disposeScene(scope: SceneScope, options: { dispatchStopScene?: boolean } = {}): Promise<void> {
    if (options.dispatchStopScene ?? true) {
      this.onStopScene.dispatchIsolated(error => this._reportLifecycleError(error), scope.scene as Scene);
    }

    await scope.destroy();
  }

  /**
   * Run `action` as one atomic navigation step, guarded so at most one
   * navigation (`change`/`restore`/`_clearScene`, transitioned or
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
