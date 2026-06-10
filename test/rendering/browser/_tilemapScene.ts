import { tiledExtension } from '@codexo/exojs-tiled';
import type { TileTransform } from '@codexo/exojs-tilemap';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension,TileSet } from '@codexo/exojs-tilemap';

import { materializeRendererBindings } from '#extensions/materialize';
import { buildSnapshot } from '#extensions/snapshot';
import type { RenderBackend } from '#rendering/RenderBackend';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

/**
 * Shared helpers for the WebGL2/WebGPU tilemap browser tests. The tilemap nodes
 * only emit `TileChunkNode` drawables, so the tests wire just the tilemap
 * renderer binding — no core renderers and therefore no shader-file mocks.
 */

/** Materialise the tilemap renderer binding directly into a bare test backend. */
export function wireTilemapRenderers(backend: RenderBackend): void {
  materializeRendererBindings(backend, tilemapExtension.renderers ?? []);
}

/**
 * Wire renderers the way an Application would for `extensions: [tiledExtension]`:
 * resolve the extension dependency snapshot (which pulls in `tilemapExtension`)
 * and materialise its renderer bindings. Proves the one-extension Tiled path —
 * loading is unit-tested in the Tiled package; this exercises rendering.
 */
export function wireViaTiledExtension(backend: RenderBackend): void {
  materializeRendererBindings(backend, buildSnapshot([tiledExtension]).renderers);
}

/** A `size`×`size` solid-colour texture. */
export function createSolidTexture(color: string, size = 16): Texture {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(canvas);
}

/**
 * A 16×16 four-quadrant atlas: top-left red, top-right green, bottom-left blue,
 * bottom-right white. Rendered as one 16×16 tile, every flip/rotation
 * orientation produces a distinct, observable quadrant arrangement.
 */
export function createQuadrantTexture(): Texture {
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
}

/** A single 16×16 tile tileset over a texture (`tileCount` covering the grid). */
export function makeTileset(texture: Texture, name = 'tiles', tileCount = 1): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
  });
}

/** Build a 1×1 map containing a single tile with the given orientation. */
export function singleTileMap(texture: Texture, transform: TileTransform = TILE_TRANSFORM_IDENTITY): TileMap {
  const tileset = makeTileset(texture);
  const layer = new TileLayer({ id: 1, name: 'ground', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset] });

  layer.setTileAt(0, 0, { tileset, localTileId: 0, transform });

  return new TileMap({ name: 'm', width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [layer] });
}
