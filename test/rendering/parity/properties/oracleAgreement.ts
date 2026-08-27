/**
 * The rendered pixel must match an expectation computed without a renderer.
 *
 * This is the one property that can say a frame is *right* rather than merely
 * consistent. Cross-backend parity and determinism both compare a rendering
 * against another rendering, so two backends that compute a colour the same
 * wrong way agree perfectly, and a backend that computes it wrongly every time
 * is perfectly deterministic.
 *
 * It applies only to scenes that declare a {@link SceneOracle}, which is the
 * point: where a pixel traces back to its source texel, the gap is already
 * closed - a `traced` verdict is itself a renderer-independent expectation.
 * What it cannot cover is computed colour, where the output is a function of
 * several inputs and no texel to trace. That is what this property is for.
 */

import { Color } from '#core/Color';

import { readWebGl2Frame, readWebGpuFrame, renderWebGl2Once, renderWebGpuOnce, webGl2Available, webGpuAvailable } from '../../browser/_backendSetup';
import { openWebGl2, openWebGpu } from '../backends';
import type { OracleSample, PerBackendProperty, PropertyResult, SceneOracle } from '../types';

const channels = ['R', 'G', 'B', 'A'] as const;

const readPixel = (frame: ArrayLike<number>, size: number, sample: OracleSample): readonly [number, number, number, number] => {
  const i = (sample.y * size + sample.x) * 4;

  return [frame[i] ?? 0, frame[i + 1] ?? 0, frame[i + 2] ?? 0, frame[i + 3] ?? 0];
};

const compare = (frame: ArrayLike<number>, size: number, oracle: SceneOracle): PropertyResult => {
  const samples = oracle.samples();
  let worst = 0;
  let worstNote: string | null = null;

  for (const sample of samples) {
    const actual = readPixel(frame, size, sample);

    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(actual[c]! - sample.expect[c]!);

      if (delta > worst) {
        worst = delta;
        worstNote = `${sample.describe} at (${sample.x}, ${sample.y}): ${channels[c]} is ${actual[c]}, expected ${sample.expect[c]}`;
      }
    }
  }

  if (worst <= oracle.tolerance) {
    return {
      support: 'supported',
      evidence: 'oracle',
      delta: worst,
      note: `${samples.length} computed pixel(s) within ${oracle.tolerance} of ${oracle.reason}`,
    };
  }

  return {
    support: 'divergent',
    evidence: 'oracle',
    delta: worst,
    note: `${worstNote} (tolerance ${oracle.tolerance}; ${oracle.reason})`,
  };
};

export const oracleAgreement: PerBackendProperty = {
  name: 'oracle-agreement',
  scope: 'per-backend',
  appliesTo: scene => scene.oracle !== undefined,

  run: async ({ scene, skip }, backend): Promise<PropertyResult> => {
    // `appliesTo` already gated this, but the type has to be narrowed here too.
    const oracle = scene.oracle;

    if (oracle === undefined) {
      return { support: 'unknown', evidence: 'none', delta: null, note: 'scene declares no oracle' };
    }

    if (backend === 'webgl2') {
      if (!webGl2Available()) {
        return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGL2 context in this browser' };
      }

      const gl = await openWebGl2(scene);

      try {
        renderWebGl2Once(gl, scene.build(), Color.black);

        return compare(readWebGl2Frame(gl, scene.size), scene.size, oracle);
      } finally {
        gl.destroy();
      }
    }

    if (!(await webGpuAvailable())) {
      return { support: 'unavailable', evidence: 'none', delta: null, note: 'no WebGPU adapter in this browser' };
    }

    const gpu = await openWebGpu(scene);

    try {
      if (!(await renderWebGpuOnce({ skip }, gpu, scene.build(), Color.black))) {
        return { support: 'unknown', evidence: 'none', delta: null, note: 'WebGPU device lost mid-run' };
      }

      return compare(readWebGpuFrame(gpu, scene.size), scene.size, oracle);
    } finally {
      gpu.destroy();
    }
  },
};
