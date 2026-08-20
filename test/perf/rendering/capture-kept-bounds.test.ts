/**
 * The capture tier's SECOND view tolerance - the one the capture cull rect
 * cannot express.
 *
 * `RetainedRootRepresentation.isCleanIgnoringTransform` accepts a moved view two
 * ways. The first is the capture margin: the view still fits the rect the
 * capture culled against. The second is `_keptBounds` - nothing was culled and
 * the view still contains every kept node - and it exists for the case the first
 * one structurally cannot cover: a view that GREW past the capture rect.
 *
 * That distinction decides what the two fields are. `_keptBounds` / `_keptEmpty`
 * only ever ADMIT more views, so removing them would cost replays and never
 * pixels: they are an optimisation. `_culledDuringCapture` is what gates them,
 * and it is not: with it forced to `false`, a capture that dropped a node would
 * replay under a view that admits that node again, and the node would be missing
 * from the frame with nothing to notice it. The tests below assert both halves,
 * so neither field can be removed on the strength of a summary of what they do.
 *
 * The indexed slot tier is refused here on purpose: it sits above the capture
 * tier and answers a zoom-out with a re-selection, which would hide the very
 * decision under test.
 *
 * @internal Test/perf-only.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import type { ServedBy } from './cullMarginProbe';
import { beginProbeFrame, endProbeFrame, installTierProbe, refusePersistentSlots } from './cullMarginProbe';
import { makeTextures } from './fixtures';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';

refusePersistentSlots(WebGl2Backend.prototype);
installTierProbe();

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

const live: Array<{ harness: WebGl2Harness; root: Container }> = [];

/**
 * A handful of sprites clustered in the middle of the view, plus - when asked -
 * one far enough away that the capturing collect has to drop it.
 */
const openScene = (withOffscreen: boolean): { harness: WebGl2Harness; root: Container } => {
  const harness = createWebGl2Harness({ width: VIEW_WIDTH, height: VIEW_HEIGHT });
  const textures = makeTextures(1, 16);
  const root = new Container();

  root.cullable = true;

  for (let index = 0; index < 8; index++) {
    const sprite = new Sprite(textures[0]!);

    sprite.cullable = true;
    sprite.setPosition(300 + index * 20, 280);
    root.addChild(sprite);
  }

  if (withOffscreen) {
    const far = new Sprite(textures[0]!);

    far.cullable = true;
    far.setPosition(40_000, 40_000);
    root.addChild(far);
  }

  harness.view.reset(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT);
  live.push({ harness, root });

  return { harness, root };
};

const render = (harness: WebGl2Harness, root: Container): { submitted: number; servedBy: ServedBy } => {
  const { backend } = harness;

  beginProbeFrame();
  backend.resetStats();
  backend.clear();
  root.render(backend);
  backend.flush();

  return { submitted: backend.stats.submittedNodes, servedBy: endProbeFrame(root) };
};

/** Whether the capture's own cull rect could still be carrying the frame. */
const viewFitsCaptureRect = (root: Container): boolean => {
  const representation = (root as unknown as { _retainedRootRepresentation(): unknown })._retainedRootRepresentation() as {
    _captureCullRect: { containsRect(rect: unknown): boolean };
    _hasCaptureCullRect: boolean;
  };

  return representation._hasCaptureCullRect;
};

afterEach(() => {
  for (const { harness, root } of live.splice(0)) {
    root.destroy();
    harness.destroy();
  }
});

describe('capture reuse when nothing was culled', () => {
  test('a zoom-out past the capture rect still replays when the capture culled nothing', () => {
    const { harness, root } = openScene(false);

    render(harness, root);
    render(harness, root);
    render(harness, root);

    expect(viewFitsCaptureRect(root)).toBe(true);

    // Four times the view on each axis: far outside any margin the builder
    // grows the capture rect by, so only the kept-bounds rule can accept it.
    harness.view.setZoom(0.25);

    const zoomed = render(harness, root);

    expect(zoomed.servedBy).toBe('captureReplay');
    expect(zoomed.submitted).toBe(8);
  });

  test('the same zoom-out does NOT replay when the capture dropped a node', () => {
    const { harness, root } = openScene(true);

    render(harness, root);
    render(harness, root);
    render(harness, root);

    harness.view.setZoom(0.25);

    const zoomed = render(harness, root);

    expect(zoomed.servedBy).not.toBe('captureReplay');
    expect(zoomed.submitted).toBe(8);
  });

  test('a zoom-out far enough to admit the dropped node draws it', () => {
    const { harness, root } = openScene(true);

    render(harness, root);
    render(harness, root);
    render(harness, root);

    // The far sprite sits at (40000, 40000); a view wide enough to reach it must
    // draw all nine, which is only possible because the capture was refused.
    harness.view.reset(20_000, 20_000, 100_000, 100_000);

    expect(render(harness, root).submitted).toBe(9);
  });
});
