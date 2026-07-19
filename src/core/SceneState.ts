/**
 * Lifecycle state of one {@link Scene} activation, owned by its internal
 * `SceneScope` and exposed read-only via {@link Scene.state}. State is
 * read-only from user code — it changes only in response to director-driven
 * lifecycle events (activation, teardown, and — from a later slice — pause
 * and retention).
 *
 * | State | fixed/update | draw | input & interaction |
 * |---|---:|---:|---|
 * | `Preparing` | no | no | registrations accepted, dispatch gated |
 * | `Active` | yes | yes | active |
 * | `Paused` | no | yes | pause-policy filtered |
 * | `Suspended` | no | no | disabled |
 * | `Destroying` / `Destroyed` | no | no | disabled |
 */
export enum SceneState {
  /** `load()` or `init()` is running. Facilities accept registrations, but nothing dispatches, ticks, or plays yet. */
  Preparing = 'preparing',
  /** Normal visible scene: fixed/update/draw all run, input and interaction dispatch normally. */
  Active = 'active',
  /** Visible simulation pause: draw continues, fixed/update stop, scene input follows its pause policy. */
  Paused = 'paused',
  /** Retained but inactive: no fixed/update/draw, no scene input or interaction dispatch. */
  Suspended = 'suspended',
  /** Permanent teardown is in progress. */
  Destroying = 'destroying',
  /** Terminal state — permanent teardown has completed. */
  Destroyed = 'destroyed',
}

/** `true` when the scene can transition `Active` → `Paused`. */
export function canPause(state: SceneState): boolean {
  return state === SceneState.Active;
}

/** `true` when the scene can transition `Paused` → `Active`. */
export function canResume(state: SceneState): boolean {
  return state === SceneState.Paused;
}

/** `true` when the scene can be suspended for retention (`Active` or `Paused` → `Suspended`). */
export function canSuspend(state: SceneState): boolean {
  return state === SceneState.Active || state === SceneState.Paused;
}

/** `true` when the scene can begin permanent teardown — anything other than an already-destroying or already-destroyed scene. */
export function canDestroy(state: SceneState): boolean {
  return state !== SceneState.Destroying && state !== SceneState.Destroyed;
}
