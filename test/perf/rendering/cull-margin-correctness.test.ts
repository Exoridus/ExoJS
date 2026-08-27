/**
 * The retention tiers must answer every camera operation with the set of nodes
 * the view actually contains - not just the small continuous step the capture
 * margin is tuned for.
 *
 * The margin makes a capture (and an indexed selection) valid for a RANGE of
 * views rather than for one, and every tier reasons about that range
 * geometrically. A camera cut, a zoom, a resize or a rotation leaves that range
 * in ways a small pan does not, and the failure mode is silent: a stale product
 * replays, a node that entered the view is never drawn, and nothing throws.
 *
 * Two properties per operation, and they are different claims:
 *
 * - **The tier is right.** An operation that leaves the valid range must NOT be
 *   answered by a replay. This is the one a stale product fails, and it is
 *   exact - the probe reads which branch the builder took, not a symptom.
 * - **The set is complete.** The frame must submit at least every leaf whose
 *   quad meets the view, computed analytically from the scene's own layout. The
 *   tiers may legitimately submit MORE (a node that has left the view since the
 *   capture is drawn and clipped), never fewer.
 *
 * Deliberately not a margin-VALUE test: nothing here encodes `1/16`. The
 * boundary cases derive their distances from the ratio the builder actually
 * culls with, so the file keeps its teeth through a recalibration.
 *
 * @internal Test/perf-only.
 */
import { afterEach, describe, expect, test } from 'vitest';

import type { ServedBy } from './cullMarginProbe';
import {
  beginProbeFrame,
  buildScrollingWorld,
  captureCullRectOf,
  endProbeFrame,
  installTierProbe,
  SCROLLING_WORLD,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from './cullMarginProbe';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';

const NODE_COUNT = 4000;
const SPEED = SCROLLING_WORLD.cameraSpeed;
const SPAN = SCROLLING_WORLD.worldSpan;
const GRID_MARGIN = 32;
const SPRITE_SIZE = 8;
/** Frames of ordinary scrolling before the operation under test. */
const WARMUP = 40;

installTierProbe();

interface Fixture {
  readonly harness: WebGl2Harness;
  readonly scene: ReturnType<typeof buildScrollingWorld>;
}

const live: Fixture[] = [];

const openScene = (): Fixture => {
  const harness = createWebGl2Harness({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  const fixture = { harness, scene: buildScrollingWorld(harness, NODE_COUNT, SPEED, SPAN) };

  live.push(fixture);

  return fixture;
};

interface FrameResult {
  readonly submitted: number;
  readonly servedBy: ServedBy;
}

const render = ({ harness, scene }: Fixture): FrameResult => {
  const { backend } = harness;

  beginProbeFrame();
  backend.resetStats();
  backend.clear();
  scene.root.render(backend);
  backend.flush();

  return { submitted: backend.stats.submittedNodes, servedBy: endProbeFrame(scene.root) };
};

/** One camera mutation applied to a view. */
type CameraOp = (harness: WebGl2Harness) => void;

/**
 * Run `ops` on a root that has been retaining for {@link WARMUP} frames of
 * ordinary scrolling, rendering after each one, and report the last frame.
 */
const warm = (ops: readonly CameraOp[]): FrameResult => {
  const fixture = openScene();

  for (let frame = 0; frame < WARMUP; frame++) {
    fixture.scene.step(frame);
    render(fixture);
  }

  let result = render(fixture);

  for (const op of ops) {
    op(fixture.harness);
    result = render(fixture);
  }

  return result;
};

/**
 * The same view, reached by a root with no history: `ops` are applied without
 * rendering between them, so only the final camera state is ever drawn.
 */
const cold = (ops: readonly CameraOp[]): FrameResult => {
  const fixture = openScene();

  for (const op of ops) {
    op(fixture.harness);
  }

  return render(fixture);
};

/** Every leaf whose quad meets `harness`'s current view - the floor no tier may fall below. */
const analyticVisible = (harness: WebGl2Harness): number => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(NODE_COUNT)));
  const rows = Math.max(1, Math.ceil(NODE_COUNT / columns));
  const cellWidth = (VIEWPORT_WIDTH * SPAN - 2 * GRID_MARGIN) / columns;
  const cellHeight = (VIEWPORT_HEIGHT * SPAN - 2 * GRID_MARGIN) / rows;
  const rect = harness.view.getBounds();
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  let visible = 0;

  for (let index = 0; index < NODE_COUNT; index++) {
    const x = GRID_MARGIN + (index % columns) * cellWidth + cellWidth / 2;
    const y = GRID_MARGIN + Math.floor(index / columns) * cellHeight + cellHeight / 2;

    if (x < right && x + SPRITE_SIZE > rect.x && y < bottom && y + SPRITE_SIZE > rect.y) {
      visible++;
    }
  }

  return visible;
};

