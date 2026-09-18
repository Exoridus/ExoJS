import { Color, RenderNode, type Texture } from '@codexo/exojs';

import type { Lighting } from '../Lighting';

/** Options every light shares. Each field is also mutable afterwards. */
export interface LightOptions {
  /** Light colour. Alpha is ignored. Defaults to opaque white. */
  readonly color?: Color;
  /** Linear brightness multiplier. Defaults to `1`. */
  readonly intensity?: number;
  /**
   * How soft the shadows this light casts are, in `0..1`. `0` is the hardest
   * edge the renderer can draw and `1` the widest. Defaults to `0.25`.
   *
   * It means a different quantity in each renderer, and the difference is
   * visible in a scene with depth:
   *
   * - `lightmap` reads it as FILTER WIDTH. The light stays a point, and the
   *   shadow term is averaged over a band of its angular shadow row, at most
   *   three percent of a full turn. The edge widens with distance from the
   *   LIGHT rather than from the wall, and it does not behave like a shadow
   *   cast by a source of that size.
   * - `radiance` reads it as SOURCE SIZE. The emitter is given a width, and
   *   the penumbra follows from the geometry: it grows with the distance
   *   between the wall and what the shadow falls on.
   *
   * Neither adds a pass, so it is free of extra draws and can differ per
   * light. Under `lightmap` the filter costs between 5 and 21 texture fetches
   * per shadowed fragment, in step with the width asked for.
   */
  readonly softness?: number;
  /**
   * Texture the light is shone through, sampled across its own bounding square
   * - a window cross, leaf shade, a stained-glass pattern. Multiplied into the
   * light, so a transparent part of the cookie casts nothing and an opaque
   * white one changes nothing.
   *
   * The square maps onto the texture's full `0..1`, turns with the light and
   * scales with its radius, so the pattern stays fixed to the lamp rather than
   * to the world. Wrapping is the texture's own business; a cookie meant to end
   * at its edge wants `ClampToEdge`.
   *
   * Read by the `lightmap` renderer. `forward` shades inside the sprite stage,
   * where a texture per light cannot be reached in one draw, and ignores it.
   *
   * Lights sharing a cookie share a draw, so a scene with three distinct
   * cookies costs three draws rather than one - still one draw per texture,
   * never one per light.
   */
  readonly cookie?: Texture;
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
  /** How soft this light's shadows are, in `0..1`. See {@link LightOptions.softness}. */
  public softness: number;
  /** Texture the light is shone through, or `null`. See {@link LightOptions.cookie}. */
  public cookie: Texture | null;
  /** When `false`, the light is skipped entirely rather than published as black. */
  public enabled: boolean;

  /** The system this light is registered with, or `null`. @internal */
  public _lighting: Lighting | null = null;

  protected constructor(options: LightOptions = {}) {
    super();

    this.color = options.color ?? Color.white.clone();
    this.intensity = options.intensity ?? 1;
    this.softness = options.softness ?? 0.25;
    this.cookie = options.cookie ?? null;
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

  /**
   * The light's own axis in world space, as a unit vector written into `out` -
   * the node's world rotation.
   *
   * It is what a cone points along and what a segment runs along, so aiming a
   * light is the same act as rotating whatever carries it. A shape with no
   * direction of its own still has one, and uses it to orient its cookie.
   */
  public getWorldDirection(out: { x: number; y: number }): void {
    // The forward map is `world = [[a, b], [c, d]] * local + (x, y)`, so the
    // local +x axis lands on (a, c) - the axis, before normalisation.
    const transform = this.getWorldTransform();
    const x = transform.a;
    const y = transform.c;
    const length = Math.hypot(x, y);

    if (length === 0) {
      out.x = 1;
      out.y = 0;

      return;
    }

    out.x = x / length;
    out.y = y / length;
  }

  public override destroy(): void {
    this._lighting?.remove(this);
    super.destroy();
  }
}
