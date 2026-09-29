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
});
