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
} from '../../browser/_backendSetup';
import { maxChannelDelta } from '../frames';
import type { CrossBackendProperty, PropertyResult } from '../types';

export const crossBackendParity: CrossBackendProperty = {
  name: 'cross-backend-parity',
  scope: 'cross-backend',
  appliesTo: () => true,

  run: async ({ scene, skip }): Promise<PropertyResult> => {
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
        evidence: 'exact',
        delta,
        ...(delta === 0 ? {} : { note: `backends differ by ${delta} on at least one channel` }),
      };
    } finally {
      gl.destroy();
      gpu.destroy();
    }
  },
};
