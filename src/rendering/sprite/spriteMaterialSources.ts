/**
 * Canonical engine vertex stage for the custom {@link SpriteMaterial} path.
 *
 * @internal — not part of the public package surface. A custom `SpriteMaterial`
 * customizes the **fragment** stage only; the vertex stage (quad-corner
 * expansion, affine transform, UV unpacking) is owned by the renderer and stays
 * instancing-critical. The sprite renderers consume these constants directly:
 * `WebGl2SpriteRenderer` pairs {@link spriteVertexGlsl} with the material's
 * fragment (ignoring any author-supplied `glsl.vertex`) after splicing
 * {@link spriteMaterialPrologueGlsl} into it, and `WebGpuSpriteRenderer`
 * prepends {@link spriteMaterialPrologueWgsl} to the material's
 * fragment WGSL. Both pin the per-instance attribute locations and the
 * projection binding exactly as the default sprite path does, so a custom
 * material keeps the single `drawArraysInstanced` / `drawIndexed` batch.
 *
 * Both paths (locations 0, 3, 5, 6) fetch each instance's world transform and
 * tint keyed by `a_nodeIndex` / `nodeIndex`: the WebGL2 path samples the
 * `u_transforms` texture (transform) and `u_tintTexture` (rgba8 tint), the
 * WGSL path reads the `transforms` storage buffer (group(0) binding(1)) and
 * the `tints` packed-rgba8 storage buffer (group(0) binding(2)).
 *
 * A custom fragment receives the interpolated `v_texcoord`, the premultiplied
 * `v_color` and the flat per-instance base-texture slot. The base texture is
 * NOT bound as a single sampler: like the default path, a custom batch rotates
 * up to {@link spriteMaterialTextureSlots} base textures through the group(1)
 * (WGSL) / unit 0..N-1 (WebGL2) slot table, and the fragment reads its own
 * instance's texture through the engine-provided `sampleBase(slot, uv)` helper.
 * On WebGPU the value passed as `slot` also carries the engine-owned sample-
 * premultiplication flag in bit 8; `sampleBase` masks and applies it. Custom
 * fragments must treat it as opaque and pass it through unchanged.
 * Material uniforms and additional textures bind on top (WebGL2 units
 * {@link spriteMaterialTextureSlots}..N / WGSL group(2)).
 */

/**
 * Base-texture batch slots a custom {@link SpriteMaterial} rotates through.
 *
 * Deliberately smaller than the default path's device-derived tier (WebGL2 16,
 * WebGPU 8/16/32): the custom path additionally binds the material's own
 * textures in the SAME fragment stage, and both backends only guarantee 16
 * fragment-stage texture/sampler bindings (`MAX_TEXTURE_IMAGE_UNITS` >= 16;
 * WebGPU's `maxSampledTexturesPerShaderStage` / `maxSamplersPerShaderStage`
 * base limits of 16). 8 base slots + 7 material textures = 15 fits that floor
 * on every conformant device, so exactly one prologue variant ships per backend
 * and no bind-group layout depends on the granted limits.
 * @internal
 */
export const spriteMaterialTextureSlots = 8;

/**
 * GLSL ES 3.00 vertex shader for the custom sprite-material path. Identical
 * corner expansion and attribute contract to the default sprite vertex shader
 * (tint read from the separate `u_tintTexture`, no per-instance color).
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
uniform sampler2D u_transforms;                 // shared per-frame transform buffer (2 texels/row)
uniform sampler2D u_tintTexture;                // shared per-frame tint buffer (rgba8, 1 texel/row)

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

    // Fetch the per-instance world transform and tint (row = a_nodeIndex):
    // transform texel 0 = (a, b, c, d), texel 1 = (tx, ty, snapMode, 0); tint
    // is its own rgba8 texel (0..1 already, hardware-normalized).
    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);
    vec4 m2 = texelFetch(u_tintTexture, ivec2(0, row), 0);

    // Geometry boundary snap (m1.z == 2.0, axis-aligned only): round each local
    // corner to the device grid so the quad edges land on whole device pixels.
    // The per-axis device scale is derived from the composed pipeline.
    // Identical to the default sprite vertex stage.
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
 * GLSL ES 3.00 multi-texture slot table for `textureSlots` base textures:
 * the `u_texture0..N-1` sampler declarations, the flat slot varying, and the
 * `sampleBase(slot, uv)` dispatch a custom fragment reads its own instance's
 * base texture through.
 *
 * The dispatch is an unrolled if/else chain, matching the default sprite
 * fragment (`webgl2/glsl/sprite.frag`): GLSL ES 3.00 forbids indexing an array
 * of samplers with a non-dynamically-uniform expression, which a per-instance
 * slot is not.
 * @internal
 */
