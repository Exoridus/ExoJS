import { describe, expect, it } from 'vitest';

import type { AnyShape } from '../src/index';
import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld, PolygonShape, Shape } from '../src/index';

describe('CircleShape', () => {
  it('computes radius, area, bounding radius and inertia', () => {
    const c = new CircleShape(10);

    expect(c.type).toBe('circle');
    expect(c.radius).toBe(10);
    expect(c.massProperties.area).toBeCloseTo(Math.PI * 100);
    expect(c.boundingRadius).toBe(10);
    expect(c.massProperties.unitInertia).toBeCloseTo(0.5 * Math.PI * 100 * 100);
  });

  it('rejects invalid radii', () => {
    expect(() => new CircleShape(0)).toThrow(RangeError);
    expect(() => new CircleShape(-1)).toThrow(RangeError);
    expect(() => new CircleShape(Number.NaN)).toThrow(RangeError);
  });
});

describe('PolygonShape — convex validation', () => {
  it('accepts a convex quad and computes area/centroid/unit normals', () => {
    const p = new PolygonShape([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);

    expect(p.count).toBe(4);
    expect(p.massProperties.area).toBeCloseTo(4);
    expect(p.massProperties.centroidX).toBeCloseTo(1);
    expect(p.massProperties.centroidY).toBeCloseTo(1);

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

    expect(cw.massProperties.area).toBeCloseTo(ccw.massProperties.area);
    expect(cw.massProperties.centroidX).toBeCloseTo(ccw.massProperties.centroidX);
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

  it('welds a coincident interior vertex (within the weld epsilon) instead of keeping it as a distinct point', () => {
    const p = new PolygonShape([
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5.00001, y: -5 }, // duplicate of the previous vertex, well within weldEpsilon
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ]);

    expect(p.count).toBe(4);
    expect(p.massProperties.area).toBeCloseTo(100, 3);
  });

  it('rejects vertices that all weld together into fewer than three distinct points', () => {
    expect(
      () =>
        new PolygonShape([
          { x: 0, y: 0 },
          { x: 0.00001, y: 0 },
          { x: 0.00002, y: 0 },
        ]),
    ).toThrow(RangeError);
  });

  it('drops a trailing vertex that duplicates the first (wrap-around weld)', () => {
    const p = new PolygonShape([
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
      { x: -5, y: -4.99999 }, // duplicates the first vertex, closing the loop
    ]);

    expect(p.count).toBe(4);
    expect(p.massProperties.area).toBeCloseTo(100, 3);
  });
});

describe('BoxShape', () => {
  it('is a centred convex quad with the rectangle area moment', () => {
    const b = new BoxShape(4, 2);

    expect(b.width).toBe(4);
    expect(b.height).toBe(2);
    expect(b.count).toBe(4);
    expect(b.massProperties.area).toBeCloseTo(8);
    expect(b.massProperties.centroidX).toBeCloseTo(0);
    expect(b.massProperties.centroidY).toBeCloseTo(0);
    // Rectangle second moment of area about the centroid: A·(w² + h²)/12.
    expect(b.massProperties.unitInertia).toBeCloseTo((8 * (16 + 4)) / 12);
  });

  it('rejects invalid dimensions', () => {
    expect(() => new BoxShape(0, 1)).toThrow(RangeError);
    expect(() => new BoxShape(1, -1)).toThrow(RangeError);
  });
});

describe('Shape mass capability', () => {
  it('exposes frozen mass properties on every solid shape', () => {
    const shapes = [new CircleShape(4), new BoxShape(4, 4), new PolygonShape([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }])];

    for (const shape of shapes) {
      expect(shape.massProperties).not.toBeNull();
      expect(Object.isFrozen(shape.massProperties)).toBe(true);
      expect(shape.massProperties.area).toBeGreaterThan(0);
    }
  });

  it('lets a body carry boundary geometry that reports no mass properties', () => {
    // Stands in for the future SegmentShape/ChainShape: geometry with no
    // interior. The cast is needed only because `AnyShape` still enumerates the
    // two shipped kinds - the point is that the base contract already allows it
    // and the mass model skips it instead of reading a fake zero area.
    class BoundaryShape extends Shape {
      public readonly type = 'circle' as const;
      public readonly radius = 5;
      public readonly boundingRadius = 5;
      public readonly massProperties = null;
    }

    const world = new PhysicsWorld();
    const body = world.add(
      new PhysicsBody({
        type: 'dynamic',
        colliders: [{ shape: new BoxShape(4, 4) }, { shape: new BoundaryShape() as unknown as AnyShape }],
      }),
    );

    const solidOnly = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(4, 4) }] }));

    expect(body.mass).toBeCloseTo(solidOnly.mass);
    expect(body.inertia).toBeCloseTo(solidOnly.inertia);
  });
});
