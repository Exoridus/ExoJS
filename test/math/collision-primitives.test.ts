import {
  buildCirclePoints,
  buildEllipsePoints,
  buildPolygonWorldPoints,
  buildRectanglePoints,
  getDotProduct,
  getVectorLength,
  getVectorLengthSquared,
  getVoronoiRegion,
  intersectionLineLineSegments,
  intersectionPointCircle,
  intersectionPointEllipse,
  intersectionPointLineSegment,
  intersectionPointPoint,
  intersectionPointPoly,
  intersectionPointRect,
  intersectionRectRect,
  pointOnSegment,
  polygonContainsPoint,
  polygonsIntersect,
  segmentsIntersect,
} from '#math/collision-primitives';
import { VoronoiRegion } from '#math/utils';

// ---------------------------------------------------------------------------
// buildCirclePoints
// ---------------------------------------------------------------------------

describe('buildCirclePoints', () => {
  test('a zero radius produces an empty point list', () => {
    expect(buildCirclePoints({ x: 0, y: 0, radius: 0 })).toEqual([]);
  });

  test('a negative radius produces an empty point list', () => {
    expect(buildCirclePoints({ x: 0, y: 0, radius: -5 })).toEqual([]);
  });

  test('a positive radius produces points on the circle boundary', () => {
    const points = buildCirclePoints({ x: 0, y: 0, radius: 10 });

    expect(points.length).toBeGreaterThan(0);

    for (const { x, y } of points) {
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(10, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// buildEllipsePoints
// ---------------------------------------------------------------------------

describe('buildEllipsePoints', () => {
  test('rx <= 0 produces an empty point list', () => {
    expect(buildEllipsePoints({ x: 0, y: 0, rx: 0, ry: 5 })).toEqual([]);
  });

  test('ry <= 0 produces an empty point list', () => {
    expect(buildEllipsePoints({ x: 0, y: 0, rx: 5, ry: 0 })).toEqual([]);
  });

  test('positive radii produce points satisfying the ellipse equation', () => {
    const points = buildEllipsePoints({ x: 0, y: 0, rx: 10, ry: 5 });

    expect(points.length).toBeGreaterThan(0);

    for (const { x, y } of points) {
      expect((x / 10) ** 2 + (y / 5) ** 2).toBeCloseTo(1, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// buildRectanglePoints
// ---------------------------------------------------------------------------

describe('buildRectanglePoints', () => {
  test('returns the four corners in TL -> TR -> BR -> BL order', () => {
    expect(buildRectanglePoints({ x: 0, y: 0, width: 10, height: 20 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildPolygonWorldPoints
// ---------------------------------------------------------------------------

describe('buildPolygonWorldPoints', () => {
  test('translates local points by the world offset', () => {
    const points = buildPolygonWorldPoints({
      x: 100,
      y: 200,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });

    expect(points).toEqual([
      { x: 100, y: 200 },
      { x: 110, y: 200 },
    ]);
  });

  test('a zero offset leaves the points unchanged', () => {
    const points = buildPolygonWorldPoints({ x: 0, y: 0, points: [{ x: 5, y: 5 }] });

    expect(points).toEqual([{ x: 5, y: 5 }]);
  });
});

// ---------------------------------------------------------------------------
// pointOnSegment
// ---------------------------------------------------------------------------

describe('pointOnSegment', () => {
  test('a point within the segment bounding box is on the segment', () => {
    expect(pointOnSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
  });

  test('a point left of the bounding box is not on the segment', () => {
    expect(pointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
  });

  test('a point right of the bounding box is not on the segment', () => {
    expect(pointOnSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
  });

  test('a point above the bounding box is not on the segment', () => {
    expect(pointOnSegment({ x: 5, y: -5 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false);
  });

  test('a point below the bounding box is not on the segment', () => {
    expect(pointOnSegment({ x: 5, y: 15 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// segmentsIntersect
// ---------------------------------------------------------------------------

describe('segmentsIntersect', () => {
  test('crossing segments intersect', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });

  test('disjoint, non-collinear segments do not intersect', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 10, y: 10 })).toBe(false);
  });

  test('collinear, overlapping segments intersect (o1 === 0 branch)', () => {
    // b1 = (5, 0) lies exactly on segment a: (0,0)-(10,0).
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 20, y: 0 })).toBe(true);
  });

  test('collinear, non-overlapping segments do not intersect', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 })).toBe(false);
  });

  test('collinear segment B has its first endpoint outside A and second endpoint inside A (o2 === 0 branch)', () => {
    // Both segments lie on the same line (all four points collinear), so the
    // general cross-product test (o1 !== o2 && o3 !== o4) is skipped (o1 ===
    // o2 === 0 here). b1 = (20, 0) falls outside a's span [0, 10], so the o1
    // check fails; b2 = (5, 0) falls inside, hitting the o2 check.
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });

  test('a small collinear segment fully contained inside a larger one (o3 === 0 branch)', () => {
    // a = (5,0)-(6,0) is entirely inside b = (0,0)-(10,0)'s span, so neither of
    // b's endpoints falls inside a's tiny span (o1/o2 both fail), but a1 = (5, 0)
    // falls inside b's span, hitting the o3 check.
    expect(segmentsIntersect({ x: 5, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
  });

  // NOTE: the mirrored o4 branch (`o4 === 0 && pointOnSegment(a2, b1, b2)`) is
  // unreachable in practice. Reaching it requires o1, o2, and o3 to all fail
  // while o4 succeeds; for any collinear configuration, o1 === o2 === o3 === o4
  // together (full collinearity is symmetric — see `orientation()`), so
  // whichever endpoint-containment check would satisfy o4 always also
  // satisfies one of the earlier o1/o2/o3 checks first (confirmed by an
  // exhaustive randomized search over collinear configurations finding no
  // counterexample). This is dead code from the check ordering, not a bug.
});

// ---------------------------------------------------------------------------
// polygonContainsPoint
// ---------------------------------------------------------------------------

describe('polygonContainsPoint', () => {
  test('fewer than 3 points always returns false', () => {
    expect(
      polygonContainsPoint({ x: 0, y: 0 }, [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe(false);
  });

  test('a point inside a triangle returns true', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];

    expect(polygonContainsPoint({ x: 5, y: 3 }, triangle)).toBe(true);
  });

  test('a point outside a triangle returns false', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];

    expect(polygonContainsPoint({ x: 100, y: 100 }, triangle)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// polygonsIntersect
// ---------------------------------------------------------------------------

describe('polygonsIntersect', () => {
  test('an empty first polygon never intersects', () => {
    expect(polygonsIntersect([], [{ x: 0, y: 0 }])).toBe(false);
  });

  test('an empty second polygon never intersects', () => {
    expect(polygonsIntersect([{ x: 0, y: 0 }], [])).toBe(false);
  });

  test('overlapping polygons (edge crossing) intersect', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = [
      { x: 5, y: 5 },
      { x: 15, y: 5 },
      { x: 15, y: 15 },
      { x: 5, y: 15 },
    ];

    expect(polygonsIntersect(a, b)).toBe(true);
  });

  test('one polygon fully containing another (no edge crossings) intersects', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const inner = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
    ];

    expect(polygonsIntersect(outer, inner)).toBe(true);
  });

  test('disjoint polygons do not intersect', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const b = [
      { x: 500, y: 500 },
      { x: 510, y: 500 },
      { x: 510, y: 510 },
      { x: 500, y: 510 },
    ];

    expect(polygonsIntersect(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointPoint
// ---------------------------------------------------------------------------

describe('intersectionPointPoint', () => {
  test('identical points intersect', () => {
    expect(intersectionPointPoint({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(true);
  });

  test('distinct points beyond the threshold do not intersect', () => {
    expect(intersectionPointPoint({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointLineSegment
// ---------------------------------------------------------------------------

describe('intersectionPointLineSegment', () => {
  test('a point exactly on the segment intersects', () => {
    expect(intersectionPointLineSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
  });

  test('a point far from the segment does not intersect', () => {
    expect(intersectionPointLineSegment({ x: 5, y: 100 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointRect
// ---------------------------------------------------------------------------

describe('intersectionPointRect', () => {
  test('a point inside the rectangle intersects', () => {
    expect(intersectionPointRect({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });

  test('a point outside the rectangle does not intersect', () => {
    expect(intersectionPointRect({ x: 50, y: 50 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointCircle
// ---------------------------------------------------------------------------

describe('intersectionPointCircle', () => {
  test('a point inside the circle intersects', () => {
    expect(intersectionPointCircle({ x: 1, y: 0 }, { x: 0, y: 0, radius: 5 })).toBe(true);
  });

  test('a point outside the circle does not intersect', () => {
    expect(intersectionPointCircle({ x: 100, y: 0 }, { x: 0, y: 0, radius: 5 })).toBe(false);
  });

  test('a zero radius never intersects', () => {
    expect(intersectionPointCircle({ x: 0, y: 0 }, { x: 0, y: 0, radius: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointEllipse
// ---------------------------------------------------------------------------

describe('intersectionPointEllipse', () => {
  test('rx <= 0 never intersects', () => {
    expect(intersectionPointEllipse({ x: 0, y: 0 }, { x: 0, y: 0, rx: 0, ry: 5 })).toBe(false);
  });

  test('ry <= 0 never intersects', () => {
    expect(intersectionPointEllipse({ x: 0, y: 0 }, { x: 0, y: 0, rx: 5, ry: 0 })).toBe(false);
  });

  test('a point inside the ellipse intersects', () => {
    expect(intersectionPointEllipse({ x: 0, y: 0 }, { x: 0, y: 0, rx: 10, ry: 5 })).toBe(true);
  });

  test('a point outside the ellipse does not intersect', () => {
    expect(intersectionPointEllipse({ x: 100, y: 100 }, { x: 0, y: 0, rx: 10, ry: 5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionPointPoly
// ---------------------------------------------------------------------------

describe('intersectionPointPoly', () => {
  test('a point inside the polygon intersects', () => {
    const square = {
      x: 0,
      y: 0,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };

    expect(intersectionPointPoly({ x: 5, y: 5 }, square)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// intersectionLineLineSegments
// ---------------------------------------------------------------------------

describe('intersectionLineLineSegments', () => {
  test('crossing segments intersect', () => {
    expect(intersectionLineLineSegments({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });

  test('parallel segments (zero denominator) do not intersect', () => {
    expect(intersectionLineLineSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  test('non-parallel segments whose infinite lines cross outside both segments do not intersect', () => {
    expect(intersectionLineLineSegments({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 5, y: -1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectionRectRect
// ---------------------------------------------------------------------------

describe('intersectionRectRect', () => {
  test('overlapping rectangles intersect', () => {
    expect(intersectionRectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  test('rectB entirely past rectA on X/Y does not intersect (first early-return branch)', () => {
    expect(intersectionRectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 })).toBe(false);
  });

  test('rectA entirely past rectB on X does not intersect (second early-return branch)', () => {
    // rectB.left (0) is NOT past rectA.right (60), so the first check passes;
    // the second check (rectA.left > rectB.right) is what must catch this case.
    expect(intersectionRectRect({ x: 50, y: 50, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

describe('getVectorLength', () => {
  test('computes the Euclidean length of a 2D vector', () => {
    expect(getVectorLength(3, 4)).toBe(5);
  });
});

describe('getVectorLengthSquared', () => {
  test('computes the squared length without a sqrt', () => {
    expect(getVectorLengthSquared(3, 4)).toBe(25);
  });
});

describe('getDotProduct', () => {
  test('computes the dot product of two vectors', () => {
    expect(getDotProduct(1, 2, 3, 4)).toBe(1 * 3 + 2 * 4);
  });

  test('perpendicular vectors have a zero dot product', () => {
    expect(getDotProduct(1, 0, 0, 1)).toBe(0);
  });
});

describe('getVoronoiRegion (scalar form)', () => {
  test('point before the edge start classifies as left', () => {
    expect(getVoronoiRegion(10, 0, -5, 0)).toBe(VoronoiRegion.left);
  });

  test('point past the edge end classifies as right', () => {
    expect(getVoronoiRegion(10, 0, 20, 0)).toBe(VoronoiRegion.right);
  });

  test('point projecting onto the edge classifies as middle', () => {
    expect(getVoronoiRegion(10, 0, 5, 3)).toBe(VoronoiRegion.middle);
  });
});
