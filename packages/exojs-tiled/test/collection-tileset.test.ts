import { Texture } from '@codexo/exojs';
import { ObjectKind } from '@codexo/exojs/tilemap';
import { describe, expect, it } from 'vitest';

import type { TiledTilesetData } from '../src/data';
import { TiledMap } from '../src/TiledMap';
import { TiledTileset } from '../src/TiledTileset';
import { TiledFormatError, validateTiledMapData } from '../src/validate';

const makeTexture = (width: number, height: number): Texture => {
  const texture = new Texture();

  texture.width = width;
  texture.height = height;

  return texture;
};

// A collection whose tile 1 was removed in the editor: ids 0, 2 and 3 remain,
// so `tilecount` is 3 but the ids reach 3 and the next tileset starts at gid 5.
const props: TiledTilesetData = {
  name: 'props',
  tilewidth: 48,
  tileheight: 96,
  tilecount: 3,
  columns: 0,
  tiles: [
    { id: 0, image: 'rock.png', imagewidth: 32, imageheight: 32 },
    { id: 2, image: 'tree.png', imagewidth: 48, imageheight: 96, properties: [{ name: 'solid', type: 'bool', value: true }] },
    // Tiled 1.9+ sub-rectangle: the right half of a 64x32 sheet.
    { id: 3, image: 'sheet.png', imagewidth: 64, imageheight: 32, x: 32, y: 0, width: 32, height: 32 },
  ],
};

const atlasData: TiledTilesetData = {
  name: 'ground',
  tilewidth: 32,
  tileheight: 32,
  tilecount: 2,
  columns: 2,
  image: 'ground.png',
  imagewidth: 64,
  imageheight: 32,
};

const textures = {
  rock: makeTexture(32, 32),
  tree: makeTexture(48, 96),
  sheet: makeTexture(64, 32),
  ground: makeTexture(64, 32),
};

const propsTileset = (data: TiledTilesetData = props): TiledTileset =>
  new TiledTileset(data, 1, {
    tileTextures: new Map([
      [0, textures.rock],
      [2, textures.tree],
      [3, textures.sheet],
    ]),
  });

const groundTileset = (): TiledTileset => new TiledTileset(atlasData, 5, { imageUrl: 'ground.png', texture: textures.ground });

const mapOf = (
  data: readonly number[],
  tilesets: TiledTileset[] = [propsTileset(), groundTileset()],
  objects: unknown[] = [],
): TiledMap => {
  const raw = validateTiledMapData(
    {
      type: 'map',
      version: '1.10',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      width: data.length,
      height: 1,
      tilewidth: 32,
      tileheight: 32,
      infinite: false,
      layers: [
        { id: 1, name: 'Ground', type: 'tilelayer', visible: true, x: 0, y: 0, width: data.length, height: 1, opacity: 1, data },
        { id: 2, name: 'Things', type: 'objectgroup', visible: true, x: 0, y: 0, opacity: 1, draworder: 'topdown', objects },
      ],
      tilesets: [
        { firstgid: 1, ...props },
        { firstgid: 5, ...atlasData },
      ],
    },
    'props.tmj',
  );

  return new TiledMap('props.tmj', raw, tilesets);
};

describe('collection-of-images tilesets', () => {
  it('spans gids up to the highest tile id, so the next tileset starts after removed ids', () => {
    const map = mapOf([1, 3, 4, 5, 6]);

    expect(map.tilesets[0]!.idCount).toBe(4);
    expect(map.tilesets[0]!.lastGid).toBe(4);
    expect(map.findTilesetForGid(4)?.name).toBe('props');
    expect(map.findTilesetForGid(5)?.name).toBe('ground');
  });

  it('converts to a runtime tileset that samples every tile from its own image', () => {
    const tileMap = mapOf([1, 3, 4, 5]).toTileMap();
    const runtime = tileMap.getTileset('props')!;

    expect(runtime.texture).toBeNull();
    expect(runtime.tileCount).toBe(4);
    expect(runtime.getTileTexture(0)!.texture).toBe(textures.rock);
    expect(runtime.getTileTexture(1)).toBeNull();
    expect(runtime.getTileTexture(2)!.texture).toBe(textures.tree);
    expect(runtime.getTileTexture(3)!.texture).toBe(textures.sheet);
    expect(runtime.getTileTexture(3)!).toMatchObject({ x: 32, y: 0, width: 32, height: 32 });
    expect(runtime.getTileRect(2)).toEqual({ x: 0, y: 0, width: 48, height: 96 });
    expect([runtime.tileWidth, runtime.tileHeight]).toEqual([48, 96]);
    expect(runtime.getTileDefinition(2)?.properties).toEqual({ solid: true });
  });

  it('resolves cells of both a collection and an atlas in one layer', () => {
    const layer = mapOf([1, 3, 4, 5, 6]).toTileMap().getTileLayer('Ground')!;

    expect(layer.getTileAt(0, 0)).toMatchObject({ localTileId: 0 });
    expect(layer.getTileAt(1, 0)).toMatchObject({ localTileId: 2 });
    expect(layer.getTileAt(2, 0)).toMatchObject({ localTileId: 3 });
    expect(layer.getTileAt(3, 0)?.tileset.name).toBe('ground');
    expect(layer.getTileAt(4, 0)).toMatchObject({ localTileId: 1 });
  });

  it('keeps tile objects of a collection resolvable to their own image', () => {
    const tree = { id: 7, name: 'oak', type: '', x: 64, y: 32, width: 48, height: 96, rotation: 0, visible: true, gid: 3 };
    const tileMap = mapOf([0], undefined, [tree]).toTileMap();
    const object = tileMap.objectLayers[0]!.objects[0]!;

    expect(object.kind).toBe(ObjectKind.Tile);

    if (object.kind === ObjectKind.Tile) {
      expect(object.tile.tileset.getTileTexture(object.tile.localTileId)!.texture).toBe(textures.tree);
    }
  });

  it('keeps animations that cycle through separate images', () => {
    const animated: TiledTilesetData = {
      ...props,
      tiles: [
        {
          ...props.tiles![0]!,
          animation: [
            { tileid: 0, duration: 100 },
            { tileid: 2, duration: 100 },
          ],
        },
        ...props.tiles!.slice(1),
      ],
    };
    const runtime = mapOf([1], [propsTileset(animated), groundTileset()])
      .toTileMap()
      .getTileset('props')!;

    expect(runtime.getTileDefinition(0)?.animation).toEqual([
      { localTileId: 0, duration: 100 },
      { localTileId: 2, duration: 100 },
    ]);
  });

  it('rejects a tile sub-rectangle that leaves its image', () => {
    const broken: TiledTilesetData = { ...props, tiles: [{ id: 0, image: 'rock.png', x: 16, y: 0, width: 32, height: 32 }] };

    expect(() => mapOf([1], [propsTileset(broken), groundTileset()]).toTileMap()).toThrow(TiledFormatError);
    expect(() => mapOf([1], [propsTileset(broken), groundTileset()]).toTileMap()).toThrow(/tile 0 cuts 32x32 at \(16, 0\)/);
  });
});
