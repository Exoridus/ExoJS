/**
 * One render root drawn to more than one render target in the same frame.
 *
 * A captured product is compiled for the target it was recorded against, so a
 * root drawn into a `RenderTexture` and onto the screen within one frame -
 * minimap, portal, mirror, post-processing source - needs one product per
 * target. Held in a single field, each draw found the other draw's product,
 * discarded it and captured again: measured on the scene below, all 20 draws of
 * a 10-frame window missed their keys, 13 of them re-captured, and every one of
 * them walked the scene graph (28,809 nodes culled, against 0 for the same
 * scene drawn twice to one target). Unlike a backend switch this never settles,
 * because both draws repeat every frame.
 *
 * The arms are counts, not a clock. `culledNodes` is booked per COLLECT, so a
 * frame that replays contributes nothing to it and a frame that walks the scene
 * graph contributes the whole world - an exact, machine-independent measure of
 * how much retention was lost. A wall clock against a fake GL context would
 * mostly measure the recorder.
 *
 * `screenTwice` is the arm that isolates the cause: two draws per frame, same
 * scene, same view, same work, differing from `bothTargets` in the render
 * target alone.
 *
 * @internal Test/perf-only.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { RetainedCaptureSlot } from '#rendering/plan/RetainedCaptureSlot';
import type { RetainedRootRepresentation } from '#rendering/plan/RetainedRootRepresentation';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { buildScrollingWorld, SCROLLING_WORLD, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './cullMarginProbe';
import type { WebGl2Harness } from './harness';
import { createWebGl2Harness } from './harness';

const LEAF_COUNT = 2000;
const WARMUP_FRAMES = 4;
const MEASURED_FRAMES = 10;

/** What one arm paid over {@link MEASURED_FRAMES} steady-state frames. */
interface ArmCounts {
  /** Draws issued - one per `root.render()`. */
  draws: number;
  /** Draws whose captured product did not match the frame's keys. */
  cleanMisses: number;
  /** Captures committed. Lower than the miss count once thrash suppression engages. */
  commits: number;
  /** Nodes the view test discarded, booked per collect: 0 for a frame that replayed. */
  culledNodes: number;
}

/** Count capture commits and key misses per call rather than per frame. */
const installCaptureCounter = (): { commits: number; misses: number; reset(): void; restore(): void } => {
  const prototype = RetainedCaptureSlot.prototype;
  const commitCapture = prototype.commitCapture;
  const isClean = prototype.isCleanIgnoringTransform;
  const state = {
    commits: 0,
    misses: 0,
    reset(): void {
      state.commits = 0;
      state.misses = 0;
    },
    restore(): void {
      prototype.commitCapture = commitCapture;
      prototype.isCleanIgnoringTransform = isClean;
    },
  };

  prototype.commitCapture = function commit(this: RetainedCaptureSlot, ...args): void {
    state.commits++;

    commitCapture.apply(this, args);
  };

  prototype.isCleanIgnoringTransform = function clean(this: RetainedCaptureSlot, ...args): boolean {
    const value = isClean.apply(this, args);

    if (!value) {
      state.misses++;
    }

    return value;
  };

  return state;
};

/**
 * Refuse the indexed slot tier for the duration of `run`. That tier sits above
 * the capture decision and is keyed on the backend alone, so leaving it in
 * would answer both draws and hide the tier under test - which is itself a
 * result, asserted in the last case.
 */
const withoutPersistentSlots = <T>(run: () => T): T => {
  const prototype = WebGl2Backend.prototype as unknown as { _acquirePersistentSlots: unknown };
  const acquire = prototype._acquirePersistentSlots;

  prototype._acquirePersistentSlots = (): null => null;

  try {
    return run();
  } finally {
    prototype._acquirePersistentSlots = acquire;
  }
};

/** How many products the root is holding. */
const slotCount = (root: RenderNode): number => {
  const representation = (root as unknown as { _retainedRootRepresentation(): RetainedRootRepresentation })._retainedRootRepresentation();

  return (representation as unknown as { _captureSlots: readonly unknown[] })._captureSlots.length;
};

const live: Array<() => void> = [];

interface Arm {
  readonly harness: WebGl2Harness;
  readonly root: RenderNode;
  readonly first: RenderTexture;
  readonly second: RenderTexture;
}

