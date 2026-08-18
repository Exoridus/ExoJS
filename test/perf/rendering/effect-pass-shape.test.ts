/**
 * SHAPE gate for the effect path's nested draws.
 *
 * `ColorMatrixFilter.apply`, `BlurFilter.apply` and `RenderNode._drawTexture` issue
 * their quads through `drawDrawableDirect`, which wraps each draw in the
 * backend's plan-depth bracket. That bracket is not decoration: ending a NESTED
 * plan flushes the active renderer and REWINDS the transform rows the draw
 * pushed, so a frame with a hundred effect passes does not stack a hundred
 * passes' worth of rows into the frame-scoped buffer.
 *
 * Nothing else catches its removal. The pixel suite
 * (`browser/webgl2-effect-direct-draw.test.ts`) passes with the bracket gone -
 * the picture is identical, only the buffer traffic and the flush granularity
 * change - and the allocation gate reads a filtered scene as CHEAPER without
 * it. Measured on `blur-q3`, dropping the bracket moves draw calls 1600 -> 300
 * and transform bytes 48000 -> 116288: batching improves, upload traffic
 * nearly triples.
 *
 * ── INTEGRATOR NOTE ─────────────────────────────────────────────────────────
 * These are exact per-frame counts on a fixed scene, machine-independent for
 * the same reason `counter-gates.test.ts` pins its table. Hoisting the bracket
 * out of a filter's sample loop - batching a blur's samples into one draw - is
 * a DELIBERATE follow-up that will move every number here. When that lands,
 * re-measure and update the table, and confirm the transform-byte column moved
 * the way you intended: fewer draw calls at the cost of more upload bytes is a
 * trade to make on purpose, not to discover afterwards.
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

      // Two passes and two acquired targets per filtered node; three draws —
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

  it('a blur flushes each offset sample and rewinds its transform rows', () => {
    const harness = createWebGl2Harness();
    const root = buildScene(sprite => sprite.addFilter(new BlurFilter({ radius: 4, quality: 3 })));

    try {
      const frame = measureSteadyFrame(harness, root);

      // A separable blur is two sweeps - horizontal into a borrowed scratch,
      // vertical into the output - so it costs one pass more than a
      // single-pass filter. What the bracket is measured by is still the draw
      // and byte columns: the taps inside each sweep must not stack up.
      expect(frame.renderPasses).toBe(3 * NODES);
      // 14 offset samples + the subject + the composite, per node.
      expect(frame.drawCalls).toBe(16 * NODES);
      // Without the per-draw rewind this reads six figures: every tap's row
      // survives to the end of the frame instead of being handed back. The
      // second sweep costs one row per node on top of the single-sweep 48000.
      expect(frame.transformUploadBytes).toBe(51200);
    } finally {
      root.destroy();
      harness.destroy();
    }
  });
});
