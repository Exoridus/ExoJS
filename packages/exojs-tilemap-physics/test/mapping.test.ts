import { BoxShape, PhysicsWorld } from '@codexo/exojs-physics';
import { ObjectKind, type TileMapObject } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { buildObjectLayerColliders } from '../src/objectLayer';
import { makeObjectLayer, shape } from './helpers';

const build = (objects: readonly TileMapObject[]) => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

  return { world, built: buildObjectLayerColliders(world, makeObjectLayer(objects)) };
};

const shapeTypes = (objects: readonly TileMapObject[]): string[] => {
  const { built } = build(objects);

  return built.flatMap(({ body }) => body.colliders.map(collider => collider.shape.type));
};

describe('kind to shape', () => {
  it('maps a rectangle to a box centred on the rectangle', () => {
    const { built } = build([shape({ kind: ObjectKind.Rectangle, x: 10, y: 20, width: 8, height: 4 })]);
    const [collider] = built[0]!.body.colliders;

    expect(built).toHaveLength(1);
    expect(collider!.shape).toBeInstanceOf(BoxShape);
    expect(built[0]!.body.x + collider!.offsetX).toBe(14);
    expect(built[0]!.body.y + collider!.offsetY).toBe(22);
  });

  it('maps an elongated ellipse to a capsule that covers it', () => {
    const semiMajor = 20;
    const semiMinor = 6;
    const { built } = build([
      shape({ kind: ObjectKind.Ellipse, x: 0, y: 0, width: semiMajor * 2, height: semiMinor * 2 }),
    ]);
    const collider = built[0]!.body.colliders[0]!;
    const capsule = collider.shape as { type: string; radius: number; length: number };

    expect(capsule.type).toBe('capsule');
    expect(capsule.radius).toBe(semiMinor);
    expect(capsule.length).toBe(2 * (semiMajor - semiMinor));

    // Every ellipse point is within the capsule: its distance to the spine
    // never exceeds the radius.
    const halfSpine = capsule.length / 2;

    for (let i = 0; i < 360; i++) {
      const angle = (i * Math.PI) / 180;
      const px = semiMajor * Math.cos(angle);
      const py = semiMinor * Math.sin(angle);
      const clamped = Math.max(-halfSpine, Math.min(halfSpine, px));

      expect(Math.hypot(px - clamped, py)).toBeLessThanOrEqual(semiMinor + 1e-9);
    }
  });

  it('maps a round ellipse to a circle', () => {
    expect(shapeTypes([shape({ kind: ObjectKind.Ellipse, width: 10, height: 10 })])).toEqual(['circle']);
  });

  it('maps a convex polygon to one polygon shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    const { built } = build([shape({ kind: ObjectKind.Polygon, points } as Partial<TileMapObject>)]);

    expect(built[0]!.body.colliders).toHaveLength(1);
    expect(built[0]!.body.colliders[0]!.shape.type).toBe('polygon');
  });

  it('maps a concave polygon to several polygons on one body', () => {
    // An L: the vertex at (10, 10) makes it concave.
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const { built } = build([shape({ kind: ObjectKind.Polygon, points } as Partial<TileMapObject>)]);
    const colliders = built[0]!.body.colliders;

    expect(built).toHaveLength(1);
    expect(colliders.length).toBeGreaterThan(1);
    expect(colliders.every(collider => collider.shape.type === 'polygon')).toBe(true);

    const area = colliders.reduce((sum, collider) => sum + (collider.shape.massProperties?.area ?? 0), 0);

    expect(area).toBeCloseTo(300, 6);
  });

  it('maps an open polyline to an open chain', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ];
    const { built } = build([shape({ kind: ObjectKind.Polyline, points } as Partial<TileMapObject>)]);
    const chain = built[0]!.body.colliders[0]!.shape as { type: string; closed: boolean; count: number };

    expect(chain.type).toBe('chain');
    expect(chain.closed).toBe(false);
    expect(chain.count).toBe(3);
  });

  it('maps a polyline with coincident endpoints to a closed chain', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ];
    const { built } = build([shape({ kind: ObjectKind.Polyline, points } as Partial<TileMapObject>)]);
    const chain = built[0]!.body.colliders[0]!.shape as { type: string; closed: boolean; count: number };

    expect(chain.closed).toBe(true);
    expect(chain.count).toBe(3);
  });

  it('builds nothing for points, tile objects and text objects', () => {
    const { built } = build([
      shape({ kind: ObjectKind.Point, width: 0, height: 0 }),
      shape({ kind: ObjectKind.Tile }),
      shape({ kind: ObjectKind.Text }),
    ]);

    expect(built).toEqual([]);
  });

  it('applies the layer offset', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const layer = makeObjectLayer([shape({ x: 4, y: 6, width: 2, height: 2 })], 100, 200);
    const [built] = buildObjectLayerColliders(world, layer);

    expect(built!.body.x).toBe(104);
    expect(built!.body.y).toBe(206);
  });

  it('skips an object the resolver rejects and keeps the rest', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const layer = makeObjectLayer([shape({ id: 1, type: 'skip' }), shape({ id: 2, type: 'solid' })]);
    const built = buildObjectLayerColliders(world, layer, { accept: object => object.type !== 'skip' });

    expect(built.map(entry => entry.object.id)).toEqual([2]);
  });

  it('resolves material per object over the call defaults', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const layer = makeObjectLayer([shape({ id: 1, type: 'ice' }), shape({ id: 2, type: 'solid' })]);
    const built = buildObjectLayerColliders(world, layer, {
      friction: 0.5,
      material: context => (context.type === 'ice' ? { friction: 0, isSensor: true } : null),
    });

    expect(built.map(entry => entry.body.colliders[0]!.friction)).toEqual([0, 0.5]);
    expect(built.map(entry => entry.body.colliders[0]!.isSensor)).toEqual([true, false]);
  });
});
