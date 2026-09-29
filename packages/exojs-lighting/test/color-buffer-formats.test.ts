import { Color, ColorMatrixFilter, Matrix, Rectangle, RenderPipeline, RenderTexture, Signal, TextureFormat } from '@codexo/exojs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { LightingHost } from '../src/LightingHost';
import { LightmapLighting } from '../src/LightmapLighting';
import { RadianceLighting } from '../src/RadianceLighting';

/**
 * The light-accumulation target's own format contract (R34): it holds linear
 * light, half-float where a device can render into one, and every numeric
 * transport around it (mask, normal prepass, shadow/transport tables) stays
 * raw regardless of the colour pipeline gate. `lightTexture`'s own
 * hdr/fallback behaviour is covered by `Lighting.test.ts`; this file covers
 * what is new here - the ambient clear's decode, the shaded/post target
 * matching the accumulation format, and every numeric transport staying
 * untouched.
 */
const fakeApp = (floatTargets = true): LightingHost =>
  ({
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (format: TextureFormat): boolean => format === TextureFormat.Rgba8 || floatTargets,
      view: {
        center: { x: 32, y: 32 },
        width: 64,
        height: 64,
        rotation: 0,
        getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64),
        getTransform: (): Matrix => new Matrix(),
        getInverseTransform: (): Matrix => new Matrix(),
      },
    },
    width: 64,
    height: 64,
  }) as unknown as LightingHost;

describe('light-accumulation ambient clear - gated decode', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('with the colour pipeline closed, the clear stays the ambient authoring bytes', async () => {
    const { LightmapLighting } = await import('../src/LightmapLighting');
    const { FrameLightingBackend } = await import('../src/backends/FrameLightingBackend');
    const ambient = new Color(64, 96, 128);
    const lighting = new LightmapLighting(fakeApp(), { ambient });

    expect((lighting.backend as InstanceType<typeof FrameLightingBackend>).ambientClear.equals(ambient)).toBe(true);
    lighting.destroy();
  });

  test('with the colour pipeline active, the clear decodes to linear - the same conversion the forward renderer applies to the same ambient', async () => {
    vi.doMock('@codexo/exojs/renderer-sdk', async () => {
      const actual = await vi.importActual<typeof import('@codexo/exojs/renderer-sdk')>('@codexo/exojs/renderer-sdk');

      return { ...actual, COLOR_PIPELINE_ENABLED: true };
    });

    const { LightmapLighting } = await import('../src/LightmapLighting');
    const { FrameLightingBackend } = await import('../src/backends/FrameLightingBackend');
    const ambient = new Color(64, 96, 128);
    const lighting = new LightmapLighting(fakeApp(), { ambient });
    const clear = (lighting.backend as InstanceType<typeof FrameLightingBackend>).ambientClear;
    const linear = new Float32Array(4);

    ambient.writeLinear(linear);

    // The Color-typed clear API only carries a byte (truncated, not rounded),
    // so the decode is recovered within one quantization step rather than
    // bit-exact.
    expect(Math.abs(clear.r - linear[0]! * 255)).toBeLessThan(1);
    expect(Math.abs(clear.g - linear[1]! * 255)).toBeLessThan(1);
    expect(Math.abs(clear.b - linear[2]! * 255)).toBeLessThan(1);
    // And measurably different from the closed-gate (undecoded) byte, so this
    // is proof of a decode, not an accidental no-op.
    expect(clear.r).not.toBe(ambient.r);
    lighting.destroy();
  });

  test('a black ambient is unaffected by the gate - it decodes to itself', async () => {
    vi.doMock('@codexo/exojs/renderer-sdk', async () => {
      const actual = await vi.importActual<typeof import('@codexo/exojs/renderer-sdk')>('@codexo/exojs/renderer-sdk');

      return { ...actual, COLOR_PIPELINE_ENABLED: true };
    });

    const { LightmapLighting } = await import('../src/LightmapLighting');
    const { FrameLightingBackend } = await import('../src/backends/FrameLightingBackend');
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });

    expect((lighting.backend as InstanceType<typeof FrameLightingBackend>).ambientClear.equals(Color.black)).toBe(true);
    lighting.destroy();
  });
});

describe('numeric transport and mask/normal targets stay untouched by the colour pipeline', () => {
  test('mask and normal-prepass targets are plain rgba8, whether or not float targets are available', () => {
    for (const floatTargets of [true, false]) {
      const lighting = new LightmapLighting(fakeApp(floatTargets));
      const backend = lighting.backend as { maskTexture: RenderTexture; normalTexture: RenderTexture };

      expect(backend.maskTexture.format).toBe(TextureFormat.Rgba8);
      expect(backend.normalTexture.format).toBe(TextureFormat.Rgba8);
      lighting.destroy();
    }
  });

  test('the radiance transport tables stay rgba32f numeric storage, never a colour format', () => {
    const lighting = new RadianceLighting(fakeApp(), { ambient: Color.black });
    const backend = lighting.backend as {
      transport: {
        segments: { format: TextureFormat };
        emitters: { format: TextureFormat };
        cells: { format: TextureFormat };
        indices: { format: TextureFormat };
      };
      maskBlocks: { texture: { format: TextureFormat } };
    };

    expect(backend.transport.segments.format).toBe(TextureFormat.Rgba32F);
    expect(backend.transport.emitters.format).toBe(TextureFormat.Rgba32F);
    expect(backend.transport.cells.format).toBe(TextureFormat.Rgba32F);
    expect(backend.transport.indices.format).toBe(TextureFormat.Rgba32F);
    expect(backend.maskBlocks.texture.format).toBe(TextureFormat.Rgba8);
    lighting.destroy();
  });
});

describe('the shaded (post-filter) target matches the accumulation format', () => {
  test('a filter chain over an hdr-capable device reports hdr, so its shaded target - set from _target.format at construction - is rgba16f, not rgba8', () => {
    const grade = new ColorMatrixFilter();

    // `_shaded` has no public accessor - its format is set from `this._target.format`
    // at construction, so `hdr` being true is exactly the condition that makes
    // it `rgba16f`. Whether an HDR value actually survives the filter chain
    // into the final frame unclipped needs a real render/readback - see the
    // browser acceptance test.
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black, post: [grade] });

    expect(lighting.hdr).toBe(true);
    lighting.destroy();
    grade.destroy();
  });
});
