/**
 * The scene must actually draw something.
 *
 * This closes the hole the other two properties share. A scene whose sprite
 * lands off-canvas, whose texture never uploads, or whose renderer was never
 * registered produces an empty frame — and an empty frame is byte-identical to
 * another empty frame and perfectly deterministic. Both comparison properties
 * would pass and report `traced`, and the matrix would fill a row with a claim
 * about nothing.
 *
 * Cheap insurance: one frame per backend, one pass over its pixels.
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
import { drawnPixelCount } from '../frames';
import type { PerBackendProperty, PropertyResult } from '../types';

const verdict = (drawn: number, total: number): PropertyResult => ({
  support: drawn > 0 ? 'supported' : 'divergent',
  // A pixel count is an observation about coverage, not a pixel traced back to
  // its texel — `sampled` is the honest class however many pixels were read.
  evidence: 'sampled',
  delta: null,
  note: drawn > 0 ? `${drawn}/${total} pixels drawn` : 'scene rendered an empty frame',
});

export const rendersSomething: PerBackendProperty = {
  name: 'renders-something',
  scope: 'per-backend',
  appliesTo: () => true,

  run: async ({ scene, skip }, backend): Promise<PropertyResult> => {
    const total = scene.size * scene.size;

    if (backend === 'webgl2') {
      if (!webGl2Available()) {
        return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGL2 context in this browser' };
      }

      const gl = await createWebGl2TestBackend(scene.size);

      try {
        renderWebGl2Once(gl, scene.build(), Color.black);

        return verdict(drawnPixelCount(readWebGl2Frame(gl, scene.size)), total);
      } finally {
        gl.destroy();
      }
    }

    if (!(await webGpuAvailable())) {
      return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGPU adapter in this browser' };
    }

    const gpu = await createWebGpuTestBackend(scene.size);

    try {
      if (!(await renderWebGpuOnce({ skip }, gpu, scene.build(), Color.black))) {
        return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
      }

      return verdict(drawnPixelCount(readWebGpuFrame(gpu, scene.size)), total);
    } finally {
      gpu.destroy();
    }
  },
};
