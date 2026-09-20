/**
 * The transport contracts, as scenes and expectations both backends run.
 *
 * Each case is the repository's form of one of the reference model's checks:
 * a stretch cannot skip a wall, a split anywhere composes back to the whole,
 * a source is additive and keeps its own colour and cone, and a virtual
 * emitter blocks nothing.
 */

import { expect } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';

import type { Light } from '../../../packages/exojs-lighting/src/lights/Light';
import { LineLight } from '../../../packages/exojs-lighting/src/lights/LineLight';
import { PointLight } from '../../../packages/exojs-lighting/src/lights/PointLight';
import { SpotLight } from '../../../packages/exojs-lighting/src/lights/SpotLight';
import { type MaskSpec, PROBE_REGION } from './_transportProbe';

/** A light placed in world space, since a `Light` takes its position from its node. */
const at = <T extends Light>(light: T, x: number, y: number): T => {
  light.position.set(x, y);

  return light;
};

/** A point light with a source disc of `radius`, reached by the softness scale. */
export const point = (x: number, y: number, radius: number, color = Color.white.clone()): PointLight =>
  at(new PointLight({ radius: radius * 20, softness: 1, color }), x, y);

/** A spot of the same size, aimed along `degrees`. */
export const spot = (x: number, y: number, radius: number, degrees: number, angle: number, color = Color.white.clone()): SpotLight => {
  const light = at(new SpotLight({ radius: radius * 20, softness: 1, angle, coneSoftness: 0, color }), x, y);

  light.rotation = degrees;

  return light;
};

/** A line light whose capsule is `radius` across and `2 * halfLength` long. */
export const line = (x: number, y: number, radius: number, halfLength: number): LineLight =>
  at(new LineLight({ radius: radius * 20, softness: 1, length: halfLength * 2 }), x, y);

/** One traced stretch: where it runs and what the probe should make of it. */
export interface Case {
  readonly name: string;
  /** The grid this scene is indexed into, where the default does not show what the case is about. */
  readonly region?: Rectangle;
  readonly cell?: number;
  /** `(x1, y1, x2, y2)` quadruples. */
  readonly segments: readonly number[];
  /** Rasterised occluders, where the case has any; the walk reads no mask without one. */
  readonly mask?: MaskSpec;
  readonly lights: readonly Light[];
  /** Stretches to trace, as `[ax, ay, bx, by]`. */
  readonly traces: ReadonlyArray<readonly [number, number, number, number]>;
  /** Scale that brings this scene's radiance into the target's range. */
  readonly scale: number;
  /**
   * What the probes must satisfy. `radiance[i]`, `through[i]`, `visited[i]` and
   * `hit[i]` hold the four draws of trace `i`, each as four 8-bit channels.
   *
   * `flatVisited[i]` is the cell count of the same trace walked without the
   * block level, and is collected only where the case brings a mask. That the
   * two walks find the same wall is asserted for every trace by the runners
   * themselves; a case only reads it to say how much cheaper the walk got.
   */
  check(
    radiance: ReadonlyArray<readonly number[]>,
    through: ReadonlyArray<readonly number[]>,
    visited: ReadonlyArray<readonly number[]>,
    hit: ReadonlyArray<readonly number[]>,
    flatVisited: ReadonlyArray<readonly number[]>,
  ): void;
}

/** Two 8-bit readings that must agree within the rounding a byte allows. */
const near = (actual: number, expected: number, tolerance = 3): void => {
  expect(Math.abs(actual - expected), `got ${actual}, expected ${expected}`).toBeLessThanOrEqual(tolerance);
};

const OPEN = 255;
const BLOCKED = 0;