/** The margin the builder is compiled with, recovered from the rect it culls against. */
const marginRatio = (): number => {
  const fixture = openScene();

  render(fixture);

  const view = fixture.harness.view.getBounds();
  const cullRect = captureCullRectOf(fixture.scene.root);

  return cullRect === null ? 0 : (cullRect.width - view.width) / (2 * view.width);
};

const setCenter =
  (x: number, y: number): CameraOp =>
  (harness): void => {
    harness.view.setCenter(x, y);
  };

/** Both claims at once: the tiers never drop a node the view contains. */
const expectComplete = (ops: readonly CameraOp[]): FrameResult => {
  const probe = openScene();

  for (const op of ops) {
    op(probe.harness);
  }

  const floor = analyticVisible(probe.harness);
  const coldFrame = cold(ops);
  const warmFrame = warm(ops);

  expect(coldFrame.submitted).toBeGreaterThanOrEqual(floor);
  expect(warmFrame.submitted).toBeGreaterThanOrEqual(floor);

  return warmFrame;
};

afterEach(() => {
  for (const { harness, scene } of live.splice(0)) {
    scene.destroy();
    harness.destroy();
  }
});

describe('retained selection under camera operations', () => {
  test('the archetype keeps real off-screen content, so the comparison has teeth', () => {
    const fixture = openScene();

    expect(analyticVisible(fixture.harness)).toBeLessThan(NODE_COUNT / 2);
  });

  test('the builder culls captures against a rect strictly larger than the view', () => {
    expect(marginRatio()).toBeGreaterThan(0);
  });

  test('a step that stays inside the margin is answered by a replay', () => {
    const ratio = marginRatio();
    const start = { x: 1500, y: 800 };
    const inside = setCenter(start.x + VIEWPORT_WIDTH * ratio * 0.25, start.y);
    const result = expectComplete([setCenter(start.x, start.y), inside]);

    expect(result.servedBy === 'slotReplay' || result.servedBy === 'captureReplay').toBe(true);
  });

  test('a step to exactly the margin boundary is still answered by a replay', () => {
    const ratio = marginRatio();
    const start = { x: 1500, y: 800 };
    const boundary = setCenter(start.x + VIEWPORT_WIDTH * ratio, start.y);
    const result = expectComplete([setCenter(start.x, start.y), boundary]);

    expect(result.servedBy === 'slotReplay' || result.servedBy === 'captureReplay').toBe(true);
  });

  test('a step one unit past the margin boundary is NOT answered by a replay', () => {
    const ratio = marginRatio();
    const start = { x: 1500, y: 800 };
    const past = setCenter(start.x + VIEWPORT_WIDTH * ratio + 1, start.y);
    const result = expectComplete([setCenter(start.x, start.y), past]);

    expect(result.servedBy === 'slotReplay' || result.servedBy === 'captureReplay').toBe(false);
  });

  test('a reversal of direction stays complete', () => {
    expectComplete([setCenter(1500, 800), setCenter(1400, 750), setCenter(1300, 700), setCenter(1400, 750)]);
  });

  test('a teleport across the world is NOT answered by a replay and stays complete', () => {
    const result = expectComplete([setCenter(1900, 1000)]);

    expect(result.servedBy === 'slotReplay' || result.servedBy === 'captureReplay').toBe(false);
  });

  test('a teleport far outside the world draws nothing at all', () => {
    const teleport = [setCenter(50_000, 20_000)];

    expect(cold(teleport).submitted).toBe(0);
    expect(warm(teleport).submitted).toBe(0);
  });

  test('a teleport out and straight back stays complete', () => {
    expectComplete([setCenter(50_000, 20_000), setCenter(900, 600)]);
  });

  test('sub-pixel shake stays complete', () => {
    expectComplete([setCenter(1000.37, 700.91), setCenter(1000.91, 700.37), setCenter(1000.02, 700.55)]);
  });

  test('a zoom-out past the capture rect stays complete', () => {
    expectComplete([
      setCenter(1280, 720),
      (harness): void => {
        harness.view.setZoom(0.25);
      },
    ]);
  });

  test('a zoom-in stays complete', () => {
    expectComplete([
      setCenter(1280, 720),
      (harness): void => {
        harness.view.setZoom(4);
      },
    ]);
  });

  test('a resize stays complete', () => {
    expectComplete([
      setCenter(1280, 720),
      (harness): void => {
        harness.view.resize(1920, 1080);
      },
    ]);
  });

  test('a rotation stays complete', () => {
    expectComplete([
      setCenter(1280, 720),
      (harness): void => {
        harness.view.setRotation(37);
      },
    ]);
  });

  test('a follow-shaped run of small steps stays complete', () => {
    expectComplete([setCenter(1500, 800), setCenter(1520, 815), setCenter(1541, 831), setCenter(1563, 848)]);
  });
});
