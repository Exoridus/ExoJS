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
import { createWebGl2Harness, measureFrame, measureSteadyFrame, type WebGl2Harness } from './harness';

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

  it('100 cyclic-texture flushes: transform upload coalesced to 1, not O(flushes)', () => {
    // Mirrors the NineSlice coalescing test. See that test for the reasoning
    // behind the warmup-then-mutate pattern (texImage2D alloc not counted).
    for (const path of ['shader', 'geometry'] as const) {
      withHarness(harness => {
        const { root, sprites } = buildRepeatingScene({ count: 100, textures: makeTextures(8), assign: 'cycle', path });

        // Warmup: allocates the DataTexture (texImage2D, not counted).
        measureFrame(harness, root);

        // Dirty transforms so the next frame must re-upload.
        sprites.forEach((s, i) => s.setPosition(i * 2, 0));

        // Post-mutation frame: exactly one texSubImage2D covers all 100 rows.
        const changed = measureFrame(harness, root);

        expect(changed.transformUploads).toBe(1);
        expect(changed.transformRows).toBe(100);
        // 100 transforms × 48 bytes each.
        expect(changed.transformUploadBytes).toBe(100 * 48);

        // Second post-mutation frame: hash stable → zero re-uploads.
        const steady = measureFrame(harness, root);

        expect(steady.transformUploads).toBe(0);
        expect(steady.transformUploadBytes).toBe(0);

        root.destroy();
      });
    }
  });
});
