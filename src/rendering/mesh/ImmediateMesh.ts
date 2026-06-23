import { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MeshMaterial } from '#rendering/material/MeshMaterial';

import { Mesh, readGeometry } from './Mesh';

// A degenerate triangle that satisfies the Mesh constructor's validation; it is
// overwritten on the first configure() before the mesh is ever drawn.
const placeholderVertices = (): Float32Array => new Float32Array([0, 0, 1, 0, 0, 1]);

/**
 * Pooled, reconfigurable mesh backing the immediate {@link RenderingContext.drawGeometry}
 * path. It never enters the scene graph: it is reconfigured per call, submitted
 * via `backend.draw`, and flushed immediately, so a single instance is reused
 * across every immediate draw without per-call allocation.
 *
 * Unlike a regular {@link Mesh}, its world matrix is the raw {@link Matrix}
 * handed to `drawGeometry` — there is no parent, origin, position, rotation, or
 * scale to compose. {@link getGlobalTransform} therefore returns that matrix
 * verbatim, a lossless 1:1 mapping onto the renderer's `a, b, c, d, tx, ty`
 * transform slot, which both backends read at their transform-write seam.
 *
 * @internal
 */
export class ImmediateMesh extends Mesh {
  private _rawTransform: Matrix | null = null;
  private _sourceGeometry: Geometry | null = null;
  private _sourceVersion = -1;

  public constructor() {
    super({ vertices: placeholderVertices() });
  }

  public override getGlobalTransform(): Matrix {
    return this._rawTransform ?? super.getGlobalTransform();
  }

  /**
   * Reconfigure this pooled mesh for one immediate draw.
   *
   * The geometry is re-flattened only when its identity or data {@link Geometry.version}
   * changed — the steady-state case (same procedural geometry, fresh transform each
   * frame) reuses the previously flattened arrays and allocates nothing. The raw
   * transform reference is held directly (not copied): `drawGeometry` flushes the
   * draw synchronously, so the caller cannot mutate it before it is consumed.
   * @internal
   */
  public configure(geometry: Geometry, transform: Matrix, material: MeshMaterial | null, tint: Color | null): void {
    this._flattenGeometry(geometry);
    // Single immediate draws go through the dynamic (non-static-cached) path, so
    // the geometry reference is left off the mesh — only the flattened arrays are
    // consumed. (The batch source path sets it for the shared GPU buffer cache.)
    this._geometry = null;
    this._material = material;
    this._rawTransform = transform;
    // setTint ignores a falsy argument, so a missing tint must reset to white
    // rather than retain the previous draw's tint through the pool.
    this.setTint(tint ?? Color.white);
  }

  /**
   * Reconfigure this pooled mesh as the shared geometry/look source for an
   * instanced {@link RenderBatch} draw. The geometry reference is kept on the
   * mesh so the renderer can cache its GPU buffer by identity; per-instance
   * transform and tint are not carried here (they are written to the shared
   * transform store per instance by `drawBatch`).
   * @internal
   */
  public configureBatchSource(geometry: Geometry, material: MeshMaterial | null): void {
    this._flattenGeometry(geometry);
    this._geometry = geometry;
    this._material = material;
    this._rawTransform = null;
    this.setTint(Color.white);
  }

  // Re-flatten the geometry into the mesh data only when its identity or data
  // version changed; reuses the previously flattened arrays otherwise.
  private _flattenGeometry(geometry: Geometry): void {
    if (geometry === this._sourceGeometry && geometry.version === this._sourceVersion) {
      return;
    }

    const data = readGeometry(geometry);

    this._vertices = data.vertices;
    this._uvs = data.uvs;
    this._colors = data.colors;
    this._indices = data.indices;
    this._sourceGeometry = geometry;
    this._sourceVersion = geometry.version;
  }
}
