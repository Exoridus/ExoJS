import { describe, test } from 'vitest';

import { Color } from '#core/Color';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuEncoded } from './_backendSetup';
import { CRT_SIZE, crtFilterProbes } from './_crtFilterProbes';

describe('CRTFilter (WebGPU)', () => {
  for (const probe of crtFilterProbes) {
    test(probe.name, async ctx => {
      const backend = await createWebGpuTestBackend(CRT_SIZE);

      try {
        await probe.run(async root => {
          if (!(await renderWebGpuEncoded(ctx, backend, root, Color.transparent))) {
            return null;
          }

          return readWebGpuFrame(backend, CRT_SIZE);
        });
      } finally {
        backend.destroy();
      }
    });
  }
});