const openScene = (): Arm => {
  const harness = createWebGl2Harness({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
  const scene = buildScrollingWorld(harness, LEAF_COUNT, SCROLLING_WORLD.cameraSpeed, SCROLLING_WORLD.worldSpan);
  const first = new RenderTexture(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  const second = new RenderTexture(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  live.push(() => {
    scene.destroy();
    first.destroy();
    second.destroy();
    harness.destroy();
  });

  return { harness, root: scene.root, first, second };
};

/** Draw the root once per entry of `targets`, in order, within one frame. */
const drawFrame = (arm: Arm, targets: ReadonlyArray<RenderTexture | null>): void => {
  const { backend } = arm.harness;

  backend.clear();

  for (const target of targets) {
    backend.setRenderTarget(target);
    backend.setView(arm.harness.view);
    arm.root.render(backend);
  }

  backend.flush();
};

const measure = (arm: Arm, targets: ReadonlyArray<RenderTexture | null>, beforeMeasuredFrame?: (frame: number) => void): ArmCounts => {
  const { backend } = arm.harness;
  const probe = installCaptureCounter();

  try {
    for (let i = 0; i < WARMUP_FRAMES; i++) {
      backend.resetStats();
      drawFrame(arm, targets);
    }

    probe.reset();

    let culledNodes = 0;

    for (let i = 0; i < MEASURED_FRAMES; i++) {
      backend.resetStats();
      beforeMeasuredFrame?.(i);
      drawFrame(arm, targets);
      culledNodes += backend.stats.culledNodes;
    }

    return { draws: targets.length * MEASURED_FRAMES, cleanMisses: probe.misses, commits: probe.commits, culledNodes };
  } finally {
    probe.restore();
  }
};

afterEach(() => {
  for (const destroy of live.splice(0)) {
    destroy();
  }
});

describe('retained products — one root, several render targets per frame', () => {
  test('drawing to one target twice per frame replays: the second draw is free', () => {
    const arm = openScene();
    const counts = withoutPersistentSlots(() => measure(arm, [null, null]));

    expect(counts).toEqual({ draws: 20, cleanMisses: 0, commits: 0, culledNodes: 0 });
    expect(slotCount(arm.root)).toBe(1);
  });

  test('a render texture and the screen hold one product each and both replay', () => {
    const arm = openScene();
    const counts = withoutPersistentSlots(() => measure(arm, [arm.first, null]));

    expect(counts).toEqual({ draws: 20, cleanMisses: 0, commits: 0, culledNodes: 0 });
    expect(slotCount(arm.root)).toBe(2);
  });

  test('a descendant move reaches the product the frame is not drawing, so both stay replayable', () => {
    const movingLeaf = (arm: Arm): RenderNode => (arm.root as unknown as { children: RenderNode[] }).children.find(child => child instanceof Sprite)!;
    const stepLeaf =
      (arm: Arm) =>
      (frame: number): void => {
        movingLeaf(arm).setPosition(400 + frame, 300);
      };
    const control = openScene();
    const twoTargets = openScene();

    // A move that reached only the product being drawn would send the other one
    // back through a collect, which `culledNodes` reports. The single-target arm
    // is the control: the baked-row patch is what keeps either arm at zero, and
    // it has to hold for every product a root owns, not only the active one.
    const single = withoutPersistentSlots(() => measure(control, [null], stepLeaf(control)));
    const both = withoutPersistentSlots(() => measure(twoTargets, [twoTargets.first, null], stepLeaf(twoTargets)));

    expect(single.culledNodes).toBe(0);
    expect(both).toEqual({ draws: 20, cleanMisses: 0, commits: 0, culledNodes: 0 });
  });

  test('a third target in one frame evicts rather than growing the set', () => {
    const arm = openScene();
    const counts = withoutPersistentSlots(() => measure(arm, [arm.first, arm.second, null]));

    // Two products are held, so the least recently used one is evicted on every
    // draw and the frame pays what a single field paid for two targets. The cap
    // is the point: a product is a full instruction set plus its recorded
    // entries, and "screen plus one offscreen" is the case worth serving.
    expect(slotCount(arm.root)).toBe(2);
    expect(counts.cleanMisses).toBeGreaterThan(0);
  });

  test('the indexed slot tier is keyed on the backend alone and absorbs the target switch', () => {
    const arm = openScene();
    const counts = measure(arm, [arm.first, null]);

    expect(counts.culledNodes).toBe(0);
  });
});
