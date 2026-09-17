import { Color, RenderNode } from '@codexo/exojs';

import type { Lighting } from '../Lighting';

/** Options every light shares. Each field is also mutable afterwards. */
export interface LightOptions {
  /** Light colour. Alpha is ignored. Defaults to opaque white. */
  readonly color?: Color;
  /** Linear brightness multiplier. Defaults to `1`. */
  readonly intensity?: number;
  /** Whether the light contributes at all. Defaults to `true`. */
  readonly enabled?: boolean;
}

/**
 * Base class for every light: a scene node that emits rather than draws.
 *
 * Being a node is the point. A light parents to whatever carries it - a torch
 * to the player, a headlight to the car - and follows that thing's transform
 * with no per-frame bookkeeping, and every field is an ordinary property, so
 * the engine's tweens animate a light without any lighting-specific animation
 * concept:
 *
 * ```ts
 * player.addChild(torch);
 * app.tweens.to(torch, { intensity: 1.6 }, seconds(0.4));
 * ```
 *
 * A light draws nothing itself and has no bounds, so it is never culled,
 * batched or captured; what it costs is one row in the lighting system's data
 * for as long as it is registered.
 *
 * Registration is explicit ({@link Lighting.add}), because a package has no
 * business scanning a scene tree it does not own. Destroying a registered light
 * unregisters it.
 */
export abstract class Light extends RenderNode {
  /** Light colour. Mutated in place or replaced; read once per frame. */
  public color: Color;
  /** Linear brightness multiplier. */
  public intensity: number;
  /** When `false`, the light is skipped entirely rather than published as black. */
  public enabled: boolean;

  /** The system this light is registered with, or `null`. @internal */
  public _lighting: Lighting | null = null;

  protected constructor(options: LightOptions = {}) {
    super();

    this.color = options.color ?? Color.white.clone();
    this.intensity = options.intensity ?? 1;
    this.enabled = options.enabled ?? true;
  }

  /**
   * World-space position, taken from the node's own transform - the reason a
   * light is a node at all.
   *
   * Written into `out` to keep the per-frame publish allocation-free.
   */
  public getWorldPosition(out: { x: number; y: number }): void {
    const transform = this.getWorldTransform();

    out.x = transform.x;
    out.y = transform.y;
  }

  public override destroy(): void {
    this._lighting?.remove(this);
    super.destroy();
  }
}
