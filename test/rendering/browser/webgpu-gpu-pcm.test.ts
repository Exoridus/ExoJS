import { RenderingContext } from '#rendering/RenderingContext';
import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, webGpuAvailable } from './_backendSetup';
import { verifyGpuPcm } from './_gpuPcm';

describe('WebGPU GPU stereo PCM', () => {
  it.for([TextureFormat.Rgba8, TextureFormat.Rgba32F, TextureFormat.Rgba16F] as const)(
    '%s preserves samples through readback and AudioWorklet',
    async (format, ctx) => {
      if (!(await webGpuAvailable())) {
        ctx.skip('No WebGPU adapter available.');
        return;
      }
      const backend = await createWebGpuTestBackend(32);
      try {
        await verifyGpuPcm(new RenderingContext(backend), format);
      } finally {
        backend.destroy();
      }
    },
  );
});
