import { describe, expect, test } from 'vitest';

import pointGlsl from '../src/backends/shaders/light-quad.frag';
import pointWgsl from '../src/backends/shaders/light-quad.wgsl';
import sunGlsl from '../src/backends/shaders/sun-quad.frag';
import sunVertexGlsl from '../src/backends/shaders/sun-quad.vert';
import sunWgsl from '../src/backends/shaders/sun-quad.wgsl';

describe('Lightmap shadow bias units', () => {
  test('point, spot and line shaders convert one world unit into normalized shadow depth', () => {
    // The CPU writes the point/spot falloff as surface.x and line half-length
    // in units of that falloff as half. Their product is the shadow-row reach.
    expect(pointGlsl).toContain('SHADOW_BIAS_WORLD = 1.0');
    expect(pointWgsl).toContain('SHADOW_BIAS_WORLD: f32 = 1.0');
    expect(pointGlsl).toContain('SHADOW_BIAS_WORLD / max(v_surface.x * (v_half + 1.0), 1.0)');
    expect(pointWgsl).toContain('SHADOW_BIAS_WORLD / max(reachWorld, 1.0)');
    expect(pointWgsl).toContain('input.surface.x * (input.half + 1.0)');
    expect(pointGlsl).toContain('here + normalizedBias - distance');
    expect(pointWgsl).toContain('here + normalizedBias - distance');
  });

  test('directional shaders normalize against the world-space depth span', () => {
    expect(sunGlsl).toContain('SHADOW_BIAS_WORLD = 1.0');
    expect(sunWgsl).toContain('SHADOW_BIAS_WORLD: f32 = 1.0');
    expect(sunVertexGlsl).toContain('v_depthSpan = a_range.w');
    expect(sunWgsl).toContain('output.depthSpan = input.range.w');
    expect(sunGlsl).toContain('SHADOW_BIAS_WORLD / max(v_depthSpan, 1.0)');
    expect(sunWgsl).toContain('SHADOW_BIAS_WORLD / max(depthSpan, 1.0)');
    expect(sunGlsl).toContain('here + normalizedBias - depth');
    expect(sunWgsl).toContain('here + normalizedBias - depth');
  });

  test('normalized bias corresponds to a stable world distance across light and camera scales', () => {
    for (const reach of [8, 64, 256, 1024]) {
      const worldBias = 1;
      const normalizedBias = worldBias / Math.max(reach, 1);

      expect(normalizedBias * reach).toBeCloseTo(worldBias, 8);
    }
  });
});
