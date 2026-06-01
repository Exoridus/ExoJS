/**
 * Canonical engine vertex stage for the custom {@link SpriteMaterial} path.
 *
 * @internal — not part of the public package surface. A custom `SpriteMaterial`
 * customizes the **fragment** stage only; the vertex stage (quad-corner
 * expansion, affine transform, UV unpacking) is owned by the renderer and stays
 * instancing-critical. The sprite renderers consume these constants directly:
 * `WebGl2SpriteRenderer` pairs {@link spriteVertexGlsl} with the material's
 * fragment (ignoring any author-supplied `glsl.vertex`), and
 * `WebGpuSpriteRenderer` prepends {@link spriteVertexWgsl} to the material's
 * fragment WGSL. Both pin the per-instance attribute locations and the
 * projection binding exactly as the default sprite path does, so a custom
 * material keeps the single `drawArraysInstanced` / `drawIndexed` batch.
 *
 * Both paths (locations 0, 3, 4, 5, 6) fetch each instance's world transform
 * from the shared transform storage keyed by `a_nodeIndex` / `nodeIndex`: the
 * WebGL2 path samples the `u_transforms` texture, the WGSL path reads the
 * `transforms` storage buffer (group(0) binding(1)).
 *
 * A custom fragment receives the interpolated `v_texcoord` and premultiplied
 * `v_color`, plus the per-batch base texture bound as `u_texture` (WebGL2 unit 0
 * / WGSL group(1) binding 0). Material uniforms and additional textures bind on
 * top (WebGL2 units 1..N / WGSL group(2)).
 */

/**
 * GLSL ES 3.00 vertex shader for the custom sprite-material path. Identical
 * corner expansion and attribute contract to the default sprite vertex shader.
 * @internal
 */
export const spriteVertexGlsl = `#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (divisor = 1). Each Sprite contributes one entry
// to the per-instance buffer; gl_VertexID 0..3 selects which corner of the
// quad this invocation is computing.
layout(location = 0) in vec4 a_localBounds;     // left, top, right, bottom (local space)
layout(location = 3) in vec4 a_uvBounds;        // uMin, vMin, uMax, vMax (normalised, already flipY-swapped)
layout(location = 4) in vec4 a_color;           // RGBA tint
layout(location = 5) in uint a_textureSlot;
layout(location = 6) in uint a_nodeIndex;       // row into the shared transform buffer

uniform mat3 u_projection;
uniform sampler2D u_transforms;                 // shared per-frame transform buffer (3 texels/row)

out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;

void main(void) {
    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
    float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;

    // Fetch the per-instance world transform from the shared buffer (row =
    // a_nodeIndex): texel 0 = (a, b, c, d), texel 1 = (tx, ty, 0, 0).
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    gl_Position = vec4((u_projection * vec3(worldX, worldY, 1.0)).xy, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
    v_textureSlot = a_textureSlot;
}
`;

/**
 * WGSL vertex stage + shared bindings for the custom sprite-material path.
 * Prepend to a material's fragment WGSL: it declares the per-instance
 * `VertexInput` (locations 0, 3, 4, 5, 6), the `VertexOutput` a custom
 * `@fragment` consumes, the group(0) projection uniform + shared transform
 * storage buffer, the group(1) base texture and sampler (`u_texture` /
 * `u_sampler`), and the `vertexMain` entry point. The fragment author adds their
 * group(2) bindings and a `fragmentMain` reading `VertexOutput`.
 * @internal
 */
export const spriteVertexWgsl = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;

@group(1) @binding(0) var u_texture: texture_2d<f32>;
@group(1) @binding(1) var u_sampler: sampler;

struct VertexInput {
    @location(0) localBounds: vec4<f32>,
    @location(3) uvBounds: vec4<f32>,
    @location(4) color: vec4<f32>,
    @location(5) textureSlot: u32,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    let localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    // Fetch this instance's world transform from the shared storage buffer,
    // keyed by nodeIndex: m0 = (a, b, c, d), m1 = (tx, ty, 0, 0). (m2 carries the
    // node tint, unused here — the sprite keeps its own per-instance color.)
    let slot = transforms[input.nodeIndex];
    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    output.position = projection.matrix * vec4<f32>(worldX, worldY, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);

    return output;
}
`;
