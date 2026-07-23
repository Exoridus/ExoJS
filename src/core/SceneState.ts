/**
 * Lifecycle state of one {@link Scene} activation, owned by its internal
 * `SceneScope` and exposed read-only via {@link Scene.state}. State is
 * read-only from user code — it changes only in response to director-driven
 * lifecycle events: activation, retention (suspend/restore), and teardown.
 * Pause is not a state — it is an orthogonal flag that only applies while
 * `Active`; see {@link Scene.paused}.
 *
 * | State | fixed/update | draw | input & interaction |
 * |---|---:|---:|---|
 * | `Preparing` | no | no | registrations accepted, dispatch gated |
 * | `Active` (not paused) | yes | yes | active |
 * | `Active` (paused) | no | yes | pause-policy filtered |
 * | `Suspended` | no | no | disabled |
 * | `Destroying` / `Destroyed` | no | no | disabled |
 */
export enum SceneState {
  /** `load()` or `init()` is running. Facilities accept registrations, but nothing dispatches, ticks, or plays yet. */
  Preparing = 'preparing',
  /** Normal visible scene: fixed/update/draw all run, input and interaction dispatch normally — unless {@link Scene.paused} is set, which freezes fixed/update. */
  Active = 'active',
  /** Retained but inactive: no fixed/update/draw, no scene input or interaction dispatch. */
  Suspended = 'suspended',
  /** Permanent teardown is in progress. */
  Destroying = 'destroying',
  /** Terminal state — permanent teardown has completed. */
  Destroyed = 'destroyed',
}

/** `true` when the scene can be suspended for retention (`Active` → `Suspended`). */
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
