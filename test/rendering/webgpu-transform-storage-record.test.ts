import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

describe('WebGpuBackend.getTransformStorageBuffer', () => {
  test('hands out one reused record that the next call rewrites', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const held = backend.getTransformStorageBuffer(1);
      const heldBuffer = held.buffer;
      const next = backend.getTransformStorageBuffer(1024);

      expect(next).toBe(held);
      expect(held.buffer).not.toBe(heldBuffer);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