export const buildSpriteMaterialSlotGlsl = (textureSlots: number): string => {
  const samplers = Array.from({ length: textureSlots }, (_, slot) => `uniform sampler2D u_texture${slot};`).join('\n');
  // The last slot is the else branch so every uint value maps to a texture.
  const dispatch = Array.from({ length: textureSlots - 1 }, (_, slot) => `    if (slot == ${slot}u) return texture(u_texture${slot}, uv);`).join('\n');

  // Every FLOAT-typed declaration carries an explicit precision qualifier: a
  // GLSL ES 3.00 fragment shader has no default float precision, and the
  // prologue is spliced ahead of whatever `precision` statement the author
  // wrote, so an unqualified `vec4` here would not compile. `uint` and
  // `sampler2D` do have fragment-stage defaults (mediump / lowp) and stay
  // unqualified — the sampler precision matches the default sprite fragment.
  return `${samplers}

// Engine-owned base-texture varying: the slot this instance's texture occupies
// in the batch's slot table. Custom fragments must not redeclare it.
flat in uint v_textureSlot;

// Sample this instance's base texture. \`slot\` is \`v_textureSlot\`; \`uv\` is
// normally \`v_texcoord\` but may be any coordinate the effect derives from it.
highp vec4 sampleBase(uint slot, highp vec2 uv) {
${dispatch}
    return texture(u_texture${textureSlots - 1}, uv);
}`;
};

/**
 * Engine-owned fragment prologue spliced into every custom sprite-material
 * GLSL fragment (see {@link composeSpriteMaterialFragmentGlsl}).
 * @internal
 */
export const spriteMaterialPrologueGlsl = buildSpriteMaterialSlotGlsl(spriteMaterialTextureSlots);

/**
 * Splice {@link spriteMaterialPrologueGlsl} into an author-supplied sprite
 * material fragment.
 *
 * The prologue cannot simply be prepended: a GLSL ES 3.00 fragment starts with
 * its own `#version` directive, which must be the first token in the unit.
 * The insertion point is therefore after the run of leading directives and
 * `precision` statements (plus blank lines and line comments) — after the
 * author's defaults, and still before any declaration, which is where
 * `#extension` requires to sit.
 * @internal
 */
export const composeSpriteMaterialFragmentGlsl = (fragment: string): string => {
  const lines = fragment.split('\n');
  let insertAt = 0;

  for (let index = 0; index < lines.length; index++) {
    // In-bounds: index < lines.length via the loop guard.
    const line = lines[index]!.trim();

    if (line === '' || line.startsWith('//')) {
      continue;
    }

    if (
      line.startsWith('#version') ||
      line.startsWith('#extension') ||
      line.startsWith('#pragma') ||
      line.startsWith('#line') ||
      line.startsWith('precision ')
    ) {
      insertAt = index + 1;
      continue;
    }

    break;
  }

  return [...lines.slice(0, insertAt), spriteMaterialPrologueGlsl, ...lines.slice(insertAt)].join('\n');
};

