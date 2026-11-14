import { Color, Matrix, Rectangle, RenderPipeline, RenderTexture, Signal, TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { FrameLightingBackend } from '../src/backends/FrameLightingBackend';
import pointGlsl from '../src/backends/shaders/light-quad.frag';
import pointWgsl from '../src/backends/shaders/light-quad.wgsl';
import sunGlsl from '../src/backends/shaders/sun-quad.frag';
import sunWgsl from '../src/backends/shaders/sun-quad.wgsl';
import type { LightingHost } from '../src/LightingHost';
import { LightmapLighting } from '../src/LightmapLighting';
import { PointLight } from '../src/lights/PointLight';

interface LightBatches {
  readonly _lightBatches: Map<
    unknown,
    { readonly material: { readonly uniforms: { readonly u_shadowPrecision: { readonly value: number } } } }
  >;
}

const fakeApp = (): LightingHost => {
  const view = {
    center: { x: 32, y: 32 },
    width: 64,
    height: 64,
    rotation: 0,
    getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64),
    getTransform: (): Matrix => new Matrix(),
    getInverseTransform: (): Matrix => new Matrix(),
  };

  return {
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (format: TextureFormat): boolean => format === TextureFormat.Rgba8 || format === TextureFormat.Rgba16F,
      view,
    },
    width: 64,
    height: 64,
  } as unknown as LightingHost;
};

describe('lightmap shadow clearance', () => {
  test.each([
    ['light-quad.frag', pointGlsl, 'fwidth(radial)'],
    ['light-quad.wgsl', pointWgsl, 'fwidth(radial)'],
    ['sun-quad.frag', sunGlsl, 'fwidth(v_sun.y)'],
    ['sun-quad.wgsl', sunWgsl, 'fwidth(input.sun.y)'],
  ])('%s clears three quarters of a fragment of the depth it compares', (_file, source, footprint) => {
    // A constant in the row's own units scales with the light's reach or the
    // sun's depth span, not with what a fragment resolves.
    expect(source).not.toMatch(/SHADOW_BIAS/);
    expect(source).toMatch(/SHADOW_CLEARANCE(: f32)? = 0\.75;/);
    expect(source).toContain(`SHADOW_CLEARANCE * ${footprint}`);
  });

  test('only the polar rows, which may be half floats, widen by their stored precision', () => {
    expect(pointGlsl).toContain('(radial - clearance) / (1.0 + uniforms.u_shadowPrecision)');
    expect(pointWgsl).toContain('(radial - clearance) / (1.0 + uniforms.u_shadowPrecision)');
    expect(sunGlsl).not.toContain('u_shadowPrecision');
    expect(sunWgsl).not.toContain('u_shadowPrecision');
  });

  test('the light materials follow the format of the rows they read', () => {
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });
    const backend = lighting.backend as FrameLightingBackend;
    const precision = (): number[] =>
      [...(backend as unknown as LightBatches)._lightBatches.values()].map(batch => batch.material.uniforms.u_shadowPrecision.value);

    lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);
    lighting.update();

    // The walked rows are `R32F`; the marched ones are `Rgba16F`, which rounds
    // a distance by up to half a unit in the last of ten mantissa bits.
    expect(precision()).toEqual([0]);

    backend.shadowFiller = 'gpu';

    expect(precision()).toEqual([2 ** -11]);

    backend.shadowFiller = 'cpu';

    expect(precision()).toEqual([0]);

    lighting.destroy();
  });
});
