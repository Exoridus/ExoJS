/**
 * The margin probe's scene must BE `scrolling-world`, not merely resemble it.
 *
 * `cullMarginProbe` re-implements the archetype's geometry rather than importing
 * it, because the bench package sits outside the workspace typecheck. A copy
 * drifts silently: a changed grid inset or camera path would leave every margin
 * number in the calibration report describing a scene the benchmark no longer
 * runs, with nothing failing. So the copy is pinned here against the bench's own
 * `world.ts` — the single source both the harness page and every arm use.
 *
 * Type-only import chain: `world.ts` pulls one `type` from `EngineAdapter`,
 * which pulls one `type` from `shared/result`, and neither reaches a competitor
 * library. Nothing here loads Playwright or the bench driver.
 *
 * @internal Test/perf-only.
 */
import { describe, expect, test } from 'vitest';

import { ARCHETYPES } from '../../../packages/exojs-bench/src/rendering/archetypes';
import type { ArchetypeSpec } from '../../../packages/exojs-bench/src/rendering/EngineAdapter';
import * as world from '../../../packages/exojs-bench/src/rendering/world';
import * as probe from './cullMarginProbe';

const SPEC = ARCHETYPES.find((archetype): archetype is ArchetypeSpec => archetype.id === 'scrolling-world')!;

describe('cull-margin probe fidelity', () => {
  test("the archetype parameters the probe hard-codes are the archetype's own", () => {
    expect(SPEC.cameraSpeed).toBe(probe.SCROLLING_WORLD.cameraSpeed);
    expect(SPEC.worldSpan).toBe(probe.SCROLLING_WORLD.worldSpan);
    expect(SPEC.nestingDepth).toBe(probe.SCROLLING_WORLD.nestingDepth);
    expect(SPEC.cullingEnabled).toBe(true);
    expect(SPEC.mutationFraction).toBe(0);
    expect(SPEC.textureCount).toBe(1);
  });

  test('the viewport, grid inset and leaf size match the bench', () => {
    expect(probe.VIEWPORT_WIDTH).toBe(world.VIEWPORT_WIDTH);
    expect(probe.VIEWPORT_HEIGHT).toBe(world.VIEWPORT_HEIGHT);
    expect(probe.GRID_MARGIN).toBe(world.GRID_MARGIN);
    expect(probe.SPRITE_SIZE).toBe(world.SPRITE_SIZE);
  });

  test('the grid layout matches the bench at every measured node count', () => {
    const extent = world.worldExtent(SPEC, world.VIEWPORT_WIDTH, world.VIEWPORT_HEIGHT);

    for (const nodeCount of [5_000, 25_000, 100_000, 1_000_000]) {
      const expected = world.gridLayout(nodeCount, extent.width, extent.height, world.GRID_MARGIN);
      const actual = probe.gridLayout(
        nodeCount,
        probe.VIEWPORT_WIDTH * probe.SCROLLING_WORLD.worldSpan,
        probe.VIEWPORT_HEIGHT * probe.SCROLLING_WORLD.worldSpan,
        probe.GRID_MARGIN,
      );

      expect(actual).toEqual(expected);
    }
  });

  test('leaf positions match the bench across the grid', () => {
    const extent = world.worldExtent(SPEC, world.VIEWPORT_WIDTH, world.VIEWPORT_HEIGHT);
    const benchLayout = world.gridLayout(25_000, extent.width, extent.height, world.GRID_MARGIN);
    const probeLayout = probe.gridLayout(25_000, probe.VIEWPORT_WIDTH * 2, probe.VIEWPORT_HEIGHT * 2, probe.GRID_MARGIN);

    for (const index of [0, 1, 158, 4_999, 12_500, 24_999]) {
      expect(probe.gridPosition(index, probeLayout, probe.GRID_MARGIN)).toEqual(world.gridPosition(index, benchLayout, world.GRID_MARGIN));
    }
  });

  test('the camera path matches the bench frame for frame, reflections included', () => {
    for (let frame = 0; frame < 400; frame++) {
      expect(probe.cameraCenterAt(frame, SPEC.cameraSpeed!, SPEC.worldSpan!)).toEqual(
        world.cameraCenterAt(SPEC, frame, world.VIEWPORT_WIDTH, world.VIEWPORT_HEIGHT),
      );
    }
  });

  test("the on-screen leaf count matches the bench, so the off-screen fraction is the archetype's", () => {
    for (const frame of [0, 7, 64, 199]) {
      expect(probe.visibleLeafCount(25_000, frame, SPEC.cameraSpeed!, SPEC.worldSpan!)).toBe(
        world.visibleLeafCount(SPEC, 25_000, frame, world.VIEWPORT_WIDTH, world.VIEWPORT_HEIGHT, world.GRID_MARGIN, world.SPRITE_SIZE),
      );
    }
  });
});
