import { Drawable } from '@/rendering/Drawable';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';

/**
 * Uniform value passed to a custom mesh shader. Mirrors the shape used by
 * {@link MeshShaderConfig.uniforms}; scalars and small vectors auto-marshal
 * to the appropriate `Float32Array`/`Int32Array` for the GL uniform call.
 * `Texture`/`RenderTexture` values are bound to texture slots starting at
 * slot 1 (slot 0 is reserved for the mesh's own `texture`).
 */
export type MeshShaderUniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

/**
 * Custom shader pair attached to a {@link Mesh}. When set, the renderer
 * compiles and binds these sources instead of the default mesh shader.
 *
 * The vertex layout is fixed and shared with the default shader, so custom
 * vertex shaders MUST pin the standard attribute locations:
 *
 * ```glsl
 * layout(location = 0) in vec2 a_position;
 * layout(location = 1) in vec2 a_texcoord;
 * layout(location = 2) in vec4 a_color;
 * ```
 *
 * The renderer auto-binds these uniforms when the shader declares them
 * (declared-but-unused is fine; absent is fine too):
 *
 * - `uniform mat3 u_projection` — view's projection.
 * - `uniform mat3 u_translation` — mesh's global transform.
 * - `uniform vec4 u_tint` — the mesh's `tint` as RGBA in 0..1.
 * - `uniform sampler2D u_texture` — bound to texture slot 0.
 *
 * Anything in `uniforms` is set after the auto-binds, in declaration order,
 * with `Texture`/`RenderTexture` entries taking texture slots 1..N. Mutate
 * `uniforms` between frames to drive animated effects (`uTime`, etc.).
 *
 * Currently WebGL2-only. Setting a custom shader on a Mesh rendered through
 * the WebGPU backend throws at draw time.
 */
export interface MeshShaderConfig {
  /** GLSL ES 3.00 vertex shader source (`#version 300 es`). */
  readonly vertexSource: string;
  /** GLSL ES 3.00 fragment shader source. */
  readonly fragmentSource: string;
  /** Initial uniform values; mutate between frames for animation. */
  uniforms?: Record<string, MeshShaderUniformValue>;
}

/**
 * Construction-time options for a {@link Mesh}.
 *
 * Vertices are required and must be a flat sequence of (x, y) pairs in
 * local space. UVs and per-vertex colors are optional but, when present,
 * must match the vertex count (UVs as (u, v) pairs, colors as one
 * packed-RGBA8 u32 per vertex). Indices are optional — if absent, the
 * vertex stream is drawn as a flat triangle list (3*N vertices = N
 * triangles). A texture is optional; a textured mesh samples it at the
 * supplied UVs while an untextured mesh paints solid vertex colors only.
 *
 * Validation is enforced at construction; any mismatch throws.
 *
 * For custom shaders, see {@link MeshShaderConfig}.
 */
export interface MeshOptions {
  readonly vertices: Float32Array;
  readonly indices?: Uint16Array;
  readonly uvs?: Float32Array;
  readonly colors?: Uint32Array;
  readonly texture?: Texture | RenderTexture | null;
  readonly shader?: MeshShaderConfig;
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
  public readonly shader: MeshShaderConfig | null;

  private _texture: Texture | RenderTexture | null;

  public constructor(options: MeshOptions) {
    super();

    const { vertices, indices = null, uvs = null, colors = null, texture = null, shader = null } = options;

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
    this.shader = shader;
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

    this.localBounds.set(minX, minY, maxX - minX, maxY - minY);
    this._invalidateBoundsCascade();

    return this;
  }
}
