import { Color } from '#core/Color';
import type { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MeshMaterial } from '#rendering/material/MeshMaterial';

import { Mesh, readGeometry } from './Mesh';

// A degenerate triangle that satisfies the Mesh constructor's validation; it is
// overwritten on the first configure() before the mesh is ever drawn.
const placeholderVertices = (): Float32Array => new Float32Array([0, 0, 1, 0, 0, 1]);

/**
 * Writable view over the (publicly `readonly`) {@link Mesh} data fields. The
 * pooled immediate mesh reconfigures these in place between draws; the readonly
 * cast mirrors the pattern the WebGPU mesh renderer uses for its draw-call slots.
 */
interface MutableMeshFields {
  vertices: Float32Array;
  indices: Uint16Array | null;
  uvs: Float32Array | null;
  colors: Uint32Array | null;
  material: MeshMaterial | null;
}

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
    const fields = this as unknown as MutableMeshFields;

    if (geometry !== this._sourceGeometry || geometry.version !== this._sourceVersion) {
      const data = readGeometry(geometry);

      fields.vertices = data.vertices;
      fields.uvs = data.uvs;
      fields.colors = data.colors;
      fields.indices = data.indices;
      this._sourceGeometry = geometry;
      this._sourceVersion = geometry.version;
    }

    fields.material = material;
    this._rawTransform = transform;
    // setTint ignores a falsy argument, so a missing tint must reset to white
    // rather than retain the previous draw's tint through the pool.
    this.setTint(tint ?? Color.white);
  }
}
