import { expect } from 'vitest';

import { createWebGl2TestBackend, createWebGpuTestBackend, readWebGl2Pixel, readWebGpuPixels } from './_backendSetup';
import type { OpenColorProbeHarness } from './color-probe-fixtures';

export const openWebGl2ColorHarness: OpenColorProbeHarness = async size => {
  const backend = await createWebGl2TestBackend(size);

  return {
    backend,
    size,
    canvasPixel: (x, y) => readWebGl2Pixel(backend, x, y),
    checked: async action => {
      const gl = backend.context;

      while (gl.getError() !== gl.NO_ERROR) {
        // Drain errors left by earlier work so the check below sees only this action's.
      }

      const result = await action();

      expect(gl.getError(), 'WebGL error raised during the probe').toBe(gl.NO_ERROR);

      return result;
    },
    destroy: () => backend.destroy(),
  };
};

export const openWebGpuColorHarness: OpenColorProbeHarness = async size => {
  const backend = await createWebGpuTestBackend(size);

  return {
    backend,
    size,
    canvasPixel: (x, y) => readWebGpuPixels(backend, size)(x, y),
    checked: async action => {
      const { device } = backend;

      device.pushErrorScope('validation');

      const result = await action();

      // Asserted on the message: a bare GPUValidationError prints as `{}`.
      expect((await device.popErrorScope())?.message ?? null).toBeNull();

      return result;
    },
    destroy: () => backend.destroy(),
  };
};
