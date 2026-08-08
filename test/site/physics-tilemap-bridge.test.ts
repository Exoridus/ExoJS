import { type Texture, TextureRegion } from '@codexo/exojs';
import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld, PolygonShape } from '@codexo/exojs-physics';
import { ObjectKind, ObjectLayer, TILE_TRANSFORM_IDENTITY, TileLayer, type TileMapObject, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { buildCollidersFromObjectLayer, buildCollidersFromTileLayer } from '../../examples/shared/physics-tilemap';

// The example physics↔tilemap bridge recipe (examples/shared/physics-tilemap.ts)
// is the only place that depends on BOTH @codexo/exojs-tilemap and
// @codexo/exojs-physics; neither package depends on the other, so the glue lives
// in example/app land. These tests exercise the recipe end-to-end against the
// real (aliased-to-source) packages.

const base = {
  name: '',
  type: 'solid',
  rotation: 0,
  visible: true,
  properties: {},
} as const;

const rectangle = (id: number, x: number, y: number, width: number, height: number, extra: Partial<TileMapObject> = {}): TileMapObject => ({
  ...base,
  kind: ObjectKind.Rectangle,
  id,
  x,
  y,
  width,
  height,
  ...extra,
});

const layerWith = (objects: TileMapObject[]): ObjectLayer => new ObjectLayer({ id: 1, name: 'collision', objects });

describe('buildCollidersFromObjectLayer', () => {
  it('builds one static body + collider per rectangle, centred on the object', () => {
    const world = new PhysicsWorld();
    const layer = layerWith([rectangle(1, 100, 200, 64, 32)]);

    const built = buildCollidersFromObjectLayer(world, layer);

    expect(built).toHaveLength(1);

    const { body } = built[0];

    expect(body.type).toBe('static');
    expect(body.colliders).toHaveLength(1);
    expect(body.colliders[0].shape).toBeInstanceOf(BoxShape);
    // Body sits at the rectangle centre (top-left origin + half extents).
    expect(body.x).toBeCloseTo(132);
    expect(body.y).toBeCloseTo(216);
    // The body joined the world (id allocated, registered after the step defer).
    expect(world.bodies).toContain(body);
  });

  it('maps an ellipse to a circle whose radius is the larger semi-axis', () => {
    const world = new PhysicsWorld();
    const layer = layerWith([rectangle(1, 0, 0, 80, 40, { kind: ObjectKind.Ellipse })]);

    const [{ body }] = buildCollidersFromObjectLayer(world, layer);
    const shape = body.colliders[0].shape;

    expect(shape).toBeInstanceOf(CircleShape);
    expect((shape as CircleShape).radius).toBeCloseTo(40);
  });

  it('maps a convex polygon to a PolygonShape, placed at the object origin', () => {
    const world = new PhysicsWorld();
    const polygon: TileMapObject = {
      ...base,
      kind: ObjectKind.Polygon,
      id: 1,
      x: 50,
      y: 60,
      width: 0,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 64, y: 0 },
        { x: 32, y: 48 },
      ],
    };

    const [{ body }] = buildCollidersFromObjectLayer(world, layerWith([polygon]));

    expect(body.colliders[0].shape).toBeInstanceOf(PolygonShape);
    expect(body.x).toBeCloseTo(50);
    expect(body.y).toBeCloseTo(60);
  });

  it('skips point, polyline and tile objects (no closed area)', () => {
    const world = new PhysicsWorld();
    const objects: TileMapObject[] = [
      { ...base, kind: ObjectKind.Point, id: 1, x: 10, y: 10, width: 0, height: 0 },
      {
        ...base,
        kind: ObjectKind.Polyline,
        id: 2,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
    ];

    const built = buildCollidersFromObjectLayer(world, layerWith(objects));

    expect(built).toHaveLength(0);
    expect(world.colliders).toHaveLength(0);
  });

  it('skips and warns on a non-convex polygon (no automatic decomposition)', () => {
    const world = new PhysicsWorld();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An arrow/dart shape — concave, so PolygonShape rejects it.
    const concave: TileMapObject = {
      ...base,
      kind: ObjectKind.Polygon,
      id: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 40 },
        { x: 10, y: 20 },
      ],
    };

    const built = buildCollidersFromObjectLayer(world, layerWith([concave]));

    expect(built).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });

  it('forwards friction, restitution and filter onto every generated collider', () => {
    const world = new PhysicsWorld();
    const layer = layerWith([rectangle(1, 0, 0, 32, 32), rectangle(2, 64, 0, 32, 32)]);

    const built = buildCollidersFromObjectLayer(world, layer, { friction: 0.9, restitution: 0.3, filter: { category: 0b10 } });

    expect(built).toHaveLength(2);

    for (const { body } of built) {
      expect(body.colliders[0].friction).toBeCloseTo(0.9);
      expect(body.colliders[0].restitution).toBeCloseTo(0.3);
      expect(body.colliders[0].filter.category).toBe(0b10);
    }
  });

  it('honours a custom accept predicate', () => {
    const world = new PhysicsWorld();
    const layer = layerWith([rectangle(1, 0, 0, 32, 32, { type: 'solid' }), rectangle(2, 64, 0, 32, 32, { type: 'decoration' })]);

    const built = buildCollidersFromObjectLayer(world, layer, { accept: object => object.type === 'solid' });

    expect(built).toHaveLength(1);
    expect(built[0].object.id).toBe(1);
  });

  it('produces a solid floor a dynamic body lands on (integration)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    // A wide floor (top at y = 400, 40px tall → centre at y = 420).
    buildCollidersFromObjectLayer(world, layerWith([rectangle(1, 0, 400, 800, 40)]), { friction: 0.6 });

    // A dynamic 40px box dropped from above must come to rest on the floor.
    const box = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 400, y: 200 },
        colliders: [{ shape: new BoxShape(40, 40), density: 1 }],
      }),
    );

    for (let frame = 0; frame < 180; frame++) {
      world.step(1 / 60);
    }

    // The box bottom should rest on the floor top (y ≈ 400): centre ≈ 380.
    expect(box.y).toBeGreaterThan(360);
    expect(box.y).toBeLessThan(400);
    expect(Math.hypot(box.linearVelocityX, box.linearVelocityY)).toBeLessThan(5);
  });
});

