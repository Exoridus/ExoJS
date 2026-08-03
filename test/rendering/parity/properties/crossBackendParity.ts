/**
 * The same scene, rendered by both backends, must produce the same frame.
 *
 * This is the parity claim the whole matrix exists to make explicit. Note what
 * it does *not* catch: if both backends are wrong in the same way, they still
 * agree. Correctness against an independent expectation is the oracle
 * property's job.
 */

import { Color } from '#core/Color';

import {
  createWebGl2TestBackend,
  createWebGpuTestBackend,
  readWebGl2Frame,
  readWebGpuFrame,
  renderWebGl2Once,
  renderWebGpuOnce,
  webGl2Available,
  webGpuAvailable,
} from '../../browser/_backendSetup';
import { maxChannelDelta } from '../frames';
import type { CrossBackendProperty, PropertyResult } from '../types';

export const crossBackendParity: CrossBackendProperty = {
  name: 'cross-backend-parity',
  scope: 'cross-backend',
  appliesTo: () => true,

  run: async ({ scene, skip }): Promise<PropertyResult> => {
    // A browser missing a backend cannot be compared across backends — that is
    // an answer about the browser, not a failure of the engine.
    if (!webGl2Available()) {
      return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGL2 context in this browser' };
    }

    if (!(await webGpuAvailable())) {
      return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGPU adapter in this browser' };
    }

    const gl = await createWebGl2TestBackend(scene.size);
    const gpu = await createWebGpuTestBackend(scene.size);

    try {
      renderWebGl2Once(gl, scene.build(), Color.black);

      // A dropped device is missing evidence, never satisfied evidence.
      const rendered = await renderWebGpuOnce({ skip }, gpu, scene.build(), Color.black);

      if (!rendered) {
        return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
      }

      const glFrame = readWebGl2Frame(gl, scene.size);
      const gpuFrame = readWebGpuFrame(gpu, scene.size);
      const delta = maxChannelDelta(glFrame, gpuFrame);

      return {
        support: delta === 0 ? 'supported' : 'divergent',
        // Whole-frame comparison; the runner decides whether the scene lets it
        // count as `traced` rather than merely `frame-equal`.
        evidence: 'traced',
        delta,
        ...(delta === 0 ? {} : { note: `backends differ by ${delta} on at least one channel` }),
      };
    } finally {
      gl.destroy();
      gpu.destroy();
    }
  },
};
