import { afterEach, describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { OutputTransform } from '#rendering/OutputTransform';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

describe('WebGpuOutputPass bind groups', () => {
  let environment: MockWebGpuEnvironment | null = null;
  let backend: WebGpuBackend | null = null;
  let transform: OutputTransform | null = null;

  afterEach(() => {
    transform?.destroy();
    backend?.destroy();
    environment?.restore();
    transform = null;
    backend = null;
    environment = null;
  });

  const present = (source: RenderTexture): void => {
    transform!.present(backend!, source, false, Color.black);
    backend!.flush();
  };

  test('a steady presentation of one source creates no bind groups after the first', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    transform = new OutputTransform();

    const source = new RenderTexture(8, 8, { format: TextureFormat.Rgba8Srgb });

    present(source);

    const afterFirst = environment.bindGroupCount();

    for (let frame = 0; frame < 5; frame++) {
      present(source);
    }

    expect(environment.bindGroupCount()).toBe(afterFirst);

    source.destroy();
  });

  test('a different source rebuilds only the source bind group', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);
    transform = new OutputTransform();

    const first = new RenderTexture(8, 8, { format: TextureFormat.Rgba8Srgb });
    const second = new RenderTexture(8, 8, { format: TextureFormat.Rgba8Srgb });

    present(first);

    const before = environment.bindGroupCount();

    present(second);

    expect(environment.bindGroupCount()).toBe(before + 1);

    present(second);

    expect(environment.bindGroupCount()).toBe(before + 1);

    first.destroy();
    second.destroy();
  });
  test('the same transform presenting on a backend with another device builds that device its own resources', async () => {
    const first = createMockWebGpuEnvironment();
    const firstBackend = await createMockBackend(first);
    const second = createMockWebGpuEnvironment();
    const secondBackend = await createMockBackend(second);
    const transform = new OutputTransform();
    const source = new RenderTexture(8, 8, { format: TextureFormat.Rgba8Srgb });

    try {
      transform.present(firstBackend, source, false, Color.black);
      firstBackend.flush();

      const before = second.bindGroupCount();

      transform.present(secondBackend, source, false, Color.black);
      secondBackend.flush();

      // A stale connection would present through the first device's cached bind groups
      // and create nothing on the second.
      expect(second.bindGroupCount()).toBeGreaterThan(before);
      expect(second.createBufferLabels().length).toBeGreaterThan(0);
    } finally {
      source.destroy();
      transform.destroy();
      secondBackend.destroy();
      firstBackend.destroy();
      second.restore();
      first.restore();
    }
  });
});
