import { logger, type ReadonlyRectangle, RenderNode, Texture } from '@codexo/exojs';

import { type AlphaOccluderDrawable, type AlphaOccluderOptions, traceAlphaFrame } from './alphaTrace';
import type { OccluderPlacement } from './OccluderPlacement';
import type { OccluderDrawable, OccluderSink, OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';

/** No outline, shared so a frame that traces to nothing costs no array. */
const empty: readonly Float32Array[] = [];

/**
 * A drawable's silhouette, traced per distinct frame and then kept.
 *
 * An animation is a finite set of silhouettes, not a continuous one: a clip
 * steps between regions of its atlas, and each region traces to the same
 * outline every time it comes round. Tracing on first sight and keeping the
 * result turns a per-frame cost into a per-frame-of-animation one - a lookup
 * per rendered frame, and a marching-squares pass only for a silhouette this
 * source has never seen.
 *
 * What this cannot fix is a source whose region stays put while its pixels
 * move: a video, or a texture drawn into every frame. There the set of
 * silhouettes is unbounded and nothing distinguishes one from the next, so the
 * outline stays the one traced first.
 * @internal
 */
export class AlphaOccluder implements OccluderSource {
  private readonly _drawable: AlphaOccluderDrawable;
  private readonly _options: AlphaOccluderOptions;
  private readonly _polyline: PolylineOccluder;
  private readonly _cache = new Map<string, readonly Float32Array[]>();
  /**
   * The drawable as a scene node, when it is one and when it also carries its
   * own placement. A `node` option pointing somewhere else means "this
   * texture, placed there", which a rasteriser cannot express: it draws the
   * node where the node is.
   */
  private readonly _node: OccluderDrawable | null;
  private _tracedTexture: Texture | null = null;
  private _tracedKey = '';
  private _warned = false;

  public constructor(drawable: AlphaOccluderDrawable, options: AlphaOccluderOptions, placement: OccluderPlacement | null) {
    this._drawable = drawable;
    this._options = options;
    this._polyline = new PolylineOccluder(empty, true, placement);
    this._node = drawable instanceof RenderNode && placement === drawable ? drawable : null;
    this._sync();
  }

  public collect(bounds: ReadonlyRectangle, out: OccluderSink): void {
    // Offered before anything is traced: where the field rasterises, the
    // silhouette is the drawable's own alpha every frame, which is correct for
    // a video and a render target as well - the two cases the trace has to
    // refuse or freeze.
    if (this._node !== null && out.addDrawable(this._node)) {
      return;
    }

    this._sync();
    this._polyline.collect(bounds, out);
  }

  /**
   * Point the outline at whatever the drawable shows now.
   *
   * The comparison is four numbers and an identity, which is what a rendered
   * frame costs when nothing changed - the common case, since a clip steps far
   * more slowly than the frame loop runs.
   */
  private _sync(): void {
    const texture = this._drawable.texture;
    const frame = this._drawable.textureFrame;
    const key = `${frame.left},${frame.top},${frame.width},${frame.height}`;

    if (texture === this._tracedTexture && key === this._tracedKey) {
      return;
    }

    this._tracedTexture = texture instanceof Texture ? texture : null;
    this._tracedKey = key;

    if (!(texture instanceof Texture)) {
      this._warnOnce(
        texture === null
          ? 'Occluders.fromAlpha: the drawable has no texture, so nothing was traced and it casts no shadow. Build the source once a texture is set.'
          : 'Occluders.fromAlpha: a RenderTexture has no pixels on this side of the GPU, so nothing was traced and the drawable casts no shadow. ' +
              'Draw into an HTMLCanvasElement or OffscreenCanvas and wrap that in a Texture when you need both a live surface and its outline.',
      );
      this._polyline.setLoops(empty);

      return;
    }

    const cacheKey = `${textureKey(texture)}|${key}`;
    const cached = this._cache.get(cacheKey);

    if (cached !== undefined) {
      this._polyline.setLoops(cached);

      return;
    }

    const traced = traceAlphaFrame(texture, this._drawable, this._options);

    if (traced === null) {
      // Not cached: a texture that was not ready is expected to become ready,
      // and caching the empty result would freeze the drawable's shadow out.
      this._warnOnce(
        'Occluders.fromAlpha: the texture could not be read, so nothing was traced and it casts no shadow yet. It is still loading, backed by nothing ' +
          'drawable, or tainted by a cross-origin image.',
      );
      this._tracedKey = '';
      this._polyline.setLoops(empty);

      return;
    }

    this._cache.set(cacheKey, traced);
    this._polyline.setLoops(traced);
  }

  /**
   * One message per source, not per frame: `_sync` runs every frame, and a
   * drawable that can never be traced would otherwise fill the console.
   */
  private _warnOnce(message: string): void {
    if (__DEV__ && !this._warned) {
      this._warned = true;
      logger.warn(message, { source: 'Occluders' });
    }
  }
}

/** Identity of a texture, for the per-frame cache key. A Map keyed on the texture itself would keep a destroyed one alive. */
let textureIds: WeakMap<Texture, number> | null = null;
let nextTextureId = 0;

const textureKey = (texture: Texture): number => {
  textureIds ??= new WeakMap();

  let id = textureIds.get(texture);

  if (id === undefined) {
    id = nextTextureId++;
    textureIds.set(texture, id);
  }

  return id;
};
