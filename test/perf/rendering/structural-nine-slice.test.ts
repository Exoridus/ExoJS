/**
 * Tier-A structural regression tests for the NineSliceSprite renderer.
 *
 * Key measured fact: the nine-slice renderer is single-texture — it has NO
 * multi-texture slot merge, so each texture change flushes. Same-atlas
 * nine-slices batch (up to ⌈quads / 4096⌉ draws); distinct textures cost one
 * draw per texture switch.
 */
import { describe, expect, it } from 'vitest';

import { buildNineSliceScene, makeTextures } from './fixtures';
import { createWebGl2Harness, measureSteadyFrame, type WebGl2Harness } from './harness';

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

describe('structural — NineSlice', () => {
  it('100 nine-slices / same atlas → one draw; stretch = 9 quads each', () => {
    withHarness(harness => {
      const { root, sprites } = buildNineSliceScene({ count: 100, textures: makeTextures(1), fill: 'stretch' });
      const quadsPer = sprites[0].quads.length;
      const m = measureSteadyFrame(harness, root, 2);

      expect(quadsPer).toBe(9);
      expect(m.drawCalls).toBe(1);
      expect(m.instances).toBe(100 * quadsPer);

      root.destroy();
    });
  });

  it('repeat / mirror-repeat fills generate more quads than stretch', () => {
    withHarness(harness => {
      const stretch = buildNineSliceScene({ count: 1, textures: makeTextures(1), fill: 'stretch' });
      const repeat = buildNineSliceScene({ count: 1, textures: makeTextures(1), fill: 'repeat' });

      expect(repeat.sprites[0].quads.length).toBeGreaterThan(stretch.sprites[0].quads.length);

      stretch.root.destroy();
      repeat.root.destroy();
    });
  });

  it('no multi-texture batching: 100 nine-slices across 8 textures → one draw PER texture switch', () => {
    withHarness(harness => {
      const { root } = buildNineSliceScene({ count: 100, textures: makeTextures(8), assign: 'cycle', fill: 'stretch' });
      const m = measureSteadyFrame(harness, root, 2);

      // Cyclic textures never coalesce → a flush per sprite. This is the gap a
      // multi-texture nine-slice renderer would close (cf. Sprite's 1 draw).
      expect(m.drawCalls).toBe(100);

      root.destroy();
    });
  });

  it('a single sprite whose quads exceed the batch buffer chunks across draws', () => {
    // batchSize 4 + a 9-quad stretch nine-slice forces the renderer's
    // per-sprite chunking loop: ⌈9 / 4⌉ = 3 draws, all 9 instances written.
    const harness = createWebGl2Harness({ spriteRendererBatchSize: 4 });

    try {
      const { root, sprites } = buildNineSliceScene({ count: 1, textures: makeTextures(1), fill: 'stretch' });

      expect(sprites[0].quads.length).toBe(9);

      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(3);
      expect(m.instances).toBe(9);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });

  it('a single texture change flushes once', () => {
    withHarness(harness => {
      const same = buildNineSliceScene({ count: 4, textures: makeTextures(1), fill: 'stretch' });
      const sameMetrics = measureSteadyFrame(harness, same.root, 2);

      expect(sameMetrics.drawCalls).toBe(1);
      same.root.destroy();
    });

    withHarness(harness => {
      const twoTextures = buildNineSliceScene({ count: 4, textures: makeTextures(2), assign: 'blocks', fill: 'stretch' });
      const m = measureSteadyFrame(harness, twoTextures.root, 2);

      // Two texture blocks → exactly one texture-change flush.
      expect(m.drawCalls).toBe(2);
      twoTextures.root.destroy();
    });
  });
});
