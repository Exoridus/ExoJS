import { Circle } from '#math/Circle';
import { getCollisionCircleCircle, intersectionCirclePoly, intersectionPolyPoly } from '#math/collision-detection';
import { ObservableVector } from '#math/ObservableVector';
import { PolarVector } from '#math/PolarVector';
import { Polygon } from '#math/Polygon';
import { Vector } from '#math/Vector';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import { layoutText } from '#rendering/text/TextLayout';
import { TextStyle } from '#rendering/text/TextStyle';

/**
 * Regression tests for the engine fixes back-ported into the 0.15.1 hotfix
 * release. Each describe block pins one fix; the full suites covering these
 * areas live on main (v0.16 line).
 */

const square = (x: number, y: number, size: number): Polygon =>
  new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

describe('0.15.1 regression: intersectionCirclePoly frame transform', () => {
  test('a circle centred well inside the polygon intersects', () => {
    expect(intersectionCirclePoly(new Circle(5, 5, 1), square(0, 0, 10))).toBe(true);
  });

  test('a circle clearly overlapping the top edge intersects', () => {
    expect(intersectionCirclePoly(new Circle(5, -0.5, 1), square(0, 0, 10))).toBe(true);
  });

  test('a circle clearly overlapping the (10,10) vertex intersects', () => {
    expect(intersectionCirclePoly(new Circle(11, 11, 2), square(0, 0, 10))).toBe(true);
  });

  test('a circle short of a flat edge still does not intersect', () => {
    expect(intersectionCirclePoly(new Circle(5, -5, 1), square(0, 0, 10))).toBe(false);
  });
});

describe('0.15.1 regression: getCollisionCircleCircle projectionV magnitude', () => {
  test('projectionV is projectionN scaled by overlap', () => {
    const response = getCollisionCircleCircle(new Circle(0, 0, 5), new Circle(8, 0, 5));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(2);
    expect(response!.projectionV.x).toBeCloseTo(2);
    expect(response!.projectionV.y).toBeCloseTo(0);
  });
});

describe('0.15.1 regression: positioned polygons honour their x/y offset', () => {
  test('project() offsets by the polygon position', () => {
    const polygon = square(0, 0, 10);
    polygon.setPosition(100, 50);

    const onX = polygon.project(new Vector(1, 0));
    expect(onX.min).toBe(100);
    expect(onX.max).toBe(110);
  });

  test('the SAT path sees the polygon at its world position', () => {
    const positioned = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 500, 500);

    expect(intersectionPolyPoly(square(0, 0, 10), positioned)).toBe(false);
    expect(intersectionPolyPoly(square(495, 495, 10), positioned)).toBe(true);
  });

  test('contains() sees the polygon at its world position', () => {
    const positioned = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 100, 100);

    expect(positioned.contains(105, 105)).toBe(true);
    expect(positioned.contains(5, 5)).toBe(false);
  });
});

describe('0.15.1 regression: vector angle convention and ObservableVector accessors', () => {
  test('angle getter measures from the positive X-axis, matching the setter', () => {
    const v = new Vector(0, 5);

    expect(v.angle).toBeCloseTo(Math.PI / 2);

    v.angle = 0;

    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
  });

  test('length setter preserves direction', () => {
    const v = new Vector(3, 4);

    v.length = 10;

    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
  });

  test('PolarVector.fromVector().toVector() round-trips', () => {
    const roundTripped = PolarVector.fromVector(new Vector(3, 4)).toVector();

    expect(roundTripped.x).toBeCloseTo(3);
    expect(roundTripped.y).toBeCloseTo(4);
  });

  test('ObservableVector exposes working angle/length getters', () => {
    const v = new ObservableVector(null, 0, 3, 4);

    expect(v.length).toBe(5);
    expect(v.angle).toBeCloseTo(Math.atan2(4, 3));

    v.length = 10;

    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
  });
});

describe('0.15.1 regression: TextLayout justify with a monospace atlas', () => {
  test('word gaps stretch even when every glyph shares the space advance', () => {
    const advance = 10;
    const infoBase = {
      x: 0,
      y: 0,
      width: 8,
      height: 16,
      advance,
      ascent: 13,
      page: 0,
      uvLeft: 0,
      uvTop: 0,
      uvRight: 0.1,
      uvBottom: 0.02,
    };
    const atlas = {
      getGlyph: () => infoBase,
      pages: [{ texture: { width: 1024, height: 1024 } }],
    } as unknown as GlyphAtlas;
    const style = new TextStyle({ fontSize: 16, align: 'justify' });

    // "A B" (30px) wraps before "CCCCC" (50px, widest line) → line 0 has
    // 20px of slack across its single inter-word gap.
    const placements = layoutText('A B CCCCC', style, { maxWidth: 30 }, atlas);
    const lineYs = [...new Set(placements.map(p => p.y))];
    const firstLine = placements.filter(p => p.y === lineYs[0]);

    expect(firstLine).toHaveLength(3);
    expect(firstLine[0]!.x).toBe(0);
    expect(firstLine.at(-1)!.x).toBe(40); // 20 natural + 20 stretch
  });
});
