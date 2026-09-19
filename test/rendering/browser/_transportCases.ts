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

import type { Light } from '../../../packages/exojs-lighting/src/lights/Light';
import { LineLight } from '../../../packages/exojs-lighting/src/lights/LineLight';
import { PointLight } from '../../../packages/exojs-lighting/src/lights/PointLight';
import { SpotLight } from '../../../packages/exojs-lighting/src/lights/SpotLight';

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
  /** `(x1, y1, x2, y2)` quadruples. */
  readonly segments: readonly number[];
  readonly lights: readonly Light[];
  /** Stretches to trace, as `[ax, ay, bx, by]`. */
  readonly traces: ReadonlyArray<readonly [number, number, number, number]>;
  /** Scale that brings this scene's radiance into the target's range. */
  readonly scale: number;
  /**
   * What the probes must satisfy. `radiance[i]` and `through[i]` hold the two
   * draws of trace `i`, each as four 8-bit channels.
   */
  check(radiance: ReadonlyArray<readonly number[]>, through: ReadonlyArray<readonly number[]>): void;
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
