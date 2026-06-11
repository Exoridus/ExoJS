/**
 * Tilemap scene fixtures + renderer wiring for the benchmark harness. The
 * tilemap renderer lives in `@codexo/exojs-tilemap` and is wired the same way an
 * Application would: materialise the extension's renderer bindings into the
 * backend (the chunk drawable resolves through the registry prototype walk).
 *
 * @internal Test/perf-only.
 */
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import { materializeRendererBindings } from '#extensions/materialize';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

// Internal chunk-geometry rebuild counter (test/perf instrumentation). Imported
// from the package's exact source file so it shares the module instance the chunk
// nodes use (same absolute path Vite resolves `./chunkGeometry` to).
import { getTileGeometryRebuildCount, resetTileGeometryRebuildCount } from '../../../packages/exojs-tilemap/src/chunkGeometry';

/** Materialise the tilemap renderer binding into a harness backend. */
export const wireTilemapRenderers = (backend: RenderBackend): void => {
  materializeRendererBindings(backend, tilemapExtension.renderers ?? []);
};

/** Read the cumulative chunk-geometry rebuild count. */
export const readTilemapRebuilds = (): number => getTileGeometryRebuildCount();

/** Reset the chunk-geometry rebuild counter (call before a measured frame). */
export const resetTilemapRebuilds = (): void => resetTileGeometryRebuildCount();

const makeTileTexture = (size: number): Texture => {
  const texture = new Texture();
  texture.setSize(size, size);

  return texture;
};

/** Build `count` independent tilesets, each over its own atlas texture. */
export const makeTilesets = (count: number, tileSize = 16, atlas = 256): TileSet[] =>
  Array.from({ length: count }, (_unused, index) => {
    const across = Math.floor(atlas / tileSize);

    return new TileSet({
      name: `tiles${index}`,
      texture: new TextureRegion(makeTileTexture(atlas), { x: 0, y: 0, width: atlas, height: atlas }),
      tileWidth: tileSize,
      tileHeight: tileSize,
      tileCount: across * across,
    });
  });

export interface TilemapSceneConfig {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSize?: number;
  readonly chunkSize?: number;
  readonly tilesets: readonly TileSet[];
  /** Which tileset index a tile at (tx, ty) draws from. Default: all tileset 0. */
  readonly tilesetAssign?: (tx: number, ty: number) => number;
  readonly layers?: number;
  /** Per-cell fill fraction in [0, 1]. `1` = dense; lower leaves deterministic gaps. */
  readonly fill?: number;
  readonly cullable?: boolean;
}

export interface TilemapScene {
  readonly map: TileMap;
  readonly node: TileMapNode;
  readonly layers: readonly TileLayer[];
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export const buildTilemapScene = (config: TilemapSceneConfig): TilemapScene => {
  const {
    widthTiles,
    heightTiles,
    tileSize = 16,
    chunkSize = 32,
    tilesets,
    tilesetAssign = (): number => 0,
    layers: layerCount = 1,
    fill = 1,
    cullable = true,
  } = config;
  const layers: TileLayer[] = [];

  for (let l = 0; l < layerCount; l++) {
    const layer = new TileLayer({
      id: l + 1,
      name: `layer${l}`,
      width: widthTiles,
      height: heightTiles,
      tileWidth: tileSize,
      tileHeight: tileSize,
      chunkWidth: chunkSize,
      chunkHeight: chunkSize,
      tilesets,
    });

    for (let ty = 0; ty < heightTiles; ty++) {
      for (let tx = 0; tx < widthTiles; tx++) {
        // Deterministic sparse pattern: keep ~`fill` of the cells.
        if (fill < 1 && ((tx * 31 + ty * 17) % 997) / 997 >= fill) {
          continue;
        }

        const tileset = tilesets[tilesetAssign(tx, ty) % tilesets.length];

        layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    layers.push(layer);
  }

  const map = new TileMap({
    name: 'bench',
    width: widthTiles,
    height: heightTiles,
    tileWidth: tileSize,
    tileHeight: tileSize,
    tilesets,
    layers,
  });

  return {
    map,
    node: new TileMapNode(map, { cullable }),
    layers,
    pixelWidth: widthTiles * tileSize,
    pixelHeight: heightTiles * tileSize,
  };
};
