import { Drawable } from '@/rendering/Drawable';
import type { Geometry } from '@/rendering/geometry/Geometry';
import type { GeometryAttribute } from '@/rendering/geometry/GeometryAttribute';
import type { MeshMaterial } from '@/rendering/material/MeshMaterial';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';

/**
 * Construction-time options for a {@link Mesh}.
 *
 * Provide the geometry in exactly one of two forms:
 *
 * - **Convenience form** — a flat `vertices` array of (x, y) pairs in local
 *   space, with optional `uvs`, per-vertex `colors`, and `indices`. This is
 *   the simplest path: `new Mesh({ vertices })`.
 * - **Geometry form** — a {@link Geometry} object whose standard attributes
 *   (`a_position`/`position`, `a_texcoord`/`texcoord`, `a_color`/`color`) are
 *   read into the mesh: `new Mesh({ geometry })`. The geometry must use the
 *   `triangle-list` topology.
 *
 * Supplying both `vertices` and `geometry`, or neither, throws.
 *
 * When present, `uvs` must match the vertex count (as (u, v) pairs) and
 * `colors` must supply one packed-RGBA8 u32 per vertex. `indices` are optional
 * — if absent, the vertex stream is drawn as a flat triangle list (3*N
 * vertices = N triangles). A texture is optional; a textured mesh samples it
 * at the supplied UVs while an untextured mesh paints solid vertex colors only.
 *
 * Validation is enforced at construction; any mismatch throws.
 *
 * For custom shaders/uniforms/textures, attach a {@link MeshMaterial}.
 */
export interface MeshOptions {
  readonly vertices?: Float32Array;
  readonly indices?: Uint16Array;
  readonly uvs?: Float32Array;
  readonly colors?: Uint32Array;
  /** Interleaved geometry source; mutually exclusive with `vertices`. */
  readonly geometry?: Geometry;
  readonly texture?: Texture | RenderTexture | null;
  /** Custom look (shader/uniforms/textures/blendMode); `null` uses the default mesh material. */
  readonly material?: MeshMaterial;
}

/**
 * Arbitrary 2D triangle-mesh primitive.
 *
 * `Mesh` lives alongside {@link Sprite} as a public Drawable: it has the
 * same transform (position/rotation/scale/origin), tint, blendMode,
 * filters, masks, and cacheAsBitmap — but the geometry it renders is
 * user-supplied rather than implied by a texture frame. The intended use
 * cases are:
 *
 * - Custom-shape sprites whose silhouette isn't a quad (badges, speech
 *   bubbles, region overlays).
 * - Deformable visuals (rope/ribbon, banner, water surface): mutate the
 *   vertex array between frames and the GPU re-tessellates nothing —
 *   only the transform changes per frame.
 * - Particles or trails with custom geometry per emitter.
 *
 * The mesh data is **immutable after construction** in v1: vertex /
 * index / UV / color arrays are exposed as readonly references. Mutate
 * the underlying typed arrays in-place if you need per-frame updates,
 * but the array lengths and topology cannot change. Texture is the only
 * post-construction mutable property.
 *
 * The vertex stream is a flat `Float32Array` of (x, y) pairs in local
 * space. The mesh's local bounds are computed once at construction from
 * the AABB of those vertices and used by the cull pass. Re-computing
 * after in-place mutation is the caller's responsibility (call
 * `recomputeLocalBounds()`).
 */
export class Mesh extends Drawable {
  public readonly vertices: Float32Array;
  public readonly indices: Uint16Array | null;
  public readonly uvs: Float32Array | null;
  public readonly colors: Uint32Array | null;

  /** Custom material attached to this mesh, or `null` for the default mesh path. */
  public readonly material: MeshMaterial | null;

  /** Source geometry when constructed from the geometry form, otherwise `null`. */
  public readonly geometry: Geometry | null;

  private _texture: Texture | RenderTexture | null;

