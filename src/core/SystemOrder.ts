/**
 * Named tick-order constants for {@link SystemRegistry.add}'s `order` option.
 * Purely conventional — the registry only compares numbers, and `order`
 * accepts any of them — but shared names keep unrelated systems from picking
 * colliding magic numbers. Not a larger phase taxonomy: pick any number,
 * these are just common reference points.
 */
export enum SystemOrder {
  /** The implicit order of a system that does not specify one. */
  Default = 0,
  /** Conventional slot for physics/simulation systems, after ordinary gameplay systems. */
  Physics = 100,
  /** Conventional slot for HUD/overlay systems, drawn above ordinary content. */
  Overlay = 900,
  /** Conventional slot for development/diagnostic systems, drawn last. */
  Debug = 1000,
}
