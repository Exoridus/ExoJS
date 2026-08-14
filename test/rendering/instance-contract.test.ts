import { describe, expect, test } from 'vitest';

import { INSTANCE_TRANSFORM_GLSL, INSTANCE_TRANSFORM_WGSL } from '#rendering/shader/instanceContract';
import { resolveTransformTextureGlsl, TRANSFORM_TEXELS_PER_ROW, TRANSFORM_TEXTURE_GLSL_INCLUDE } from '#rendering/shader/transformTextureLayout';
import { TRANSFORM_FLOATS_PER_ROW, TRANSFORM_TINT_BYTES_PER_ROW } from '#rendering/TransformBuffer';

// Floats per rgba32f texel. The transform row is uploaded as whole texels, so
// the number of texelFetch calls a shader needs is a function of the row width.
const floatsPerTexel = 4;

describe('instanced-batch shader contract', () => {
  test('the GLSL form satisfies the renderer instancing predicate', () => {
    // Mirrors WebGl2MeshRenderer._isInstancingCompatible: a batch shader reaches
    // its transform through the shared buffer and must not carry the
    // single-draw uniforms, which mean the legacy per-draw path.
    expect(INSTANCE_TRANSFORM_GLSL).toContain('in uint a_nodeIndex;');
    expect(INSTANCE_TRANSFORM_GLSL).toContain('uniform sampler2D u_transforms;');
    expect(INSTANCE_TRANSFORM_GLSL).not.toContain('u_translation');
    expect(INSTANCE_TRANSFORM_GLSL).not.toContain('uniform vec4 u_tint;');
  });

  test('the GLSL form reads exactly the texels the transform row occupies', () => {
    // Rot guard: this is the check that fails if the row layout is widened or
    // narrowed without updating the contract constant. Without it, a layout
    // change would fix mesh.vert (its pixel tests go red) while the exported
    // constant silently kept fetching the old texel count.
    const expectedTexels = TRANSFORM_FLOATS_PER_ROW / floatsPerTexel;
    const fetched = [...INSTANCE_TRANSFORM_GLSL.matchAll(/texelFetch\(u_transforms, exoTransformTexel\(row, (\d+)\), 0\)/g)].map(match => Number(match[1]));

    expect(fetched).toEqual(Array.from({ length: expectedTexels }, (_, i) => i));
    expect(TRANSFORM_TEXELS_PER_ROW).toBe(expectedTexels);
  });

  test('the tint row is read from its own single-texel texture', () => {
    // The tint lives in a separate rgba8 row precisely so the transform row
    // stays at two texels; a shader that folded it back in would break that.
    expect(TRANSFORM_TINT_BYTES_PER_ROW).toBe(floatsPerTexel);
    expect(INSTANCE_TRANSFORM_GLSL).toContain('texelFetch(u_tintTexture, exoTintTexel(int(nodeIndex)), 0)');
  });

  test('the GLSL form carries the include the engine expands into the row addressing', () => {
    // The contract must not spell out the row -> texel mapping itself: it is
    // resolved at compile time from one shared source, which is what lets the
    // store hold more rows than MAX_TEXTURE_SIZE without every pasted shader
    // going stale.
    expect(INSTANCE_TRANSFORM_GLSL).toContain(TRANSFORM_TEXTURE_GLSL_INCLUDE);
    expect(INSTANCE_TRANSFORM_GLSL).not.toContain('EXO_TRANSFORM_ROWS_PER_LINE');

    const resolved = resolveTransformTextureGlsl(INSTANCE_TRANSFORM_GLSL);

    expect(resolved).toContain('ivec2 exoTransformTexel(int row, int texel)');
    expect(resolved).toContain('ivec2 exoTintTexel(int row)');
    expect(resolved).not.toContain(TRANSFORM_TEXTURE_GLSL_INCLUDE);
  });

  test('both language forms expose the same helper surface', () => {
    for (const source of [INSTANCE_TRANSFORM_GLSL, INSTANCE_TRANSFORM_WGSL]) {
      expect(source).toContain('exoInstanceClipPosition');
      expect(source).toContain('exoInstanceTint');
    }
  });

  test('neither form declares a version directive or precision qualifier', () => {
    // Both are inserted into user source, which owns its own header.
    for (const source of [INSTANCE_TRANSFORM_GLSL, INSTANCE_TRANSFORM_WGSL]) {
      expect(source).not.toContain('#version');
      expect(source).not.toContain('precision ');
    }
  });

  test('the WGSL form binds the engine-owned group 0 slots', () => {
    expect(INSTANCE_TRANSFORM_WGSL).toContain('@group(0) @binding(0) var<uniform> exoUniforms');
    expect(INSTANCE_TRANSFORM_WGSL).toContain('@group(0) @binding(1) var<storage, read> exoTransforms');
    expect(INSTANCE_TRANSFORM_WGSL).toContain('@group(0) @binding(2) var<storage, read> exoTints');
  });
});
