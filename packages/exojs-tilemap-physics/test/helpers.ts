import { type Texture, TextureRegion } from '@codexo/exojs';
import {
  ObjectKind,
  ObjectLayer,
  TILE_TRANSFORM_IDENTITY,
  type TileDefinition,
  TileLayer,
  type TileMapObject,
  TileSet,
  type TileTransform,
} from '@codexo/exojs-tilemap';

export const TILE = 16;

const fakeTexture = (): Texture => ({ destroyed: false, destroy: () => {}, height: 512, label: 'test', uid: 0, width: 512 }) as unknown as Texture;

const fakeRegion = (): TextureRegion => new TextureRegion(fakeTexture(), { height: 512, width: 512, x: 0, y: 0 });

/** A tile-local collision shape, defaulting to a full tile rectangle. */
export const shape = (overrides: Partial<TileMapObject> = {}): TileMapObject =>
  ({
    kind: ObjectKind.Rectangle,
    id: 1,
    name: '',
    type: 'solid',
    x: 0,
    y: 0,
    width: TILE,
    height: TILE,
    rotation: 0,
    visible: true,
    properties: {},
    ...overrides,
  }) as TileMapObject;

export const makeTileset = (collisionByTile: Record<number, readonly TileMapObject[]>): TileSet => {
  const tileset = new TileSet({
    name: 'ts',
    texture: fakeRegion(),
    tileWidth: TILE,
    tileHeight: TILE,
    tileCount: 16,
    columns: 4,
  });
  const definitions: TileDefinition[] = Object.entries(collisionByTile).map(([id, collision]) => ({
    localTileId: Number(id),
    collision,
  }));

  tileset._setDefinitions(definitions);

  return tileset;
};

export interface LayerSetup {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly chunkWidth?: number;
  readonly chunkHeight?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export const makeLayer = (tileset: TileSet, setup: LayerSetup = {}): TileLayer =>
  new TileLayer({
    id: 1,
    name: 'ground',
    ...(setup.width !== undefined && setup.height !== undefined && { width: setup.width, height: setup.height }),
    tileWidth: TILE,
    tileHeight: TILE,
    chunkWidth: setup.chunkWidth ?? 4,
    chunkHeight: setup.chunkHeight ?? 4,
    tilesets: [tileset],
    offsetX: setup.offsetX ?? 0,
    offsetY: setup.offsetY ?? 0,
  });

export const place = (
  layer: TileLayer,
  tileset: TileSet,
  tx: number,
  ty: number,
  localTileId = 0,
  transform: TileTransform = TILE_TRANSFORM_IDENTITY,
): void => {
  layer.setTileAt(tx, ty, { tileset, localTileId, transform });
};

export const makeObjectLayer = (objects: readonly TileMapObject[], offsetX = 0, offsetY = 0): ObjectLayer =>
  new ObjectLayer({ id: 2, name: 'objects', objects, offsetX, offsetY });
