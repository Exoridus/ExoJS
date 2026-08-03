/**
 * Rendering the same scene twice must produce the same frame.
 *
 * Cheap, and it holds for every scene regardless of fixture kind — which makes
 * it the property that proves the runner itself works. A failure here means
 * frame-to-frame state leaks (a retained cache serving a stale batch, an
 * uncleared buffer), not a backend difference.
 */

import { Color } from '#core/Color';

import {
  createWebGl2TestBackend,
  createWebGpuTestBackend,
  readWebGl2Frame,
  readWebGpuFrame,
  renderWebGl2Once,
  renderWebGpuOnce,
} from '../../browser/_backendSetup';
import { maxChannelDelta } from '../frames';
import type { PerBackendProperty, PropertyResult } from '../types';

const verdict = (delta: number): PropertyResult => ({
  support: delta === 0 ? 'supported' : 'divergent',
  evidence: 'exact',
  delta,
  ...(delta === 0 ? {} : { note: `frame 2 differs from frame 1 by ${delta}` }),
});

export const determinism: PerBackendProperty = {
  name: 'repeat-render-determinism',
  scope: 'per-backend',
  appliesTo: () => true,

  run: async ({ scene, skip }, backend): Promise<PropertyResult> => {
    // A fresh graph per frame: reusing one would let retained state make the
    // second frame identical for the wrong reason.
    if (backend === 'webgl2') {
      const gl = await createWebGl2TestBackend(scene.size);

      try {
        renderWebGl2Once(gl, scene.build(), Color.black);

        const first = readWebGl2Frame(gl, scene.size);

        renderWebGl2Once(gl, scene.build(), Color.black);

        return verdict(maxChannelDelta(first, readWebGl2Frame(gl, scene.size)));
      } finally {
        gl.destroy();
      }
    }

    const gpu = await createWebGpuTestBackend(scene.size);

    try {
      if (!(await renderWebGpuOnce({ skip }, gpu, scene.build(), Color.black))) {
        return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
      }

      const first = readWebGpuFrame(gpu, scene.size);

      if (!(await renderWebGpuOnce({ skip }, gpu, scene.build(), Color.black))) {
        return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
      }

      return verdict(maxChannelDelta(first, readWebGpuFrame(gpu, scene.size)));
    } finally {
      gpu.destroy();
    }
  },
};
