/**
 * Named tick-order constants for {@link SystemRegistry.add}'s `order` option.
 * Purely conventional - the registry only compares numbers, and `order`
 * accepts any of them - but shared names keep unrelated systems from picking
 * colliding magic numbers. Not a larger phase taxonomy: pick any number,
 * these are just common reference points.
 */
export enum SystemOrder {
  /**
   * Input snapshot for this frame. First of the engine's own
   * {@link SystemMethods.preUpdate} systems, which occupy the negative range
   * so that an application system added without an `order` runs after all of
   * them. To sit between two of them, prefer `before`/`after` against the
   * manager instance (`before: [app.rendering]`) over picking a number.
   */
  CoreInput = -500,
  /** Node-level pointer dispatch plus terminal-pointer retirement, directly after {@link SystemOrder.CoreInput}. */
  CoreInteraction = -400,
  /** Voice and bus bookkeeping. */
  CoreAudio = -300,
  /** Tween and sequencer advance. */
  CoreTweens = -200,
  /**
   * Sprite frame-animation advance. After {@link SystemOrder.CoreTweens} so a
   * tween that drives playback (swapping clips, changing speed) has already
   * applied this frame's value, and before {@link SystemOrder.CoreRendering}
   * so the frame a sprite advances to is the one this frame renders.
   */
  CoreAnimation = -150,
  /** Renderer per-frame state reset and view update. Last of the engine's own pre-update systems. */
  CoreRendering = -100,
  /** The implicit order of a system that does not specify one. */
  Default = 0,
  /** Conventional slot for physics/simulation systems, after ordinary gameplay systems. */
  Physics = 100,
  /** Conventional slot for HUD/overlay systems, drawn above ordinary content. */
  Overlay = 900,
  /** Conventional slot for development/diagnostic systems, drawn last. */
  Debug = 1000,
}
