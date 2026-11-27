import { describe, expect, it } from 'vitest';

import { TILED_FLIPPED_DIAGONALLY_FLAG, TILED_FLIPPED_HORIZONTALLY_FLAG, TILED_ROTATED_HEXAGONAL_120_FLAG } from '../src/gid';
import { TiledFormatError } from '../src/validate';
import { loadFixture, makeTiledContext } from './type-context';

const staggeredMap = (overrides: Record<string, unknown> = {}, data: number[] = [1, 1, 1, 1]): Record<string, unknown> => ({
  type: 'map',
  version: '1.10',
  orientation: 'staggered',
  staggeraxis: 'x',
  staggerindex: 'even',
  width: 2,
  height: 2,
  tilewidth: 64,
  tileheight: 32,
  infinite: false,
  layers: [{ id: 1, name: 'Ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: 2, height: 2, data }],
  tilesets: [
    {
      firstgid: 1,
      name: 'tiles',
      image: 'tiles.png',
      imagewidth: 64,
      imageheight: 32,
      tilewidth: 64,
      tileheight: 32,
      columns: 1,
      tilecount: 1,
    },
  ],
  ...overrides,
});

const load = (document: unknown) => {
  const { loadSource } = makeTiledContext({ 'map.tmj': document }, { 'tiles.png': { w: 64, h: 32 } });

  return loadSource('map.tmj');
};

describe('staggered and hexagonal Tiled maps', () => {
  it('converts a hexagonal map with its stagger layout and pixel-space objects', async () => {
    const { loadSource } = makeTiledContext({ 'hexagonal.tmj': loadFixture('hexagonal.tmj') }, { 'hex-tiles.png': { w: 56, h: 32 } });
    const source = await loadSource('hexagonal.tmj');
    const tileMap = source.toTileMap();
    const projection = tileMap.projection;

    expect([source.staggerAxis, source.staggerIndex, source.hexSideLength]).toEqual(['y', 'odd', 16]);
    expect(projection).toMatchObject({ orientation: 'hexagonal', staggerAxis: 'y', staggerIndex: 'odd', hexSideLength: 16, originX: 0 });
    // Tiled sizes a 3x3 pointy hex map of 28x32 cells to 98x80.
    expect([tileMap.pixelWidth, tileMap.pixelHeight]).toEqual([3 * 28 + 14, 3 * 24 + 8]);

    const ground = tileMap.getTileLayer('Ground')!;

    expect(ground.tileToPixel(1, 1)).toEqual({ x: 28 + 14, y: 24 });
    expect(ground.pixelToTile(42 + 14, 24 + 16)).toEqual({ tx: 1, ty: 1 });
    expect(ground.getTileAt(1, 1)).toMatchObject({ localTileId: 0 });

    // Tiled stores objects of these maps in plain pixels; nothing is projected.
    const spawn = tileMap.objectLayers[0]!;

    expect(spawn.getDisplayObject(spawn.objects[0]!)).toMatchObject({ x: 42, y: 40 });
  });

  it('reads the stagger axis and index of a staggered map', async () => {
    const tileMap = (await load(staggeredMap())).toTileMap();

    expect(tileMap.projection).toMatchObject({ orientation: 'staggered', staggerAxis: 'x', staggerIndex: 'even', hexSideLength: 0 });
    // Even columns shift down by half a row when the even index is staggered.
    expect(tileMap.getTileLayer('Ground')!.tileToPixel(0, 0)).toEqual({ x: 0, y: 16 });
  });

  it("defaults to Tiled's y axis and odd index when the file leaves them out", async () => {
    const source = await load(staggeredMap({ staggeraxis: undefined, staggerindex: undefined }));

    expect([source.staggerAxis, source.staggerIndex]).toEqual(['y', 'odd']);
  });

  it('keeps signed chunk coordinates of an infinite staggered map', async () => {
    const infinite = staggeredMap({
      infinite: true,
      layers: [
        {
          id: 1,
          name: 'Ground',
          type: 'tilelayer',
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          width: 16,
          height: 16,
          startx: -16,
          starty: -16,
          chunks: [{ x: -16, y: -16, width: 16, height: 16, data: Array.from({ length: 256 }, (_, i) => (i === 255 ? 1 : 0)) }],
        },
      ],
    });
    const source = await load(infinite);
    const tileMap = source.toTileMap();
    const layer = tileMap.getTileLayer('Ground')!;
    const chunk = await source.getChunkSource(layer.id)!.getChunk(-1, -1);

    expect(chunk).not.toBeNull();
    // Column -1 is odd, so with the even index it stays unshifted.
    expect(layer.tileToPixel(-1, -1)).toEqual({ x: -32, y: -32 });
  });

  it('rejects an invalid stagger axis', async () => {
    await expect(load(staggeredMap({ staggeraxis: 'z' }))).rejects.toThrow(/unknown staggeraxis "z"/);
  });

  it('rejects hexagonal tiles rotated by 60 or 120 degrees, but keeps flipped ones', async () => {
    const hexagonal = { orientation: 'hexagonal', hexsidelength: 16, staggeraxis: 'y' };
    const flipped = (TILED_FLIPPED_HORIZONTALLY_FLAG + 1) >>> 0;

    expect(
      (await load(staggeredMap(hexagonal, [flipped, 1, 1, 1]))).toTileMap().getTileLayer('Ground')!.getTileAt(0, 0)!.transform.flipX,
    ).toBe(true);

    for (const flag of [TILED_FLIPPED_DIAGONALLY_FLAG, TILED_ROTATED_HEXAGONAL_120_FLAG]) {
      const source = await load(staggeredMap(hexagonal, [1, (flag + 1) >>> 0, 1, 1]));

      expect(() => source.toTileMap()).toThrow(TiledFormatError);
      expect(() => source.toTileMap()).toThrow(/rotated by 60 or 120 degrees/);
    }
  });
});
