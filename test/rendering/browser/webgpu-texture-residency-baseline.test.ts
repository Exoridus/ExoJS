import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { RESIDENCY_SURFACE_SIZE, verifyTextureResidencyBaseline } from './_textureResidencyBaseline';

test('WebGPU shares one decode across samplers and records GPU texture residency', async ctx => {
  const backend = await createWebGpuTestBackend(RESIDENCY_SURFACE_SIZE);
  const { vendor, architecture, device, description } = backend.device.adapterInfo;

  try {
    await verifyTextureResidencyBaseline({
      adapter: [vendor, architecture, device, description].filter(Boolean).join(' / '),
      sharesTexture: true,
      bytes: () => backend.stats.gpuMemoryBytes,
      uploadedBytes: () => backend.stats.textureUploadBytes,
      bind: texture => void backend.getTextureBinding(texture),
      draw: async root => {
        if (!(await renderWebGpuOnce(ctx, backend, root))) {
          return null;
        }

        return readWebGpuPixels(backend, RESIDENCY_SURFACE_SIZE);
      },
    });
  } finally {
    backend.destroy();
  }
});
