import { Circle } from '#math/Circle';
import {
  getCollisionCircleCircle,
  getCollisionCircleRectangle,
  getCollisionEllipseCircle,
  getCollisionEllipseEllipse,
  getCollisionEllipseRectangle,
  getCollisionPolygonCircle,
  getCollisionRectangleRectangle,
  getCollisionSat,
  intersectionCircleCircle,
  intersectionCircleEllipse,
  intersectionCirclePoly,
  intersectionEllipseEllipse,
  intersectionEllipsePoly,
  intersectionLineCircle,
  intersectionLineEllipse,
  intersectionLineLine,
  intersectionLinePoly,
  intersectionLineRect,
  intersectionPointCircle,
  intersectionPointEllipse,
  intersectionPointLine,
  intersectionPointPoint,
  intersectionPointPoly,
  intersectionPointRect,
  intersectionPolyPoly,
  intersectionRectCircle,
  intersectionRectEllipse,
  intersectionRectPoly,
  intersectionRectRect,
  intersectionSat,
} from '#math/collision-detection';
import { Ellipse } from '#math/Ellipse';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number): Rectangle => new Rectangle(x, y, w, h);
const circle = (x: number, y: number, radius: number): Circle => new Circle(x, y, radius);
const ellipse = (x: number, y: number, rx: number, ry: number): Ellipse => new Ellipse(x, y, rx, ry);
const line = (x1: number, y1: number, x2: number, y2: number): Line => new Line(x1, y1, x2, y2);
// `square()` bakes its (x, y) directly into the point coordinates and leaves
// the Polygon position at the (0, 0) default; positioned-polygon behaviour
// (x/y offset honoured by project()/the SAT paths) has dedicated tests.
const square = (x: number, y: number, size: number): Polygon =>
  new Polygon([new Vector(x, y), new Vector(x + size, y), new Vector(x + size, y + size), new Vector(x, y + size)]);

// ---------------------------------------------------------------------------
// intersectionPointPoint
// ---------------------------------------------------------------------------

