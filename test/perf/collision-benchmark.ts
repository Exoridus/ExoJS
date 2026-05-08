/**
 * Collision benchmark — math / collision-detection CPU cost.
 *
 * All computations are pure CPU — no rendering, no audio.
 * Scenarios cover SAT polygon pairs, circle pairs, quadtree build/query,
 * and swept-rectangle queries.
 *
 * Output: test/perf/results/collision.{json,md}
 */

import { Circle } from '../../src/math/Circle';
import { getCollisionSat } from '../../src/math/collision-detection';
import { intersectionCircleCircle } from '../../src/math/collision-detection';
import { Polygon } from '../../src/math/Polygon';
import { Quadtree } from '../../src/math/Quadtree';
import { Rectangle } from '../../src/math/Rectangle';
import { sweepRectangle } from '../../src/math/swept-collision';
import { Vector } from '../../src/math/Vector';
import type { BenchmarkResult } from './harness';
import { runScenario, writeResults } from './harness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a regular N-gon as a Polygon at (cx, cy) with given radius. */
const makeRegularPolygon = (cx: number, cy: number, radius: number, sides: number): Polygon => {
  const points: Vector[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    points.push(new Vector(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return new Polygon(points, cx, cy);
};

const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
};

// ---------------------------------------------------------------------------
// Scenario 1 — SAT polygon vs polygon (1 000 pairs)
// ---------------------------------------------------------------------------

const results: BenchmarkResult[] = [];

{
  const rand = rng(42);
  const PAIRS = 1000;
  const polygons: [Polygon, Polygon][] = [];

  results.push(
    runScenario(
      {
        name: 'sat-polygon-pairs-1k',
        setup() {
          for (let i = 0; i < PAIRS; i++) {
            const ax = rand() * 2000;
            const ay = rand() * 2000;
            const bx = ax + (rand() - 0.5) * 100;
            const by = ay + (rand() - 0.5) * 100;
            const sidesA = 3 + Math.floor(rand() * 6);
            const sidesB = 3 + Math.floor(rand() * 6);
            polygons.push([makeRegularPolygon(ax, ay, 20 + rand() * 30, sidesA), makeRegularPolygon(bx, by, 20 + rand() * 30, sidesB)]);
          }
        },
        tick() {
          for (const [a, b] of polygons) {
            getCollisionSat(a, b);
          }
        },
        teardown() {
          for (const [a, b] of polygons) {
            a.destroy();
            b.destroy();
          }
          polygons.length = 0;
        },
      },
      60,
    ),
  );
}

// ---------------------------------------------------------------------------
// Scenario 2 — Circle vs Circle (10 000 pairs, batched per iteration)
// ---------------------------------------------------------------------------

{
  const rand = rng(99);
  const PAIRS = 10000;
  const circles: [Circle, Circle][] = [];

  results.push(
    runScenario(
      {
        name: 'circle-circle-10k',
        setup() {
          for (let i = 0; i < PAIRS; i++) {
            const ax = rand() * 5000;
            const ay = rand() * 5000;
            const bx = ax + (rand() - 0.5) * 80;
            const by = ay + (rand() - 0.5) * 80;
            circles.push([new Circle(ax, ay, 10 + rand() * 30), new Circle(bx, by, 10 + rand() * 30)]);
          }
        },
        tick() {
          for (const [a, b] of circles) {
            intersectionCircleCircle(a, b);
          }
        },
        teardown() {
          for (const [a, b] of circles) {
            a.destroy();
            b.destroy();
          }
          circles.length = 0;
        },
      },
      30,
    ),
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 — Quadtree build from 1 000 random rectangles
// ---------------------------------------------------------------------------

{
  const rand = rng(7);
  const ITEMS = 1000;
  const bounds = new Rectangle(0, 0, 5000, 5000);
  let items: { bounds: Rectangle; payload: number }[] = [];

  results.push(
    runScenario(
      {
        name: 'quadtree-build-1k',
        setup() {
          for (let i = 0; i < ITEMS; i++) {
            const x = rand() * 4900;
            const y = rand() * 4900;
            items.push({ bounds: new Rectangle(x, y, 20 + rand() * 60, 20 + rand() * 60), payload: i });
          }
        },
        tick() {
          const qt = new Quadtree<number>(new Rectangle(0, 0, 5000, 5000));
          for (const item of items) {
            qt.insert(item);
          }
          qt.destroy();
        },
        teardown() {
          for (const item of items) {
            item.bounds.destroy();
          }
          items = [];
          bounds.destroy();
        },
      },
      120,
    ),
  );
}

// ---------------------------------------------------------------------------
// Scenario 4 — Quadtree queryPoint (1 000-item tree, 10 000 queries)
// ---------------------------------------------------------------------------

{
  const rand = rng(13);
  const ITEMS = 1000;
  const QUERIES = 10000;
  let qt: Quadtree<number> | null = null;
  const queryPoints: [number, number][] = [];

  results.push(
    runScenario(
      {
        name: 'quadtree-query-10k',
        setup() {
          qt = new Quadtree<number>(new Rectangle(0, 0, 5000, 5000));
          for (let i = 0; i < ITEMS; i++) {
            qt.insert({
              bounds: new Rectangle(rand() * 4900, rand() * 4900, 20 + rand() * 60, 20 + rand() * 60),
              payload: i,
            });
          }
          for (let i = 0; i < QUERIES; i++) {
            queryPoints.push([rand() * 5000, rand() * 5000]);
          }
        },
        tick() {
          for (const [x, y] of queryPoints) {
            qt!.queryPoint(x, y);
          }
        },
        teardown() {
          qt!.destroy();
          qt = null;
          queryPoints.length = 0;
        },
      },
      30,
    ),
  );
}

// ---------------------------------------------------------------------------
// Scenario 5 — Swept rectangle vs static rectangles (1 000 queries)
// ---------------------------------------------------------------------------

{
  const rand = rng(31);
  const COUNT = 1000;
  const statics: Rectangle[] = [];
  const movers: { rect: Rectangle; dx: number; dy: number }[] = [];

  results.push(
    runScenario(
      {
        name: 'swept-rect-1k',
        setup() {
          for (let i = 0; i < COUNT; i++) {
            statics.push(new Rectangle(rand() * 4000, rand() * 4000, 40 + rand() * 80, 40 + rand() * 80));
            movers.push({
              rect: new Rectangle(rand() * 4000, rand() * 4000, 30, 30),
              dx: (rand() - 0.5) * 200,
              dy: (rand() - 0.5) * 200,
            });
          }
        },
        tick() {
          for (let i = 0; i < COUNT; i++) {
            const { rect, dx, dy } = movers[i];
            sweepRectangle(rect, dx, dy, statics[i]);
          }
        },
        teardown() {
          for (const r of statics) {
            r.destroy();
          }
          for (const { rect } of movers) {
            rect.destroy();
          }
          statics.length = 0;
          movers.length = 0;
        },
      },
      120,
    ),
  );
}

// ---------------------------------------------------------------------------
// Write results
// ---------------------------------------------------------------------------

console.log('ExoJS collision benchmark (CPU math)');
console.table(results);
writeResults('collision', 'Collision Benchmark', results);
