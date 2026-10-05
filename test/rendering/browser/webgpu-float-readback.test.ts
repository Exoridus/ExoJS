import { test } from 'vitest';

import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, webGpuAvailable } from './_backendSetup';
import { checkFloatReadback } from './_floatReadback';

test.for([TextureFormat.Rgba16F, TextureFormat.Rgba32F] as const)('WebGPU typed %s readback preserves values, regions and storage', async (format, ctx) => {
  if (!(await webGpuAvailable())) {
    ctx.skip('No WebGPU adapter available.');
    return;
  }
  const backend = await createWebGpuTestBackend(20);
  try {
    await checkFloatReadback(backend, format);
  } finally {
    backend.destroy();
  }
});