// ── Per-tile collision ────────────────────────────────────────────────────

function fakeRegion(): TextureRegion {
  const texture = {
    destroyed: false,
    destroy: () => {},
    height: 512,
    label: 'test',
    uid: 0,
    width: 512,
  } as unknown as Texture;

  return new TextureRegion(texture, { height: 512, width: 512, x: 0, y: 0 });
}

/** A tileset whose tile 0 carries `collision`, plus a 16px layer using it. */
function tileLayerWith(collision: readonly TileMapObject[]): { layer: TileLayer; tileset: TileSet } {
  const tileset = new TileSet({
    name: 'ts',
    texture: fakeRegion(),
    tileWidth: 16,
    tileHeight: 16,
    tileCount: 16,
    columns: 4,
  });

  tileset._setDefinitions([{ localTileId: 0, collision }]);

  const layer = new TileLayer({
    id: 1,
    name: 'ground',
    width: 16,
    height: 16,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [tileset],
  });

  return { layer, tileset };
}

function fill(layer: TileLayer, tileset: TileSet, fromTx: number, toTx: number, ty: number): void {
  for (let tx = fromTx; tx <= toTx; tx++) {
    layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
  }
}

describe('buildCollidersFromTileLayer', () => {
  it('collapses a run of full-tile collision boxes into a single wide body', () => {
    const world = new PhysicsWorld();
    const { layer, tileset } = tileLayerWith([rectangle(1, 0, 0, 16, 16)]);

    fill(layer, tileset, 0, 3, 5);

    const built = buildCollidersFromTileLayer(world, layer);

    // Four tiles, one merged body — the whole point of the merging pass.
    expect(built).toHaveLength(1);
    expect(built[0].source.kind).toBe('rect');

    const { body } = built[0];

    expect(body.type).toBe('static');
    expect(body.colliders[0].shape).toBeInstanceOf(BoxShape);
    expect(body.x).toBeCloseTo(32);
    expect(body.y).toBeCloseTo(88);
    expect(world.bodies).toContain(body);
  });

  it('builds one body per tile for non-rectangular per-tile geometry', () => {
    const world = new PhysicsWorld();
    const slope: TileMapObject = {
      ...base,
      kind: ObjectKind.Polygon,
      id: 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      points: [
        { x: 0, y: 16 },
        { x: 16, y: 16 },
        { x: 16, y: 0 },
      ],
    };
    const { layer, tileset } = tileLayerWith([slope]);

    fill(layer, tileset, 0, 2, 0);

    const built = buildCollidersFromTileLayer(world, layer);

    expect(built).toHaveLength(3);

    for (const collider of built) {
      expect(collider.source.kind).toBe('shape');
      expect(collider.body.colliders[0].shape).toBeInstanceOf(PolygonShape);
    }

    expect(built.map(collider => collider.body.x)).toEqual([0, 16, 32]);
  });

  it('scopes the build to an explicit tile region', () => {
    const world = new PhysicsWorld();
    const { layer, tileset } = tileLayerWith([rectangle(1, 0, 0, 16, 16)]);

    fill(layer, tileset, 0, 7, 0);

    const built = buildCollidersFromTileLayer(world, layer, { region: { x: 2, y: 0, width: 2, height: 1 } });

    expect(built).toHaveLength(1);
    expect(built[0].body.x).toBeCloseTo(48);
  });

  it('forwards friction, restitution and filter onto every generated collider', () => {
    const world = new PhysicsWorld();
    const { layer, tileset } = tileLayerWith([rectangle(1, 0, 0, 16, 16)]);

    fill(layer, tileset, 0, 1, 0);

    const built = buildCollidersFromTileLayer(world, layer, {
      friction: 0.9,
      restitution: 0.3,
      filter: { category: 0b10 },
      merge: false,
    });

    expect(built).toHaveLength(2);

    for (const { body } of built) {
      expect(body.colliders[0].friction).toBeCloseTo(0.9);
      expect(body.colliders[0].restitution).toBeCloseTo(0.3);
      expect(body.colliders[0].filter.category).toBe(0b10);
    }
  });

  it('produces a solid tile floor a dynamic body lands on (integration)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
    const { layer, tileset } = tileLayerWith([rectangle(1, 0, 0, 16, 16)]);

    // A 16-tile floor whose top edge sits at y = 160 (tile row 10).
    fill(layer, tileset, 0, 15, 10);
    buildCollidersFromTileLayer(world, layer, { friction: 0.6 });

    const box = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 120, y: 40 },
        colliders: [{ shape: new BoxShape(16, 16), density: 1 }],
      }),
    );

    for (let frame = 0; frame < 180; frame++) {
      world.step(1 / 60);
    }

    expect(box.y).toBeGreaterThan(140);
    expect(box.y).toBeLessThan(160);
    expect(Math.hypot(box.linearVelocityX, box.linearVelocityY)).toBeLessThan(5);
  });
});
