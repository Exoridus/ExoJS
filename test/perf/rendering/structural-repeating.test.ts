/**
 * Tier-A structural regression tests for the RepeatingSprite renderer.
 *
 * Two internal paths share one renderer: the shader path (bare Texture, one
 * instance per sprite, GPU sampler wrap) and the geometry path (TextureRegion,
 * Cartesian-product quads). Both are single-texture — like nine-slice, neither
 * multi-texture-batches, so distinct textures flush per switch.
 */
import { describe, expect, it } from 'vitest';

import { buildRepeatingScene, makeTextures } from './fixtures';
import { createWebGl2Harness, measureSteadyFrame, type WebGl2Harness } from './harness';

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

describe('structural — RepeatingSprite', () => {
  it('shader path: 100 / 1 texture → one draw, one instance per sprite', () => {
    withHarness(harness => {
      const { root } = buildRepeatingScene({ count: 100, textures: makeTextures(1), path: 'shader' });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(1);
      expect(m.instances).toBe(100);
      expect(m.samplerBinds).toBeGreaterThanOrEqual(1);

      root.destroy();
    });
  });

  it('geometry path: 100 / 1 texture → one draw, Cartesian-product instances', () => {
    withHarness(harness => {
      const { root } = buildRepeatingScene({ count: 100, textures: makeTextures(1), path: 'geometry', width: 128, height: 128 });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(1);
      // 128×128 over a 64×64 region → 2×2 = 4 tiles per sprite.
      expect(m.instances).toBe(400);

      root.destroy();
    });
  });

  it('no multi-texture batching on either path: 8 cyclic textures → one draw per switch', () => {
    for (const path of ['shader', 'geometry'] as const) {
      withHarness(harness => {
        const { root } = buildRepeatingScene({ count: 100, textures: makeTextures(8), assign: 'cycle', path });
        const m = measureSteadyFrame(harness, root, 2);

        expect(m.drawCalls).toBe(100);

        root.destroy();
      });
    }
  });
});
