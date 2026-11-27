import { describe, expect, it } from 'vitest';

import { makeTiledContext } from './type-context';

const document = {
  type: 'map',
  version: '1.10',
  orientation: 'isometric',
  renderorder: 'right-down',
  width: 3,
  height: 4,
  tilewidth: 64,
  tileheight: 32,
  infinite: false,
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      tilewidth: 64,
      tileheight: 96,
      tilecount: 1,
      columns: 1,
      image: 'tiles.png',
      imagewidth: 64,
      imageheight: 96,
    },
  ],
  layers: [
    {
      id: 1,
      name: 'ground',
      type: 'tilelayer',
      x: 0,
      y: 0,
      visible: true,
      opacity: 1,
      width: 3,
      height: 4,
      data: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      id: 2,
      name: 'objects',
      type: 'objectgroup',
      x: 0,
      y: 0,
      visible: true,
      opacity: 1,
      draworder: 'topdown',
      offsetx: 7,
      offsety: -9,
      objects: [
        { id: 1, name: 'spawn', type: '', visible: true, point: true, x: 64, y: 32, width: 0, height: 0, rotation: 0 },
        { id: 2, name: 'wall', type: '', visible: true, x: 32, y: 32, width: 32, height: 32, rotation: 0 },
        { id: 3, name: 'tree', type: '', visible: true, gid: 1, x: 64, y: 32, width: 64, height: 96, rotation: 0 },
      ],
    },
  ],
};

describe('Tiled isometric conversion', () => {
  it('preserves signed infinite chunks and accumulated group display offsets', async () => {
    const source = {
      ...document,
      width: 0,
      height: 0,
      infinite: true,
      layers: [
        {
          id: 3,
          name: 'group',
          type: 'group',
          x: 0,
          y: 0,
          visible: true,
          opacity: 1,
          offsetx: 10,
          offsety: 20,
          layers: [
            {
              ...document.layers[0],
              data: undefined,
              width: 0,
              height: 0,
              offsetx: 7,
              offsety: -9,
              chunks: [{ x: -16, y: -16, width: 16, height: 16, data: new Array(256).fill(1) }],
            },
            document.layers[1],
          ],
        },
      ],
    };
    const { loadSource } = makeTiledContext({ 'infinite.tmj': source }, { 'tiles.png': { w: 64, h: 96 } });
    const parsed = await loadSource('infinite.tmj');
    const map = parsed.toTileMap();
    const layer = map.layers[0]!;
    expect(layer.bounded).toBe(false);
    const payload = await parsed.getChunkSource(1)!.getChunk(-1, -1);
    expect(payload).not.toBeNull();
    layer._adoptChunk(-1, -1, payload!);
    expect(layer.getTileAt(-16, -16)?.localTileId).toBe(0);
    expect(layer.tileToPixel(-16, -16)).toEqual({ x: 17, y: -501 });
    expect(layer.pixelToTile(17, -501)).toEqual({ tx: -16, ty: -16 });
    const objects = map.objectLayers[0]!;
    expect(objects.getDisplayObject(objects.objects[0]!)).toMatchObject({ x: 49, y: 59 });
  });

  it('exposes the projected rotation pivot for an aligned tile image', async () => {
    const rotated = structuredClone(document);
    rotated.layers[1]!.objects![2]!.rotation = 90;
    const { loadSource } = makeTiledContext({ 'tile.tmj': rotated }, { 'tiles.png': { w: 64, h: 96 } });
    const layer = (await loadSource('tile.tmj')).toTileMap().objectLayers[0]!;
    expect(layer.getDisplayObject(layer.objects[2]!)).toMatchObject({ x: 135, y: -57, rotation: 90, rotationOrigin: { x: 167, y: 39 } });
  });

  it('preserves the centre and axes of an ellipse rotated after projection', async () => {
    const rotated = structuredClone(document);
    const wall = rotated.layers[1]!.objects![1]!;
    Object.assign(wall, { ellipse: true, height: 16, rotation: 90 });
    const { loadSource } = makeTiledContext({ 'ellipse.tmj': rotated }, { 'tiles.png': { w: 64, h: 96 } });
    const layer = (await loadSource('ellipse.tmj')).toTileMap().objectLayers[0]!;
    const display = layer.getDisplayObject(layer.objects[1]!);
    expect(display.kind).toBe('ellipse');
    const angle = (display.rotation * Math.PI) / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const rx = display.width / 2;
    const ry = display.height / 2;
    expect(display.x + c * rx - s * ry).toBeCloseTo(123);
    expect(display.y + s * rx + c * ry).toBeCloseTo(31);
    expect(c * c * rx * rx + s * s * ry * ry).toBeCloseTo(80);
    expect(s * s * rx * rx + c * c * ry * ry).toBeCloseTo(320);
  });

  it('rotates authored rectangles in display space before mapping them into physics space', async () => {
    const rotated = structuredClone(document);
    const objectLayer = rotated.layers[1]!;
    objectLayer.objects![1]!.rotation = 90;
    const { loadSource } = makeTiledContext({ 'rotated.tmj': rotated }, { 'tiles.png': { w: 64, h: 96 } });
    const map = (await loadSource('rotated.tmj')).toTileMap();
    const layer = map.objectLayers[0]!;
    const display = layer.getDisplayObject(layer.objects[1]!);
    expect(display.kind).toBe('polygon');

    if (display.kind !== 'polygon') {
      throw new Error('Expected polygon');
    }

    expect(display.points[1]!.x).toBeCloseTo(-16);
    expect(display.points[1]!.y).toBeCloseTo(32);
  });

  it('shares the Tiled origin across tile and object layers and preserves logical shapes', async () => {
    const { loadSource } = makeTiledContext({ 'iso.tmj': document }, { 'tiles.png': { w: 64, h: 96 } });
    const map = (await loadSource('iso.tmj')).toTileMap();
    expect(map.tileToPixel(0, 0)).toEqual({ x: 128, y: 0 });
    expect(map.layers[0]!.projection).toBe(map.projection);
    const objects = map.objectLayers[0]!;
    expect(objects.projection).toBe(map.projection);
    expect(objects.objects[1]).toMatchObject({ kind: 'rectangle', x: 32, y: 32, width: 32, height: 32 });
    expect(objects.getDisplayObject(objects.objects[0]!)).toMatchObject({ kind: 'point', x: 167, y: 39 });
    expect(objects.getDisplayObject(objects.objects[1]!)).toMatchObject({
      kind: 'polygon',
      x: 135,
      y: 23,
      points: [
        { x: 0, y: 0 },
        { x: 32, y: 16 },
        { x: 0, y: 32 },
        { x: -32, y: 16 },
      ],
    });
    expect(objects.getDisplayObject(objects.objects[2]!)).toMatchObject({ kind: 'tile', x: 135, y: -57, width: 64, height: 96 });
  });
});
