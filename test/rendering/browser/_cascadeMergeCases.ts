/**
 * What one cascade level does with the level above it, when the level below
 * walks geometry.
 *
 * The merge is a transfer, not a weighting: each of the four coarser probes is
 * reached by its own walk, and what that walk let through is what scales that
 * probe's radiance. So a blocked way needs no weight of its own - the walk
 * already returned nothing - and an open way keeps the plain bilinear weight
 * its place in the grid gives it.
 *
 * Every case reads one texel: one probe, one direction. The scene is expressed
 * in the same world the probe grid covers, and the level above is a constant,
 * so what comes out can be predicted exactly.
 */

import { expect } from 'vitest';

import { Rectangle } from '#math/Rectangle';

import type { Light } from '../../../packages/exojs-lighting/src/lights/Light';
import { point } from './_transportCases';

/** Probes across and up, and the tile of directions each of them owns. */
export const MERGE_PROBES = 8;
export const MERGE_TILE = 2;
/** World units between probes, and the interval this level's rays cover. */
export const MERGE_SPACING = 16;
export const MERGE_RANGE = 16;
/** The world the probe grid spans, which is also the grid the tables index. */
export const MERGE_WORLD = new Rectangle(0, 0, MERGE_PROBES * MERGE_SPACING, MERGE_PROBES * MERGE_SPACING);
export const MERGE_CELL = 16;

/**
 * What the level above holds, everywhere: mid grey, so a merge that keeps all
 * of it reads back as itself and one that keeps a fraction reads as that
 * fraction.
 */
export const COARSE_LEVEL = 128;

/** The probe every case reads, and the four coarser probes it merges from. */
const PROBE = [3, 3] as const;
/** 45 degrees, which is where the two segments below are placed relative to. */
const DIRECTION = 0;

/**
 * The bilinear weight of the coarser probe up and to the left of probe 3, 3.
 *
 * `place = (3 + 0.5) / 2 - 0.5 = 1.25` on both axes, so the weights are
 * `0.75 * 0.75`, `0.25 * 0.75`, `0.75 * 0.25` and `0.25 * 0.25`. The first is
 * the one the cases leave open.
 */
const NEAREST_WEIGHT = 0.5625;

/**
 * The walls. Probe 3, 3 sits at world 56, 56 and its four walks along 45
 * degrees end at 59.3, 59.3 / 91.3, 59.3 / 59.3, 91.3 / 91.3, 91.3.
 *
 * A wall at x = 70 crosses the second and the fourth, one at y = 70 the third
 * and the fourth, and a short one at x = 58 crosses the first - which is the
 * only one that stays inside the probe's own neighbourhood.
 */
const FAR_WALLS = [70, 40, 70, 100, 40, 70, 100, 70];
const NEAR_WALL = [58, 50, 58, 62];

/** One reading: the merged texel with the level above lit, and with it black. */
export interface MergeCase {
  readonly name: string;
  readonly segments: readonly number[];
  readonly lights: readonly Light[];
  readonly probe: readonly [number, number];
  readonly direction: number;
  /** `lit` is the texel over a lit level above, `dark` the same over a black one. */
  check(lit: number, dark: number): void;
}

const near = (actual: number, expected: number, tolerance = 3): void => {
  expect(Math.abs(actual - expected), `got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tolerance);
};

export const mergeCases = (): readonly MergeCase[] => [
  {
    name: 'with every way open the level above arrives whole',
    segments: [],
    lights: [],
    probe: PROBE,
    direction: DIRECTION,
    check: (lit, dark) => {
      // The four weights sum to one, so a merge that adds them up unweighted
      // by anything else reads back exactly what the level above holds.
      near(lit, COARSE_LEVEL);
      near(dark, 0);
    },
  },
  {
    name: 'with every way blocked none of the level above arrives',
    segments: [...FAR_WALLS, ...NEAR_WALL],
    lights: [],
    probe: PROBE,
    direction: DIRECTION,
    check: (lit, dark) => {
      near(lit, 0);
      near(dark, 0);
    },
  },
  {
    name: 'one open way keeps the weight of its own place, not the whole',
    segments: FAR_WALLS,
    lights: [],
    probe: PROBE,
    direction: DIRECTION,
    check: (lit, dark) => {
      // Renormalising the open weights would read the level above whole here.
      near(lit, COARSE_LEVEL * NEAREST_WEIGHT, 4);
      near(dark, 0);
    },
  },
  {
    name: 'a source this side of the walls survives what the walls stop',
    segments: [...FAR_WALLS, ...NEAR_WALL],
    // Inside every walk's first few units, and in front of the near wall.
    lights: [point(57, 57, 3)],
    probe: PROBE,
    direction: DIRECTION,
    check: (lit, dark) => {
      expect(dark, 'what the probe itself found').toBeGreaterThan(10);
      // Nothing of the level above got past the walls, so lighting it changes
      // nothing about what this probe reports.
      near(lit, dark, 2);
    },
  },
];
