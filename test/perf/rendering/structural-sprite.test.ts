/**
 * Tier-A structural regression tests for the Sprite renderer. Deterministic,
 * GPU-free, CI-safe: they assert draw-call / batching / culling / upload
 * invariants captured by the recording fake context — never wall-clock time.
 *
 * Baseline facts (measured): the sprite renderer multi-texture-batches up to 16
 * textures into one draw, breaks the batch at a 17th distinct texture or a blend
 * change, and splits into ⌈instances / 4096⌉ draws on batch-buffer overflow.
 */
import { describe, expect, it } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { BlendModes } from '#rendering/types';

import { buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness, measureCrossCallFrame, measureSteadyFrame, type WebGl2Harness } from './harness';

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

describe('structural — Sprite', () => {
  it('1000 sprites / 1 texture → one draw, 1000 instances, 32 bytes each', () => {
    withHarness(harness => {
      const { root } = buildSpriteScene({ count: 1000, textures: makeTextures(1) });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(1);
      expect(m.batches).toBe(1);
      expect(m.instances).toBe(1000);
      expect(m.visibleNodes).toBe(1000);
      // Zero, not 1000 * 32: the render root is retained by default, so a steady
      // frame replays the recorded batch out of the group-owned instance buffer
      // instead of re-uploading 32 bytes per sprite. The RECORD frame still
      // uploads them once — that is what the 32-bytes-per-instance shape is now
      // pinned by in `retained-instruction-equivalence`, byte for byte.
      expect(m.uploadedBufferBytes).toBe(0);

      root.destroy();
    });
  });

  it('1000 sprites / 16 textures → one draw (multi-texture slot merge)', () => {
    withHarness(harness => {
      const { root } = buildSpriteScene({ count: 1000, textures: makeTextures(16), assign: 'cycle' });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(1);
      expect(m.instances).toBe(1000);

      root.destroy();
    });
  });

  it('16 distinct textures batch into one draw (slot merge up to 16)', () => {
    withHarness(harness => {
      const { root } = buildSpriteScene({ count: 16, textures: makeTextures(16), assign: 'distinct' });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(1);
      expect(m.batches).toBe(1);
      expect(m.instances).toBe(16);

      root.destroy();
    });
  });

  it('17 / 32 distinct textures → 2 draws; 33 → 3 draws (slot exhaustion at the 17th)', () => {
    for (const [textureCount, expectedDraws] of [
      [17, 2],
      [32, 2],
      [33, 3],
    ] as const) {
      withHarness(harness => {
        const { root } = buildSpriteScene({ count: textureCount, textures: makeTextures(textureCount), assign: 'distinct' });
        const m = measureSteadyFrame(harness, root, 2);

        expect(m.drawCalls).toBe(expectedDraws);

        root.destroy();
      });
    }
  });

  it('batch-buffer overflow splits into ⌈instances / 4096⌉ draws', () => {
    for (const [count, expectedDraws] of [
      [4096, 1],
      [4097, 2],
      [10000, 3],
    ] as const) {
      withHarness(harness => {
        const { root } = buildSpriteScene({ count, textures: makeTextures(1) });
        const m = measureSteadyFrame(harness, root, 2);

        expect(m.drawCalls).toBe(expectedDraws);
        expect(m.instances).toBe(count);

        root.destroy();
      });
    }
  });

  it('alternating blend coalesces by material when sprites do not overlap', () => {
    // Non-overlapping → the plan optimiser reorders same-blend draws adjacent →
    // one group per blend mode → 2 draws (not 10).
    withHarness(harness => {
      const { root } = buildSpriteScene({ count: 10, textures: makeTextures(1), blendModes: [0, 1] });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(2);

      root.destroy();
    });
  });

  it('alternating blend flushes per sprite when sprites overlap (reorder blocked)', () => {
    // Identical positions → overlap blocks material reordering → document order →
    // a flush at every blend change.
    withHarness(harness => {
      const texture = makeTextures(1)[0];
      const root = new Container();

      for (let i = 0; i < 10; i++) {
        const sprite = new Sprite(texture);
        sprite.blendMode = (i % 2) as BlendModes;
        sprite.setPosition(100, 100);
        root.addChild(sprite);
      }

      const m = measureSteadyFrame(harness, root, 2);

      expect(m.drawCalls).toBe(10);
      expect(m.blendChanges).toBe(10);

      root.destroy();
    });
  });

  it('off-screen sprites are culled, not drawn', () => {
    withHarness(harness => {
      const { root } = buildSpriteScene({ count: 100, textures: makeTextures(1), offscreenFraction: 0.5 });
      const m = measureSteadyFrame(harness, root, 2);

      expect(m.visibleNodes).toBe(50);
      // `culledNodes` counts cull WORK, and a retained steady frame does none —
      // the 50 off-screen sprites were dropped at capture and the replay never
      // revisits them. What the archetype actually asserts is that they are not
      // DRAWN, which `instances` below pins directly.
      expect(m.culledNodes).toBe(0);
      expect(m.instances).toBe(50);

      root.destroy();
    });
  });

  it('1000 per-call renders / 1 texture → one draw (cross-call batching)', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);
      const sprites = Array.from({ length: 1000 }, (_, i) => {
        const sprite = new Sprite(texture);
        sprite.setPosition(i % 100, Math.floor(i / 100));
        return sprite;
      });

      const m = measureCrossCallFrame(harness, sprites, 2);

      expect(m.drawCalls).toBe(1);
      expect(m.instances).toBe(1000);
      expect(m.visibleNodes).toBe(1000);

      for (const sprite of sprites) sprite.destroy();
    });
  });

  it('neither a static nor a moving steady frame re-uploads the shared transform rows', () => {
    withHarness(harness => {
      const staticScene = buildSpriteScene({ count: 500, textures: makeTextures(1) });
      const staticMetrics = measureSteadyFrame(harness, staticScene.root, 2);

      expect(staticMetrics.transformUploads).toBe(0);

      staticScene.root.destroy();
    });

    withHarness(harness => {
      const { root, sprites } = buildSpriteScene({ count: 500, textures: makeTextures(1) });
      let frame = 0;
      const moving = measureSteadyFrame(harness, root, 2, () => {
        frame++;
        for (const sprite of sprites) {
          sprite.setPosition(sprite.position.x + (frame % 2 === 0 ? 1 : -1), sprite.position.y);
        }
      });

      // Moving every sprite used to re-upload all 500 shared rows. It now costs
      // zero shared-buffer traffic: the render root is retained, so each move is
      // reconciled as an in-place patch of one group-owned row and the recorded
      // batch is replayed unchanged. `retained-transform-row-patch` pins that the
      // patch really happens and addresses the right row; what belongs HERE is
      // the structural consequence — motion neither re-uploads nor breaks the
      // batch.
      expect(moving.transformUploads).toBe(0);
      expect(moving.drawCalls).toBe(1);
      expect(moving.instances).toBe(500);

      root.destroy();
    });
  });

  it('per-call renders match a Container render (same draws, instances, transform rows)', () => {
    withHarness(harness => {
      const [texture] = makeTextures(1);

      const loose = Array.from({ length: 500 }, (_, i) => {
        const sprite = new Sprite(texture);
        sprite.setPosition((i * 7) % 640, (i * 13) % 480);
        return sprite;
      });
      const crossCall = measureCrossCallFrame(harness, loose, 2);
      for (const sprite of loose) sprite.destroy();

      const { root } = buildSpriteScene({ count: 500, textures: makeTextures(1) });
      const container = measureSteadyFrame(harness, root, 2);
      root.destroy();

      expect(crossCall.drawCalls).toBe(container.drawCalls);
      expect(crossCall.instances).toBe(container.instances);
      expect(crossCall.transformRows).toBe(container.transformRows);
    });
  });
});
