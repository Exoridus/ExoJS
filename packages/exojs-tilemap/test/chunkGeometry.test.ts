import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { buildChunkPages, orientCode } from '../src/chunkGeometry';
import type { ReadonlyTileChunk } from '../src/TileChunk';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import { packTile, TILE_TRANSFORM_IDENTITY } from '../src/types';

// ── helpers ────────────────────────────────────────────────────────────

function fakeTexture(width = 512, height = 512): Texture {
  return {
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(name = 'tiles', tileCount = 16, tw = 32, th = 32, texW = 512, texH = 512): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(fakeTexture(texW, texH), { x: 0, y: 0, width: texW, height: texH }),
    tileWidth: tw,
    tileHeight: th,
    tileCount,
  });
}

function makeLayer(tilesets: TileSet[], width = 4, height = 4): TileLayer {
  return new TileLayer({
    id: 1,
    name: 'ground',
    width,
    height,
    tileWidth: 32,
    tileHeight: 32,
    tilesets,
  });
}

/** Minimal fixed-content chunk stub for the defensive out-of-range paths. */
function stubChunk(raw: number): ReadonlyTileChunk {
  return {
    cx: 0,
    cy: 0,
    width: 1,
    height: 1,
    empty: false,
    revision: 1,
    getRawAt: () => raw,
    cloneTiles: () => new Uint32Array([raw]),
  };
}

// ═══════════════════════════════════════════════════════════════════════

describe('orientCode', () => {
  it('maps the 8 transform combinations to 0..7', () => {
    expect(orientCode({ flipX: false, flipY: false, diagonal: false })).toBe(0);
    expect(orientCode({ flipX: true, flipY: false, diagonal: false })).toBe(1);
    expect(orientCode({ flipX: false, flipY: true, diagonal: false })).toBe(2);
    expect(orientCode({ flipX: true, flipY: true, diagonal: false })).toBe(3);
    expect(orientCode({ flipX: false, flipY: false, diagonal: true })).toBe(4);
    expect(orientCode({ flipX: true, flipY: true, diagonal: true })).toBe(7);
  });
});

describe('buildChunkPages', () => {
  it('returns no pages for an empty chunk', () => {
    const tileset = makeTileset();
    const layer = makeLayer([tileset]);
    // No tiles set → the chunk never materialises.
    const chunk = layer.getChunk(0, 0);
    expect(chunk).toBeUndefined();
  });

  it('builds one page with one quad and correct UVs for a single tile', () => {
    const tileset = makeTileset('tiles', 16, 32, 32, 512, 512);
    const layer = makeLayer([tileset]);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const chunk = layer.getChunk(0, 0)!;
    const pages = buildChunkPages(chunk, [tileset], 32, 32);

    expect(pages).toHaveLength(1);
    expect(pages[0].tileset).toBe(tileset);
    expect(pages[0].quads).toHaveLength(1);

    const quad = pages[0].quads[0];
    // Tile 0 of a 32px grid in a 512px texture → [0, 0]..[0.0625, 0.0625].
    expect(quad.u0).toBeCloseTo(0, 6);
    expect(quad.v0).toBeCloseTo(0, 6);
    expect(quad.u1).toBeCloseTo(32 / 512, 6);
    expect(quad.v1).toBeCloseTo(32 / 512, 6);
    // Destination rect is the chunk-local cell.
    expect(quad.x0).toBe(0);
    expect(quad.y0).toBe(0);
    expect(quad.x1).toBe(32);
    expect(quad.y1).toBe(32);
    expect(quad.orient).toBe(0);
  });

  it('uses the second column UVs for local tile id 1', () => {
    const tileset = makeTileset('tiles', 16, 32, 32, 512, 512);
    const layer = makeLayer([tileset]);
    layer.setTileAt(1, 0, { tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [tileset], 32, 32);
    const quad = pages[0].quads[0];

    expect(quad.u0).toBeCloseTo(32 / 512, 6);
    expect(quad.u1).toBeCloseTo(64 / 512, 6);
    // Cell (1,0) → local x starts at 32.
    expect(quad.x0).toBe(32);
    expect(quad.x1).toBe(64);
  });

  it('carries the per-tile orientation code through to the quad', () => {
    const tileset = makeTileset();
    const layer = makeLayer([tileset]);
    layer.setTileAt(0, 0, { tileset, localTileId: 2, transform: { flipX: true, flipY: false, diagonal: true } });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [tileset], 32, 32);

    expect(pages[0].quads[0].orient).toBe(orientCode({ flipX: true, flipY: false, diagonal: true }));
  });

  it('bottom-left aligns tiles taller than the map cell', () => {
    // 32×48 tiles drawn on a 32px grid extend 16px upward.
    const tileset = makeTileset('tall', 8, 32, 48, 256, 256);
    const layer = makeLayer([tileset]);
    layer.setTileAt(0, 1, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [tileset], 32, 32);
    const quad = pages[0].quads[0];

    // Cell (0,1): bottom edge at y = 2*32 = 64; a 48px tile starts at 64-48 = 16.
    expect(quad.y1).toBe(64);
    expect(quad.y0).toBe(16);
    expect(quad.x0).toBe(0);
    expect(quad.x1).toBe(32);
  });

  it('groups tiles by tileset in tileset-array order (multiple tilesets)', () => {
    const tsA = makeTileset('a', 16, 32, 32, 512, 512);
    const tsB = makeTileset('b', 16, 32, 32, 512, 512);
    const layer = makeLayer([tsA, tsB]);
    // Interleave: A, B, A across the row.
    layer.setTileAt(0, 0, { tileset: tsA, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: tsB, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(2, 0, { tileset: tsA, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const pages = buildChunkPages(layer.getChunk(0, 0)!, [tsA, tsB], 32, 32);

    expect(pages).toHaveLength(2);
    expect(pages[0].tileset).toBe(tsA);
    expect(pages[0].quads).toHaveLength(2);
    expect(pages[1].tileset).toBe(tsB);
    expect(pages[1].quads).toHaveLength(1);
  });

  it('skips cells whose packed tileset index is out of range (treated as empty)', () => {
    const tileset = makeTileset();
    // tilesetIndex 5, but only one tileset is available.
    const pages = buildChunkPages(stubChunk(packTile(5, 0, TILE_TRANSFORM_IDENTITY)), [tileset], 32, 32);
    expect(pages).toHaveLength(0);
  });

  it('skips cells whose local tile id is out of range (treated as empty)', () => {
    const tileset = makeTileset('tiles', 16);
    // localTileId 20 exceeds tileCount 16.
    const pages = buildChunkPages(stubChunk(packTile(0, 20, TILE_TRANSFORM_IDENTITY)), [tileset], 32, 32);
    expect(pages).toHaveLength(0);
  });
});
