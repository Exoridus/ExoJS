// Tile-object anchoring rules, mirroring Tiled's own `MapObject::alignment()`
// and `alignmentOffset()` from libtiled.

import type { TiledObjectAlignment, TiledOrientation } from './data';

/** A {@link TiledObjectAlignment} with Tiled's orientation-dependent default already applied. */
export type TiledResolvedObjectAlignment = Exclude<TiledObjectAlignment, 'unspecified'>;

/** Every value Tiled accepts for a tileset's `objectalignment`. */
export const TILED_OBJECT_ALIGNMENTS: readonly TiledObjectAlignment[] = [
  'unspecified',
  'topleft',
  'top',
  'topright',
  'left',
  'center',
  'right',
  'bottomleft',
  'bottom',
  'bottomright',
];

/**
 * Resolve a tileset's `objectalignment` into a concrete alignment for tile
 * objects on a map of the given `orientation`.
 *
 * Tiled's default (`'unspecified'`, and an absent field) is orientation
 * dependent: `'bottom'` on an isometric map and `'bottomleft'` on every other
 * orientation, including staggered and hexagonal.
 * @advanced
 */
export const resolveTiledObjectAlignment = (alignment: TiledObjectAlignment | undefined, orientation: TiledOrientation): TiledResolvedObjectAlignment => {
  if (alignment !== undefined && alignment !== 'unspecified') {
    return alignment;
  }

  return orientation === 'isometric' ? 'bottom' : 'bottomleft';
};

/**
 * Offset of a tile object's stored `x`/`y` anchor from the top-left corner of
 * its `width` × `height` bounding box, for an already-resolved `alignment`.
 *
 * Subtract this from the stored position to obtain the corner:
 * `cornerX = object.x - offset.x`.
 * @advanced
 */
export const getTiledObjectAnchorOffset = (
  alignment: TiledResolvedObjectAlignment,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } => {
  switch (alignment) {
    case 'topleft':
      return { x: 0, y: 0 };
    case 'top':
      return { x: width / 2, y: 0 };
    case 'topright':
      return { x: width, y: 0 };
    case 'left':
      return { x: 0, y: height / 2 };
    case 'center':
      return { x: width / 2, y: height / 2 };
    case 'right':
      return { x: width, y: height / 2 };
    case 'bottomleft':
      return { x: 0, y: height };
    case 'bottom':
      return { x: width / 2, y: height };
    case 'bottomright':
      return { x: width, y: height };
  }
};
