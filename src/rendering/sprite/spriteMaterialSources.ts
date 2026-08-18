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

import spriteVertexGlslModule from './glsl/sprite-material.vert';
import spriteFragmentMainWgslModule from './wgsl/sprite-fragment-main.wgsl';
import spriteSharedStorageWgslModule from './wgsl/sprite-shared-storage.wgsl';
import spriteVertexCoreWgslModule from './wgsl/sprite-vertex-core.wgsl';

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
export const spriteVertexGlsl: string = spriteVertexGlslModule;

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
 * The whole WGSL sprite vertex stage EXCEPT where the per-sprite record comes
 * from: the `VertexOutput` a sprite fragment consumes, the boundary snap, and
 * `spriteVertexCore`, which turns one record plus a corner id into that output.
 *
 * Every WGSL sprite path shares this text — the streamed default path, the
 * custom-material path, and the persistent-indexed path — because the three
 * differ only in whether the record arrives as vertex attributes, as a row of
 * the shared frame storage, or as a row of a root's persistent slot store. The
 * geometry, the snapping and the tint resolve are the SAME contract in all
 * three, and a copy per path is how two of them silently stop matching.
 *
 * Reads the module-scope `projection` uniform rather than taking it as an
 * argument, so a path may extend `ProjectionUniforms` with fields of its own
 * (see `buildPersistentSpriteShaderSource`) as long as the three this needs —
 * `matrix`, `group`, `viewport` — keep their meaning.
 * @internal
 */
export const spriteVertexCoreWgsl: string = spriteVertexCoreWgslModule;

/**
 * The group(0) declarations every WGSL sprite path that reads the SHARED
 * per-frame transform storage makes: the projection uniform, the transform rows
 * and the packed rgba8 tint words.
 * @internal
 */
export const spriteSharedStorageWgsl: string = spriteSharedStorageWgslModule;

/**
 * The default sprite fragment stage: sample this instance's slot with explicit
 * derivatives, resolve the premultiply flag the vertex stage forwarded, and
 * modulate by the interpolated tint.
 * @internal
 */
export const spriteFragmentMainWgsl: string = spriteFragmentMainWgslModule;

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
export const spriteVertexWgsl = `${spriteSharedStorageWgsl}
struct VertexInput {
    @location(0) localBounds: vec4<f32>,
    @location(3) uvBounds: vec4<f32>,
    @location(5) packedSlotFlags: u32, // bits 0..7 = texture slot, bit 8 = premultiply sample
    @location(6) nodeIndex: u32,
};
${spriteVertexCoreWgsl}
@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    // This instance's world transform and tint, keyed by nodeIndex into the
    // shared per-frame storage.
    let slot = transforms[input.nodeIndex];

    return spriteVertexCore(input.localBounds, input.uvBounds, slot.m0, slot.m1, tints[input.nodeIndex], input.packedSlotFlags, vid);
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
