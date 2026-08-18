import type { ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { TargetResolution } from '#rendering/types';

/**
 * What a {@link Filter} notifies when its state changes — a {@link RenderNode}
 * in practice, narrowed to the one call so the filter module does not depend on
 * the node module.
 */
export interface FilterOwner {
  invalidateCache(): unknown;
}

/**
 * Abstract base class for post-process filters applied to a drawable's
 * render output.
 *
 * Filters are rendered into a temporary {@link RenderTexture} (the `output`)
 * that is composited back onto the scene after all filters in the chain have
 * been applied. Subclasses implement {@link apply} to run their shader pass.
 * Stock implementations: {@link BlurFilter}, {@link ColorMatrixFilter},
 * {@link LutFilter}. User-supplied GLSL/WGSL shaders: {@link ShaderFilter}.
 */
export abstract class Filter {
  /**
   * Resolution this filter's render targets are rasterized at, in device pixels
   * per logical unit.
   *
   * `'inherit'` (the default) matches the surface the result is composited into,
   * so a filtered subtree stays as sharp as its surroundings on a HiDPI display.
   * Lower it for a filter whose output is low-frequency anyway — a heavy blur at
   * `0.5` costs a quarter of the fragments and is hard to tell apart.
   *
   * A filter CHAIN shares one target size, so the whole chain runs at the lowest
   * resolution any of its filters asks for.
   *
   * ```ts
   * const blur = new BlurFilter({ radius: 8 });
   *
   * blur.resolution = 0.5; // half-resolution blur, quarter the fill cost
   * ```
   * @stable
   */
  public resolution: TargetResolution = 'inherit';

  /**
   * Nodes this filter is currently attached to, built on the first attachment.
   * A filter may be shared between nodes, so {@link invalidate} has to reach all
   * of them; the overwhelmingly common case is exactly one, and an
   * always-allocated array would cost every filter a heap object for it.
   */
  private _owners: FilterOwner[] | null = null;

  /**
   * The logical bounds this effect can produce from the logical bounds it is
   * given — the contract that lets an effect change a drawable's visual extent
   * instead of being clipped by the geometry it was captured from.
   *
   * Both rectangles are in the capture domain's LOGICAL units, the same ones
   * {@link RenderNode.getBounds} reports. They are not device pixels: the target
   * a pass runs against is separately allocated at `bounds × resolution` texels,
   * so an expansion of 8 stays 8 logical units at every pixel ratio.
   *
   * The default is the identity — an effect that only recolours what it is given
   * (a colour matrix, a LUT) needs no override. An effect that reaches outside
   * its input (a blur, a glow) must declare that reach, and one that reaches
   * asymmetrically (a drop shadow) may move the edges independently:
   *
   * ```ts
   * public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
   *   output.set(input.x - this.radius, input.y - this.radius, input.width + this.radius * 2, input.height + this.radius * 2);
   * }
   * ```
   *
   * In a CHAIN each filter is asked in turn, with the previous filter's output
   * as its input, and the barrier's capture domain is the union of the source
   * bounds and every stage's answer. A bounds-REDUCING effect is therefore
   * represented — the domain simply keeps the room its predecessors needed, so
   * no pass is ever clipped by a target smaller than what it declared.
   *
   * `input` and `output` are never the same object, so an implementation may
   * read `input` freely while writing `output`.
   *
   * Called once per frame for every filtered node, so it must not allocate.
   */
  public getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x, input.y, input.width, input.height);
  }

  /**
   * Tell every node this filter is attached to that its rendered output is out
   * of date.
   *
   * Call it after mutating anything that changes what the filter draws or how
   * far it reaches — the stock filters do this from their own setters. Without
   * it a cached or retained representation of the owning node keeps replaying
   * the result the filter produced before the change.
   */
  public invalidate(): void {
    const owners = this._owners;

    if (owners === null) {
      return;
    }

    for (let index = 0; index < owners.length; index++) {
      // In-bounds: index < length.
      owners[index]!.invalidateCache();
    }
  }

  /**
   * Register a node as a consumer of this filter's output. Pushed once per
   * attachment rather than once per node, so a filter added to the same node
   * twice is notified through both and survives one of them being removed.
   * @internal
   */
  public _attachOwner(owner: FilterOwner): void {
    (this._owners ??= []).push(owner);
  }

  /** Balances one {@link _attachOwner}. @internal */
  public _detachOwner(owner: FilterOwner): void {
    const index = this._owners?.indexOf(owner) ?? -1;

    if (index !== -1) {
      this._owners!.splice(index, 1);
    }
  }

  /**
   * Execute one filter pass: sample from `input`, write the result to `output`.
   *
   * Both textures are `bounds × resolution` texels — NOT the drawable's logical
   * bounding box. Any parameter a subclass expresses in pixels (a blur radius, a
   * displacement amount) is in LOGICAL units by convention and must be
   * multiplied by `resolution` before it is used as a texel offset; otherwise the
   * effect shrinks by `1/resolution` on a HiDPI display. Parameters expressed as
   * a fraction of the target (or as pure colour maths) need no adjustment.
   *
   * The engine always passes `resolution`. It is optional for the hand-rolled
   * case — a post-processing chain that creates its own {@link RenderTexture}s
   * and calls `apply` directly — where the textures are whatever size the caller
   * made them and `1` is the honest answer.
   */
  public abstract apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, resolution?: number): void;

  /**
   * Release any GPU-side resources held by this filter (uniform buffers,
   * pipelines, intermediate textures). The base drops the attachment list;
   * subclasses with GPU state ({@link BlurFilter}, {@link ColorMatrixFilter})
   * override and call `super.destroy()`.
   */
  public destroy(): void {
    this._owners = null;
  }
}
