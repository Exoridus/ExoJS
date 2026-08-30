/**
 * Width of a mesh's index stream.
 *
 * `'uint16'` is the default and the cheaper one - half the index bytes to upload
 * and to keep resident - and covers any mesh addressing at most 65 536 vertices.
 * `'uint32'` exists for generated or merged geometry that legitimately exceeds
 * that: batched tile, trail, terrain or imported SVG meshes.
 *
 * The values are the strings WebGPU accepts verbatim; WebGL2 maps them onto its
 * own `UNSIGNED_SHORT`/`UNSIGNED_INT` element types.
 * @stable
 */
export type MeshIndexFormat = 'uint16' | 'uint32';

/** The typed-array kinds a mesh index stream can be supplied as. */
export type MeshIndexArray = Uint16Array | Uint32Array;

/** Bytes one index occupies in `format`. */
export const meshIndexBytes = (format: MeshIndexFormat): number => (format === 'uint32' ? 4 : 2);

/**
 * Largest vertex count a 16-bit index stream can address.
 *
 * A `Uint16Array` index holds `0..65535`, so a mesh of exactly this many
 * vertices is still fully addressable; one vertex more is not.
 */
export const maxUint16VertexCount = 0x10000;

/**
 * The index width a mesh drawn from `indices` over `vertexCount` vertices needs.
 *
 * An authored stream keeps the width it was authored with - narrowing a
 * `Uint32Array` that happens to fit would make the format depend on the values
 * rather than on the declaration, so the same geometry could change width when
 * its content changes. A non-indexed mesh has its indices synthesized, so its
 * width follows purely from how many vertices there are to address.
 */
export const meshIndexFormatFor = (indices: MeshIndexArray | null, vertexCount: number): MeshIndexFormat => {
  if (indices !== null) {
    return indices instanceof Uint32Array ? 'uint32' : 'uint16';
  }

  return vertexCount > maxUint16VertexCount ? 'uint32' : 'uint16';
};

/** A zero-filled index array of `length` entries in `format`. */
export const createIndexArray = (format: MeshIndexFormat, length: number): MeshIndexArray =>
  format === 'uint32' ? new Uint32Array(length) : new Uint16Array(length);