  public constructor(options: MeshOptions) {
    super();

    const { texture = null, material = null } = options;

    let vertices: Float32Array;
    let indices: Uint16Array | null;
    let uvs: Float32Array | null;
    let colors: Uint32Array | null;
    let geometry: Geometry | null;

    if (options.geometry !== undefined) {
      if (options.vertices !== undefined) {
        throw new Error('Mesh accepts either `vertices` or `geometry`, not both.');
      }

      geometry = options.geometry;
      const data = readGeometry(geometry);
      vertices = data.vertices;
      uvs = data.uvs;
      colors = data.colors;
      indices = data.indices;
    } else {
      if (options.vertices === undefined) {
        throw new Error('Mesh requires either `vertices` or `geometry`.');
      }

      geometry = null;
      vertices = options.vertices;
      indices = options.indices ?? null;
      uvs = options.uvs ?? null;
      colors = options.colors ?? null;
    }

    if (vertices.length === 0 || vertices.length % 2 !== 0) {
      throw new Error(`Mesh vertices must be a non-empty flat array of (x,y) pairs (got length ${vertices.length}).`);
    }

    const vertexCount = vertices.length / 2;

    if (vertexCount < 3) {
      throw new Error(`Mesh requires at least 3 vertices (got ${vertexCount}).`);
    }

    if (uvs !== null && uvs.length !== vertices.length) {
      throw new Error(`Mesh uvs length ${uvs.length} must equal vertices length ${vertices.length}.`);
    }

    if (colors !== null && colors.length !== vertexCount) {
      throw new Error(`Mesh colors length ${colors.length} must equal vertex count ${vertexCount}.`);
    }

    if (indices !== null) {
      if (indices.length === 0 || indices.length % 3 !== 0) {
        throw new Error(`Mesh indices must be a non-empty multiple of 3 (got length ${indices.length}).`);
      }

      for (let i = 0; i < indices.length; i++) {
        if (indices[i] >= vertexCount) {
          throw new Error(`Mesh index ${indices[i]} at position ${i} is out of range for vertex count ${vertexCount}.`);
        }
      }
    } else if (vertexCount % 3 !== 0) {
      throw new Error(`Non-indexed Mesh requires a vertex count that is a multiple of 3 (got ${vertexCount}).`);
    }

    this.vertices = vertices;
    this.indices = indices;
    this.uvs = uvs;
    this.colors = colors;
    this.material = material;
    this.geometry = geometry;
    this._texture = texture;

    this.recomputeLocalBounds();
  }

  /** Number of (x, y) vertex pairs in the mesh (i.e. `vertices.length / 2`). */
  public get vertexCount(): number {
    return this.vertices.length / 2;
  }

  /** Number of indices to draw: `indices.length` for indexed meshes, `vertexCount` otherwise. */
  public get indexCount(): number {
    return this.indices?.length ?? this.vertexCount;
  }

  public get texture(): Texture | RenderTexture | null {
    return this._texture;
  }

  public set texture(texture: Texture | RenderTexture | null) {
    this._texture = texture;
    this.invalidateCache();
  }

