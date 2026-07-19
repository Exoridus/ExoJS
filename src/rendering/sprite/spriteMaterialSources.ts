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
 * Both paths (locations 0, 3, 5, 6) fetch each instance's world transform and
 * tint from the shared transform storage keyed by `a_nodeIndex` / `nodeIndex`: the
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
 * corner expansion and attribute contract to the default sprite vertex shader
 * (tint read from the shared transform slot's texel 2, no per-instance color).
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
layout(location = 5) in uint a_textureSlot;
layout(location = 6) in uint a_nodeIndex;       // row into the shared transform buffer

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;                        // device-pixel snap rect (x, y, width, height)
uniform sampler2D u_transforms;                 // shared per-frame transform buffer (3 texels/row)

out vec2 v_texcoord;
out vec4 v_color;
flat out uint v_textureSlot;

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Identical to the default sprite vertex stage.
float snapBoundary(float localValue, float scale) {
    if (abs(scale) < 1e-6) return localValue;
    return floor(localValue * scale + 0.5) / scale;
}

void main(void) {
    // gl_VertexID 0..3 → corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_localBounds.x : a_localBounds.z;
    float localY = (cornerY == 0) ? a_localBounds.y : a_localBounds.w;

    // Fetch the per-instance world transform and tint from the shared buffer
    // (row = a_nodeIndex): texel 0 = (a, b, c, d), texel 1 = (tx, ty, snapMode, 0),
    // texel 2 = tint (rgb 0..1, a).
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
    vec4 m2 = texelFetch(u_transforms, ivec2(2, row), 0);

    // Geometry boundary snap (m1.z == 2.0, axis-aligned only): round each local
    // corner to the device grid so the quad edges land on whole device pixels.
    // The per-axis device scale is derived from the composed pipeline exactly
    // like buildPixelSnapContext. Identical to the default sprite vertex stage.
    if (m1.z == 2.0) {
        vec2 vp = u_viewport.zw;
        vec3 dO = u_projection * u_group * vec3(m1.x, m1.y, 1.0);
        vec2 devO = u_viewport.xy + (dO.xy * 0.5 + 0.5) * vp;
        vec3 dX = u_projection * u_group * vec3(m1.x + m0.x, m1.y + m0.z, 1.0);
        vec3 dY = u_projection * u_group * vec3(m1.x + m0.y, m1.y + m0.w, 1.0);
        vec2 devX = u_viewport.xy + (dX.xy * 0.5 + 0.5) * vp;
        vec2 devY = u_viewport.xy + (dY.xy * 0.5 + 0.5) * vp;
        float scaleX = devX.x - devO.x;
        float scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    vec2 clip = (u_projection * u_group * vec3(worldX, worldY, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin), identical to the default sprite
    // vertex stage: snap the node ORIGIN's device-pixel position and rigid-shift
    // the whole primitive by the same delta. floor(x+0.5) matches the CPU
    // Math.round policy; GLSL round() is undefined at .5. A custom material
    // customizes only the fragment stage, so its origin snap must stay identical.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(m2.rgb * m2.a, m2.a);
    v_textureSlot = a_textureSlot;
}
`;

/**
 * WGSL vertex stage + shared bindings for the custom sprite-material path.
 * Prepend to a material's fragment WGSL: it declares the per-instance
 * `VertexInput` (locations 0, 3, 5, 6), the `VertexOutput` a custom
 * `@fragment` consumes, the group(0) projection uniform + shared transform
 * storage buffer, the group(1) base texture and sampler (`u_texture` /
 * `u_sampler`), and the `vertexMain` entry point. The fragment author adds their
 * group(2) bindings and a `fragmentMain` reading `VertexOutput`.
 * @internal
 */
export const spriteVertexWgsl = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,
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
    @location(5) textureSlot: u32,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Identical to the default sprite vertex stage.
fn snapBoundary(localValue: f32, scale: f32) -> f32 {
    if (abs(scale) < 1e-6) {
        return localValue;
    }
    return floor(localValue * scale + 0.5) / scale;
}

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    var localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    var localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    // Fetch this instance's world transform and tint from the shared storage
    // buffer, keyed by nodeIndex: m0 = (a, b, c, d), m1 = (tx, ty, snapMode, 0),
    // m2 = tint (rgb 0..1, a).
    let slot = transforms[input.nodeIndex];

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the quad edges land on whole device
    // pixels. The per-axis device scale is derived from the composed pipeline
    // exactly like buildPixelSnapContext. Identical to the default sprite stage.
    if (slot.m1.z == 2.0) {
        let vp = projection.viewport.zw;
        let dO = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let dX = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.x, slot.m1.y + slot.m0.z, 0.0, 1.0);
        let dY = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.y, slot.m1.y + slot.m0.w, 0.0, 1.0);
        let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let scaleX = devX.x - devO.x;
        let scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    var position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    // Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin),
    // identical to the default sprite vertex stage: snap the node ORIGIN's
    // device-pixel position and rigid-shift the whole primitive by the same
    // delta. floor(x + 0.5) matches the CPU Math.round policy; WGSL round() is
    // half-to-even. A custom material customizes only the fragment stage, so its
    // origin snap must stay identical.
    if (slot.m1.z != 0.0) {
        let originClip = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
        position = vec4<f32>(position.xy + snapDelta, position.z, position.w);
    }

    output.position = position;

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4<f32>(slot.m2.rgb * slot.m2.a, slot.m2.a);

    return output;
}
`;
