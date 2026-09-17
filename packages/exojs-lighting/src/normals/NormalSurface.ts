import type { Matrix, ReadonlyRectangle, RenderTexture, Texture } from '@codexo/exojs';

import type { NormalSource } from './Normals';

/**
 * A drawable whose own texture, frame and layout box say where its normals
 * belong on screen. Core's `Sprite` - and therefore `AnimatedSprite` and
 * `Video`, which extend it - satisfies it as it stands, which is what lets one
 * argument stand in for a quad, a region of a texture and a placement.
 *
 * The texture is read for its alpha only. The quad a drawable occupies is a
 * rectangle and its silhouette rarely fills one, so the alpha is what says
 * where a surface was actually described.
 */
export interface NormalSurfaceDrawable {
  readonly texture: Texture | RenderTexture | null;
  /** The region of the texture this drawable shows. */
  readonly textureFrame: ReadonlyRectangle;
  /** Whether the drawable is drawn at all. A hidden one describes no surface. */
  readonly visible: boolean;
  /** The drawable's own local box, which the frame is mapped onto. */
  getLocalBounds(): ReadonlyRectangle;
  getWorldTransform(): Matrix;
}

/** A registered drawable and the normals it contributes. */
export interface NormalSurface {
  readonly drawable: NormalSurfaceDrawable;
  readonly normals: NormalSource;
}
