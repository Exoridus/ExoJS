import { describe, test } from 'vitest';

import { Color } from '#core/Color';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Encoded } from './_backendSetup';
import { CRT_SIZE, crtFilterProbes } from './_crtFilterProbes';

describe('CRTFilter (WebGL2)', () => {
  for (const probe of crtFilterProbes) {
    test(probe.name, async () => {
      const backend = await createWebGl2TestBackend(CRT_SIZE);

      try {
        await probe.run(async root => {
          renderWebGl2Encoded(backend, root, Color.transparent);

          return readWebGl2Frame(backend, CRT_SIZE);
        });
      } finally {
        backend.destroy();
      }
    });
  }
});
