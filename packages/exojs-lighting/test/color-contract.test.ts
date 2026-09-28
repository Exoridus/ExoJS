import { Color, Texture } from '@codexo/exojs';
import { COLOR_PIPELINE_ENABLED } from '@codexo/exojs/renderer-sdk';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { PointLight } from '../src/lights/PointLight';
import { NormalMap } from '../src/normals/NormalMap';

const channels = 4;

describe('lighting colour contract', () => {
  test('the colour pipeline stays inactive until every renderer is integrated', () => {
    expect(COLOR_PIPELINE_ENABLED).toBe(false);
  });

  test('NormalMap rejects a texture that requests sRGB colour interpretation', () => {
    const srgbTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement, { colorSpace: 'srgb' });

    expect(() => new NormalMap(srgbTexture)).toThrow(/colorSpace "srgb"/);
  });

  test('NormalMap accepts a texture with no explicit colour interpretation', () => {
    const defaultTexture = new Texture({ width: 2, height: 2 } as unknown as HTMLCanvasElement);

    expect(() => new NormalMap(defaultTexture)).not.toThrow();
  });
});

describe('lighting colour contract - gated linear packing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('a gray ambient packs its authoring byte normalized, not decoded, while the pipeline is closed', async () => {
    const { ForwardLighting } = await import('../src/ForwardLighting');
    const { ForwardBackend } = await import('../src/backends/ForwardBackend');

    const lighting = new ForwardLighting({ maxLights: 1, ambient: new Color(128, 128, 128) });

    lighting.update();

    const texture = (lighting.backend as InstanceType<typeof ForwardBackend>).lightTexture;
    const headerRow = texture.width * channels;

    // 128/255, not the linear-decoded value (~0.216): the legacy path is
    // exactly what shipped before this contract, unchanged while
    // COLOR_PIPELINE_ENABLED is false.
    expect(texture.buffer[headerRow]).toBeCloseTo(128 / 255, 6);
  });

  test('a gray ambient decodes to linear light once the pipeline is active', async () => {
    vi.doMock('@codexo/exojs/renderer-sdk', async () => {
      const actual = await vi.importActual<typeof import('@codexo/exojs/renderer-sdk')>('@codexo/exojs/renderer-sdk');

      return { ...actual, COLOR_PIPELINE_ENABLED: true };
    });

    const { ForwardLighting } = await import('../src/ForwardLighting');
    const { ForwardBackend } = await import('../src/backends/ForwardBackend');

    const lighting = new ForwardLighting({ maxLights: 1, ambient: new Color(128, 128, 128) });

    lighting.update();

    const texture = (lighting.backend as InstanceType<typeof ForwardBackend>).lightTexture;
    const headerRow = texture.width * channels;

    // SRGB_BYTE_TO_LINEAR[128] - decoded, and measurably different from 128/255.
    expect(texture.buffer[headerRow]).toBeCloseTo(0.21586050011389926, 6);
  });

  test('a colored light publishes its decoded RGB, not its authoring bytes, once the pipeline is active', async () => {
    vi.doMock('@codexo/exojs/renderer-sdk', async () => {
      const actual = await vi.importActual<typeof import('@codexo/exojs/renderer-sdk')>('@codexo/exojs/renderer-sdk');

      return { ...actual, COLOR_PIPELINE_ENABLED: true };
    });

    const { ForwardLighting } = await import('../src/ForwardLighting');
    const { ForwardBackend } = await import('../src/backends/ForwardBackend');

    const lighting = new ForwardLighting({ maxLights: 2 });

    lighting.add(new PointLight({ color: new Color(51, 102, 153) }));
    lighting.update();

    const texture = (lighting.backend as InstanceType<typeof ForwardBackend>).lightTexture;
    const offset = (texture.width * 1 + 1) * channels;

    expect(texture.buffer[offset]).toBeCloseTo(0.033104766570885055, 6);
  });
});
