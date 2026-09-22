import type { Matrix } from '@codexo/exojs';

/**
 * Something whose world transform places an occluder outline. Any scene node
 * satisfies it, which is how an outline authored in a sprite's own pixels
 * follows that sprite around without this package knowing what a sprite is.
 */
export interface OccluderPlacement {
  getWorldTransform(): Matrix;
}

/** The six numbers mapping a local point to the world: `(a x + b y + x, c x + d y + y)`. */
export interface PlacementMap {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
}

/** A fresh identity map, for a source to keep as its own per-frame scratch. */
export const placementMap = (): PlacementMap => ({ a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 });

/** Read a placement's current world map into `out`, or leave the identity there when there is none. */
export const readPlacement = (node: OccluderPlacement | null, out: PlacementMap): PlacementMap => {
  const transform = node === null ? null : node.getWorldTransform();

  out.a = transform === null ? 1 : transform.a;
  out.b = transform === null ? 0 : transform.b;
  out.c = transform === null ? 0 : transform.c;
  out.d = transform === null ? 1 : transform.d;
  out.x = transform === null ? 0 : transform.x;
  out.y = transform === null ? 0 : transform.y;

  return out;
};
