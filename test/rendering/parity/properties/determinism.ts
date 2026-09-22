/**
 * Rendering the same scene twice must produce the same frame.
 *
 * Cheap, and it holds for every scene regardless of fixture kind - which makes
 * it the property that proves the runner itself works. A failure here means
 * frame-to-frame state leaks (a retained cache serving a stale batch, an
 * uncleared buffer), not a backend difference.
 */

import { Color } from '#core/Color';

import { readWebGl2Frame, readWebGpuFrame, renderWebGl2Once, renderWebGpuOnce } from '../../browser/_backendSetup';
import { maxChannelDelta } from '../frames';
import type { PerBackendProperty, PropertyResult } from '../types';

const verdict = (delta: number): PropertyResult => ({
  support: delta === 0 ? 'supported' : 'divergent',
  // Whole-frame comparison; the runner decides whether the scene lets it count
  // as `traced` rather than merely `frame-equal`.
  evidence: 'traced',
  delta,
  ...(delta === 0 ? {} : { note: `frame 2 differs from frame 1 by ${delta}` }),
});

export const determinism: PerBackendProperty = {
  name: 'repeat-render-determinism',
  scope: 'per-backend',
  appliesTo: () => true,

  run: async ({ scene, skip, webgl2, webgpu }, backend): Promise<PropertyResult> => {
    // A fresh graph per frame: reusing one would let retained state make the
    // second frame identical for the wrong reason.
    if (backend === 'webgl2') {
      if (webgl2 === null) {
        return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGL2 context in this browser' };
      }

      renderWebGl2Once(webgl2, scene.build(), Color.black);

      const first = readWebGl2Frame(webgl2, scene.size);

      renderWebGl2Once(webgl2, scene.build(), Color.black);

      return verdict(maxChannelDelta(first, readWebGl2Frame(webgl2, scene.size)));
    }

    if (webgpu === null) {
      return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGPU adapter in this browser' };
    }

    if (!(await renderWebGpuOnce({ skip }, webgpu, scene.build(), Color.black))) {
      return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
    }

    const first = readWebGpuFrame(webgpu, scene.size);

    if (!(await renderWebGpuOnce({ skip }, webgpu, scene.build(), Color.black))) {
      return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
    }

    return verdict(maxChannelDelta(first, readWebGpuFrame(webgpu, scene.size)));
  },
};
