import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import type { Application } from './Application';
import { logger } from './logging';
import { Scene } from './Scene';
import { SceneNavigationTransaction } from './scene/SceneNavigationTransaction';
import { SceneScope } from './SceneScope';
import type { SceneState } from './SceneState';
import type {
  SceneTransition,
  SceneTransitionContext,
  SceneTransitionEnvironment,
  SceneTransitionFrame,
  SceneTransitionRequirements,
  SceneTransitionSession,
} from './SceneTransition';
import { SceneTransitionLifecycleError } from './SceneTransition';
import { resolveSceneTransitionSelection } from './SceneTransitionResolution';
import {
  AmbiguousSceneInstanceError,
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
  type SceneInstanceKind,
  SceneInstanceNotFoundError,
  type SceneRegistryIndex,
  type SceneRegistryShape,
  type UnloadOptions,
  UnregisteredSceneError,
  validateSceneRegistry,
} from './SceneTypes';
import { Signal } from './Signal';
import type { Time } from './Time';

export type {
  SceneTransitionContext,
  SceneTransitionEnvironment,
  SceneTransitionFrame,
  SceneTransitionOperation,
  SceneTransitionRequirements,
  SceneTransitionSession,
} from './SceneTransition';
export { SceneTransition, SceneTransitionLifecycleError } from './SceneTransition';
export type { ChangeSceneOptions, RestoreSceneOptions, SceneInstanceKind, UnloadOptions } from './SceneTypes';
export {
  AmbiguousSceneInstanceError,
  ConcurrentSceneNavigationError,
  RetainedSceneConflictError,
  RetainedSceneNotFoundError,
  SceneInstanceNotFoundError,
} from './SceneTypes';

type PreloadStatus = 'loading' | 'ready' | 'claimed' | 'cancelling';

/** Internal `_preloaded` entry — a small internal-only interface colocated with the class that uses it. */
interface PreloadEntry {
  readonly scope: SceneScope;
  readonly data: unknown;
  readonly ready: Promise<void>;
  status: PreloadStatus;
}

/** @internal Result of driving one transition session to its exit point. */
type SceneTransitionOutcome = { readonly ok: true; readonly error?: undefined } | { readonly ok: false; readonly error: unknown };

/** @internal Render resources provisioned for one transition session, released on every exit path. */
interface TransitionResources {
  readonly outgoingSnapshot: RenderTexture | null;
  readonly currentTexture: RenderTexture | null;
  readonly release: () => void;
}

/** @internal Director-owned implementation of {@link SceneTransitionEnvironment}. Not exported. */
class DirectorTransitionEnvironment implements SceneTransitionEnvironment {
  public readonly context: SceneTransitionContext;
  private _commitRequested = false;
  private _committed = false;

  public constructor(context: SceneTransitionContext) {
    this.context = context;
  }

  public get commitRequested(): boolean {
    return this._commitRequested;
  }

  public get committed(): boolean {
    return this._committed;
  }

  public commit(): void {
    if (this._commitRequested) {
      if (__DEV__) {
        throw new SceneTransitionLifecycleError('commit-reentrant');
      }

      return;
    }

    this._commitRequested = true;
  }

  /** @internal Called by the Director once the atomic commit boundary is actually crossed. */
  public _markCommitted(): void {
    this._committed = true;
  }
}

