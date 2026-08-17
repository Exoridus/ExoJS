import { type ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import type { Filter } from '#rendering/filters/Filter';

/**
 * The one place a barrier's logical capture domain is decided.
 *
 * A drawable's source bounds are not its final visual bounds: an effect may
 * reach outside what it was handed (a blur), or move its edges independently (a
 * drop shadow), and a capture sized to the geometry alone would clip exactly the
 * part the effect added. The resolver walks the filter chain in order, asking
 * each filter what it can produce from what it will be given, and keeps the
 * union of the source bounds and every stage's answer.
 *
 * Why the union rather than only the last stage's answer: the executor runs the
 * whole chain against ONE target size, and the invariant that matters is that no
 * pass is clipped by a target smaller than the domain it declared. For the
 * expanding and identity effects that exist today the union IS the final stage's
 * answer; for a bounds-reducing effect it keeps the room its predecessors needed
 * and the reduced region simply lands inside a domain with transparent margin —
 * correct pixels, at the cost of a target nobody had to redesign the executor to
 * allocate.
 *
 * Everything here is in LOGICAL capture units — the same units
 * `RenderNode.getBounds` reports. The device-pixel density of the targets is a
 * separate axis, applied by the executor via the barrier's resolution.
 * @internal
 */
export class EffectBoundsResolver {
  /** Quantised capture domain, valid after {@link resolve} returns `true`. */
  public left = 0;
  public top = 0;
  public width = 0;
  public height = 0;

  private _inputScratch = new Rectangle();
  private _outputScratch = new Rectangle();

  /**
   * Resolve `source` through `filters` and quantise the result to whole logical
   * units. Returns `false` for a domain nothing can be rendered into — an empty
   * source, or one an effect answered about with a non-finite rectangle — which
   * the caller treats the same way it treats an empty drawable.
   *
   * The empty-source check lives here rather than at the call site so a filter
   * chain is never asked to transform a degenerate rectangle.
   */
  public resolve(source: ReadonlyRectangle, filters: readonly Filter[]): boolean {
    if (source.width <= 0 || source.height <= 0) {
      return false;
    }

    let minX = source.left;
    let minY = source.top;
    let maxX = source.right;
    let maxY = source.bottom;

    if (filters.length > 0) {
      let input = this._inputScratch;
      let output = this._outputScratch;

      input.set(source.x, source.y, source.width, source.height);

      for (let index = 0; index < filters.length; index++) {
        // In-bounds: index < length.
        filters[index]!.getOutputBounds(input, output);

        // A stage that answers with a non-finite rectangle is skipped entirely
        // — neither counted nor passed on. One filter with a broken bounds
        // transform then costs its own expansion instead of poisoning every
        // stage after it, and there is no size a NaN domain could be captured
        // at. One `isFinite` on the sum catches NaN and either infinity.
        if (!Number.isFinite(output.x + output.y + output.width + output.height)) {
          continue;
        }

        if (output.left < minX) minX = output.left;
        if (output.top < minY) minY = output.top;
        if (output.right > maxX) maxX = output.right;
        if (output.bottom > maxY) maxY = output.bottom;

        const previousInput = input;

        input = output;
        output = previousInput;
      }

      // The scratch pair may have ended up swapped; which one holds what is
      // irrelevant, but the fields have to point at the two live objects.
      this._inputScratch = input;
      this._outputScratch = output;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return false;
    }

    // Quantised EDGE by EDGE. Rounding the origin down and the size up
    // independently is not the same thing and loses a pixel whenever the
    // fractional origin pushes the right edge past what `ceil(width)` covers:
    // `x = 0.5, width = 10` spans up to 10.5, which `floor(0.5) + ceil(10) = 10`
    // cuts short. Taking `ceil` of the far edge cannot.
    const left = Math.floor(minX);
    const top = Math.floor(minY);
    const width = Math.ceil(maxX) - left;
    const height = Math.ceil(maxY) - top;

    if (width <= 0 || height <= 0) {
      return false;
    }

    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;

    return true;
  }
}
