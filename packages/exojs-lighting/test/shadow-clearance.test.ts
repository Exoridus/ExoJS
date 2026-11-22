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
    {
      readonly material: {
        readonly uniforms: {
          readonly u_shadowPrecision: { readonly value: number };
          readonly u_shadowClearance: { readonly value: number };
        };
      };
    }
  >;
}

const fakeApp = (frameSize = 64): LightingHost => {
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
    frameTexture: new RenderTexture(frameSize, frameSize),
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
    ['light-quad.frag', pointGlsl],
    ['light-quad.wgsl', pointWgsl],
  ])('%s clears a share of a fragment of the depth it compares, set by the renderer', (_file, source) => {
    // A constant in the row's own units scales with the light's reach, not
    // with what a fragment resolves.
    expect(source).not.toMatch(/SHADOW_BIAS|SHADOW_CLEARANCE/);
    expect(source).toContain('uniforms.u_shadowClearance * fwidth(radial)');
  });

  test.each([
    ['sun-quad.frag', sunGlsl, 'fwidth(v_sun.y)'],
    ['sun-quad.wgsl', sunWgsl, 'fwidth(input.sun.y)'],
  ])('%s clears three quarters of a fragment of the depth it compares', (_file, source, footprint) => {
    // A constant in the row's own units scales with the light's reach or the
    // sun's depth span, not with what a fragment resolves.
    expect(source).not.toMatch(/SHADOW_BIAS/);
    expect(source).toMatch(/SHADOW_CLEARANCE(: f32)? = 0\.75;/);
    expect(source).toContain(`SHADOW_CLEARANCE * ${footprint}`);
  });

  test('the clearance spares the occluder its own lit fragment unless the composite filters a coarse light texel across the face', () => {
    const clearance = (lightResolution: number): number[] => {
      const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black, lightResolution });
      const backend = lighting.backend as FrameLightingBackend;

      lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);
      lighting.update();

      const values = [...(backend as unknown as LightBatches)._lightBatches.values()].map(
        batch => batch.material.uniforms.u_shadowClearance.value,
      );

      lighting.destroy();

      return values;
    };

    // One light texel per frame pixel: a quarter keeps the fragment in front of
    // a face lit and the first one behind it dark.
    expect(clearance(1)).toEqual([0.25]);
    // Two frame pixels per texel: the texel behind the face stays lit, or the
    // filtered composite darkens the floor in front of it.
    expect(clearance(0.5)).toEqual([0.75]);
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
