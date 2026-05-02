import { Drawable } from '@/rendering/Drawable';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';

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
 */
export interface MeshOptions {
    readonly vertices: Float32Array;
    readonly indices?: Uint16Array;
    readonly uvs?: Float32Array;
    readonly colors?: Uint32Array;
    readonly texture?: Texture | RenderTexture | null;
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

    private _texture: Texture | RenderTexture | null;

    public constructor(options: MeshOptions) {
        super();

        const { vertices, indices = null, uvs = null, colors = null, texture = null } = options;

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
        this._texture = texture;

        this.recomputeLocalBounds();
    }

    public get vertexCount(): number {
        return this.vertices.length / 2;
    }

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
