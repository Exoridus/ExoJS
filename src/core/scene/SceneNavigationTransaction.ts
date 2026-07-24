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

/** Result of {@link SceneNavigationTransaction.beginOutgoingDisposition}. */
export interface OutgoingDisposition {
  /** Resolves once the outgoing scope's permanent teardown has fully settled. Already resolved when there was no outgoing scope, or it was suspended instead of torn down. */
  readonly teardown: Promise<void>;
  /** The scope `finishOutgoingDisposition` must still dispatch `onStopScene` for, or `null` when there is nothing to dispatch (no outgoing scope, or it was suspended instead). */
  readonly pendingStopScene: SceneScope | null;
}

/**
 * @internal Collaborator owned by `SceneDirector`, holding the atomic
 * commit-boundary logic (definition §3.5, steps 5 and 8) shared by
 * `change()` and `restore()` — and the exact seam a later slice's
 * transition-session runner calls through at its own commit point, so this
 * logic exists in exactly one place rather than duplicated per call site.
 * Holds no state of its own beyond the `_retained` map and the two Director
 * signals it dispatches through, both handed in at construction —
 * `SceneDirector` remains the sole owner of `_activeScope`/
 * `_activeScopeTarget`/`_retained` itself.
 */
export class SceneNavigationTransaction {
  public constructor(
    private readonly _retained: Map<AnySceneConstructor, SceneScope>,
    private readonly _onStopScene: Signal<[Scene]>,
    private readonly _onStateChange: Signal<[SceneState, SceneState, Scene]>,
    private readonly _reportError: (error: unknown) => void,
  ) {}

  /**
   * Commit the outgoing scope's fate as part of an atomic switch (§3.5 step
   * 5): suspend and retain it under `outgoing.target` when `suspendCurrent`
   * is set (dispatching `onStateChange` for the edge, guarded via
   * `Signal.dispatchIsolated` — a throwing listener is reported, never
   * thrown back), otherwise begin its permanent teardown (`scope.destroy()`,
   * which synchronously flips it to `Destroying` before this method
   * returns) and hand back the still-settling teardown promise plus the
   * scope `finishOutgoingDisposition` must still dispatch `onStopScene` for.
   * No-op (an already-resolved teardown, `null` pending-stop-scene) when
   * `outgoing` is `null`. Never throws.
   */
  public beginOutgoingDisposition(outgoing: OutgoingScope | null, suspendCurrent: boolean): OutgoingDisposition {
    if (outgoing === null) {
      return { teardown: Promise.resolve(), pendingStopScene: null };
    }

    if (suspendCurrent) {
      const previousState = outgoing.scope.state;

      outgoing.scope.suspend();
      this._retained.set(outgoing.target, outgoing.scope);
      this._onStateChange.dispatchIsolated(this._reportError, previousState, outgoing.scope.state, outgoing.scope.scene as Scene);

      return { teardown: Promise.resolve(), pendingStopScene: null };
    }

    return { teardown: outgoing.scope.destroy(), pendingStopScene: outgoing.scope };
  }

  /**
   * Not-rollback-able step 8: dispatch `onStopScene` for a just-committed
   * permanent switch's outgoing scope — guarded via
   * `Signal.dispatchIsolated`, never throws back to the caller (the switch
   * already committed; a throwing listener here cannot un-commit it). No-op
   * when `pendingStopScene` is `null`.
   */
  public finishOutgoingDisposition(pendingStopScene: SceneScope | null): void {
    if (pendingStopScene === null) {
      return;
    }

    this._onStopScene.dispatchIsolated(this._reportError, pendingStopScene.scene as Scene);
  }
}
