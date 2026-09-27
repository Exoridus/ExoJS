import { RenderingContext } from '#rendering/RenderingContext';
import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';
import { verifyGpuPcm } from './_gpuPcm';

describe('WebGL2 GPU stereo PCM', () => {
  it.for([TextureFormat.Rgba8, TextureFormat.Rgba32F, TextureFormat.Rgba16F] as const)(
    '%s preserves samples through readback and AudioWorklet',
    async (format, ctx) => {
      const backend = await createWebGl2TestBackend(32);
      const context = new RenderingContext(backend);
      try {
        if (!context.supportsReadbackFormat(format)) {
          ctx.skip(`${format} readback is unsupported`);
          return;
        }
        await verifyGpuPcm(context, format);
      } finally {
        backend.destroy();
      }
    },
  );
});
