/**
 * What a fragment makes of the probes around it, when the way to each of them
 * is walked.
 *
 * A probe stands up to a spacing away from the fragment that reads it, and
 * between the two there can be a wall. The reconstruction is therefore the
 * same transfer as the merge: what the walk to a probe let through scales that
 * probe's radiance, the weights stay the plain bilinear ones, and a probe that
 * cannot be reached simply contributes nothing.
 *
 * Both cases read one fragment against a finest cascade that holds one
 * constant everywhere, so what comes out can be predicted exactly.
 */

import { expect } from 'vitest';

import { Rectangle } from '#math/Rectangle';

/** The probe grid the cases describe, and the world it covers. */
export const RECEIVER_PROBES = 8;
export const RECEIVER_TILE = 2;
export const RECEIVER_SPACING = 16;
export const RECEIVER_WORLD = new Rectangle(0, 0, RECEIVER_PROBES * RECEIVER_SPACING, RECEIVER_PROBES * RECEIVER_SPACING);
export const RECEIVER_CELL = 16;

/** Side of the square the cases render, so one fragment covers four world units. */
export const RECEIVER_SIZE = 32;

/** What every probe of the finest cascade holds, in every direction. */
export const FINEST_LEVEL = 128;

/** The fragment every case reads, in world units and in fragments. */
export const RECEIVER_AT = 66;
export const RECEIVER_PIXEL = 16;

/**
 * The wall, where a case has one: straight down the world at x = 64, which
 * runs between the probe column at 56 and the one at 72.
 */
const WALL = [64, 0, 64, RECEIVER_WORLD.height];

/**
 * The share of the four probes that lies on the fragment's own side of that
 * wall.
 *
 * The fragment sits at 66, 66, so `place` is 3.625 on both axes and the
 * weights are `0.375 * 0.375`, `0.625 * 0.375`, `0.375 * 0.625` and
 * `0.625 * 0.625`. The two probes at x = 72 are the reachable ones, and their
 * weights add to 0.625.
 */
const REACHABLE_SHARE = 0.625;

export interface ReceiverCase {
  readonly name: string;
  readonly segments: readonly number[];
  check(reading: number): void;
}

const near = (actual: number, expected: number, tolerance = 3): void => {
  expect(Math.abs(actual - expected), `got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tolerance);
};

export const receiverCases = (): readonly ReceiverCase[] => [
  {
    name: 'with every probe reachable the fragment reads what they hold',
    segments: [],
    check: reading => near(reading, FINEST_LEVEL),
  },
  {
    name: 'a probe on the far side of a wall contributes nothing, and its weight goes nowhere else',
    segments: WALL,
    check: reading => {
      // Interpolating without walking reads the whole; handing the blocked
      // weight to the reachable probes would read the whole as well.
      near(reading, FINEST_LEVEL * REACHABLE_SHARE, 4);
    },
  },
];
