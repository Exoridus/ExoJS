/**
 * Slice-4d acceptance: the incremental transform-row patch is O(k moved rows),
 * not O(n group size).
 *
 * The dynamic-heavy motivation (design §1) measured exojs at ~117 ms vs Pixi's
 * ~9 ms under 7.5 % churn, because the engine rebuilt collect -> pack ->
 * transform-upload over ALL nodes every frame even though only a few moved. The
 * design attribution is explicit: 100 % of the cost is CPU-side in `render`
 * (collect+transform+pack), `flush` ~0. So the fix's core property — upload work
 * proportional to the number of MOVED rows, independent of group size — is a
 * CPU-pipeline property that this GPU-free Node harness measures exactly and
 * deterministically (the recording fake context turns the GPU draw into a
 * no-op; every expensive staging step still runs for real).
 *
 * These gates pin that property structurally (counters, not wall-clock, so they
 * are reproducible and CI-safe). The absolute wall-clock head-to-head vs Pixi
 * still belongs on a real GPU (packages/exojs-bench) — that is a separate,
 * hardware-bound measurement and is intentionally NOT what these gates claim.
 */
import { describe, expect, it, vi } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';

import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';

const withHarness = (fn: (harness: WebGl2Harness) => void): void => {
  const harness = createWebGl2Harness();

  try {
    fn(harness);
  } finally {
    harness.destroy();
  }
};

/**
 * A retained group of `n` default-path sprites on one texture (so they all
 * batch), warmed to the instruction-replay tier. One sprite sits OUTSIDE and
 * before the group so the group's transform rows never start at shared row 0 —
 * the group-local rebase is load-bearing, not incidentally satisfied.
 */
const buildScaledScene = (n: number) => {
  const [texture] = makeTextures(1);
  const root = new Container();
  const outside = new Sprite(texture!);
  const group = new RetainedContainer();
  const sprites: Sprite[] = [];

  outside.setPosition(700, 500);
  root.addChild(outside);

  for (let i = 0; i < n; i++) {
    const sprite = new Sprite(texture!);

    // Deterministic on-screen placement (harness view is 1280x720): all pass
    // culling, none overlaps the group AABB assertions.
    sprite.setPosition((i % 32) * 20 + 10, Math.floor(i / 32) * 20 + 10);
    group.addChild(sprite);
    sprites.push(sprite);
  }

  group.setPosition(100, 100);
  root.addChild(group);

  return { root, group, sprites };
};

/** Warm the scene to the steady instruction-replay tier (F1 capture, F2 record, F3 splice). */
const warmToSplice = (harness: WebGl2Harness, root: Container): void => {
  measureFrame(harness, root); // F1 capture
  measureFrame(harness, root); // F2 record
  measureFrame(harness, root); // F3 splice
};

describe('Slice 4d: transform-row patch is O(k moved), independent of group size', () => {
  it('moving k=4 sprites uploads only the k touched rows and ZERO instance bytes — the same cost at n=16 and n=256', () => {
    const measurePatchCost = (n: number, k: number): { transformRows: number; instanceBytes: number; reRecorded: boolean } => {
      let result!: { transformRows: number; instanceBytes: number; reRecorded: boolean };

      withHarness(harness => {
        const { root, sprites } = buildScaledScene(n);

        warmToSplice(harness, root);

        const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');

        // Move the first k sprites (contiguous rows 0..k-1 → one k-tall sub-range).
        const moved = measureFrame(harness, root, () => {
          for (let i = 0; i < k; i++) {
            sprites[i]!.setPosition(400 + i, 400 + i);
          }
        });

        result = {
          transformRows: moved.transformRows,
          instanceBytes: moved.uploadedBufferBytes,
          reRecorded: beginSpy.mock.calls.length > 0,
        };

        root.destroy();
      });

      return result;
    };

    const small = measurePatchCost(16, 4);
    const large = measurePatchCost(256, 4);

    // The headline O(k): patching k rows costs the same whether the group holds
    // 16 sprites or 256. Uploaded transform rows track k (the contiguous 0..k-1
    // sub-range), NOT n; no re-record.
    expect(small.transformRows).toBe(4);
    expect(large.transformRows).toBe(4);
    expect(large.transformRows).toBe(small.transformRows); // n grew 16x, cost flat

    // The group uploads ZERO instance bytes on a transform patch — the only
    // instance traffic is the one immediate `outside` sprite (32 B = 8 words),
    // which is CONSTANT across n. If the group re-uploaded its instances this
    // would scale with n; it does not.
    expect(small.instanceBytes).toBe(32);
    expect(large.instanceBytes).toBe(32);
    expect(large.instanceBytes).toBe(small.instanceBytes); // group contributes 0, flat over n

    expect(small.reRecorded).toBe(false);
    expect(large.reRecorded).toBe(false);
  });

  it('contrast: a CONTENT change re-records the whole group — O(n), so n=256 uploads 16x the rows of n=16', () => {
    const measureContentCost = (n: number): number => {
      let rows = 0;

      withHarness(harness => {
        const { root, sprites } = buildScaledScene(n);

        warmToSplice(harness, root);

        // A tint change is a genuine content mutation: it invalidates the
        // recording and forces a full re-collect + re-record + re-store of ALL
        // n rows over the next two frames (dirty collect, then record).
        sprites[0]!.setTint(new Color(10, 20, 30));
        measureFrame(harness, root); // dirty full collect
        const recorded = measureFrame(harness, root); // re-record stores all rows

        rows = recorded.transformRows;
        root.destroy();
      });

      return rows;
    };

    const small = measureContentCost(16);
    const large = measureContentCost(256);

    // The full re-record stores every row, so cost scales with n — the exact
    // O(n) behaviour the transform patch avoids. (Rows include the one outside
    // sprite, so compare the group-dominated totals, not an exact multiple.)
    expect(small).toBeGreaterThanOrEqual(16);
    expect(large).toBeGreaterThanOrEqual(256);
    expect(large).toBeGreaterThan(small * 4); // grows with n, unlike the flat patch
  });

  it('a single moved sprite in a 1024-group uploads exactly 1 row and no instance bytes (the churn win at scale)', () => {
    withHarness(harness => {
      const { root, sprites } = buildScaledScene(1024);

      warmToSplice(harness, root);

      const beginSpy = vi.spyOn(harness.backend, '_beginRetainedCapture');
      const moved = measureFrame(harness, root, () => sprites[0]!.setPosition(640, 360));

      expect(moved.transformRows).toBe(1); // one row patched, out of 1024
      expect(moved.uploadedBufferBytes).toBe(32); // only the immediate outside sprite; group re-uploads nothing
      expect(beginSpy).not.toHaveBeenCalled(); // no re-record

      root.destroy();
    });
  });
});
