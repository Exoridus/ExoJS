import { logger, Texture } from '@codexo/exojs';

import { AlphaOccluder } from './AlphaOccluder';
import { type AlphaOccluderDrawable, type AlphaOccluderOptions, traceAlphaFrame } from './alphaTrace';
import type { OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';

/** @internal - see {@link Occluders.fromAlpha}. */
export const fromAlpha = (source: Texture | AlphaOccluderDrawable, options: AlphaOccluderOptions = {}): OccluderSource => {
  // A drawable can change what it shows, so it gets a source that re-reads its
  // frame and keeps one outline per frame it has seen. A bare texture cannot,
  // so it is traced here and never again.
  if (!(source instanceof Texture)) {
    return new AlphaOccluder(source, options, options.node ?? source);
  }

  const traced = traceAlphaFrame(source, null, options);

  if (__DEV__ && traced === null) {
    logger.warn(
      'Occluders.fromAlpha: the texture could not be read, so nothing was traced and it casts no shadow. It is still loading, backed by nothing drawable, ' +
        'or tainted by a cross-origin image. Build the source once the texture is ready.',
      { source: 'Occluders' },
    );
  }

  return new PolylineOccluder(traced ?? [], true, options.node ?? null);
};
