import { meshBoundaryLoops } from './meshBoundary';
import type { OccluderPlacement } from './OccluderPlacement';
import type { OccluderSource } from './OccluderSource';
import { PolylineOccluder } from './PolylineOccluder';
import { simplifyLoop } from './traceContours';

/**
 * What {@link Occluders.fromMesh} reads off a mesh: a flat `(x, y)` vertex
 * stream in local space, its triangle list, and the transform that places it.
 *
 * Core's `Mesh` satisfies it as it stands. So does a plain object over
 * geometry of your own, which is the point: the outline is derived from
 * triangles, not from a class.
 */
export interface OccluderMesh extends OccluderPlacement {
  readonly vertices: Float32Array;
  /** Triangle indices, or `null` for consecutive triples. */
  readonly indices: Uint16Array | Uint32Array | null;
}

/** Tuning for {@link Occluders.fromMesh}. */
export interface MeshOccluderOptions {
  /**
   * How far, in local units, the simplified outline may drift from the
   * extracted one. `0` only drops points that lie exactly on the line between
   * their neighbours, which is what a tessellated rectangle is full of.
   * Defaults to `0`.
   */
  readonly simplify?: number;
  /**
   * Distance below which two vertices count as the same corner. A mesh without
   * an index stream repeats its corners per triangle and has no shared edges
   * until they are welded. Defaults to `1e-4`.
   */
  readonly weld?: number;
  /**
   * Node whose world transform places the outline. Defaults to the mesh
   * itself, which is what makes a moving mesh move its own shadow.
   */
  readonly node?: OccluderPlacement;
}

/** @internal - see {@link Occluders.fromMesh}. */
export const fromMesh = (mesh: OccluderMesh, options: MeshOccluderOptions = {}): OccluderSource => {
  const tolerance = options.simplify ?? 0;
  const loops: Float32Array[] = [];

  for (const boundary of meshBoundaryLoops(mesh.vertices, mesh.indices, options.weld)) {
    const reduced = simplifyLoop(boundary, tolerance);

    if (reduced.length >= 6) {
      loops.push(Float32Array.from(reduced));
    }
  }

  return new PolylineOccluder(loops, true, options.node ?? mesh);
};
