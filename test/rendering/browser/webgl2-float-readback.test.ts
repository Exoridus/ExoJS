import { expect, test } from 'vitest';

import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';
import { checkFloatReadback } from './_floatReadback';

test.for([TextureFormat.Rgba16F, TextureFormat.Rgba32F] as const)('WebGL2 typed %s readback preserves values, regions and storage', async (format, ctx) => {
  const backend = await createWebGl2TestBackend(20);
  try {
    if (!backend.supportsReadbackFormat(format)) {
      expect(backend.supportsColorFormat(format)).toBe(false);
      ctx.skip('EXT_color_buffer_float unavailable.');
      return;
    }
    await checkFloatReadback(backend, format);
  } finally {
    backend.destroy();
  }
});
