import { afterEach, describe, expect, test } from 'vitest';

import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { type ColorTextureFormat, TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from '../webgpuMockEnvironment';

describe('WebGpuShaderFilterPass connection', () => {
  const disposers: Array<() => void> = [];

  afterEach(() => {
    while (disposers.length > 0) disposers.pop()!();
  });

  const open = async (): Promise<{ environment: MockWebGpuEnvironment; backend: WebGpuBackend }> => {
    const environment = createMockWebGpuEnvironment();
    const backend = await createMockBackend(environment);

    disposers.push(() => {
      backend.destroy();
      environment.restore();
    });

    return { environment, backend };
  };

  const targets = (format: ColorTextureFormat): { input: RenderTexture; output: RenderTexture } => {
    const input = new RenderTexture(8, 8, { format });
    const output = new RenderTexture(8, 8, { format });

    disposers.push(() => {
      input.destroy();
      output.destroy();
    });

    return { input, output };
  };

  test('one filter instance gets one pipeline per target format, reused on return', async () => {
    const { environment, backend } = await open();
    const filter = new ColorMatrixFilter();

    disposers.push(() => filter.destroy());

    const run = (format: ColorTextureFormat): void => {
      const { input, output } = targets(format);

      filter.apply(backend, input, output);
    };

    run(TextureFormat.Rgba8Srgb);
    const first = environment.syncPipelineCount();

    run(TextureFormat.Rgba8Srgb);
    expect(environment.syncPipelineCount()).toBe(first);

    run(TextureFormat.Rgba16F);
    expect(environment.syncPipelineCount()).toBe(first + 1);

    run(TextureFormat.Rgba8);
    expect(environment.syncPipelineCount()).toBe(first + 2);

    run(TextureFormat.Rgba8Srgb);
    run(TextureFormat.Rgba16F);
    expect(environment.syncPipelineCount()).toBe(first + 2);
  });

  test('a filter moved to a backend on another device rebuilds its device-owned state', async () => {
    const one = await open();
    const two = await open();
    const filter = new ColorMatrixFilter();

    disposers.push(() => filter.destroy());

    const { input, output } = targets(TextureFormat.Rgba8Srgb);

    filter.apply(one.backend, input, output);

    const beforeSecondDevice = two.environment.syncPipelineCount();

    filter.apply(two.backend, input, output);

    expect(one.environment.syncPipelineCount()).toBe(1);
    expect(two.environment.syncPipelineCount()).toBe(beforeSecondDevice + 1);
  });
});
