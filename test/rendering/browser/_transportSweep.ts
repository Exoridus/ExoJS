/**
 * The contract the block level is there to keep: it may say a region is empty,
 * and it may never say a region holds something. Anything else it did would
 * show up as a different wall from the one the flat walk finds.
 *
 * So this is one mask and a long list of stretches, walked twice - once with
 * the block level bound and once without - and the two answers have to agree.
 * The list is deterministic: a generator with a fixed seed for coverage, and
 * named cases for the places a grid walk goes wrong, which are the boundaries
 * and the corners rather than the open middle of a texel.
 */

import { Rectangle } from '#math/Rectangle';

import type { MaskSpec } from './_transportProbe';

/** Texels across the sweep's mask, and the world it covers. */
const TEXELS = 64;
const WORLD = new Rectangle(-256, -256, 512, 512);

/** World units one texel covers, which every named case below is expressed in. */
const TEXEL = WORLD.width / TEXELS;

/** Where the grid's lines are, in world units: `line(8)` is the edge between texels 7 and 8. */
const line = (index: number): number => WORLD.x + index * TEXEL;

/** Middle of a texel, which is the least awkward place a walk can cross one. */
const middle = (index: number): number => line(index) + TEXEL / 2;

/**
 * A small integer generator, so the sweep is the same list on every run and on
 * both backends: a failure names a stretch that can be looked at again.
 */
const rolls = (seed: number): (() => number) => {
  let state = seed;

  return (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state / 2147483648;
  };
};

/**
 * Blockers with the three shapes that catch a grid walk out: a scattered
 * handful, a diagonal run whose texels meet only at their corners, and a
 * checkerboard patch, which is nothing but corners.
 */
export const sweepMask = (): MaskSpec => {
  const blocked: Array<readonly [number, number]> = [];
  const roll = rolls(20260920);

  for (let index = 0; index < 40; index++) {
    const x = Math.floor(roll() * TEXELS);
    const y = Math.floor(roll() * TEXELS);

    // Kept out of the four blocks around texel 48, which the corner pair below
    // has to itself: anything else in them would mark them and hide what that
    // case is about.
    if (x >= 40 && x < 56 && y >= 40 && y < 56) continue;

    blocked.push([x, y]);
  }

  // Two texels meeting only at the corner where four blocks of the coarse
  // level meet, and each lying in a block the stretch below does not enter.
  // Only the margin around a block brings them into view.
  blocked.push([47, 48], [48, 47]);

  for (let step = 0; step < 12; step++) {
    blocked.push([20 + step, 40 + step]);
  }

  for (let y = 8; y < 16; y++) {
    for (let x = 8; x < 16; x++) {
      if ((x + y) % 2 === 0) blocked.push([x, y]);
    }
  }

  return { texels: TEXELS, world: WORLD, blocked };
};

/** The stretches, as `[ax, ay, bx, by]`. */
export const sweepRays = (): ReadonlyArray<readonly [number, number, number, number]> => {
  const rays: Array<readonly [number, number, number, number]> = [
    // Along a grid line, one axis at a time: every step of the walk lands on a
    // boundary of the other axis.
    [line(4), line(12), line(60), line(12)],
    [line(12), line(4), line(12), line(60)],
    // The main diagonals, which cross every texel corner they meet.
    [line(4), line(4), line(60), line(60)],
    [line(60), line(4), line(4), line(60)],
    // Exactly through the corner four blocks of the coarse level share, where
    // the only blockers lie in the two blocks the stretch never enters.
    [line(44), line(44), line(52), line(52)],
    // Through the checkerboard, whose texels share nothing but corners.
    [middle(4), middle(4), middle(20), middle(20)],
    [line(8), line(8), line(16), line(16)],
    // Starting and ending exactly on a corner.
    [line(20), line(20), middle(50), middle(34)],
    [middle(2), middle(6), line(24), line(24)],
    // Shorter than a texel, inside one and across one boundary.
    [middle(30) - 1, middle(30) - 1, middle(30) + 1, middle(30) + 1],
    [line(30) - 0.25, middle(30), line(30) + 0.25, middle(30)],
    // Beginning far outside the mask and crossing the whole of it.
    [WORLD.x - 400, WORLD.y - 120, WORLD.x + WORLD.width + 400, WORLD.y + WORLD.height + 120],
    // Missing it entirely.
    [WORLD.x - 400, WORLD.y - 400, WORLD.x - 300, WORLD.y + 400],
  ];
  const roll = rolls(768);

  for (let index = 0; index < 28; index++) {
    rays.push([WORLD.x + roll() * WORLD.width, WORLD.y + roll() * WORLD.height, WORLD.x + roll() * WORLD.width, WORLD.y + roll() * WORLD.height]);
  }

  return rays;
};
