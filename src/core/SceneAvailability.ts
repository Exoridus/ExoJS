/**
 * When a scene-scoped registration stays live relative to the owning scene's
 * pause flag. Shared by every scene facility that accepts a `when` option —
 * {@link SceneAudio}, {@link SceneInputs} and {@link SceneTweens} — so one
 * policy vocabulary covers voices, bindings and tweens alike.
 *
 * Pause is orthogonal to {@link SceneState}: these values only discriminate
 * within `Active`, which is the only state where the pause flag applies. A
 * suspended or preparing scope dispatches nothing regardless of the policy
 * chosen here.
 *
 * | Value | while running | while paused |
 * |---|---:|---:|
 * | `Active` | yes | no |
 * | `Paused` | no | yes |
 * | `Always` | yes | yes |
 *
 * `Paused` is what pause menus are built from: input bindings and tweens that
 * exist *only* while the scene is frozen.
 * @stable
 */
export enum SceneAvailability {
  /** Live while the scene runs; frozen the moment it pauses, resumed when it resumes. */
  Active = 'active',
  /** Live only while the scene is paused — the pause-menu case. */
  Paused = 'paused',
  /** Live regardless of the pause flag. */
  Always = 'always',
}
