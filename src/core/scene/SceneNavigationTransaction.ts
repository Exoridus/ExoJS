import type { Scene } from '#core/Scene';
import type { SceneScope } from '#core/SceneScope';
import type { SceneState } from '#core/SceneState';
import type { AnySceneConstructor } from '#core/SceneTypes';
import type { Signal } from '#core/Signal';

/** An outgoing scope at a switch boundary, paired with the constructor it was activated from (needed to key it in `_retained` when suspended). */
export interface OutgoingScope {
  readonly scope: SceneScope;
  readonly target: AnySceneConstructor;
}

/** Result of {@link SceneNavigationTransaction.prepareOutgoingDisposition}. */
export interface OutgoingDisposition {
  /** The scope about to be permanently torn down, or `null` when there is nothing to tear down (no outgoing scope, or it was suspended instead). Pass to {@link SceneNavigationTransaction.dispatchStopScene} then {@link SceneNavigationTransaction.beginOutgoingTeardown}, in that order. */
  readonly pendingStopScene: SceneScope | null;
}

/**
 * @internal Collaborator owned by `SceneDirector`, holding the atomic
 * commit-boundary logic shared by
 * `change()` and `restore()` - and the exact seam the
 * transition-session runner calls through at its own commit point, so this
 * logic exists in exactly one place rather than duplicated per call site.
 * Holds no state of its own beyond the `_retained` map and the two Director
 * signals it dispatches through, both handed in at construction -
 * `SceneDirector` remains the sole owner of `_activeScope`/
 * `_activeScopeTarget`/`_retained` itself.
 *
 * Split into three steps - `prepareOutgoingDisposition` →
 * `dispatchStopScene` → `beginOutgoingTeardown` - rather than one call,
 * so the caller can interleave incoming-scope activation and
 * `onChangeScene`/`onStartScene` dispatch BETWEEN deciding the outgoing
 * scope's fate and actually starting its teardown (the outgoing
 * scope must be marked/suspended before the incoming scope activates, but
 * `Scene.unload()` must not start running until after `onStopScene` has
 * fired for it, which itself must fire after the incoming scope is live).
 */
export class SceneNavigationTransaction {
  public constructor(
    private readonly _retained: Map<AnySceneConstructor, SceneScope>,
    private readonly _onStopScene: Signal<[Scene]>,
    private readonly _onStateChange: Signal<[SceneState, SceneState, Scene]>,
    private readonly _reportError: (error: unknown) => void,
  ) {}

  /**
   * Decide the outgoing scope's fate WITHOUT starting its
   * teardown: suspend and retain it under `outgoing.target` when
   * `suspendCurrent` is set (dispatching `onStateChange` for the edge
   * immediately - suspension has no `unload()`/`onStopScene` to sequence
   * against), otherwise return it as `pendingStopScene` for the caller to
   * pass to {@link SceneNavigationTransaction.dispatchStopScene} and
   * {@link SceneNavigationTransaction.beginOutgoingTeardown} once it has
   * finished activating the incoming scope. No-op (`pendingStopScene: null`)
   * when `outgoing` is `null`. Never throws.
   */
  public prepareOutgoingDisposition(outgoing: OutgoingScope | null, suspendCurrent: boolean): OutgoingDisposition {
    if (outgoing === null) {
      return { pendingStopScene: null };
    }

    if (suspendCurrent) {
      const previousState = outgoing.scope.state;

      outgoing.scope.suspend();
      this._retained.set(outgoing.target, outgoing.scope);
      this._onStateChange.dispatchIsolated(this._reportError, previousState, outgoing.scope.state, outgoing.scope.scene as Scene);

      return { pendingStopScene: null };
    }

    return { pendingStopScene: outgoing.scope };
  }

  /**
   * Dispatch `onStopScene` for a scope about to be permanently torn down -
   * guarded via `Signal.dispatchIsolated`, never throws back to the caller.
   * Call AFTER the incoming scope has activated and its own
   * `onChangeScene`/`onStartScene` have fired, and BEFORE
   * {@link SceneNavigationTransaction.beginOutgoingTeardown} (`onStopScene`'s
   * own contract: "fires just before a scene is unloaded"). No-op when
   * `pendingStopScene` is `null`.
   */
  public dispatchStopScene(pendingStopScene: SceneScope | null): void {
    if (pendingStopScene === null) {
      return;
    }

    this._onStopScene.dispatchIsolated(this._reportError, pendingStopScene.scene as Scene);
  }

  /**
   * Not-rollback-able step 8: actually start `pendingStopScene`'s permanent
   * teardown (`scope.destroy()`, which synchronously flips it to
   * `Destroying` and begins running `Scene.unload()` before this method
   * returns). Call AFTER {@link SceneNavigationTransaction.dispatchStopScene}.
   * Returns the still-settling teardown promise - already resolved when
   * `pendingStopScene` is `null`.
   */
  public beginOutgoingTeardown(pendingStopScene: SceneScope | null): Promise<void> {
    return pendingStopScene === null ? Promise.resolve() : pendingStopScene.destroy();
  }
}