describe('intersectionPointPoint', () => {
  test('identical points intersect with zero threshold', () => {
    expect(intersectionPointPoint({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(true);
  });

  test('different points do not intersect with zero threshold', () => {
    expect(intersectionPointPoint({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });

  test('a threshold expands the hit radius', () => {
    expect(intersectionPointPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointLine
// ---------------------------------------------------------------------------

describe('intersectionPointLine', () => {
  test('point exactly on the segment intersects', () => {
    const l = line(0, 0, 10, 0);

    expect(intersectionPointLine({ x: 5, y: 0 }, l)).toBe(true);
  });

  test('point off the segment (beyond threshold) does not intersect', () => {
    const l = line(0, 0, 10, 0);

    expect(intersectionPointLine({ x: 5, y: 5 }, l)).toBe(false);
  });

  test('point past the segment endpoint does not intersect', () => {
    const l = line(0, 0, 10, 0);

    expect(intersectionPointLine({ x: 20, y: 0 }, l)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointRect
// ---------------------------------------------------------------------------

describe('intersectionPointRect', () => {
  test('point inside the rectangle intersects', () => {
    expect(intersectionPointRect({ x: 5, y: 5 }, rect(0, 0, 10, 10))).toBe(true);
  });

  test('point outside the rectangle does not intersect', () => {
    expect(intersectionPointRect({ x: 50, y: 50 }, rect(0, 0, 10, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointCircle
// ---------------------------------------------------------------------------

describe('intersectionPointCircle', () => {
  test('point inside the circle intersects', () => {
    expect(intersectionPointCircle({ x: 1, y: 0 }, circle(0, 0, 5))).toBe(true);
  });

  test('point outside the circle does not intersect', () => {
    expect(intersectionPointCircle({ x: 100, y: 0 }, circle(0, 0, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointEllipse
// ---------------------------------------------------------------------------

describe('intersectionPointEllipse', () => {
  test('point inside the ellipse intersects', () => {
    expect(intersectionPointEllipse({ x: 0, y: 0 }, ellipse(0, 0, 10, 5))).toBe(true);
  });

  test('point outside the ellipse does not intersect', () => {
    expect(intersectionPointEllipse({ x: 100, y: 100 }, ellipse(0, 0, 10, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointPoly
// ---------------------------------------------------------------------------

describe('intersectionPointPoly', () => {
  test('point inside the polygon intersects', () => {
    expect(intersectionPointPoly({ x: 5, y: 5 }, square(0, 0, 10))).toBe(true);
  });

  test('point outside the polygon does not intersect', () => {
    expect(intersectionPointPoly({ x: 50, y: 50 }, square(0, 0, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionLineLine
// ---------------------------------------------------------------------------

describe('intersectionLineLine', () => {
  test('crossing segments intersect', () => {
    expect(intersectionLineLine(line(0, 0, 10, 10), line(0, 10, 10, 0))).toBe(true);
  });

  test('parallel segments do not intersect', () => {
    expect(intersectionLineLine(line(0, 0, 10, 0), line(0, 5, 10, 5))).toBe(false);
  });

  test('non-crossing segments do not intersect', () => {
    expect(intersectionLineLine(line(0, 0, 1, 1), line(5, 5, 10, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionLineRect
// ---------------------------------------------------------------------------

describe('intersectionLineRect', () => {
  test('line crossing through the rectangle intersects', () => {
    expect(intersectionLineRect(line(-5, 5, 15, 5), rect(0, 0, 10, 10))).toBe(true);
  });

  test('line entirely outside the rectangle does not intersect', () => {
    expect(intersectionLineRect(line(-50, -50, -40, -40), rect(0, 0, 10, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionLineCircle
// ---------------------------------------------------------------------------

describe('intersectionLineCircle', () => {
  test('line endpoint inside the circle intersects', () => {
    expect(intersectionLineCircle(line(0, 0, 100, 100), circle(0, 0, 5))).toBe(true);
  });

  test('line passing near enough the circle centre intersects', () => {
    expect(intersectionLineCircle(line(-10, 0, 10, 0), circle(0, 0, 5))).toBe(true);
  });

  test('line entirely outside the circle does not intersect', () => {
    expect(intersectionLineCircle(line(-10, 100, 10, 100), circle(0, 0, 5))).toBe(false);
  });

  test('closest point falls outside the segment bounds → no intersection', () => {
    // Segment from (10, 10) to (20, 10) is horizontal; the circle at origin's
    // closest approach along the infinite line is at x=0, which lies outside
    // the segment — so despite the infinite line passing near, the segment doesn't.
    expect(intersectionLineCircle(line(10, 10, 20, 10), circle(0, 0, 5))).toBe(false);
  });

  test('zero-length line (coincident endpoints) outside the circle does not intersect', () => {
    expect(intersectionLineCircle(line(100, 100, 100, 100), circle(0, 0, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionLineEllipse
// ---------------------------------------------------------------------------

describe('intersectionLineEllipse', () => {
  test('degenerate ellipse (rx <= 0) never intersects', () => {
    expect(intersectionLineEllipse(line(-10, 0, 10, 0), ellipse(0, 0, 0, 5))).toBe(false);
  });

  test('degenerate ellipse (ry <= 0) never intersects', () => {
    expect(intersectionLineEllipse(line(-10, 0, 10, 0), ellipse(0, 0, 5, 0))).toBe(false);
  });

  test('line endpoint inside the ellipse intersects (c <= 0 branch)', () => {
    expect(intersectionLineEllipse(line(0, 0, 100, 100), ellipse(0, 0, 10, 5))).toBe(true);
  });

  test('line passing through the ellipse intersects', () => {
    expect(intersectionLineEllipse(line(-20, 0, 20, 0), ellipse(0, 0, 10, 5))).toBe(true);
  });

  test('line entirely outside the ellipse does not intersect', () => {
    expect(intersectionLineEllipse(line(-20, 100, 20, 100), ellipse(0, 0, 10, 5))).toBe(false);
  });

  test('zero-length line outside the ellipse does not intersect (a <= EPSILON branch)', () => {
    expect(intersectionLineEllipse(line(100, 100, 100, 100), ellipse(0, 0, 10, 5))).toBe(false);
  });

  test('line tangent to the ellipse intersects at the touching point', () => {
    // Horizontal line at y=5 is tangent to an ellipse with ry=5 centred at origin.
    expect(intersectionLineEllipse(line(-20, 5, 20, 5), ellipse(0, 0, 10, 5))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intersectionLinePoly
// ---------------------------------------------------------------------------

describe('intersectionLinePoly', () => {
  test('line crossing an edge of the polygon intersects', () => {
    expect(intersectionLinePoly(line(-5, 5, 15, 5), square(0, 0, 10))).toBe(true);
  });

  test('line entirely outside the polygon does not intersect', () => {
    expect(intersectionLinePoly(line(-50, -50, -40, -40), square(0, 0, 10))).toBe(false);
  });

  test('offset polygon (world position) is respected', () => {
    const poly = square(100, 100, 10);

    expect(intersectionLinePoly(line(95, 105, 115, 105), poly)).toBe(true);
    expect(intersectionLinePoly(line(-5, 5, 15, 5), poly)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionRectRect
// ---------------------------------------------------------------------------

describe('intersectionRectRect', () => {
  test('overlapping rectangles intersect', () => {
    expect(intersectionRectRect(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
  });

  test('touching rectangles (shared edge) intersect', () => {
    expect(intersectionRectRect(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(true);
  });

  test('disjoint rectangles do not intersect', () => {
    expect(intersectionRectRect(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionRectCircle
// ---------------------------------------------------------------------------

describe('intersectionRectCircle', () => {
  test('circle overlapping the rectangle intersects', () => {
    expect(intersectionRectCircle(rect(0, 0, 10, 10), circle(15, 5, 6))).toBe(true);
  });

  test('circle exactly touching the rectangle boundary intersects', () => {
    expect(intersectionRectCircle(rect(0, 0, 10, 10), circle(20, 5, 10))).toBe(true);
  });

  test('circle far from the rectangle does not intersect', () => {
    expect(intersectionRectCircle(rect(0, 0, 10, 10), circle(100, 100, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionRectEllipse
// ---------------------------------------------------------------------------

describe('intersectionRectEllipse', () => {
  test('ellipse overlapping the rectangle intersects', () => {
    expect(intersectionRectEllipse(rect(0, 0, 10, 10), ellipse(5, 5, 3, 3))).toBe(true);
  });

  test('ellipse far from the rectangle does not intersect', () => {
    expect(intersectionRectEllipse(rect(0, 0, 10, 10), ellipse(1000, 1000, 3, 3))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionRectPoly
// ---------------------------------------------------------------------------

describe('intersectionRectPoly', () => {
  test('overlapping rectangle and polygon intersect', () => {
    expect(intersectionRectPoly(rect(0, 0, 10, 10), square(5, 5, 10))).toBe(true);
  });

  test('separated rectangle and polygon do not intersect', () => {
    expect(intersectionRectPoly(rect(0, 0, 10, 10), square(500, 500, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionCircleCircle
// ---------------------------------------------------------------------------

describe('intersectionCircleCircle', () => {
  test('overlapping circles intersect', () => {
    expect(intersectionCircleCircle(circle(0, 0, 5), circle(6, 0, 5))).toBe(true);
  });

  test('circles exactly touching (distance === sum of radii) intersect', () => {
    expect(intersectionCircleCircle(circle(0, 0, 5), circle(10, 0, 5))).toBe(true);
  });

  test('circles far apart do not intersect', () => {
    expect(intersectionCircleCircle(circle(0, 0, 5), circle(100, 0, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionCircleEllipse
// ---------------------------------------------------------------------------

describe('intersectionCircleEllipse', () => {
  test('overlapping circle and ellipse intersect', () => {
    expect(intersectionCircleEllipse(circle(0, 0, 5), ellipse(6, 0, 5, 3))).toBe(true);
  });

  test('circle and ellipse far apart do not intersect', () => {
    expect(intersectionCircleEllipse(circle(0, 0, 5), ellipse(1000, 1000, 5, 3))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionCirclePoly
// ---------------------------------------------------------------------------

describe('intersectionCirclePoly', () => {
  test('circle far away from the polygon does not intersect', () => {
    expect(intersectionCirclePoly(circle(500, 500, 1), square(0, 0, 10))).toBe(false);
  });

  test('circle short of a flat edge does not intersect', () => {
    expect(intersectionCirclePoly(circle(5, -5, 1), square(0, 0, 10))).toBe(false);
  });

  test('circle short of a convex vertex does not intersect', () => {
    // Distance from (11, 11) to the corner (10, 10) is sqrt(2) ≈ 1.41 > 1.
    expect(intersectionCirclePoly(circle(11, 11, 1), square(0, 0, 10))).toBe(false);
  });

  test('circle centred on the (0,0) vertex intersects', () => {
    expect(intersectionCirclePoly(circle(0, 0, 1), square(0, 0, 10))).toBe(true);
  });

  test('circle overlapping through the edge adjacent to (0,0) (x=0 side) intersects', () => {
    expect(intersectionCirclePoly(circle(-5, 5, 10), square(0, 0, 10))).toBe(true);
  });

  test('a circle large enough to engulf the whole polygon intersects', () => {
    expect(intersectionCirclePoly(circle(5, 5, 1000), square(0, 0, 10))).toBe(true);
  });

  test('a circle centred well inside the polygon intersects', () => {
    expect(intersectionCirclePoly(circle(5, 5, 1), square(0, 0, 10))).toBe(true);
  });

  test('a circle clearly overlapping the top edge intersects', () => {
    expect(intersectionCirclePoly(circle(5, -0.5, 1), square(0, 0, 10))).toBe(true);
  });

  test('a circle clearly overlapping the (10,10) vertex intersects', () => {
    // Distance from (11, 11) to the corner (10, 10) is sqrt(2) ≈ 1.41 < 2.
    expect(intersectionCirclePoly(circle(11, 11, 2), square(0, 0, 10))).toBe(true);
  });

  test('a polygon positioned via its x/y offset is honoured', () => {
    // Local unit square at position (100, 100) → world square [100..110]².
    const positioned = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 100, 100);

    expect(intersectionCirclePoly(circle(105, 105, 1), positioned)).toBe(true);
    expect(intersectionCirclePoly(circle(5, 5, 1), positioned)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionEllipseEllipse
// ---------------------------------------------------------------------------

describe('intersectionEllipseEllipse', () => {
  test('overlapping ellipses intersect', () => {
    expect(intersectionEllipseEllipse(ellipse(0, 0, 10, 5), ellipse(8, 0, 10, 5))).toBe(true);
  });

  test('ellipses far apart do not intersect', () => {
    expect(intersectionEllipseEllipse(ellipse(0, 0, 10, 5), ellipse(1000, 1000, 10, 5))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionEllipsePoly
// ---------------------------------------------------------------------------

describe('intersectionEllipsePoly', () => {
  test('ellipse overlapping the polygon intersects', () => {
    expect(intersectionEllipsePoly(ellipse(5, 5, 3, 3), square(0, 0, 10))).toBe(true);
  });

  test('ellipse far from the polygon does not intersect', () => {
    expect(intersectionEllipsePoly(ellipse(1000, 1000, 3, 3), square(0, 0, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPolyPoly
// ---------------------------------------------------------------------------

describe('intersectionPolyPoly', () => {
  test('overlapping polygons intersect', () => {
    expect(intersectionPolyPoly(square(0, 0, 10), square(5, 5, 10))).toBe(true);
  });

  test('separated polygons do not intersect', () => {
    expect(intersectionPolyPoly(square(0, 0, 10), square(500, 500, 10))).toBe(false);
  });

  test('a polygon positioned via its x/y offset is honoured by the SAT path', () => {
    // Local unit square at position (500, 500) → world square [500..510]².
    const positioned = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)], 500, 500);

    expect(intersectionPolyPoly(square(0, 0, 10), positioned)).toBe(false);
    expect(intersectionPolyPoly(square(495, 495, 10), positioned)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intersectionSat
// ---------------------------------------------------------------------------

describe('intersectionSat', () => {
  test('overlapping shapes intersect on all axes', () => {
    expect(intersectionSat(square(0, 0, 10), square(5, 5, 10))).toBe(true);
  });

  test('a single separating axis is enough to report no intersection', () => {
    expect(intersectionSat(square(0, 0, 10), square(500, 0, 10))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCollisionRectangleRectangle
// ---------------------------------------------------------------------------

describe('getCollisionRectangleRectangle', () => {
  test('disjoint rectangles return null', () => {
    expect(getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(50, 50, 10, 10))).toBeNull();
  });

  test('rectangles exactly touching at an edge return an overlap of 0', () => {
    const response = getCollisionRectangleRectangle(rect(0, 0, 10, 10), rect(10, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBe(0);
  });

  test('overlapping rectangles pick the axis with the smaller penetration as the MTV', () => {
    // rectA [0..10]x[0..10], rectB [8..18]x[0..10] → overlapX=2, overlapY=10.
    const rectA = rect(0, 0, 10, 10);
    const rectB = rect(8, 0, 10, 10);
    const response = getCollisionRectangleRectangle(rectA, rectB);

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(2);
    expect(response!.projectionN.x).toBeCloseTo(1); // rectB is to the right of rectA's centre
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.projectionV.x).toBeCloseTo(2);
  });

  test('a big rectangle fully containing a small one reports containment flags', () => {
    const big = rect(0, 0, 100, 100);
    const small = rect(10, 10, 20, 20);
    const response = getCollisionRectangleRectangle(big, small);

    expect(response).not.toBeNull();
    expect(response!.shapeBinA).toBe(true); // small (B) is inside big (A)
    expect(response!.shapeAinB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCollisionCircleCircle
// ---------------------------------------------------------------------------

describe('getCollisionCircleCircle', () => {
  test('disjoint circles return null', () => {
    expect(getCollisionCircleCircle(circle(0, 0, 5), circle(100, 0, 5))).toBeNull();
  });

  test('circles exactly touching return overlap 0', () => {
    const response = getCollisionCircleCircle(circle(0, 0, 5), circle(10, 0, 5));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(0);
  });

  test('overlapping circles compute the correct overlap and unit normal', () => {
    const response = getCollisionCircleCircle(circle(0, 0, 5), circle(8, 0, 5));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(2);
    expect(response!.projectionN.x).toBeCloseTo(1);
    expect(response!.projectionN.y).toBeCloseTo(0);
  });

  test('projectionV is projectionN scaled by overlap, like every other getCollision*', () => {
    const response = getCollisionCircleCircle(circle(0, 0, 5), circle(8, 0, 5));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(2);
    expect(response!.projectionV.x).toBeCloseTo(2);
    expect(response!.projectionV.y).toBeCloseTo(0);
  });

  test('a small circle inside a big one reports shapeAinB', () => {
    const small = circle(1, 0, 2);
    const big = circle(0, 0, 10);
    const response = getCollisionCircleCircle(small, big);

    expect(response).not.toBeNull();
    expect(response!.shapeAinB).toBe(true);
    expect(response!.shapeBinA).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCollisionCircleRectangle
// ---------------------------------------------------------------------------

describe('getCollisionCircleRectangle', () => {
  test('disjoint circle and rectangle return null', () => {
    expect(getCollisionCircleRectangle(circle(1000, 1000, 5), rect(0, 0, 10, 10))).toBeNull();
  });

  test('circle overlapping the rectangle face-on computes the correct normal', () => {
    // Circle centred to the right of the rectangle, overlapping its right face.
    const response = getCollisionCircleRectangle(circle(13, 5, 5), rect(0, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(1);
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.overlap).toBeCloseTo(2);
  });

  test('circle centre exactly inside the rectangle picks the nearest exit axis', () => {
    // Interior point (3, 5) of rect [0..10]x[0..10]: exitLeft=3 is the smallest exit.
    const response = getCollisionCircleRectangle(circle(3, 5, 1), rect(0, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(-1);
    expect(response!.projectionN.y).toBeCloseTo(0);
  });

  test('swap=true swaps shapeA/shapeB and flips the normal', () => {
    const c = circle(13, 5, 5);
    const r = rect(0, 0, 10, 10);
    const unswapped = getCollisionCircleRectangle(c, r, false);
    const swapped = getCollisionCircleRectangle(c, r, true);

    expect(unswapped).not.toBeNull();
    expect(swapped).not.toBeNull();
    expect(swapped!.shapeA).toBe(unswapped!.shapeB);
    expect(swapped!.shapeB).toBe(unswapped!.shapeA);
    expect(swapped!.projectionN.x).toBeCloseTo(-unswapped!.projectionN.x);
    expect(swapped!.projectionN.y).toBeCloseTo(-unswapped!.projectionN.y);
  });

  test('a zero-radius circle exactly on the rectangle boundary still registers a hit', () => {
    const response = getCollisionCircleRectangle(circle(10, 5, 0), rect(0, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// getCollisionEllipseRectangle
// ---------------------------------------------------------------------------

describe('getCollisionEllipseRectangle', () => {
  test('disjoint ellipse and rectangle return null', () => {
    expect(getCollisionEllipseRectangle(ellipse(1000, 1000, 3, 3), rect(0, 0, 10, 10))).toBeNull();
  });

  test('ellipse overlapping the rectangle from outside computes overlap and normal', () => {
    // Ellipse centre 1 unit left of the rect, rx=3 → penetrates by 2.
    const response = getCollisionEllipseRectangle(ellipse(-1, 5, 3, 3), rect(0, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(-1);
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.overlap).toBeCloseTo(2);
  });

  test('ellipse centre exactly inside the rectangle picks the nearest exit axis', () => {
    const response = getCollisionEllipseRectangle(ellipse(3, 5, 2, 2), rect(0, 0, 10, 10));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(-1);
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.overlap).toBeCloseTo(5); // minExitX (3) + ellipse.rx (2)
  });

  test('swap=true swaps shapeA/shapeB and flips the normal', () => {
    const e = ellipse(-1, 5, 3, 3);
    const r = rect(0, 0, 10, 10);
    const unswapped = getCollisionEllipseRectangle(e, r, false);
    const swapped = getCollisionEllipseRectangle(e, r, true);

    expect(unswapped).not.toBeNull();
    expect(swapped).not.toBeNull();
    expect(swapped!.shapeA).toBe(unswapped!.shapeB);
    expect(swapped!.shapeB).toBe(unswapped!.shapeA);
    expect(swapped!.projectionN.x).toBeCloseTo(-unswapped!.projectionN.x);
  });
});

// ---------------------------------------------------------------------------
// getCollisionEllipseCircle
// ---------------------------------------------------------------------------

describe('getCollisionEllipseCircle', () => {
  test('disjoint ellipse and circle return null', () => {
    expect(getCollisionEllipseCircle(ellipse(0, 0, 5, 3), circle(1000, 0, 2))).toBeNull();
  });

  test('overlapping ellipse and circle compute a positive overlap along the connecting axis', () => {
    const response = getCollisionEllipseCircle(ellipse(0, 0, 5, 3), circle(6, 0, 2));

    expect(response).not.toBeNull();
    // normal points from the circle toward the ellipse, i.e. in -X here.
    expect(response!.projectionN.x).toBeCloseTo(-1);
    expect(response!.overlap).toBeCloseTo(1); // ellipseBoundary(5) + circleRadius(2) - distance(6)
  });

  test('coincident centres with rx > ry push along the Y axis using ry', () => {
    const response = getCollisionEllipseCircle(ellipse(0, 0, 5, 3), circle(0, 0, 1));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(0);
    expect(response!.projectionN.y).toBeCloseTo(1);
    expect(response!.overlap).toBeCloseTo(4); // ellipse.ry(3) + circle.radius(1)
  });

  test('coincident centres with rx <= ry push along the X axis using rx', () => {
    const response = getCollisionEllipseCircle(ellipse(0, 0, 2, 5), circle(0, 0, 1));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(1);
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.overlap).toBeCloseTo(3); // ellipse.rx(2) + circle.radius(1)
  });

  test('swap=true swaps shapeA/shapeB and flips the normal', () => {
    const e = ellipse(0, 0, 5, 3);
    const c = circle(6, 0, 2);
    const unswapped = getCollisionEllipseCircle(e, c, false);
    const swapped = getCollisionEllipseCircle(e, c, true);

    expect(unswapped).not.toBeNull();
    expect(swapped).not.toBeNull();
    expect(swapped!.shapeA).toBe(unswapped!.shapeB);
    expect(swapped!.shapeB).toBe(unswapped!.shapeA);
    expect(swapped!.projectionN.x).toBeCloseTo(-unswapped!.projectionN.x);
  });
});

// ---------------------------------------------------------------------------
// getCollisionPolygonCircle
// ---------------------------------------------------------------------------

describe('getCollisionPolygonCircle', () => {
  test('disjoint polygon and circle return null', () => {
    expect(getCollisionPolygonCircle(square(0, 0, 10), circle(1000, 1000, 1))).toBeNull();
  });

  test('circle overlapping a flat edge computes a response', () => {
    const response = getCollisionPolygonCircle(square(0, 0, 10), circle(5, -0.5, 1));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeGreaterThan(0);
  });

  test('a tiny circle deep inside a huge polygon reports full containment (shapeBinA)', () => {
    const big = square(-1000, -1000, 2000);
    const tiny = circle(0, 0, 1);
    const response = getCollisionPolygonCircle(big, tiny);

    expect(response).not.toBeNull();
    expect(response!.shapeBinA).toBe(true); // circle (B) fully inside the polygon (A)
  });

  test('a huge circle enclosing a small polygon reports shapeAinB', () => {
    const small = square(-1, -1, 2);
    const huge = circle(0, 0, 1000);
    const response = getCollisionPolygonCircle(small, huge);

    expect(response).not.toBeNull();
    expect(response!.shapeAinB).toBe(true); // polygon (A) fully inside the circle (B)
  });

  test('swap=true swaps shapeA/shapeB', () => {
    const poly = square(0, 0, 10);
    const c = circle(5, -0.5, 1);
    const unswapped = getCollisionPolygonCircle(poly, c, false);
    const swapped = getCollisionPolygonCircle(poly, c, true);

    expect(unswapped).not.toBeNull();
    expect(swapped).not.toBeNull();
    expect(swapped!.shapeA).toBe(unswapped!.shapeB);
    expect(swapped!.shapeB).toBe(unswapped!.shapeA);
  });
});

// ---------------------------------------------------------------------------
// getCollisionEllipseEllipse
// ---------------------------------------------------------------------------

describe('getCollisionEllipseEllipse', () => {
  test('disjoint ellipses return null', () => {
    expect(getCollisionEllipseEllipse(ellipse(0, 0, 5, 3), ellipse(1000, 1000, 5, 3))).toBeNull();
  });

  test('overlapping ellipses along the centre axis compute a positive overlap', () => {
    const response = getCollisionEllipseEllipse(ellipse(0, 0, 5, 3), ellipse(8, 0, 5, 3));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeGreaterThan(0);
    expect(response!.projectionN.x).toBeCloseTo(-1);
  });

  test('coincident centres with rx > ry push along Y using the smaller axis', () => {
    const response = getCollisionEllipseEllipse(ellipse(0, 0, 5, 3), ellipse(0, 0, 4, 2));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(0);
    expect(response!.projectionN.y).toBeCloseTo(1);
    expect(response!.overlap).toBeCloseTo(3 + 2); // ellipseA.ry(3) + ellipseB.ry(2)
  });

  test('coincident centres with rx <= ry push along X using the smaller axis', () => {
    const response = getCollisionEllipseEllipse(ellipse(0, 0, 2, 5), ellipse(0, 0, 3, 4));

    expect(response).not.toBeNull();
    expect(response!.projectionN.x).toBeCloseTo(1);
    expect(response!.projectionN.y).toBeCloseTo(0);
    expect(response!.overlap).toBeCloseTo(2 + 3); // ellipseA.rx(2) + ellipseB.rx(3)
  });
});

// ---------------------------------------------------------------------------
// getCollisionSat
// ---------------------------------------------------------------------------

describe('getCollisionSat', () => {
  test('disjoint polygons return null', () => {
    expect(getCollisionSat(square(0, 0, 10), square(500, 0, 10))).toBeNull();
  });

  test('overlapping polygons compute a positive overlap and a valid unit normal', () => {
    const response = getCollisionSat(square(0, 0, 10), square(5, 0, 10));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeGreaterThan(0);

    const normalLength = Math.sqrt(response!.projectionN.x ** 2 + response!.projectionN.y ** 2);

    expect(normalLength).toBeCloseTo(1);
  });

  test('a small square fully inside a big one reports containment on both interpretations', () => {
    const big = square(0, 0, 100);
    const small = square(10, 10, 20);
    const response = getCollisionSat(big, small);

    expect(response).not.toBeNull();
    expect(response!.shapeBinA).toBe(true); // small (B) is inside big (A)
    expect(response!.shapeAinB).toBe(false);
  });

  test('works across shape types (rectangle vs polygon)', () => {
    const response = getCollisionSat(rect(0, 0, 10, 10), square(5, 5, 10));

    expect(response).not.toBeNull();
    expect(response!.overlap).toBeGreaterThan(0);
  });
});
