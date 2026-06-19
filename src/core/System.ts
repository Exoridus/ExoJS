import type { Time } from './Time';
import type { Destroyable } from './types';

/**
 * A per-frame unit of simulation owned by a {@link Scene} (for example a
 * physics world). Added via `scene.systems.add(...)`, ticked once per frame
 * after the scene's `update()` and before its `draw()`, and destroyed with the
 * scene. A system owns its own timestep policy — it receives the frame delta
 * and decides how to integrate (fixed-step, variable, etc.).
 *
 * Extends {@link Destroyable} so a system fits the ownership model uniformly:
 * the scene's registry destroys its systems when the scene is destroyed.
 */
export interface System extends Destroyable {
  /** Advance the system by the frame `delta`. */
  update(delta: Time): void;

  /**
   * Tick order within the scene (ascending; default `0`). Systems sharing an
   * order tick in insertion order. Read when the registry next sorts.
   */
  readonly order?: number;
}
