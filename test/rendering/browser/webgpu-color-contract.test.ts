import { expect, test } from 'vitest';

import { Color } from '#core/Color';
import { OutputTransform } from '#rendering/OutputTransform';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, readWebGpuPixels } from './_backendSetup';

test('WebGpuOutputPass round-trips an sRGB gray through the linear working target back to the same byte', async () => {
  const backend = await createWebGpuTestBackend(2);
  const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const outputTransform = new OutputTransform();

  try {
    // `clear` on an sRGB target hardware-encodes the linear-decoded color it
    // is given, so an opaque clear of nominal gray 128 is stored as gray 128.
    backend.setRenderTarget(source).clear(new Color(128, 128, 128, 1));
    backend.flush();

    outputTransform.present(backend, source, false, Color.black);
    backend.flush();

    const [r, g, b, a] = readWebGpuPixels(backend, 2)(0, 0);

    // Sampling decodes the stored byte to linear, and the output pass
    // re-encodes it - gray 128 round-trips back to gray 128.
    expect(r).toBeCloseTo(128, 0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
    expect(a).toBe(255);
  } finally {
    source.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});

test('WebGpuOutputPass overwrites the canvas exactly on a repeated present - no blend-driven accumulation', async () => {
  const backend = await createWebGpuTestBackend(2);
  const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const outputTransform = new OutputTransform();

  try {
    backend.setRenderTarget(source).clear(new Color(128, 128, 128, 1));
    backend.flush();

    outputTransform.present(backend, source, false, Color.black);
    backend.flush();
    const first = readWebGpuPixels(backend, 2)(0, 0);

    outputTransform.present(backend, source, false, Color.black);
    backend.flush();
    const second = readWebGpuPixels(backend, 2)(0, 0);

    expect(second).toEqual(first);
  } finally {
    source.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});
