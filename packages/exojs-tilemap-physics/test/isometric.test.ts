import { Container, type Texture, TextureRegion } from '@codexo/exojs';
import { PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import {
  buildTileCollisionGeometry,
  ObjectLayer,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileProjection,
  TileSet,
} from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { buildObjectLayerColliders } from '../src/objectLayer';
import { TileColliderStreamer } from '../src/TileColliderStreamer';
import { TilePhysicsBinding } from '../src/TilePhysicsBinding';

const projection = () => new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32, originX: 128 });
const shape = {
  id: 1,
  name: '',
  type: 'solid',
  visible: true,
  properties: {},
  kind: 'rectangle' as const,
  x: 32,
  y: 32,
  width: 32,
  height: 32,
  rotation: 0,
};

describe('isometric logical physics', () => {
  it('builds square logical cells with inverse-projected display offsets', () => {
    const layer = new TileLayer({
      id: 1,
      name: 'collision',
      width: 2,
      height: 2,
      tileWidth: 64,
      tileHeight: 32,
      tilesets: [],
      projection: projection(),
      offsetX: 32,
      offsetY: 16,
    });
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const streamer = new TileColliderStreamer(world, layer, { cells: (x, y) => (x === 1 && y === 0 ? 'solid' : null) });
    streamer.sync();
    const body = [...streamer.bodies()][0]!;
    const collider = body.colliders[0]!;
    expect(collider.shape).toMatchObject({ width: 32, height: 32 });
    expect([body.x + collider.offsetX, body.y + collider.offsetY]).toEqual([80, 16]);
    streamer.destroy();
    world.destroy();
  });

  it('keeps object colliders logical while display geometry is projected', () => {
    const layer = new ObjectLayer({ id: 1, projection: projection(), offsetX: 32, offsetY: 16, objects: [shape] });
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const [{ body }] = buildObjectLayerColliders(world, layer);
    expect([body!.x, body!.y]).toEqual([64, 32]);
    expect(layer.getDisplayObject(shape)).toMatchObject({ kind: 'polygon', x: 160, y: 48 });
    world.destroy();
  });

  it('maps authored image-space diamond collision back onto its logical cell', () => {
    const tileset = new TileSet({
      name: 'diamond',
      texture: new TextureRegion({ width: 64, height: 32 } as Texture, { x: 0, y: 0, width: 64, height: 32 }),
      tileWidth: 64,
      tileHeight: 32,
      tileCount: 1,
    });
    tileset.setDefinitions([
      {
        localTileId: 0,
        collision: [
          {
            ...shape,
            kind: 'polygon',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            points: [
              { x: 32, y: 0 },
              { x: 64, y: 16 },
              { x: 32, y: 32 },
              { x: 0, y: 16 },
            ],
          },
        ],
      },
    ]);
    const layer = new TileLayer({ id: 1, name: 'tiles', tileWidth: 64, tileHeight: 32, tilesets: [tileset], projection: projection() });
    layer.setTileAt(2, 1, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const geometry = buildTileCollisionGeometry(layer);
    expect(geometry.rects).toEqual([{ x: 64, y: 32, width: 32, height: 32, type: 'solid' }]);
  });

  it('explicitly binds a logical body to presentation without changing the body or sprite rotation', () => {
    const body = new PhysicsBody({ position: { x: 64, y: 32 } });
    const node = new Container();
    node.rotation = 15;
    const binding = new TilePhysicsBinding(body, node, projection());
    binding.sync();
    expect([node.x, node.y, node.rotation]).toEqual([160, 48, 15]);
    expect([body.x, body.y]).toEqual([64, 32]);
    body.setTransform({ x: -32, y: 64 });
    binding.syncInterpolated(0.5);
    expect([node.x, node.y]).toEqual([32, 16]);
    node.destroy();
  });
});