  /**
   * Recompute the local AABB from the current vertex array. Call after
   * mutating `vertices` in place to keep culling correct; otherwise the
   * bounds the cull pass sees will be the AABB at construction time.
   */
  public recomputeLocalBounds(): this {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < this.vertices.length; i += 2) {
      const x = this.vertices[i];
      const y = this.vertices[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    this.getLocalBounds().set(minX, minY, maxX - minX, maxY - minY);
    this._invalidateBoundsCascade();

    return this;
  }
}

const positionAttributeNames = new Set<string>(['a_position', 'position']);
const texcoordAttributeNames = new Set<string>(['a_texcoord', 'texcoord', 'a_uv', 'uv']);
const colorAttributeNames = new Set<string>(['a_color', 'color']);

const findAttribute = (attributes: readonly GeometryAttribute[], names: Set<string>): GeometryAttribute | undefined =>
  attributes.find(attribute => names.has(attribute.name));

/**
 * Read a {@link Geometry}'s standard mesh attributes into the flat
 * `vertices`/`uvs`/`colors` arrays the mesh renderers consume. Only the
 * `triangle-list` topology and the canonical attribute layout (`f32` position
 * and texcoord, `u8`/`u32`/`f32` color) are supported — this is the immediate
 * (non-batched) bridge; shared GPU buffers and instancing arrive later.
 */
function readGeometry(geometry: Geometry): {
  vertices: Float32Array;
  uvs: Float32Array | null;
  colors: Uint32Array | null;
  indices: Uint16Array | null;
} {
  if (geometry.topology !== 'triangle-list') {
    throw new Error(`Mesh only supports triangle-list geometry (got "${geometry.topology}").`);
  }

  const position = findAttribute(geometry.attributes, positionAttributeNames);

  if (position === undefined) {
    throw new Error('Mesh geometry requires a position attribute named `a_position` or `position`.');
  }

  if (position.type !== 'f32' || position.size < 2) {
    throw new Error('Mesh geometry position attribute must be a float vector with at least 2 components.');
  }

  const texcoord = findAttribute(geometry.attributes, texcoordAttributeNames);

  if (texcoord !== undefined && (texcoord.type !== 'f32' || texcoord.size < 2)) {
    throw new Error('Mesh geometry texcoord attribute must be a float vector with at least 2 components.');
  }

  const color = findAttribute(geometry.attributes, colorAttributeNames);
  const vertexCount = geometry.vertexCount;
  const { stride } = geometry;
  const source = geometry.vertexData;
  const view = source instanceof Float32Array ? new DataView(source.buffer, source.byteOffset, source.byteLength) : new DataView(source);

  const vertices = new Float32Array(vertexCount * 2);
  const uvs = texcoord !== undefined ? new Float32Array(vertexCount * 2) : null;
  const colors = color !== undefined ? new Uint32Array(vertexCount) : null;

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;

    vertices[i * 2] = view.getFloat32(base + position.offset, true);
    vertices[i * 2 + 1] = view.getFloat32(base + position.offset + 4, true);

    if (uvs !== null && texcoord !== undefined) {
      uvs[i * 2] = view.getFloat32(base + texcoord.offset, true);
      uvs[i * 2 + 1] = view.getFloat32(base + texcoord.offset + 4, true);
    }

    if (colors !== null && color !== undefined) {
      colors[i] = readPackedColor(view, base + color.offset, color);
    }
  }

  const indices = readIndices(geometry.indices, vertexCount);

  return { vertices, uvs, colors, indices };
}

/** Pack a geometry color attribute into the mesh's RGBA8 u32 representation. */
function readPackedColor(view: DataView, offset: number, attribute: GeometryAttribute): number {
  if (attribute.type === 'u32' && attribute.size === 1) {
    return view.getUint32(offset, true) >>> 0;
  }

  if (attribute.type === 'u8' && attribute.size === 4) {
    const r = view.getUint8(offset);
    const g = view.getUint8(offset + 1);
    const b = view.getUint8(offset + 2);
    const a = view.getUint8(offset + 3);
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  }

  if (attribute.type === 'f32' && attribute.size === 4) {
    const r = Math.round(clamp01(view.getFloat32(offset, true)) * 255);
    const g = Math.round(clamp01(view.getFloat32(offset + 4, true)) * 255);
    const b = Math.round(clamp01(view.getFloat32(offset + 8, true)) * 255);
    const a = Math.round(clamp01(view.getFloat32(offset + 12, true)) * 255);
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  }

  throw new Error('Mesh geometry color attribute must be u8x4, u32x1, or f32x4.');
}

function readIndices(indices: Uint16Array | Uint32Array | null, vertexCount: number): Uint16Array | null {
  if (indices === null) {
    return null;
  }

  if (indices instanceof Uint16Array) {
    return indices;
  }

  if (vertexCount > 0xffff) {
    throw new Error(`Mesh geometry with ${vertexCount} vertices exceeds the 16-bit index limit.`);
  }

  return Uint16Array.from(indices);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