/**
 * Single-active-scene controller owned by {@link Application}. Holds at most one
 * active {@link Scene} (the current "screen"); {@link SceneDirector.change}
 * switches to a new scene — ending the previous one permanently — with an
 * optional {@link SceneTransition}.
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
 * Per-frame dispatch is split into entry points called by
 * {@link Application.update} in normative order: {@link SceneDirector.fixedUpdate}
 * (zero or more times), {@link SceneDirector.update}, then
 * {@link SceneDirector.draw}. An active {@link SceneTransitionSession} is
 * driven separately each frame via {@link SceneDirector._updateTransition}
 * and {@link SceneDirector._renderTransition}, composited above or below the
 * app draw systems depending on the session's `placement` (§3.6).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty registry is a valid default
export class SceneDirector<Registry extends SceneRegistryShape<Registry> = {}> {
  private readonly _app: Application;
  private readonly _registry: SceneRegistryIndex;
  private _activeScope: SceneScope | null = null;
  private _activeScopeTarget: AnySceneConstructor | null = null;
  private readonly _retained = new Map<AnySceneConstructor, SceneScope>();
  private readonly _preloaded = new Map<AnySceneConstructor, PreloadEntry>();
  private _activeSession: SceneTransitionSession | null = null;
  private _activeEnvironment: DirectorTransitionEnvironment | null = null;
  private _sessionAction: (() => Promise<void>) | null = null;
  private _sessionSettle: ((outcome: SceneTransitionOutcome) => void) | null = null;
  private _sessionCommitStarted = false;
  private _pendingOutgoingTeardown: Promise<void> | null = null;
  private _sessionResources: TransitionResources | null = null;
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
   * @internal `true` while a {@link SceneTransitionSession} is in flight —
   * used by {@link SceneInputs} (`when` policy) and {@link InteractionManager}
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
   * An optional `transition` (a {@link SceneTransition} instance) drives the
   * switch through a {@link SceneTransitionSession}: the atomic commit
   * boundary is deferred until the session requests it via
   * `environment.commit()`, and the returned promise resolves only once the
   * session finishes. With no `transition`, the switch runs the direct fast
   * path. `transition` is intentionally not yet part of
   * {@link ChangeSceneOptions}'s documented public shape (a registry-default
   * `SceneTransitionSelection` follows in a later slice).
   *
   * Rejects with {@link ConcurrentSceneNavigationError} when another
   * navigation is already in flight (dev and production builds — no
   * queueing, definition §11.5); with {@link UnregisteredSceneError} (dev
   * builds for a constructor target, every build for an unresolvable
   * registry key) when `target` is not present in
   * `ApplicationOptions.scenes`; with {@link RetainedSceneConflictError}
   * when `target` already has a retained instance (restore or unload it
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
      // uncommitted entry that never reaches the commit boundary below goes
      // back into `_preloaded` as `ready` rather than being destroyed (spec
      // §3.5.1) — see the `catch` on the transitioned action below, which is
      // reachable via §3.7's frame-loop abort (`_abortInFlightNavigation`).
      const preloadEntry = this._preloaded.get(resolvedTarget);
      const claimedEntry = preloadEntry !== undefined && preloadEntry.status !== 'cancelling' && Object.is(preloadEntry.data, data) ? preloadEntry : null;

      if (claimedEntry !== null) {
        this._preloaded.delete(resolvedTarget);
        claimedEntry.status = 'claimed';
      }

      const context: SceneTransitionContext = {
        operation: 'change',
        hasOutgoingScene: this._activeScope !== null,
        hasIncomingScene: true,
      };

      // Flipped `true` the instant the atomic switch begins consuming the
      // claim (before its `await`). Distinguishes "the claim was never
      // reached — a pre-commit session abort settled the navigation before
      // `commitSwitch` ran" (restore the claim, §3.5.1) from "`commitSwitch`
      // already started — it now owns the claimed scope's fate itself,
      // whether it goes on to commit, fail preparation, or bail on the §3.7
      // race guard below". The catch must never touch a claim `commitSwitch`
      // has taken over.
      let commitStarted = false;

      // The atomic switch (definition §3.5, steps 5-9). Invoked directly on
      // the direct fast path, or by the transition session once it calls
      // `environment.commit()`. `_prepareScene`/`_awaitClaimedPreload` runs
      // inside here, so a transitioned navigation only prepares the incoming
      // scope at commit time; nothing past prepare can fail or roll back.
      const commitSwitch = async (): Promise<void> => {
        commitStarted = true;

        // Captured before the prepare `await`: the session driving this
        // commit, or `null` on the direct fast path (no session at all).
        const sessionAtStart = this._activeSession;
        const scene = claimedEntry !== null ? (claimedEntry.scope.scene as Scene) : new resolvedTarget();
        const newScope = claimedEntry !== null ? await this._awaitClaimedPreload(claimedEntry) : await this._prepareScene(scene, data);

        // §3.7 concurrency guard. `_prepareScene`/`_awaitClaimedPreload` above
        // can await the incoming scene's `load()`/`init()` across several
        // frames (or a slow preload); a frame-loop stop
        // (`_abortInFlightNavigation`) can fire during that window — a scene's
        // own `load()` hook calling `app.stop()`, or a fatal frame error —
        // settling and rejecting this navigation while this continuation is
        // still suspended. Committing the switch now would activate the
        // incoming scene and tear the outgoing one down for a navigation the
        // app already reported aborted. Detect it (the session that drove
        // this commit is gone) and bail, tearing the freshly-prepared,
        // never-activated Ready scope down (Ready-scope cleanup, §3.5.1 —
        // `unload()` runs, `onStopScene` does not).
        if (sessionAtStart !== null && this._activeSession !== sessionAtStart) {
          await this._disposeScene(newScope, { dispatchStopScene: false });

          return;
        }

        const previousScope = this._activeScope;
        const previousTarget = this._activeScopeTarget;
        const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget! };
        const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);

        this._activeScope = newScope;
        this._activeScopeTarget = resolvedTarget;
        newScope.activate();

        this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);
        this.onStartScene.dispatchIsolated(error => this._reportLifecycleError(error), scene as Scene);

        // Not rollback-able (definition §3.5, steps 8-9). Outgoing teardown
        // settles in the background while the session keeps playing; the
        // navigation awaits it last via `_awaitPendingOutgoingTeardown`.
        this._navigation.finishOutgoingDisposition(pendingStopScene);
        this._pendingOutgoingTeardown = teardown;
      };

      const resolvedTransition = resolveSceneTransitionSelection('change', options.transition, this._registry.defaultTransitions.get(resolvedTarget));

      try {
        await (resolvedTransition === null ? commitSwitch() : this._runTransitionedAction(commitSwitch, context, resolvedTransition));
        await this._awaitPendingOutgoingTeardown();
      } catch (error) {
        // Pre-commit abort restoration (spec §3.5.1), mirroring restore()'s
        // `_retained` restoration. Only when `commitSwitch` never started:
        // once it has, it owns the claimed scope (commit, prepare-failure
        // cleanup, or the §3.7 race-guard teardown above all handle it), and
        // re-adding a consumed/destroyed scope here would corrupt `_preloaded`.
        if (!commitStarted && claimedEntry !== null) {
          claimedEntry.status = 'ready';
          this._preloaded.set(resolvedTarget, claimedEntry);
        }

        throw error;
      }
    });

    return this;
  }

  /**
   * @internal Clear the active scene (if any) without activating a new one.
   * Used by {@link Application.stop}/{@link Application.destroy} (no
   * transition, the default — runs the direct fast path), and by
   * {@link SceneDirector.unload}'s active-scope match, where an explicit
   * `transition` drives a full {@link SceneTransitionSession} (operation
   * `'unload'`, `hasIncomingScene: false` — the discard has no scene to
   * enter). Never part of the public navigation surface itself (navigation
   * always targets a registered constructor).
   */
  public async _clearScene(transition?: SceneTransition | null): Promise<this> {
    await this._runWithNavigation(async () => {
      const context: SceneTransitionContext = {
        operation: 'unload',
        hasOutgoingScene: this._activeScope !== null,
        hasIncomingScene: false,
      };

      const commitDiscard = (): Promise<void> => {
        const previousScope = this._activeScope;

        this._activeScope = null;
        this._activeScopeTarget = null;
        // Outgoing teardown backgrounds (same contract as change()/restore());
        // awaited last via `_awaitPendingOutgoingTeardown`.
        this._pendingOutgoingTeardown = previousScope !== null ? this._disposeScene(previousScope) : null;

        this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), null);

        return Promise.resolve();
      };

      await (transition === undefined || transition === null ? commitDiscard() : this._runTransitionedAction(commitDiscard, context, transition));
      await this._awaitPendingOutgoingTeardown();
    });

    return this;
  }

  /**
   * Reactivate a scene previously retained via
   * `change(..., { suspendCurrent: true })` or
   * `restore(..., { suspendCurrent: true })` — the same instance, returned
   * to whichever of `Active`/`Paused` it had before suspension. `load()`/
   * `init()` do not run again (definition §14.3). Shares the same atomic
   * commit boundary and optional {@link SceneTransition} behavior as
   * {@link SceneDirector.change} — see its doc comment for the exact
   * guarantee.
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
    // so a concurrent restore(target)/unload(target) call targeting
    // the same constructor can never also see it.
    this._retained.delete(resolvedTarget);

    try {
      await this._runWithNavigation(async () => {
        const context: SceneTransitionContext = {
          operation: 'restore',
          hasOutgoingScene: this._activeScope !== null,
          hasIncomingScene: true,
        };

        // Atomic commit boundary — restore() has no async prepare step, so
        // this reaches the commit point immediately (or as soon as a
        // transition session requests commit).
        const commitSwitch = (): Promise<void> => {
          const previousScope = this._activeScope;
          const previousTarget = this._activeScopeTarget;
          const outgoing = previousScope === null ? null : { scope: previousScope, target: previousTarget! };
          const { teardown, pendingStopScene } = this._navigation.beginOutgoingDisposition(outgoing, options.suspendCurrent ?? false);
          const previousState = retainedScope.state;

          this._activeScope = retainedScope;
          this._activeScopeTarget = resolvedTarget;
          retainedScope.restore();

          this.onChangeScene.dispatchIsolated(error => this._reportLifecycleError(error), retainedScope.scene as Scene);
          this.onStateChange.dispatchIsolated(error => this._reportLifecycleError(error), previousState, retainedScope.state, retainedScope.scene as Scene);

          this._navigation.finishOutgoingDisposition(pendingStopScene);
          this._pendingOutgoingTeardown = teardown;

          return Promise.resolve();
        };

        const resolvedTransition = resolveSceneTransitionSelection('restore', options.transition, this._registry.defaultTransitions.get(resolvedTarget));

        await (resolvedTransition === null ? commitSwitch() : this._runTransitionedAction(commitSwitch, context, resolvedTransition));
        await this._awaitPendingOutgoingTeardown();
      });
    } catch (error) {
      // Put the eager claim back into `_retained` — but only if the switch
      // never actually committed. A post-commit session failure (§3.5: the
      // new scene stays live) means `retainedScope` is now legitimately
      // `_activeScope`; re-adding it here would make the same scope both
      // live and "retained". The common pre-commit path (a rejected
      // concurrent-navigation guard, or a pre-commit session abort) restores
      // it so a future restore()/unload() can still reach it.
      if (this._activeScope !== retainedScope) {
        this._retained.set(resolvedTarget, retainedScope);
      }

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
   * Discard whatever is parked or active for `target`'s constructor — the
   * single, unified replacement for the removed `releaseScene()`. Checks
   * every candidate (active, retained, preloaded); when more than one
   * exists, `options.instance` must disambiguate which one — there is no
   * priority order. `options.transition` only materializes for an
   * active-scope match (a retained or preloaded match has nothing visible on
   * screen to transition, and always runs the direct, non-transitioned
   * teardown path).
   *
   * Returns `false` if nothing matched `target` at all. Rejects with
   * {@link AmbiguousSceneInstanceError} when `options.instance` is omitted
   * and more than one candidate exists; with {@link SceneInstanceNotFoundError}
   * when `options.instance` names a specific kind that doesn't exist for
   * `target`.
   */
  public async unload<C extends AnySceneConstructor>(target: C, options: UnloadOptions = {}): Promise<boolean> {
    const preloadEntry = this._preloaded.get(target);
    const candidates: SceneInstanceKind[] = [
      ...(this._activeScopeTarget === target ? (['active'] as const) : []),
      ...(this._retained.has(target) ? (['retained'] as const) : []),
      ...(preloadEntry !== undefined && preloadEntry.status !== 'cancelling' ? (['preloaded'] as const) : []),
    ];

    if (candidates.length === 0) {
      return false;
    }

    if (options.instance === undefined) {
      if (candidates.length > 1) {
        throw new AmbiguousSceneInstanceError(target.name, candidates);
      }

      return this._unloadInstance(target, candidates[0]!, options);
    }

    if (options.instance === 'all') {
      let unloadedAny = false;

      for (const kind of ['retained', 'preloaded', 'active'] as const) {
        if (!candidates.includes(kind)) {
          continue;
        }

        const unloaded = await this._unloadInstance(target, kind, options);

        unloadedAny = unloaded || unloadedAny;
      }

      return unloadedAny;
    }

    if (!candidates.includes(options.instance)) {
      throw new SceneInstanceNotFoundError(target.name, options.instance);
    }

    return this._unloadInstance(target, options.instance, options);
  }

  private async _unloadInstance(target: AnySceneConstructor, kind: SceneInstanceKind, options: UnloadOptions): Promise<boolean> {
    if (kind === 'retained') {
      const scope = this._retained.get(target);

      if (scope === undefined) {
        return false;
      }

      this._retained.delete(target);
      await this._disposeScene(scope);

      return true;
    }

    if (kind === 'preloaded') {
      return this._unloadPreloaded(target);
    }

    if (this._activeScopeTarget !== target) {
      return false;
    }

    // 'unload' never consults the registry default — resolveSceneTransitionSelection
    // enforces that internally regardless of what defaultTransitions holds for `target`.
    const resolvedTransition = resolveSceneTransitionSelection('unload', options.transition, this._registry.defaultTransitions.get(target));

    await this._clearScene(resolvedTransition);

    return true;
  }

  /**
   * Discard a `_preloaded` entry, racing an in-flight `preload()` safely:
   * marks the entry `cancelling` synchronously (so `preload()`'s own claim
   * check and `change()`'s claim check both skip it — see `preload()` and
   * `change()`'s claim step above), then waits for its `ready` to settle
   * before tearing anything down — `scope.destroy()` never runs
   * concurrently with an in-progress `prepare()`.
   */
  private async _unloadPreloaded(target: AnySceneConstructor): Promise<boolean> {
    const entry = this._preloaded.get(target);

    if (entry === undefined || entry.status === 'cancelling') {
      return false;
    }

    entry.status = 'cancelling';

    try {
      await entry.ready;
    } catch {
      // prepare() failed — _runPreloadPrepare() already ran the
      // failed-preparation cleanup and removed the entry. Nothing further to do.
      return true;
    }

    // prepare() succeeded — the scope genuinely reached Ready. Normal
    // permanent teardown, WITH unload() (spec §2.1/§3.5.1's "Ready-scope
    // cleanup"), but WITHOUT dispatching onStopScene (§2.1: never activated).
    if (this._preloaded.get(target) === entry) {
      this._preloaded.delete(target);
    }

    await this._disposeScene(entry.scope, { dispatchStopScene: false });

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
   * active scope's state does not permit drawing. An active transition
   * session's own visual output is drawn separately — see
   * {@link SceneDirector._renderTransition}.
   *
   * When a session requested `currentFrame: 'texture'` (§3.4), the active
   * scope's full render surface is redirected into the pooled offscreen
   * texture instead of straight to the canvas, so the session can composite
   * it itself.
   */
  public draw(context: RenderingContext): this {
    const currentTexture = this._sessionResources?.currentTexture ?? null;

    if (currentTexture !== null) {
      if (this._activeScope !== null) {
        context._renderSurfaceInto(currentTexture, this._app.clearColor, () => this._activeScope?.draw(context));
      }

      return this;
    }

    this._activeScope?.draw(context);

    return this;
  }

  /**
   * @internal Advance the active {@link SceneTransitionSession}'s `update()`
   * by `delta`, then check whether it just requested commit or reported
   * `done`. Called once per frame by {@link Application.update}. No-op when
   * no session is active.
   */
  public _updateTransition(delta: Time): void {
    const session = this._activeSession;

    if (session === null) {
      return;
    }

    try {
      session.update(delta);
    } catch (error) {
      this._finishActiveSession({ ok: false, error });

      return;
    }

    this._checkCommitRequested();
    this._checkSessionDone();
  }

  /**
   * @internal Which render layer the active session's output composites
   * against (§3.6), or `null` when no session is active. Read live every
   * frame by {@link Application.update} to decide draw order.
   */
  public _transitionPlacement(): 'scene' | 'screen' | null {
    return this._activeSession?.placement ?? null;
  }

  /**
   * @internal Render the active {@link SceneTransitionSession}'s own visual
   * output (not the scene itself — see the render-surface boundary, §3.6),
   * then check whether it just requested commit or reported `done`. No-op
   * when no session is active. The {@link SceneTransitionFrame} carries the
   * provisioned resources (§3.4/§3.7a): the one-time outgoing snapshot, and
   * the pooled "current" texture (only while there is a live scope to show).
   */
  public _renderTransition(context: RenderingContext): void {
    const session = this._activeSession;
    const environment = this._activeEnvironment;

    if (session === null || environment === null) {
      return;
    }

    const resources = this._sessionResources;
    const frame: SceneTransitionFrame = {
      outgoing: resources?.outgoingSnapshot ?? null,
      current: this._activeScope !== null ? (resources?.currentTexture ?? null) : null,
      committed: environment.committed,
    };

    try {
      session.render(context, frame);
    } catch (error) {
      this._finishActiveSession({ ok: false, error });

      return;
    }

    this._checkCommitRequested();
    this._checkSessionDone();
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
   * Tear down every owned resource: abort an in-flight transition session,
   * destroy the active scene, destroy every retained scene, then destroy
   * all Signals. Fires `_dispose()` (async teardown) and returns immediately
   * — errors are reported through the app error pipeline rather than
   * propagated, matching every other synchronous `destroy()` in the engine.
   * An async shutdown path that needs to know teardown has fully finished
   * may `await` {@link SceneDirector._dispose} directly instead of calling
   * this method.
   */
  public destroy(): void {
    void this._dispose();
  }

  /**
   * @internal Awaited teardown, in order: abort any in-flight transition
   * session (destroy it, reject its navigation) → destroy the active scope
   * (guarded, errors reported) → destroy every retained scope in reverse
   * insertion order (guarded, errors reported) → destroy every Signal.
   * Signals are destroyed last so scene teardown (`unload()`, `onStopScene`
   * listeners) can still use them while it runs. Does not participate in
   * the `_navigationInFlight` guard — teardown must always proceed
   * regardless of any in-flight navigation (definition §10.6).
   */
  public async _dispose(): Promise<void> {
    // Abort any in-flight transition session first, through the same public
    // entry point every frame-loop stop uses (§3.7). A no-op when nothing is
    // in flight; otherwise `_finishActiveSession` owns the full synchronous
    // teardown (destroy the session, release `_sessionResources`, decrement
    // the input gate — each exactly once) and rejects the pending navigation.
    // A `commitSwitch()` still awaiting its incoming scene's prepare() when
    // this fires is now caught by that method's own §3.7 race guard: it sees
    // the session gone and bails instead of mutating `_activeScope` behind us.
    this._abortInFlightNavigation(new SceneTransitionLifecycleError('aborted'));

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

    this.onChangeScene.destroy();
    this.onStartScene.destroy();
    this.onUpdateScene.destroy();
    this.onStopScene.destroy();
    this.onPause.destroy();
    this.onResume.destroy();
    this.onStateChange.destroy();
  }

  /**
   * @internal Abort whatever transition session is currently in flight, if
   * any, rejecting its pending navigation promise with `reason`. This
   * generalizes the single hard-coded abort {@link SceneDirector._dispose}
   * already performs (its `'aborted'` lifecycle-error case) to any point the
   * {@link Application} frame loop stops while a frame-driven session is
   * mid-flight (definition §3.7): a session cannot progress without per-frame
   * `update()`/`render()` callbacks, so rather than hang forever the
   * navigation is aborted. {@link SceneDirector._finishActiveSession} runs the
   * full generalized teardown (destroy the session exactly once, release its
   * render resources, close the input gate, settle the outer promise), and
   * the resulting rejection propagates up through each navigation method's own
   * pre-commit `catch`, restoring any claimed preload/retained entry per spec
   * §3.5.1.
   *
   * Returns `true` when a session was actually in flight and got aborted;
   * `false` when there was nothing to interrupt — no session at all, or a
   * navigation already past its atomic commit boundary (a committed switch is
   * never undone, §3.5). Idempotent: a second call once the session has
   * settled is a no-op `false`, since `_finishActiveSession` already cleared
   * `_activeSession`. Called by {@link Application} whenever it stops the
   * frame loop.
   *
   * NOTE: a `commitSwitch()` whose `_prepareScene()`/`_awaitClaimedPreload()`
   * is still asynchronously awaiting when this fires is handled by that
   * closure's own §3.7 race guard — it re-checks liveness after the `await`
   * and bails instead of mutating `_activeScope` for an already-rejected
   * navigation. That guard lives in {@link SceneDirector.change}'s commit
   * closure (the only navigation whose commit has an async prepare step).
   */
  public _abortInFlightNavigation(reason: Error): boolean {
    if (this._activeSession === null) {
      return false;
    }

    this._finishActiveSession({ ok: false, error: reason });

    return true;
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
   * navigation (`change`/`restore`/`_clearScene`, transitioned or not) is
   * ever in flight at a time (definition §11.5 — a second request rejects
   * rather than queueing). Transition handling lives in each navigation
   * method's own body, not here. Does not guard
   * {@link SceneDirector._dispose}, which must always be able to proceed.
   */
  private async _runWithNavigation(action: () => Promise<void>): Promise<void> {
    if (this._navigationInFlight) {
      throw new ConcurrentSceneNavigationError();
    }

    this._navigationInFlight = true;

    try {
      await action();
    } finally {
      this._navigationInFlight = false;
    }
  }

  /** Await and clear `_pendingOutgoingTeardown`, if a commitSwitch/commitDiscard set it this navigation. */
  private async _awaitPendingOutgoingTeardown(): Promise<void> {
    const pending = this._pendingOutgoingTeardown;

    this._pendingOutgoingTeardown = null;

    if (pending !== null) {
      await pending;
    }
  }

  /**
   * Run `commit` (the atomic switch/discard closure) through a full
   * transitioned navigation: provision the session's declared render
   * resources (§3.4), start `transition`'s session, then drive it once per
   * frame via {@link SceneDirector._updateTransition}/
   * {@link SceneDirector._renderTransition} until it calls
   * `environment.commit()` (which runs `commit`) and reports `done`. This
   * method only sets up the session and awaits its outer promise; the actual
   * per-frame ticking is done by `Application.update()` (or manually in
   * tests). The input gate is held open for the session's whole lifetime.
   *
   * KNOWN LIMITATION (removed by a later slice's `Application.start()` fix):
   * a transitioned navigation run as part of the very first navigation inside
   * `Application.start()` deadlocks — nothing drives the per-frame methods
   * yet (the frame loop has not started). Do not exercise a transitioned
   * navigation through `Application.start()`; drive `SceneDirector` directly.
   */
  private async _runTransitionedAction(commit: () => Promise<void>, context: SceneTransitionContext, transition: SceneTransition): Promise<void> {
    const requirements = transition.getRequirements(context);
    const resources = this._provisionTransitionResources(context, requirements);
    const environment = new DirectorTransitionEnvironment(context);

    let session: SceneTransitionSession;

    try {
      session = transition.beginSession(environment);
    } catch (error) {
      this._releaseTransitionResources(resources);

      throw error;
    }

    this._inputGateDepth++;

    const outcome = await new Promise<SceneTransitionOutcome>(resolve => {
      this._activeSession = session;
      this._activeEnvironment = environment;
      this._sessionAction = commit;
      this._sessionSettle = resolve;
      this._sessionCommitStarted = false;
      this._sessionResources = resources;

      // A session may call environment.commit() and/or report done()
      // synchronously from inside its own createSession() — check right away
      // rather than waiting for the first per-frame tick.
      this._checkCommitRequested();
      this._checkSessionDone();
    });

    // No cleanup here: the promise only ever settles via _finishActiveSession
    // (the sole caller of `settle`), which already cleared `_activeSession`/
    // `_activeEnvironment`/`_sessionAction`/`_sessionResources` and decremented
    // the input gate synchronously, before this continuation's microtask ran.
    if (!outcome.ok) {
      throw outcome.error;
    }
  }

  /**
   * If the active session has requested commit and it has not started yet,
   * kick off the atomic switch. The switch itself runs asynchronously (its
   * `_prepareScene` may await) — never reentrantly from inside the session
   * callback that requested it (§3.5.2).
   */
  private _checkCommitRequested(): void {
    const environment = this._activeEnvironment;

    if (environment === null || this._sessionCommitStarted || !environment.commitRequested) {
      return;
    }

    this._sessionCommitStarted = true;
    void this._performSessionCommit();
  }

  private async _performSessionCommit(): Promise<void> {
    const environment = this._activeEnvironment;
    const commit = this._sessionAction;

    if (environment === null || commit === null) {
      return;
    }

    try {
      await commit();
    } catch (error) {
      this._finishActiveSession({ ok: false, error });

      return;
    }

    environment._markCommitted();
    this._checkSessionDone();
  }

  /**
   * Finish the active session if it has reported `done`: a session done
   * before commit is a `'done-before-commit'` lifecycle error (the switch
   * never happened — the old scene stays live), otherwise a clean success.
   * No-op while the session is not yet done.
   */
  private _checkSessionDone(): void {
    const session = this._activeSession;
    const environment = this._activeEnvironment;

    if (session === null || environment === null || !session.done) {
      return;
    }

    if (!environment.committed) {
      this._finishActiveSession({ ok: false, error: new SceneTransitionLifecycleError('done-before-commit') });

      return;
    }

    this._finishActiveSession({ ok: true });
  }

  /**
   * Finish the active session, performing ALL session-completion cleanup
   * synchronously and exactly once at the moment completion is detected —
   * before settling the outer navigation promise (whose `await` continuation
   * in {@link SceneDirector._runTransitionedAction} only resumes on a later
   * microtask). Clearing `_activeSession`/`_activeEnvironment` and releasing
   * `_sessionResources` here (rather than in that continuation) is what makes
   * the rest of the SAME frame safe: once this returns, any later per-frame
   * call this tick — {@link SceneDirector.draw},
   * {@link SceneDirector._updateTransition},
   * {@link SceneDirector._transitionPlacement},
   * {@link SceneDirector._renderTransition} — sees a cleared session and
   * no-ops, so `session.update()`/`session.render()` are never called on, and
   * `draw()` never redirects into a texture owned by, the session this method
   * just destroyed (§3.7b; {@link SceneTransitionSession.destroy}'s "no
   * further update()/render() calls follow" contract). This matters because
   * a session commonly reports `done` from inside `_updateTransition()`,
   * which runs BEFORE this frame's `draw()`/`_renderTransition()`.
   *
   * Steps, in order: null the session/environment/action/settle handles and
   * release the render resources, decrement the input gate (exactly once per
   * session lifecycle — the increment lives in `_runTransitionedAction`),
   * destroy the session exactly once (§3.7b), report any failure (both the
   * session's own error and any error `session.destroy()` itself throws)
   * through the app error pipeline, then settle the outer navigation promise
   * last.
   *
   * Idempotent — a second call once the session has already settled is a
   * no-op, which matters because `_updateTransition` and `_renderTransition`
   * can each independently decide the session is done on the same frame, and
   * because `_dispose()` may abort a session that a per-frame method is
   * mid-completing.
   */
  private _finishActiveSession(outcome: SceneTransitionOutcome): void {
    const session = this._activeSession;
    const settle = this._sessionSettle;

    if (session === null || settle === null) {
      return;
    }

    // Clear all session state synchronously, up front — before destroy() and
    // before settle(). The guard above (captured into `session`/`settle`)
    // makes this the single, atomic ownership handoff: any re-entrant or
    // later same-tick call now short-circuits.
    this._activeSession = null;
    this._activeEnvironment = null;
    this._sessionAction = null;
    this._sessionSettle = null;
    this._releaseTransitionResources(this._sessionResources);
    this._sessionResources = null;
    this._inputGateDepth--;

    try {
      session.destroy();
    } catch (error) {
      this._app.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
    }

    if (!outcome.ok) {
      this._app.onError.dispatch(outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error)));
    }

    settle(outcome);
  }

  /**
   * Provision render resources for a session about to start, per its
   * declared {@link SceneTransitionRequirements} (§3.4). Textures are sized
   * to the current canvas backing-store dimensions (device-pixel-ratio
   * aware, since `Application` already bakes `pixelRatio` into
   * `canvas.width`/`canvas.height`) and, for the pooled "current" texture
   * only, resized live if the canvas resizes mid-session — a frozen
   * `outgoingFrame: 'snapshot'` is deliberately never resized (§3.7a: "the
   * same snapshot texture for the entire session — never reallocated").
   */
  private _provisionTransitionResources(context: SceneTransitionContext, requirements: SceneTransitionRequirements): TransitionResources {
    const width = this._app.canvas.width;
    const height = this._app.canvas.height;

    const outgoingSnapshot =
      requirements.outgoingFrame === 'snapshot' && this._activeScope !== null ? this._captureOutgoingSnapshot(this._activeScope, width, height) : null;

    const currentTexture = requirements.currentFrame === 'texture' ? this._app.backend.acquireRenderTexture(width, height) : null;

    const onResize = (): void => {
      currentTexture?.setSize(this._app.canvas.width, this._app.canvas.height);
    };

    this._app.onResize.add(onResize);

    void context; // reserved for future requirement-dependent provisioning (none needed yet)

    return {
      outgoingSnapshot,
      currentTexture,
      release: () => {
        this._app.onResize.remove(onResize);

        if (outgoingSnapshot !== null) {
          this._app.backend.releaseRenderTexture(outgoingSnapshot);
        }

        if (currentTexture !== null) {
          this._app.backend.releaseRenderTexture(currentTexture);
        }
      },
    };
  }

  /** One-time capture of `scope`'s full render surface (`Scene.draw()` + its systems + `Scene.ui`) into a fresh pooled texture, while it is still the live scope. */
  private _captureOutgoingSnapshot(scope: SceneScope, width: number, height: number): RenderTexture {
    const snapshot = this._app.backend.acquireRenderTexture(width, height);

    this._app.rendering._renderSurfaceInto(snapshot, this._app.clearColor, () => scope.draw(this._app.rendering));

    return snapshot;
  }

  private _releaseTransitionResources(resources: TransitionResources | null): void {
    resources?.release();
  }
}
