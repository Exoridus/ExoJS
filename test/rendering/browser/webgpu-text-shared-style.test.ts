import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

import { createWebGpuTestBackend, readWebGpuFrame } from './_backendSetup';
import { exerciseSharedTextStyle, sharedTextCanvasSize } from './_sharedTextStyle';
import { getBackendDevice } from './webgpu-test-helpers';

beforeEach(() => resetDefaultGlyphAtlasPool());
afterEach(() => resetDefaultGlyphAtlasPool());

test('WebGPU renders every shared TextStyle reader after layout and paint mutations', async () => {
  const backend = await createWebGpuTestBackend(sharedTextCanvasSize);
  const device = getBackendDevice(backend);

  try {
    await exerciseSharedTextStyle(async root => {
      device.pushErrorScope('validation');
      backend.resetStats();
      backend.clear();
      root.render(backend);
      backend.flush();
      expect((await device.popErrorScope())?.message ?? null).toBeNull();
      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      return readWebGpuFrame(backend, sharedTextCanvasSize);
    });
  } finally {
    backend.destroy();
  }
});
