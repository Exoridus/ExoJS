import { bench, describe } from 'vitest';

import { Circle } from '../../src/math/Circle';
import { getCollisionSat, intersectionCircleCircle } from '../../src/math/collision-detection';
import { Polygon } from '../../src/math/Polygon';
import { Quadtree } from '../../src/math/Quadtree';
import { Rectangle } from '../../src/math/Rectangle';
import { sweepRectangle } from '../../src/math/swept-collision';
import { Vector } from '../../src/math/Vector';

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

const makeRegularPolygon = (cx: number, cy: number, radius: number, sides: number): Polygon => {
  const points: Vector[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    points.push(new Vector(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return new Polygon(points, cx, cy);
};

describe('collision', () => {
  bench('SAT polygon pairs (1k pairs, 60 iterations)', () => {
    const rand = rng(42);
    const PAIRS = 1000;
    const ITERATIONS = 60;
    const polygons: [Polygon, Polygon][] = [];

    for (let i = 0; i < PAIRS; i++) {
      const ax = rand() * 2000;
      const ay = rand() * 2000;
      const bx = ax + (rand() - 0.5) * 100;
      const by = ay + (rand() - 0.5) * 100;
      polygons.push([
        makeRegularPolygon(ax, ay, 20 + rand() * 30, 3 + Math.floor(rand() * 6)),
        makeRegularPolygon(bx, by, 20 + rand() * 30, 3 + Math.floor(rand() * 6)),
      ]);
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const [a, b] of polygons) {
        getCollisionSat(a, b);
      }
    }

    for (const [a, b] of polygons) {
      a.destroy();
      b.destroy();
    }
  });

  bench('circle vs circle (10k pairs, 30 iterations)', () => {
    const rand = rng(99);
    const PAIRS = 10000;
    const ITERATIONS = 30;
    const circles: [Circle, Circle][] = [];

    for (let i = 0; i < PAIRS; i++) {
      const ax = rand() * 5000;
      const ay = rand() * 5000;
      circles.push([
        new Circle(ax, ay, 10 + rand() * 30),
        new Circle(ax + (rand() - 0.5) * 80, ay + (rand() - 0.5) * 80, 10 + rand() * 30),
      ]);
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const [a, b] of circles) {
        intersectionCircleCircle(a, b);
      }
    }

    for (const [a, b] of circles) {
      a.destroy();
      b.destroy();
    }
  });

  bench('quadtree build from 1k rectangles (120 iterations)', () => {
    const rand = rng(7);
    const ITEMS = 1000;
    const ITERATIONS = 120;
    const items: { bounds: Rectangle; payload: number }[] = [];

    for (let i = 0; i < ITEMS; i++) {
      items.push({ bounds: new Rectangle(rand() * 4900, rand() * 4900, 20 + rand() * 60, 20 + rand() * 60), payload: i });
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const qt = new Quadtree<number>(new Rectangle(0, 0, 5000, 5000));
      for (const item of items) {
        qt.insert(item);
      }
      qt.destroy();
    }

    for (const item of items) {
      item.bounds.destroy();
    }
  });

  bench('quadtree queryPoint (1k-item tree, 10k queries, 30 iterations)', () => {
    const rand = rng(13);
    const ITEMS = 1000;
    const QUERIES = 10000;
    const ITERATIONS = 30;
    const queryPoints: [number, number][] = [];

    const qt = new Quadtree<number>(new Rectangle(0, 0, 5000, 5000));
    for (let i = 0; i < ITEMS; i++) {
      qt.insert({
        bounds: new Rectangle(rand() * 4900, rand() * 4900, 20 + rand() * 60, 20 + rand() * 60),
        payload: i,
      });
    }
    for (let i = 0; i < QUERIES; i++) {
      queryPoints.push([rand() * 5000, rand() * 5000]);
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (const [x, y] of queryPoints) {
        qt.queryPoint(x, y);
      }
    }

    qt.destroy();
  });

  bench('swept rectangle (1k queries, 120 iterations)', () => {
    const rand = rng(31);
    const COUNT = 1000;
    const ITERATIONS = 120;
    const statics: Rectangle[] = [];
    const movers: { rect: Rectangle; dx: number; dy: number }[] = [];

    for (let i = 0; i < COUNT; i++) {
      statics.push(new Rectangle(rand() * 4000, rand() * 4000, 40 + rand() * 80, 40 + rand() * 80));
      movers.push({ rect: new Rectangle(rand() * 4000, rand() * 4000, 30, 30), dx: (rand() - 0.5) * 200, dy: (rand() - 0.5) * 200 });
    }

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < COUNT; i++) {
        sweepRectangle(movers[i].rect, movers[i].dx, movers[i].dy, statics[i]);
      }
    }

    for (const r of statics) r.destroy();
    for (const { rect } of movers) rect.destroy();
  });
});