export const transportCases = (): readonly Case[] => [
  {
    name: 'an empty stretch of vacuum carries nothing and blocks nothing',
    segments: [],
    lights: [],
    traces: [[-100, 0, 100, 40]],
    scale: 1,
    check: (radiance, through) => {
      expect(radiance[0]!.slice(0, 3)).toEqual([0, 0, 0]);
      near(through[0]![0]!, OPEN);
    },
  },
  {
    name: 'a wall between two arbitrary samples cannot be stepped over',
    segments: [-40, -200, -40, 200],
    lights: [],
    traces: [
      [-200, 0, 200, 0],
      [0, 0, 200, 0],
    ],
    scale: 1,
    check: (_radiance, through) => {
      near(through[0]![0]!, BLOCKED);
      near(through[1]![0]!, OPEN);
    },
  },
  {
    name: 'a source behind an opaque wall reaches nothing in front of it',
    segments: [0, -200, 0, 200],
    lights: [point(80, 0, 20)],
    traces: [
      [-160, 0, 160, 0],
      [-160, 0, -8, 0],
    ],
    scale: 0.02,
    check: (radiance, through) => {
      expect(radiance[0]!.slice(0, 3)).toEqual([0, 0, 0]);
      near(through[0]![0]!, BLOCKED);
      expect(radiance[1]!.slice(0, 3)).toEqual([0, 0, 0]);
    },
  },
  {
    name: 'a source in front of a wall survives the wall behind it',
    segments: [80, -200, 80, 200],
    lights: [point(0, 0, 20)],
    traces: [
      [-160, 0, 200, 0],
      [-160, 0, 40, 0],
    ],
    scale: 0.02,
    check: (radiance, through) => {
      for (let channel = 0; channel < 3; channel++) {
        near(radiance[0]![channel]!, radiance[1]![channel]!);
      }

      expect(radiance[0]![0]!).toBeGreaterThan(20);
      near(through[0]![0]!, BLOCKED);
    },
  },
  {
    name: 'a split inside a source composes back to the undivided stretch',
    segments: [],
    lights: [point(0, 0, 20)],
    traces: [
      [-120, 0, 120, 0],
      [-120, 0, 4, 0],
      [4, 0, 120, 0],
    ],
    scale: 0.02,
    check: (radiance, through) => {
      for (let channel = 0; channel < 3; channel++) {
        near(radiance[0]![channel]!, radiance[1]![channel]! + (through[1]![0]! / 255) * radiance[2]![channel]!);
      }
    },
  },
  {
    name: 'a wall exactly at a split belongs to the stretch beyond it',
    segments: [0, -200, 0, 200],
    lights: [],
    traces: [
      [-120, 0, 0, 0],
      [0, 0, 120, 0],
      [-120, 0, 120, 0],
    ],
    scale: 1,
    check: (_radiance, through) => {
      near(through[0]![0]!, OPEN);
      near(through[1]![0]!, BLOCKED);
      near(through[2]![0]!, BLOCKED);
    },
  },
  {
    name: 'a source is neither lost nor counted twice across a split beyond it',
    segments: [],
    lights: [point(-40, 0, 20)],
    traces: [
      [-160, 0, 160, 0],
      [-160, 0, -20, 0],
      [-20, 0, 160, 0],
    ],
    scale: 0.02,
    check: (radiance, through) => {
      for (let channel = 0; channel < 3; channel++) {
        near(radiance[0]![channel]!, radiance[1]![channel]! + (through[1]![0]! / 255) * radiance[2]![channel]!);
      }
    },
  },
  {
    name: 'a red point and a blue spot aimed away keep their own colours',
    segments: [],
    lights: [point(0, 0, 20, new Color(255, 0, 0)), spot(0, 0, 20, 0, 15, new Color(0, 0, 255))],
    traces: [[-160, 0, 160, 0]],
    scale: 0.02,
    check: radiance => {
      expect(radiance[0]![0]!).toBeGreaterThan(20);
      near(radiance[0]![2]!, 0);
    },
  },
  {
    name: 'two spots facing almost opposite ways are not averaged into one lobe',
    segments: [],
    lights: [spot(0, 0, 20, 179, 10, new Color(255, 0, 0)), spot(0, 0, 20, -179, 10, new Color(0, 0, 255))],
    traces: [
      [-160, 0, 160, 0],
      [160, 0, -160, 0],
      [0, 160, 0, -160],
    ],
    scale: 0.02,
    check: radiance => {
      // Both spots point within a degree of -x, so only the stretch walked
      // towards +x sees them. An averaged axis would light the other two.
      expect(radiance[0]![0]! + radiance[0]![2]!).toBeGreaterThan(20);
      near(radiance[1]![0]!, 0);
      near(radiance[1]![2]!, 0);
      near(radiance[2]![0]!, 0);
      near(radiance[2]![2]!, 0);
    },
  },
  {
    name: 'sources add, and a virtual emitter blocks nothing',
    segments: [],
    lights: [point(-40, 0, 20), point(40, 0, 20)],
    traces: [[-160, 0, 160, 0]],
    scale: 0.01,
    check: (radiance, through) => {
      expect(radiance[0]![0]!).toBeGreaterThan(20);
      near(through[0]![0]!, OPEN);
    },
  },
  {
    name: 'a capsule counts its caps once',
    segments: [],
    lights: [line(0, 0, 10, 40)],
    traces: [
      [-200, 0, 200, 0],
      [0, -200, 0, 200],
    ],
    scale: 0.05,
    check: radiance => {
      // Along the axis the ray crosses 2 * (halfLength + radius) = 100; across
      // it, 2 * radius = 20. A capsule whose caps were added to the box would
      // read 120 along the axis.
      near(radiance[0]![0]! / Math.max(radiance[1]![0]!, 1), 5, 1);
    },
  },
  {
    name: 'a walk across the whole grid visits one cell per boundary it crosses',
    // 64 cells a side, entered at the corner and left at the far one: the walk
    // changes cell index 63 times along each axis and visits 127 cells. A
    // bound taken from the euclidean diagonal would be 91 and would cut the
    // walk short of the far corner.
    region: new Rectangle(0, 0, 64, 64),
    cell: 1,
    segments: [],
    lights: [],
    traces: [[0.1, 0.2, 63.9, 63.7]],
    scale: 1,
    check: (_radiance, through, visited) => {
      near(visited[0]![0]!, 127, 0);
      near(through[0]![0]!, OPEN);
    },
  },
  {
    name: 'a raster wall is entered where the stretch crosses into its texel, not where it crosses its column',
    // Mask texel (8, 9) covers world x 0..32, y 32..64. The stretch reaches
    // x = 0 at 0.4 of its length, still a row below, and enters the texel at
    // 0.5, where it crosses y = 32. A walk that took the column crossing for
    // the entry would stop at 0.4.
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 9]] },
    segments: [],
    lights: [],
    traces: [[-64, 0, 96, 64]],
    scale: 1,
    check: (_radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 128);
      near(through[0]![0]!, BLOCKED);
    },
  },
  {
    name: 'a raster wall touched only at its corner still blocks',
    // The stretch meets texel (8, 8) - world 0..32 square - at the single
    // point (0, 0) and is in its diagonal neighbours on either side. Letting
    // it through is what opens a seam between two blockers that share nothing
    // but a corner.
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 8]] },
    segments: [],
    lights: [],
    traces: [[-32, 32, 32, -32]],
    scale: 1,
    check: (_radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 128);
      near(through[0]![0]!, BLOCKED);
    },
  },
  {
    name: 'a stretch beginning inside a raster wall carries nothing at all',
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 8]] },
    segments: [],
    lights: [point(60, 16, 20)],
    traces: [
      [0.01, 16, 120, 16],
      [-0.01, 16, -120, 16],
    ],
    scale: 0.02,
    check: (radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 0);
      near(through[0]![0]!, BLOCKED);
      expect(radiance[0]!.slice(0, 3)).toEqual([0, 0, 0]);
      // A quarter of a texel the other way is outside the wall, and the walk
      // that leaves it behind is unobstructed.
      near(hit[1]![0]!, 255);
      near(through[1]![0]!, OPEN);
    },
  },
  {
    name: 'a mask texel below the coverage threshold is not a wall',
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 8]], coverage: 0.4 },
    segments: [],
    lights: [],
    traces: [[-160, 16, 160, 16]],
    scale: 1,
    check: (_radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 255);
      near(through[0]![0]!, OPEN);
    },
  },
  {
    name: 'the earliest wall wins whether it was rasterised or not',
    // A source, then a raster wall at x = 0, then a vector wall at x = 64.
    // What arrives has to be what the stretch up to the raster wall collects,
    // and the stretch has to report stopping there rather than at the segment.
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 8]] },
    segments: [64, -200, 64, 200],
    lights: [point(-100, 16, 20)],
    traces: [
      [-160, 16, 160, 16],
      [-160, 16, -0.5, 16],
    ],
    scale: 0.02,
    check: (radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 128);
      near(through[0]![0]!, BLOCKED);
      expect(radiance[0]![0]!).toBeGreaterThan(20);

      for (let channel = 0; channel < 3; channel++) {
        near(radiance[0]![channel]!, radiance[1]![channel]!);
      }
    },
  },
  {
    name: 'the block level skips what it says is empty',
    // A mask of 64 texels an axis - 8 world units each - with its one blocker
    // nowhere near the stretch. The flat walk reads a texel per 8 world units
    // it crosses; the walk that consults the block level reads a texel per
    // block, and the two have to agree on finding nothing.
    mask: { texels: 64, world: PROBE_REGION, blocked: [[32, 50]] },
    segments: [],
    lights: [],
    traces: [[-252, 4, 252, 4]],
    scale: 1,
    check: (_radiance, through, visited, hit, flatVisited) => {
      near(hit[0]![0]!, 255);
      near(through[0]![0]!, OPEN);
      // The stretch crosses 63 texels and 8 blocks, none of them marked: the
      // blocker sits two blocks off the row, which its one-texel margin does
      // not reach. Both counts also carry the cell walk, the same either way,
      // so the difference is what the block level saved.
      expect(flatVisited[0]![0]! - visited[0]![0]!, 'texels the block level saved').toBeGreaterThan(45);
    },
  },
  {
    name: 'a block holding a blocker the stretch misses is not itself a wall',
    // Mask texel (8, 8) blocks, and the block that holds it spans texels 8..15
    // on both axes. The stretch crosses that block along row 14 and has to
    // come out the other side: a walk that took a marked block for a wall
    // would stop where it entered one.
    mask: { texels: 64, world: PROBE_REGION, blocked: [[8, 8]] },
    segments: [],
    lights: [],
    traces: [[-200, -140, -120, -140]],
    scale: 1,
    check: (_radiance, through, _visited, hit) => {
      near(hit[0]![0]!, 255);
      near(through[0]![0]!, OPEN);
    },
  },
  {
    name: 'a stretch over both kinds of wall and three sources composes out of any three pieces of itself',
    // The one case that puts every part of the operator into the same walk:
    // a source, a rasterised wall, a source behind it, an outline as a second
    // wall, and a third source beyond that. Walked whole and walked in three
    // pieces, from either end, the answer has to be the same - which is what
    // says the two representations settle the earliest hit BEFORE anything is
    // integrated rather than after.
    //
    // World along y = 16: A at -150, the mask texel (8, 8) over x 0..32, B at
    // 60, the outline at x = 100, C at 160. From the left only A arrives, and
    // a walk that let the raster wall through would pick up B as well; from
    // the right only C does, and the outline is what stops it.
    mask: { texels: 16, world: PROBE_REGION, blocked: [[8, 8]] },
    segments: [100, -200, 100, 200],
    lights: [point(-150, 16, 20), point(60, 16, 20), point(160, 16, 20)],
    traces: [
      [-240, 16, 240, 16],
      // Split inside A, and again inside the raster wall: neither boundary is
      // a place the walk may gain or lose anything.
      [-240, 16, -145, 16],
      [-145, 16, 20, 16],
      [20, 16, 240, 16],
      [240, 16, -240, 16],
      // The same from the other side: inside C, then exactly on the outline.
      [240, 16, 165, 16],
      [165, 16, 100, 16],
      [100, 16, -240, 16],
    ],
    scale: 0.01,
    check: (radiance, through) => {
      for (const [whole, first, second, third] of [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ]) {
        const nearThrough = through[first!]![0]! / 255;
        const middleThrough = through[second!]![0]! / 255;

        for (let channel = 0; channel < 3; channel++) {
          const composed = radiance[first!]![channel]! + nearThrough * (radiance[second!]![channel]! + middleThrough * radiance[third!]![channel]!);

          near(radiance[whole!]![channel]!, composed, 4);
        }

        // What got through the whole is what got through the pieces, and both
        // walls are opaque, so nothing does.
        near(through[whole!]![0]!, nearThrough * middleThrough * through[third!]![0]!, 1);
      }

      // One source arrives from either side: the walls take the rest.
      expect(radiance[0]![0]!).toBeGreaterThan(20);
      expect(radiance[4]![0]!).toBeGreaterThan(20);
      near(through[0]![0]!, BLOCKED);
      near(through[4]![0]!, BLOCKED);
    },
  },
  {
    name: 'the merge stretch is traced where it actually runs, not along its projection',
    segments: [80, 20, 80, 120],
    lights: [],
    traces: [
      [0, 0, 160, 0],
      [0, 0, 160, 80],
    ],
    scale: 1,
    check: (_radiance, through) => {
      near(through[0]![0]!, OPEN);
      near(through[1]![0]!, BLOCKED);
    },
  },
];
