/**
 * Lifecycle state of one {@link Scene} activation, owned by its internal
 * `SceneScope` and exposed read-only via {@link Scene.state}. State is
 * read-only from user code — it changes only in response to director-driven
 * lifecycle events: preparation, activation, retention (suspend/restore),
 * and teardown. Pause is not a state — it is an orthogonal flag that only
 * applies while `Active`; see {@link Scene.paused}.
 *
 * | State | fixed/update | draw | input & interaction | meaning |
 * |---|---:|---:|---|---|
 * | `Preparing` | no | no | registrations accepted, dispatch gated | `load()`/`init()` running |
 * | `Ready` | no | no | registrations accepted, dispatch gated | fully prepared, never yet activated |
 * | `Active` (not paused) | yes | yes | active | live |
 * | `Active` (paused) | no | yes | pause-policy filtered | live, simulation frozen |
 * | `Suspended` | no | no | registrations accepted, dispatch gated | previously active, retained |
 * | `Destroying` / `Destroyed` | no | no | disabled | permanent teardown |
 */
export enum SceneState {
  /** `load()` or `init()` is running. Facilities accept registrations, but nothing dispatches, ticks, or plays yet. */
  Preparing = 'preparing',
  /**
   * Fully prepared (`load()`/`init()` both completed) but never yet
   * activated — a genuine, cold checkpoint between preparation and going
   * live. Facilities keep accepting registrations (definition §4.2), but
   * still nothing dispatches, ticks, plays, or produces any
   * application-wide runtime effect. Transient for an ordinary activation
   * (immediately followed by {@link SceneScope.activate}); can be
   * longer-lived for a pre-warmed scene in a later slice. Not
   * suspend-eligible — see {@link canSuspend}: a `Ready` scope that is
   * discarded before ever activating is torn down via `destroy()` directly,
   * never via {@link SceneScope.suspend}.
   */
  Ready = 'ready',
  /** Normal visible scene: fixed/update/draw all run, input and interaction dispatch normally — unless {@link Scene.paused} is set, which freezes fixed/update. */
  Active = 'active',
  /** Retained but inactive: no fixed/update/draw, no scene input or interaction dispatch. */
  Suspended = 'suspended',
  /** Permanent teardown is in progress. */
  Destroying = 'destroying',
  /** Terminal state — permanent teardown has completed. */
  Destroyed = 'destroyed',
}

/**
 * `true` when the scene can be suspended for retention (`Active` →
 * `Suspended`). Deliberately excludes `Ready`: a scope that finished
 * preparing but was never activated has nothing live to suspend — it is
 * discarded via `destroy()` instead (see {@link SceneState.Ready}).
 */
export function canSuspend(state: SceneState): boolean {
  return state === SceneState.Active;
}

/** `true` when the scene can be restored from retention (`Suspended` → `Active`). */
export function canRestore(state: SceneState): boolean {
  return state === SceneState.Suspended;
}

/** `true` when the scene can begin permanent teardown — anything other than an already-destroying or already-destroyed scene. */
export function canDestroy(state: SceneState): boolean {
  return state !== SceneState.Destroying && state !== SceneState.Destroyed;
}
