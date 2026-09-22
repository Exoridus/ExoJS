import { logger, type ReadonlyRectangle, Texture } from '@codexo/exojs';

import { type AlphaOccluderDrawable, type AlphaOccluderOptions, traceAlphaFrame } from './alphaTrace';
import { AnimatedAlphaOccluder } from './AnimatedAlphaOccluder';
import type { OccluderSink, OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';

/**
 * Shadows from a texture's own silhouette, traced once.
 *
 * ```ts
 * lighting.occludeFrom(new AlphaOccluder(tree));
 * ```
 *
 * Pass the drawable and it supplies everything: its texture, the frame of it
 * that it shows - so a sprite from an atlas outlines itself rather than the
 * whole page - its own box, and its transform, which already carries the
 * anchor. Pass a bare texture instead and the whole of it is traced, placed by
 * `node`.
 *
 * The alpha channel is traced and simplified per distinct frame, on first
 * sight and then never again, so an animation costs one trace per frame OF THE
 * CLIP rather than one per rendered frame - and the outline follows the clip
 * instead of freezing on whichever frame was showing at construction. What
 * runs every rendered frame is a comparison and the transform.
 *
 * That leaves two cases with no outline rather than a wrong one, both reported
 * on the `AlphaOccluder` log source in a development build. A render target
 * has no pixels this side of the GPU and can never be traced. A texture that
 * is not readable yet - still loading, or tainted by a cross-origin image - is
 * retried on the next frame rather than cached.
 *
 * The outline follows the art, which is not always the shadow you want - a
 * tree casts the shadow of its trunk, not of its canopy. Reach for
 * {@link PolygonOccluder} where they differ.
 */
export class AlphaOccluder implements OccluderSource {
  private readonly _source: OccluderSource;

  public constructor(source: Texture | AlphaOccluderDrawable, options: AlphaOccluderOptions = {}) {
    // A drawable can change what it shows, so it gets a source that re-reads
    // its frame and keeps one outline per frame it has seen. A bare texture
    // cannot, so it is traced here and never again.
    if (!(source instanceof Texture)) {
      this._source = new AnimatedAlphaOccluder(source, options, options.node ?? source);

      return;
    }

    const traced = traceAlphaFrame(source, null, options);

    if (__DEV__ && traced === null) {
      logger.warn(
        'The texture could not be read, so nothing was traced and it casts no shadow. It is still loading, backed by nothing drawable, or tainted by a ' +
          'cross-origin image. Build the occluder once the texture is ready.',
        { source: 'AlphaOccluder' },
      );
    }

    this._source = new PolylineOccluder(traced ?? [], true, options.node ?? null);
  }

  public collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
    this._source.collect(bounds, out);
  }
}
