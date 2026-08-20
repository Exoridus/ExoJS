/**
 * Shader-side contract for custom {@link RenderBatch} materials.
 *
 * A batch draws one geometry N times and reaches each instance's transform and
 * tint through the engine's shared per-frame transform buffer, indexed by
 * `a_nodeIndex` (GLSL) / `nodeIndex` (WGSL). The buffer's texel layout, the
 * affine unpacking and the render-only pixel-snap policy are all internal and
 * have changed before - most recently when the tint moved into its own rgba8
 * row to keep the transform row at two texels.
 *
 * These constants exist so that layout stays internal. Paste one into a custom
 * material's shader source and read the instance through the `exo*` helpers
 * instead of touching the buffers directly; a future layout change then updates
 * the helper rather than breaking every shader that copied its body.
 *
 * A shader that does not satisfy this contract is rejected on its first
 * {@link RenderingContext.drawBatch} - the check reads the linked program, so it
 * cannot run any earlier.
 */

import { TRANSFORM_TEXTURE_GLSL_INCLUDE } from './transformTextureLayout';

/**
 * GLSL ES 3.00 form of the instanced-batch contract. Insert it directly after
 * the `#version 300 es` directive of a custom material's **vertex** shader; it
 * declares no precision qualifier, relying on the vertex stage's default `highp`
 * for floats.
 *
 * Declares the engine-supplied inputs (`a_position`, `a_texcoord`, `a_color`,
 * `a_nodeIndex`) and uniforms, and exposes two helpers:
 *
 * - `vec2 exoInstanceClipPosition(vec2 localPosition, uint nodeIndex)` - maps a
 *   local-space vertex of the current instance to clip space, including pixel
 *   snapping. Returns clip space rather than world space because snapping is
 *   defined in device pixels and needs the projection, group matrix and viewport
 *   together.
 * - `vec4 exoInstanceTint(uint nodeIndex)` - the instance's tint, to be passed
 *   through to the fragment stage.
 *
 * Unused declarations are stripped at link time; a batch shader that ignores
 * texcoords or vertex colors needs no further ceremony. The `#exo-include`
 * comment the constant carries is expanded by the engine when it compiles the
 * shader - it is what keeps the buffers' texel addressing internal, so leave it
 * in place.
 *
 * @example
 * ```ts
 * const vertex = `#version 300 es
 * ${INSTANCE_TRANSFORM_GLSL}
 *
 * in vec2 a_offset;
 *
 * out vec2 v_texcoord;
 * out vec4 v_tint;
 *
 * void main() {
 *   gl_Position = vec4(exoInstanceClipPosition(a_position + a_offset, a_nodeIndex), 0.0, 1.0);
 *   v_texcoord = a_texcoord;
 *   v_tint = exoInstanceTint(a_nodeIndex);
 * }`;
 * ```
 * @stable
 */
export const INSTANCE_TRANSFORM_GLSL = `
in vec2 a_position;
in vec2 a_texcoord;
in vec4 a_color;
in uint a_nodeIndex;

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;
uniform sampler2D u_transforms;
uniform sampler2D u_tintTexture;

${TRANSFORM_TEXTURE_GLSL_INCLUDE}

vec2 exoInstanceClipPosition(vec2 localPosition, uint nodeIndex) {
    int row = int(nodeIndex);
    vec4 m0 = texelFetch(u_transforms, exoTransformTexel(row, 0), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, exoTransformTexel(row, 1), 0); // tx, ty, snapMode, 0
    // mat3() takes columns, the engine's Matrix is row-major — hence the
    // interleave. Yields | a b tx ; c d ty ; 0 0 1 |.
    mat3 transform = mat3(
        m0.x, m0.z, 0.0,
        m0.y, m0.w, 0.0,
        m1.x, m1.y, 1.0
    );

    vec2 clip = (u_projection * u_group * transform * vec3(localPosition, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, non-zero = snap origin). Snap
    // the instance ORIGIN's device-pixel position and rigid-shift the primitive
    // by the same delta. floor(x + 0.5) matches the CPU Math.round policy;
    // GLSL round() is undefined at .5.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    return clip;
}

vec4 exoInstanceTint(uint nodeIndex) {
    return texelFetch(u_tintTexture, exoTintTexel(int(nodeIndex)), 0);
}
`;

/**
 * WGSL form of the instanced-batch contract, for the WebGPU backend. Insert it
 * at the top of a custom material's shader source.
 *
 * Declares the engine-owned `@group(0)` bindings and exposes the same two
 * helpers as {@link INSTANCE_TRANSFORM_GLSL}. Because WGSL has no global vertex
 * inputs, both take the node index explicitly - which is also why the GLSL
 * helpers take it as a parameter, so a material's two shader bodies read alike:
 *
 * - `exoInstanceClipPosition(localPosition: vec2<f32>, nodeIndex: u32) -> vec2<f32>`
 * - `exoInstanceTint(nodeIndex: u32) -> vec4<f32>`
 *
 * The vertex entry point must take `@location(6) nodeIndex: u32` in its input
 * struct; `@location(0..2)` carry position, texcoord and color as in the GLSL
 * form.
 * @stable
 */
export const INSTANCE_TRANSFORM_WGSL = `
struct ExoTransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

struct ExoTransformUniforms {
    projection: mat3x3<f32>,
    group: mat3x3<f32>,
    flags: vec4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};

@group(0) @binding(0) var<uniform> exoUniforms: ExoTransformUniforms;
@group(0) @binding(1) var<storage, read> exoTransforms: array<ExoTransformSlot>;
@group(0) @binding(2) var<storage, read> exoTints: array<u32>;

fn exoInstanceClipPosition(localPosition: vec2<f32>, nodeIndex: u32) -> vec2<f32> {
    // Shared slot convention: m0 = (a, b, c, d), m1 = (tx, ty, snapMode, 0).
    let slot = exoTransforms[nodeIndex];
    let world = vec3<f32>(
        slot.m0.x * localPosition.x + slot.m0.y * localPosition.y + slot.m1.x,
        slot.m0.z * localPosition.x + slot.m0.w * localPosition.y + slot.m1.y,
        1.0
    );

    var clip = (exoUniforms.projection * exoUniforms.group * world).xy;

    // Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
    // floor(x + 0.5) matches the CPU Math.round policy; WGSL round() is
    // half-to-even.
    if (slot.m1.z != 0.0) {
        let originClip = (exoUniforms.projection * exoUniforms.group * vec3<f32>(slot.m1.x, slot.m1.y, 1.0)).xy;
        let originDevice = exoUniforms.viewport.xy + (originClip * 0.5 + vec2<f32>(0.5)) * exoUniforms.viewport.zw;
        clip = clip + (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(exoUniforms.viewport.zw, vec2<f32>(1.0));
    }

    return clip;
}

fn exoInstanceTint(nodeIndex: u32) -> vec4<f32> {
    return unpack4x8unorm(exoTints[nodeIndex]);
}
`;
