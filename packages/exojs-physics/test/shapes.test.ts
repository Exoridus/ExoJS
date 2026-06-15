import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, PolygonShape } from '../src/index';

describe('CircleShape', () => {
  it('computes radius, area, bounding radius and inertia', () => {
    const c = new CircleShape(10);

    expect(c.type).toBe('circle');
    expect(c.radius).toBe(10);
    expect(c.area).toBeCloseTo(Math.PI * 100);
    expect(c.boundingRadius).toBe(10);
    expect(c.unitInertia).toBeCloseTo(0.5 * Math.PI * 100 * 100);
  });

  it('rejects invalid radii', () => {
    expect(() => new CircleShape(0)).toThrow(RangeError);
    expect(() => new CircleShape(-1)).toThrow(RangeError);
    expect(() => new CircleShape(Number.NaN)).toThrow(RangeError);
  });
});

describe('PolygonShape — convex validation (gate B-2 foundation)', () => {
  it('accepts a convex quad and computes area/centroid/unit normals', () => {
    const p = new PolygonShape([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);

    expect(p.count).toBe(4);
    expect(p.area).toBeCloseTo(4);
    expect(p.centroidX).toBeCloseTo(1);
    expect(p.centroidY).toBeCloseTo(1);

    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.normals[i * 2], p.normals[i * 2 + 1])).toBeCloseTo(1);
    }
  });

  it('canonicalises either input winding to the same shape', () => {
    const ccw = new PolygonShape([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    const cw = new PolygonShape([
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
      { x: 0, y: 0 },
    ]);

    expect(cw.area).toBeCloseTo(ccw.area);
    expect(cw.centroidX).toBeCloseTo(ccw.centroidX);
  });

  it('rejects fewer than three vertices', () => {
    expect(() => new PolygonShape([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(RangeError);
  });

  it('rejects a non-convex polygon', () => {
    expect(
      () =>
        new PolygonShape([
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 0, y: 2 },
        ]),
    ).toThrow(RangeError);
  });

  it('rejects a degenerate (collinear) polygon', () => {
    expect(() => new PolygonShape([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toThrow(RangeError);
  });

  it('rejects non-finite vertices', () => {
    expect(() => new PolygonShape([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }])).toThrow(RangeError);
  });

  it('freezes the vertex and normal arrays', () => {
    const p = new PolygonShape([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }]);

    expect(Object.isFrozen(p.vertices)).toBe(true);
    expect(Object.isFrozen(p.normals)).toBe(true);
  });
});

describe('BoxShape', () => {
  it('is a centred convex quad with the rectangle area moment', () => {
    const b = new BoxShape(4, 2);

    expect(b.width).toBe(4);
    expect(b.height).toBe(2);
    expect(b.count).toBe(4);
    expect(b.area).toBeCloseTo(8);
    expect(b.centroidX).toBeCloseTo(0);
    expect(b.centroidY).toBeCloseTo(0);
    // Rectangle second moment of area about the centroid: A·(w² + h²)/12.
    expect(b.unitInertia).toBeCloseTo((8 * (16 + 4)) / 12);
  });

  it('rejects invalid dimensions', () => {
    expect(() => new BoxShape(0, 1)).toThrow(RangeError);
    expect(() => new BoxShape(1, -1)).toThrow(RangeError);
  });
});
