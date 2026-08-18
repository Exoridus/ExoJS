/**
 * The same scene, rendered by both backends, must produce the same frame.
 *
 * This is the parity claim the whole matrix exists to make explicit. Note what
 * it does *not* catch: if both backends are wrong in the same way, they still
 * agree. Correctness against an independent expectation is the oracle
 * property's job.
 */

import { Color } from '#core/Color';

import { readWebGl2Frame, readWebGpuFrame, renderWebGl2Once, renderWebGpuOnce, webGl2Available, webGpuAvailable } from '../../browser/_backendSetup';
import { openWebGl2, openWebGpu } from '../backends';
import { maxChannelDelta, pixelsExceeding } from '../frames';
import type { CrossBackendProperty, PropertyResult } from '../types';

/**
 * Largest deviation still counted as agreement, in 8-bit channel steps.
 *
 * One step is the smallest representable difference — the last bit of a byte.
 * Software adapters round some interpolated coordinates differently from
 * hardware ones, which shows up on the nine-slice scenes as exactly this: 0 on
 * a real GPU, 1 under SwiftShader in CI. Anything larger is a real disagreement
 * and stays a failure, so this cannot hide a genuine bug behind a threshold.
 */
const LAST_BIT = 1;

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

    const gl = await openWebGl2(scene);
    const gpu = await openWebGpu(scene);

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

      if (delta === 0) {
        return {
          support: 'supported',
          // Whole-frame comparison; the runner decides whether the scene lets it
          // count as `traced` rather than merely `frame-equal`.
          evidence: 'traced',
          delta,
        };
      }

      if (delta <= LAST_BIT) {
        // Equal to the last bit rather than bit-identical. Recorded as its own
        // class instead of quietly passing: a reader can tell an adapter's
        // rounding from a genuine match, and `tolerant` rows are exactly what
        // to look at when a real difference is suspected.
        return {
          support: 'supported',
          evidence: 'tolerant',
          delta,
          note: `backends agree within ${delta} of one channel step`,
        };
      }

      const tolerance = scene.crossBackendTolerance;

      if (tolerance !== undefined) {
        const differing = pixelsExceeding(glFrame, gpuFrame, LAST_BIT);
        const fraction = differing / (scene.size * scene.size);
        const within = delta <= tolerance.delta && fraction <= tolerance.maxPixelFraction;
        const measured = `${delta} on ${differing} px (${(fraction * 100).toFixed(1)}% of the frame)`;

        return within
          ? {
              support: 'supported',
              evidence: 'tolerant',
              delta,
              note: `backends differ by ${measured}, within this scene's declared tolerance`,
            }
          : {
              support: 'divergent',
              evidence: 'traced',
              delta,
              note: `backends differ by ${measured}, beyond this scene's tolerance of ${tolerance.delta} on ${(tolerance.maxPixelFraction * 100).toFixed(0)}% of the frame`,
            };
      }

      return {
        support: 'divergent',
        evidence: 'traced',
        delta,
        note: `backends differ by ${delta} on at least one channel`,
      };
    } finally {
      gl.destroy();
      gpu.destroy();
    }
  },
};
