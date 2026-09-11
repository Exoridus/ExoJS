/**
 * SHAPE gate for the effect path's nested draws.
 *
 * `RenderNode._drawTexture` and every filter that composites through drawables
 * issue their quads through `drawDrawableDirect`, which wraps each draw in the
 * backend's plan-depth bracket. That bracket is not decoration: ending a NESTED
 * plan flushes the active renderer and REWINDS the transform rows the draw
 * pushed, so a frame with a hundred effect passes does not stack a hundred
 * passes' worth of rows into the frame-scoped buffer.
 *
 * Nothing else catches its removal. The pixel suite
 * (`browser/webgl2-effect-direct-draw.test.ts`) passes with the bracket gone -
 * the picture is identical, only the buffer traffic and the flush granularity
 * change - and the allocation gate reads a filtered scene as CHEAPER without
 * it.
 *
 * ── INTEGRATOR NOTE ─────────────────────────────────────────────────────────
 * These are exact per-frame counts on a fixed scene, machine-independent for
 * the same reason `counter-gates.test.ts` pins its table. A change to how a
 * stock filter composites moves every number here; re-measure and update the
 * table rather than relaxing the assertions.
 *
 * @internal Test/perf-only.
 */
import { describe, expect, it } from 'vitest';

import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';

import { makeTextures, scatterInView } from './fixtures';
import { createWebGl2Harness, measureSteadyFrame } from './harness';

const VIEW = { w: 1280, h: 720 } as const;
const NODES = 100;

/** `NODES` scattered sprites, each carrying whatever `decorate` adds. */
const buildScene = (decorate: (sprite: Sprite) => void): Container => {
  const [texture] = makeTextures(1);
  const root = new Container();

  for (let i = 0; i < NODES; i++) {
    const sprite = new Sprite(texture!);

    scatterInView(sprite, i, VIEW.w, VIEW.h);
    decorate(sprite);
    root.addChild(sprite);
  }

  return root;
};

describe('effect pass shape', () => {
  it('a single-pass filter costs one capture pass and one filter pass per node', () => {
    const harness = createWebGl2Harness();
    const root = buildScene(sprite => sprite.addFilter(new ColorMatrixFilter()));

    try {
      const frame = measureSteadyFrame(harness, root);

      // Two passes and two acquired targets per filtered node; three draws -
      // the subject into the capture, the filter quad, the composite. The
      // filter's quad goes through its own VAO rather than a drawable, so it
      // pushes no transform row: the byte column is one row per node lighter
      // than it was when this filter drew through a Sprite.
      expect(frame.renderPasses).toBe(2 * NODES);
      expect(frame.drawCalls).toBe(3 * NODES);
      expect(frame.transformUploadBytes).toBe(6400);
    } finally {
      root.destroy();
      harness.destroy();
    }
  });

  it('a separable blur costs one pass and one draw per sweep', () => {
    const harness = createWebGl2Harness();
    const root = buildScene(sprite => sprite.addFilter(new BlurFilter({ strength: 2 })));

    try {
      const frame = measureSteadyFrame(harness, root);

      // A separable blur is two sweeps - horizontal into a borrowed scratch,
      // vertical into the output - so it costs one pass more than a
      // single-pass filter.
      expect(frame.renderPasses).toBe(3 * NODES);
      // One draw per sweep + the subject + the composite, per node.
      expect(frame.drawCalls).toBe(4 * NODES);
      // Both sweeps go through the shader pass's own VAO, so neither pushes a
      // transform row: the byte column is the subject and the composite alone,
      // exactly the single-pass filter's.
      expect(frame.transformUploadBytes).toBe(6400);
    } finally {
      root.destroy();
      harness.destroy();
    }
  });
});
