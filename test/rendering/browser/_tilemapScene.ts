import type { TileTransform } from '@codexo/exojs/tilemap';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileProjection, TileSet } from '@codexo/exojs/tilemap';
import { tiledExtension } from '@codexo/exojs-tiled';

import { materializeRendererBindings } from '#extensions/materialize';
import { buildSnapshot } from '#extensions/snapshot';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

/**
 * Shared helpers for the WebGL2/WebGPU tilemap browser tests. The tilemap nodes
 * only emit `TileChunkNode` drawables, so the tests wire just the tilemap
 * renderer binding - no core renderers and therefore no shader-file mocks.
 */

/** Materialise the tilemap renderer binding directly into a bare test backend. */
export const wireTilemapRenderers = (backend: RenderBackend): void => {
  materializeRendererBindings(backend, tilemapExtension.renderers ?? []);
};

/**
 * Wire renderers the way an Application would for `extensions: [tiledExtension]`:
 * resolve the extension dependency snapshot (which pulls in `tilemapExtension`)
 * and materialise its renderer bindings. Proves the one-extension Tiled path -
 * loading is unit-tested in the Tiled package; this exercises rendering.
 */
export const wireViaTiledExtension = (backend: RenderBackend): void => {
  materializeRendererBindings(backend, buildSnapshot([tiledExtension]).renderers);
};

/** A `size`×`size` solid-colour texture. */
export const createSolidTexture = (color: string, size = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(canvas);
};

/**
 * A 16×16 four-quadrant atlas: top-left red, top-right green, bottom-left blue,
 * bottom-right white. Rendered as one 16×16 tile, every flip/rotation
 * orientation produces a distinct, observable quadrant arrangement.
 */
export const createQuadrantTexture = (): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = 16;
  canvas.height = 16;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 8, 8); // top-left
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(8, 0, 8, 8); // top-right
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 8, 8, 8); // bottom-left
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 8, 8, 8); // bottom-right

  return new Texture(canvas);
};

/** A single 16×16 tile tileset over a texture (`tileCount` covering the grid). */
export const makeTileset = (texture: Texture, name = 'tiles', tileCount = 1): TileSet =>
  new TileSet({
    name,
    texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
  });

/** Build a 1×1 map containing a single tile with the given orientation. */
export const singleTileMap = (texture: Texture, transform: TileTransform = TILE_TRANSFORM_IDENTITY): TileMap => {
  const tileset = makeTileset(texture);
  const layer = new TileLayer({ id: 1, name: 'ground', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset] });

  layer.setTileAt(0, 0, { tileset, localTileId: 0, transform });

  return new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
};

/** Opaque overlapping tiles exercise painter order across both chunk axes. */
export const isometricOverlapMap = (red: Texture, blue: Texture): TileMap => {
  const tilesets = [makeTileset(red, 'red'), makeTileset(blue, 'blue')];
  const projection = new TileProjection({ orientation: 'isometric', tileWidth: 16, tileHeight: 8, originX: 32 });
  const layer = new TileLayer({
    id: 1,
    name: 'iso',
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 8,
    chunkWidth: 2,
    chunkHeight: 2,
    tilesets,
    projection,
  });

  for (let y = 3; y >= 0; y--) {
    for (let x = 3; x >= 0; x--) {
      layer.setTileAt(x, y, { tileset: tilesets[(x + y) % 2]!, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }

  return new TileMap({ width: 4, height: 4, tileWidth: 16, tileHeight: 8, tilesets, layers: [layer], projection });
};

/** A `width`×`height` solid-colour texture. */
export const createSolidRectTexture = (color: string, width: number, height: number): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(canvas);
};

/**
 * Opaque artwork overhanging orthogonal chunk borders (chunks one cell wide, two
 * cells tall), installed nearest-first rather than in draw order: a 16x48 tree in
 * the top row of chunk (0, 1) rising through chunk (0, 0), and a 32x32 crate in
 * row 1 of chunk (2, 0) reaching over row 0 of chunk (3, 0). Tiled draws both
 * overhangs on top of the ground they cover.
 */
export const orthogonalOverhangLayer = (ground: Texture, tree: Texture, crate: Texture): { layer: TileLayer; streamIn: () => void } => {
  const groundSet = makeTileset(ground, 'ground');
  const props = new TileSet({
    name: 'props',
    tileWidth: 32,
    tileHeight: 48,
    tileImages: [
      new TextureRegion(tree, { x: 0, y: 0, width: tree.width, height: tree.height }),
      new TextureRegion(crate, { x: 0, y: 0, width: crate.width, height: crate.height }),
    ],
  });
  const options = { id: 1, name: 'overhang', tileWidth: 16, tileHeight: 16, chunkWidth: 1, chunkHeight: 2, tilesets: [groundSet, props] };
  const authored = new TileLayer(options);
  const layer = new TileLayer(options);
  const place = (tx: number, ty: number, tileset: TileSet, localTileId: number): void =>
    authored.setTileAt(tx, ty, { tileset, localTileId, transform: TILE_TRANSFORM_IDENTITY });

  place(0, 0, groundSet, 0);
  place(0, 1, groundSet, 0);
  place(1, 0, groundSet, 0);
  place(3, 0, groundSet, 0);
  place(0, 2, props, 0);
  place(2, 1, props, 1);

  // Installed after the node exists, as a chunk streamer would.
  const streamIn = (): void => {
    for (const [cx, cy] of [
      [0, 1],
      [3, 0],
      [2, 0],
      [1, 0],
      [0, 0],
    ] as const) {
      const chunk = authored.getChunk(cx, cy)!;
      const tiles = new Uint32Array(chunk.width * chunk.height);

      for (let ly = 0; ly < chunk.height; ly++) {
        for (let lx = 0; lx < chunk.width; lx++) {
          tiles[ly * chunk.width + lx] = chunk.getRawAt(lx, ly);
        }
      }

      layer._adoptChunk(cx, cy, { width: chunk.width, height: chunk.height, tiles });
    }
  };

  return { layer, streamIn };
};
