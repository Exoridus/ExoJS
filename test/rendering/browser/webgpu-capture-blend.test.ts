import { createWebGpuTestBackend } from './_backendSetup';
import { verifyCaptureBlendPixels } from './_captureBlendScene';

describe('webgpu capture blending', () => {
  test.each([
    [false, 'sprite'],
    [true, 'sprite'],
    [false, 'mesh'],
    [false, 'custom'],
    [false, 'text'],
    [false, 'particles'],
    [false, 'nested'],
    [false, 'cached'],
    [false, 'opaque'],
  ])('preserves the blend oracle after advanced draw %s, renderer %s', async (prime, kind) => {
    const backend = await createWebGpuTestBackend(64);

    try {
      await verifyCaptureBlendPixels(backend, prime, kind);
    } finally {
      backend.destroy();
    }
  });
});