/**
 * WGSL vertex stage for the custom sprite-material path. Declares the
 * per-instance `VertexInput` (locations 0, 3, 5, 6), the `VertexOutput` a
 * custom `@fragment` consumes, the group(0) projection uniform + shared
 * transform storage buffers, and the `vertexMain` entry point.
 *
 * Not fed to `createShaderModule` on its own — {@link spriteMaterialPrologueWgsl}
 * pairs it with the group(1) base-texture slot table.
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
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
// Packed rgba8 tint (r|g|b|a, 8 bits each, unpacked via unpack4x8unorm), one
// u32 per instance.
@group(0) @binding(2) var<storage, read> tints: array<u32>;

struct VertexInput {
    @location(0) localBounds: vec4<f32>,
    @location(3) uvBounds: vec4<f32>,
    @location(5) packedSlotFlags: u32, // bits 0..7 = texture slot, bit 8 = premultiply sample
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    // Opaque packed slot/flag word. Pass it unchanged to sampleBase(); custom
    // fragments must not interpret it as a plain slot index.
    @location(2) @interpolate(flat) textureSlot: u32,
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

    // Fetch this instance's world transform and tint, keyed by nodeIndex:
    // m0 = (a, b, c, d), m1 = (tx, ty, snapMode, 0); tint is its own packed
    // rgba8 word, unpacked to 0..1 by the GPU (no manual math needed).
    let slot = transforms[input.nodeIndex];
    let tint = unpack4x8unorm(tints[input.nodeIndex]);

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the quad edges land on whole device
    // pixels. The per-axis device scale is derived from the composed pipeline.
    // Identical to the default sprite stage.
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

    output.color = vec4<f32>(tint.rgb * tint.a, tint.a);
    output.textureSlot = input.packedSlotFlags;

    return output;
}
`;

/**
 * WGSL multi-texture slot table for `textureSlots` base textures on group(1):
 * the texture bindings at [0, N), their samplers at [N, 2N), and the
 * `sampleTexture` dispatch over the same slot range.
 *
 * The single generator behind BOTH the default sprite pipeline
 * (`buildSpriteShaderSource`) and the custom-material prologue
 * ({@link spriteMaterialPrologueWgsl}), so the two slot layouts cannot drift.
 *
 * `textureSampleGrad` (explicit derivatives) rather than `textureSample`:
 * WGSL requires implicit-LOD sampling to run in uniform control flow, which
 * multi-texture batching breaks because the slot varies per fragment. Explicit
 * derivatives are valid regardless of control-flow uniformity while preserving
 * mipmap-correct LOD.
 * @internal
 */
export const buildSpriteTextureSlotWgsl = (textureSlots: number): string => {
  const textureBindings = Array.from({ length: textureSlots }, (_, slot) => `@group(1) @binding(${slot})\nvar spriteTexture${slot}: texture_2d<f32>;`).join(
    '\n',
  );
  const samplerBindings = Array.from(
    { length: textureSlots },
    (_, slot) => `@group(1) @binding(${textureSlots + slot})\nvar spriteSampler${slot}: sampler;`,
  ).join('\n');
  // The last slot is the switch default so every u32 value maps to a texture.
  const sampleCases = Array.from({ length: textureSlots }, (_, slot) =>
    slot < textureSlots - 1
      ? `        case ${slot}u: {\n            return textureSampleGrad(spriteTexture${slot}, spriteSampler${slot}, uv, ddx, ddy);\n        }`
      : `        default: {\n            return textureSampleGrad(spriteTexture${slot}, spriteSampler${slot}, uv, ddx, ddy);\n        }`,
  ).join('\n');

  return `${textureBindings}

${samplerBindings}

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    switch slot {
${sampleCases}
    }
}`;
};

/**
 * Engine-owned WGSL prologue prepended to every custom sprite-material
 * fragment: {@link spriteVertexWgsl} plus the group(1) base-texture slot table
 * and the `sampleBase(slot, uv)` helper a custom fragment reads its own
 * instance's base texture through.
 *
 * The author adds their group(2) bindings and a `fragmentMain` reading
 * `VertexOutput`.
 * @internal
 */
export const spriteMaterialPrologueWgsl = `${spriteVertexWgsl}
${buildSpriteTextureSlotWgsl(spriteMaterialTextureSlots)}

// Sample this instance's base texture. \`packedSlotFlags\` is the opaque
// \`input.textureSlot\` carrier: bits 0..7 select the texture and bit 8 asks
// the engine to convert its unpremultiplied sample to premultiplied alpha.
// \`uv\` is normally \`input.texcoord\` but may be any coordinate the effect
// derives from it. Derivatives are taken here, before the per-slot switch, because
// multi-texture batching makes the slot non-uniform across a quad and
// textureSampleGrad is the only sampling form valid in that control flow.
fn sampleBase(packedSlotFlags: u32, uv: vec2<f32>) -> vec4<f32> {
    let slot = packedSlotFlags & 0xffu;
    let sample = sampleTexture(slot, uv, dpdx(uv), dpdy(uv));
    let premultiplySample = ((packedSlotFlags >> 8u) & 1u) == 1u;
    return select(sample, vec4<f32>(sample.rgb * sample.a, sample.a), premultiplySample);
}
`;
