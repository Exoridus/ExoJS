import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TileChunk } from '../src/TileChunk';
import { TileLayer } from '../src/TileLayer';
import { TileMap } from '../src/TileMap';
import { TileSet } from '../src/TileSet';
import {
  packTile,
  TILE_TRANSFORM_IDENTITY,
  tileToChunkCoord,
  tileToLocalInChunk,
  tileTransformLabel,
  unpackTile,
} from '../src/types';

// ── helpers ────────────────────────────────────────────────────────────

function fakeTexture(): Texture {
  return {
    width: 512,
    height: 512,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

function fakeRegion(tw = 512, th = 512): TextureRegion {
  return new TextureRegion(fakeTexture(), { x: 0, y: 0, width: tw, height: th });
}

function makeTileset(name: string, tileCount = 16, tw = 32, th = 32): TileSet {
  return new TileSet({
    name,
    texture: fakeRegion(512, 512),
    tileWidth: tw,
    tileHeight: th,
    tileCount,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Tile identity & packing
// ═══════════════════════════════════════════════════════════════════════

describe('tile packing', () => {
  it('pack/unpack roundtrip', () => {
    const packed = packTile(0, 5, { flipX: true, flipY: false, diagonal: false });
    const unpacked = unpackTile(packed);
    expect(unpacked).not.toBeNull();
    expect(unpacked!.tilesetIndex).toBe(0);
    expect(unpacked!.localTileId).toBe(5);
    expect(unpacked!.transform.flipX).toBe(true);
    expect(unpacked!.transform.flipY).toBe(false);
    expect(unpacked!.transform.diagonal).toBe(false);
  });

  it('empty tile is 0', () => {
    expect(unpackTile(0)).toBeNull();
  });

  it('all 8 transform combinations roundtrip', () => {
    for (const flipX of [false, true]) {
      for (const flipY of [false, true]) {
        for (const diagonal of [false, true]) {
          const t = { flipX, flipY, diagonal };
          const packed = packTile(0, 1, t);
          const u = unpackTile(packed)!;
          expect(u.transform).toEqual(t);
        }
      }
    }
  });

  it('rejects tileset index overflow', () => {
    expect(() => packTile(512, 1, TILE_TRANSFORM_IDENTITY)).toThrow();
  });

  it('rejects local tile ID overflow', () => {
    expect(() => packTile(0, (1 << 20) - 1, TILE_TRANSFORM_IDENTITY)).toThrow();
  });

  it('rejects negative tileset index', () => {
    expect(() => packTile(-1, 1, TILE_TRANSFORM_IDENTITY)).toThrow();
  });

  it('identity transform packs as non-zero when localTileId=0', () => {
    // With the +1 offset, tile 0 stores as 1, not 0
    const packed = packTile(0, 0, TILE_TRANSFORM_IDENTITY);
    expect(packed).not.toBe(0);
    const u = unpackTile(packed)!;
    expect(u.localTileId).toBe(0);
  });

  it('TILE_TRANSFORM_IDENTITY is frozen identity', () => {
    expect(TILE_TRANSFORM_IDENTITY).toEqual({
      flipX: false,
      flipY: false,
      diagonal: false,
    });
    expect(Object.isFrozen(TILE_TRANSFORM_IDENTITY)).toBe(true);
  });
});

describe('tileTransformLabel', () => {
  it('identity', () => {
    expect(tileTransformLabel(TILE_TRANSFORM_IDENTITY)).toBe('identity');
  });
  it('flipX', () => {
    expect(tileTransformLabel({ flipX: true, flipY: false, diagonal: false })).toBe('flipX');
  });
  it('flipY', () => {
    expect(tileTransformLabel({ flipX: false, flipY: true, diagonal: false })).toBe('flipY');
  });
  it('diag+flipX+flipY', () => {
    expect(tileTransformLabel({ flipX: true, flipY: true, diagonal: true })).toBe('diag+flipX+flipY');
  });
});

describe('chunk coordinate math', () => {
  it('positive coords map to chunk 0', () => {
    expect(tileToChunkCoord(5, 7, 32, 32)).toEqual({ cx: 0, cy: 0 });
  });

  it('edge of chunk maps to next chunk', () => {
    expect(tileToChunkCoord(32, 0, 32, 32)).toEqual({ cx: 1, cy: 0 });
    expect(tileToChunkCoord(0, 32, 32, 32)).toEqual({ cx: 0, cy: 1 });
  });

  it('negative coords map to negative chunks', () => {
    expect(tileToChunkCoord(-1, -1, 32, 32)).toEqual({ cx: -1, cy: -1 });
    expect(tileToChunkCoord(-32, -32, 32, 32)).toEqual({ cx: -1, cy: -1 });
    expect(tileToChunkCoord(-33, -33, 32, 32)).toEqual({ cx: -2, cy: -2 });
  });

  it('local in chunk wraps correctly for negatives', () => {
    const { cx, cy } = tileToChunkCoord(-1, -5, 32, 32);
    const { lx, ly } = tileToLocalInChunk(-1, -5, 32, 32);
    expect(cx).toBe(-1);
    expect(cy).toBe(-1);
    expect(lx).toBe(31);
    expect(ly).toBe(27);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileSet
// ═══════════════════════════════════════════════════════════════════════

describe('TileSet', () => {
  it('basic construction', () => {
    const ts = new TileSet({
      name: 'test',
      texture: fakeRegion(256, 256),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 64,
    });
    expect(ts.name).toBe('test');
    expect(ts.tileWidth).toBe(32);
    expect(ts.tileHeight).toBe(32);
    expect(ts.tileCount).toBe(64);
    expect(ts.columns).toBe(8);
    expect(ts.rows).toBe(8);
  });

  it('custom columns', () => {
    const ts = new TileSet({
      name: 'test',
      texture: fakeRegion(320, 160),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
      columns: 4,
    });
    expect(ts.columns).toBe(4);
    expect(ts.rows).toBe(4);
  });

  it('spacing and margin affect grid', () => {
    const ts = new TileSet({
      name: 'test',
      texture: fakeRegion(320, 320),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 64,
      spacing: 2,
      margin: 4,
    });
    expect(ts.columns).toBeGreaterThanOrEqual(1);
  });

  it('getTileRect basic', () => {
    const ts = new TileSet({
      name: 'test',
      texture: fakeRegion(128, 128),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
    });
    const r = ts.getTileRect(0);
    expect(r).toEqual({ x: 0, y: 0, width: 32, height: 32 });

    const r2 = ts.getTileRect(5);
    expect(r2.x).toBe(32);
    expect(r2.y).toBe(32);
  });

  it('getTileRect with spacing and margin', () => {
    const ts = new TileSet({
      name: 'test',
      texture: fakeRegion(160, 160),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
      spacing: 2,
      margin: 4,
    });
    const r = ts.getTileRect(0);
    expect(r.x).toBe(4);
    expect(r.y).toBe(4);

    const r2 = ts.getTileRect(1);
    expect(r2.x).toBe(38);
  });

  it('getTileRect out of range throws', () => {
    const ts = makeTileset('test', 16);
    expect(() => ts.getTileRect(-1)).toThrow();
    expect(() => ts.getTileRect(16)).toThrow();
  });

  it('rejects zero tileWidth', () => {
    expect(() => new TileSet({
      name: 'test',
      texture: fakeRegion(),
      tileWidth: 0,
      tileHeight: 32,
      tileCount: 16,
    })).toThrow();
  });

  it('rejects non-integer tileCount', () => {
    expect(() => new TileSet({
      name: 'test',
      texture: fakeRegion(),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16.5,
    })).toThrow();
  });

  it('rejects null texture', () => {
    expect(() => new TileSet({
      name: 'test',
      texture: null!,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
    })).toThrow();
  });

  it('tile definitions are stored and retrievable', () => {
    const ts = makeTileset('test', 16);
    ts._setDefinition(0, { properties: { solid: true } });
    const def = ts.getTileDefinition(0);
    expect(def).toBeDefined();
    expect(def!.properties).toEqual({ solid: true });
  });

  it('tile definitions copy and freeze properties', () => {
    const ts = makeTileset('test', 16);
    const mutableProps = { solid: true };
    ts._setDefinition(0, { properties: mutableProps });
    mutableProps.solid = false;
    expect(ts.getTileDefinition(0)!.properties!.solid).toBe(true);
  });

  it('allDefinitions returns frozen snapshot', () => {
    const ts = makeTileset('test', 16);
    ts._setDefinition(0, { properties: { a: 1 } });
    const snap = ts.allDefinitions;
    expect(snap[0]).toEqual({ a: 1 });
    expect(snap[1]).toBeUndefined();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('definedTiles iterates sparse definitions', () => {
    const ts = makeTileset('test', 16);
    ts._setDefinition(3, { properties: {} });
    ts._setDefinition(7, { properties: {} });
    const ids = [...ts.definedTiles()].map(d => d.localTileId);
    expect(ids).toEqual([3, 7]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileChunk
// ═══════════════════════════════════════════════════════════════════════

describe('TileChunk', () => {
  it('basic construction', () => {
    const chunk = new TileChunk(0, 0, 32, 32);
    expect(chunk.cx).toBe(0);
    expect(chunk.cy).toBe(0);
    expect(chunk.width).toBe(32);
    expect(chunk.height).toBe(32);
    expect(chunk.cloneTiles().length).toBe(1024);
    expect(chunk.empty).toBe(true);
  });

  it('backing array is NOT exposed publicly', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    // The `tiles` property does not exist on the public interface
    expect((chunk as Record<string, unknown>).tiles).toBeUndefined();
  });

  it('source data is defensively copied', () => {
    const source = new Uint32Array(4);
    source[0] = 1;
    const chunk = new TileChunk(0, 0, 2, 2, source);
    source[0] = 99;
    expect(chunk.getRawAt(0, 0)).toBe(1);
  });

  it('_setRawAt returns true on change, false on no-op', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    expect(chunk._setRawAt(0, 0, 42)).toBe(true);
    expect(chunk._setRawAt(0, 0, 42)).toBe(false);
  });

  it('revision increments on change, not on no-op', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    expect(chunk.revision).toBe(0);
    chunk._setRawAt(0, 0, 42);
    expect(chunk.revision).toBe(1);
    chunk._setRawAt(0, 0, 42);
    expect(chunk.revision).toBe(1);
    chunk._setRawAt(1, 0, 99);
    expect(chunk.revision).toBe(2);
  });

  it('empty flag is cached and invalidated', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    expect(chunk.empty).toBe(true);
    chunk._setRawAt(0, 0, 42);
    expect(chunk.empty).toBe(false);
    chunk._setRawAt(0, 0, 0);
    expect(chunk.empty).toBe(true);
  });

  it('_clear sets all to 0 and increments revision if had content', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    chunk._setRawAt(0, 0, 42);
    const rev = chunk.revision;
    chunk._clear();
    expect(chunk.revision).toBe(rev + 1);
    expect(chunk.empty).toBe(true);
  });

  it('_clear on already-empty chunk is no-op', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    const rev = chunk.revision;
    chunk._clear();
    expect(chunk.revision).toBe(rev);
  });

  it('_markDirty invalidates empty cache and increments revision', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    chunk._markDirty();
    expect(chunk.revision).toBe(1);
  });

  it('negative chunk coordinates supported', () => {
    const chunk = new TileChunk(-3, -5, 16, 16);
    expect(chunk.cx).toBe(-3);
    expect(chunk.cy).toBe(-5);
  });

  it('rejects zero dimensions', () => {
    expect(() => new TileChunk(0, 0, 0, 32)).toThrow();
  });

  it('rejects unsafe allocation size', () => {
    expect(() => new TileChunk(0, 0, 1e8, 1e8)).toThrow();
  });

  it('rejects non-integer cx', () => {
    expect(() => new TileChunk(1.5, 0, 2, 2)).toThrow();
  });

  it('rejects non-finite cx', () => {
    expect(() => new TileChunk(NaN, 0, 2, 2)).toThrow();
    expect(() => new TileChunk(Infinity, 0, 2, 2)).toThrow();
  });

  it('rejects non-safe-integer cx', () => {
    expect(() => new TileChunk(Number.MAX_SAFE_INTEGER + 1, 0, 2, 2)).toThrow();
  });

  it('getRawAt validates local coordinates', () => {
    const chunk = new TileChunk(0, 0, 8, 8);
    expect(() => chunk.getRawAt(-1, 0)).toThrow();
    expect(() => chunk.getRawAt(0, -1)).toThrow();
    expect(() => chunk.getRawAt(8, 0)).toThrow();
    expect(() => chunk.getRawAt(0, 8)).toThrow();
    expect(() => chunk.getRawAt(0.5, 0)).toThrow();
    expect(() => chunk.getRawAt(NaN, 0)).toThrow();
  });

  it('_setRawAt validates local coordinates', () => {
    const chunk = new TileChunk(0, 0, 8, 8);
    expect(() => chunk._setRawAt(-1, 0, 1)).toThrow();
    expect(() => chunk._setRawAt(0, 8, 1)).toThrow();
    expect(chunk.revision).toBe(0); // no revision change on rejection
  });

  it('_setRawAt validates packed value is a finite integer', () => {
    const chunk = new TileChunk(0, 0, 8, 8);
    expect(() => chunk._setRawAt(0, 0, NaN)).toThrow();
    expect(() => chunk._setRawAt(0, 0, 0.5)).toThrow();
    expect(() => chunk._setRawAt(0, 0, Infinity)).toThrow();
    // Negative integers are valid uint32 values (bit 31 set)
    expect(() => chunk._setRawAt(0, 0, -1)).not.toThrow();
  });

  it('cloneTiles returns independent copy', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    chunk._setRawAt(0, 0, 42);
    const copy = chunk.cloneTiles();
    copy[0] = 99;
    expect(chunk.getRawAt(0, 0)).toBe(42);
  });

  it('source length mismatch throws', () => {
    expect(() => new TileChunk(0, 0, 2, 2, new Uint32Array(3))).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileLayer
// ═══════════════════════════════════════════════════════════════════════

describe('TileLayer', () => {
  const ts = makeTileset('base', 64);

  it('basic construction', () => {
    const layer = new TileLayer({
      id: 1,
      name: 'ground',
      width: 128,
      height: 128,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [ts],
    });
    expect(layer.id).toBe(1);
    expect(layer.name).toBe('ground');
    expect(layer.width).toBe(128);
    expect(layer.height).toBe(128);
    expect(layer.pixelWidth).toBe(4096);
    expect(layer.pixelHeight).toBe(4096);
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
  });

  it('default chunk size is 32', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.chunkWidth).toBe(32);
    expect(layer.chunkHeight).toBe(32);
  });

  it('custom chunk size', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      chunkWidth: 16, chunkHeight: 16,
    });
    expect(layer.chunkWidth).toBe(16);
  });

  it('rejects invalid chunk size', () => {
    expect(() => new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      chunkWidth: 0,
    })).toThrow();
  });

  it('rejects zero dimensions', () => {
    expect(() => new TileLayer({
      id: 0, name: 'l', width: 0, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    })).toThrow();
  });

  it('inBounds check', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 10, height: 10,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.inBounds(0, 0)).toBe(true);
    expect(layer.inBounds(9, 9)).toBe(true);
    expect(layer.inBounds(-1, 0)).toBe(false);
    expect(layer.inBounds(10, 0)).toBe(false);
  });

  it('chunk range computation', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 100, height: 80,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const range = layer.chunkRange();
    expect(range.minCx).toBe(0);
    expect(range.minCy).toBe(0);
    expect(range.maxCx).toBe(3);
    expect(range.maxCy).toBe(2);
  });

  it('getChunk returns readonly view (ReadonlyTileChunk)', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 32, height: 32,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    // No chunk exists yet (lazy)
    expect(layer.getChunk(0, 0)).toBeUndefined();

    // Create via layer mutation
    const ref = { tileset: ts, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);

    const chunk = layer.getChunk(0, 0);
    expect(chunk).toBeDefined();
    expect(chunk!.cx).toBe(0);
    expect(chunk!.cy).toBe(0);
    expect(chunk!.getRawAt(0, 0)).not.toBe(0);
  });

  it('_ensureChunk creates chunks in valid range', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const chunk = layer._ensureChunk(0, 0);
    expect(chunk).toBeDefined();
    expect(chunk.width).toBe(32);
    expect(chunk.height).toBe(32);
  });

  it('_ensureChunk outside range throws', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 32, height: 32,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(() => layer._ensureChunk(5, 5)).toThrow();
  });

  it('edge chunks have correct dimensions', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 40, height: 40,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      chunkWidth: 32, chunkHeight: 32,
    });
    const edgeChunk = layer._ensureChunk(1, 0);
    expect(edgeChunk.width).toBe(8);
    expect(edgeChunk.height).toBe(32);
  });

  it('getTileAt returns null for empty cell', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.getTileAt(0, 0)).toBeNull();
  });

  it('getTileAt returns null out of bounds', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.getTileAt(100, 100)).toBeNull();
  });

  it('setTileAt and getTileAt roundtrip', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(5, 5, ref);
    const result = layer.getTileAt(5, 5);
    expect(result).not.toBeNull();
    expect(result!.tileset).toBe(ts);
    expect(result!.localTileId).toBe(3);
  });

  it('setTileAt with transform preserves orientation', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = {
      tileset: ts,
      localTileId: 7,
      transform: { flipX: true, flipY: false, diagonal: true },
    };
    layer.setTileAt(0, 0, ref);
    const result = layer.getTileAt(0, 0)!;
    expect(result.transform).toEqual({ flipX: true, flipY: false, diagonal: true });
  });

  it('setTileAt out of bounds throws', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 10, height: 10,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    expect(() => layer.setTileAt(10, 0, ref)).toThrow();
    expect(() => layer.setTileAt(-1, 0, ref)).toThrow();
  });

  it('setTileAt with wrong tileset throws', () => {
    const ts2 = makeTileset('other', 16);
    const layer = new TileLayer({
      id: 0, name: 'l', width: 10, height: 10,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts2, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    expect(() => layer.setTileAt(0, 0, ref)).toThrow();
  });

  it('setTileAt with invalid localTileId throws', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 10, height: 10,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 999, transform: TILE_TRANSFORM_IDENTITY };
    expect(() => layer.setTileAt(0, 0, ref)).toThrow();
  });

  it('clearTileAt on empty is no-op', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const rev = layer.revision;
    layer.clearTileAt(0, 0);
    expect(layer.revision).toBe(rev);
  });

  it('clearTileAt after set removes tile', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);
    expect(layer.getTileAt(0, 0)).not.toBeNull();
    layer.clearTileAt(0, 0);
    expect(layer.getTileAt(0, 0)).toBeNull();
  });

  it('clearTileAt out of bounds throws', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 10, height: 10,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(() => layer.clearTileAt(10, 0)).toThrow();
  });

  it('revision tracks mutations', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY };
    expect(layer.revision).toBe(0);
    layer.setTileAt(0, 0, ref);
    expect(layer.revision).toBe(1);
    layer.setTileAt(0, 0, ref); // no-op
    expect(layer.revision).toBe(1);
    layer.clearTileAt(0, 0);
    expect(layer.revision).toBe(2);
    layer.clearTileAt(0, 0); // no-op (already empty)
    expect(layer.revision).toBe(2);
  });

  it('getRawTileAt returns 0 for empty', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.getRawTileAt(0, 0)).toBe(0);
  });

  it('getRawTileAt returns packed value after set', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 7, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);
    const raw = layer.getRawTileAt(0, 0);
    expect(raw).not.toBe(0);
  });

  it('fillRect fills a region', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 16, height: 16,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 2, transform: TILE_TRANSFORM_IDENTITY };
    layer.fillRect(2, 2, 4, 4, ref);
    expect(layer.getTileAt(2, 2)).not.toBeNull();
    expect(layer.getTileAt(5, 5)).not.toBeNull();
    expect(layer.getTileAt(1, 1)).toBeNull();
    expect(layer.getTileAt(6, 2)).toBeNull();
  });

  it('tilesInRect iterates non-empty tiles', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 16, height: 16,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(2, 2, ref);
    layer.setTileAt(5, 3, ref);
    const tiles = [...layer.tilesInRect(0, 0, 16, 16)];
    expect(tiles.length).toBe(2);
    expect(tiles[0]!.tx).toBe(2);
    expect(tiles[0]!.ty).toBe(2);
    expect(tiles[1]!.tx).toBe(5);
    expect(tiles[1]!.ty).toBe(3);
  });

  it('countNonEmptyTiles returns correct count', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);
    layer.setTileAt(10, 10, ref);
    layer.setTileAt(20, 20, ref);
    expect(layer.countNonEmptyTiles()).toBe(3);
  });

  it('loadedChunks iterates in deterministic order', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 96, height: 96,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      chunkWidth: 32, chunkHeight: 32,
    });
    const ref = { tileset: ts, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(65, 0, ref);
    layer.setTileAt(0, 65, ref);
    layer.setTileAt(35, 0, ref);
    layer.setTileAt(0, 0, ref);

    const chunkCoords = [...layer.loadedChunks()].map(c => [c.cx, c.cy]);
    const expected = [[0, 0], [1, 0], [2, 0], [0, 2]];
    expect(chunkCoords).toEqual(expected);
  });

  it('layer properties are frozen', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      properties: { key: 'value' },
    });
    expect(layer.properties.key).toBe('value');
    expect(Object.isFrozen(layer.properties)).toBe(true);
  });

  it('layer properties copy input object', () => {
    const mutable = { key: 'original' };
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      properties: mutable,
    });
    mutable.key = 'changed';
    expect(layer.properties.key).toBe('original');
  });

  it('coordinate conversion: tileToPixel', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 32, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.tileToPixel(0, 0)).toEqual({ x: 0, y: 0 });
    expect(layer.tileToPixel(5, 3)).toEqual({ x: 160, y: 48 });
  });

  it('coordinate conversion: pixelToTile', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 32, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.pixelToTile(0, 0)).toEqual({ tx: 0, ty: 0 });
    expect(layer.pixelToTile(31, 15)).toEqual({ tx: 0, ty: 0 });
    expect(layer.pixelToTile(32, 16)).toEqual({ tx: 1, ty: 1 });
  });

  it('coordinate conversion with offset', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 32, tileHeight: 32, tilesets: [ts],
      offsetX: 16, offsetY: 8,
    });
    expect(layer.tileToPixel(0, 0)).toEqual({ x: 16, y: 8 });
    expect(layer.pixelToTile(16, 8)).toEqual({ tx: 0, ty: 0 });
  });

  it('operations after destroy throw', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    layer.destroy();
    expect(layer.destroyed).toBe(true);
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    expect(() => layer.setTileAt(0, 0, ref)).toThrow();
    expect(() => layer.clearTileAt(0, 0)).toThrow();
    expect(() => layer._ensureChunk(0, 0)).toThrow();
  });

  it('destroy is idempotent', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    layer.destroy();
    layer.destroy();
    expect(layer.destroyed).toBe(true);
  });

  it('multiple tilesets work', () => {
    const ts1 = makeTileset('a', 16);
    const ts2 = makeTileset('b', 32);
    const layer = new TileLayer({
      id: 0, name: 'l', width: 64, height: 64,
      tileWidth: 16, tileHeight: 16, tilesets: [ts1, ts2],
    });
    layer.setTileAt(0, 0, { tileset: ts1, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(1, 0, { tileset: ts2, localTileId: 10, transform: { flipX: true, flipY: false, diagonal: false } });

    const t0 = layer.getTileAt(0, 0)!;
    expect(t0.tileset).toBe(ts1);
    expect(t0.localTileId).toBe(5);

    const t1 = layer.getTileAt(1, 0)!;
    expect(t1.tileset).toBe(ts2);
    expect(t1.localTileId).toBe(10);
    expect(t1.transform.flipX).toBe(true);
  });

  // ── No-op mutation & revision ─────────────────────────────────────────

  it('no-op setTileAt does NOT change revision', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);
    const rev = layer.revision;
    layer.setTileAt(0, 0, ref);
    expect(layer.revision).toBe(rev);
  });

  it('no-op clearTileAt does NOT change revision', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const rev = layer.revision;
    layer.clearTileAt(0, 0);
    expect(layer.revision).toBe(rev);
  });

  it('failed setTileAt does NOT change revision', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ts2 = makeTileset('other', 16);
    const rev = layer.revision;
    try { layer.setTileAt(0, 0, { tileset: ts2, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY }); } catch { /* expected */ }
    expect(layer.revision).toBe(rev);
  });

  // ── Parallax ──────────────────────────────────────────────────────────

  it('parallaxX and parallaxY default to 1.0', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    expect(layer.parallaxX).toBe(1);
    expect(layer.parallaxY).toBe(1);
  });

  it('parallaxX and parallaxY can be set via options', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      parallaxX: 0.5,
      parallaxY: 0.25,
    });
    expect(layer.parallaxX).toBe(0.5);
    expect(layer.parallaxY).toBe(0.25);
  });

  it('parallaxX = 0.0 is valid (stationary layer)', () => {
    const layer = new TileLayer({
      id: 0, name: 'l', width: 8, height: 8,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
      parallaxX: 0,
      parallaxY: 0,
    });
    expect(layer.parallaxX).toBe(0);
    expect(layer.parallaxY).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMap
// ═══════════════════════════════════════════════════════════════════════

describe('TileMap', () => {
  const ts = makeTileset('base', 64);

  it('basic construction', () => {
    const map = new TileMap({
      width: 32, height: 24,
      tileWidth: 16, tileHeight: 16,
    });
    expect(map.width).toBe(32);
    expect(map.height).toBe(24);
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
    expect(map.pixelWidth).toBe(512);
    expect(map.pixelHeight).toBe(384);
  });

  it('can hold multiple layers', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 0, name: 'ground', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
        new TileLayer({ id: 1, name: 'walls', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    expect(map.layers.length).toBe(2);
    expect(map.getLayerById(0)!.name).toBe('ground');
    expect(map.getLayerById(1)!.name).toBe('walls');
  });

  it('layers maintain insertion order', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 10, name: 'third', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
        new TileLayer({ id: 5, name: 'first', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
        new TileLayer({ id: 7, name: 'second', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    expect(map.layers.map(l => l.name)).toEqual(['third', 'first', 'second']);
  });

  it('duplicate layer ID throws', () => {
    expect(() => new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 1, name: 'a', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
        new TileLayer({ id: 1, name: 'b', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    })).toThrow();
  });

  it('addLayer after construction works', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
    });
    const layer = new TileLayer({ id: 5, name: 'added', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] });
    map.addLayer(layer);
    expect(map.getLayerById(5)).toBeDefined();
  });

  it('removeLayer destroys the layer', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
    });
    const layer = new TileLayer({ id: 1, name: 'removable', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] });
    map.addLayer(layer);
    expect(map.removeLayer(1)).toBe(true);
    expect(map.getLayerById(1)).toBeUndefined();
    expect(layer.destroyed).toBe(true);
  });

  it('removeLayer returns false for non-existent ID', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
    });
    expect(map.removeLayer(999)).toBe(false);
  });

  it('getLayerByName returns first match', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 1, name: 'dup', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
        new TileLayer({ id: 2, name: 'dup', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    const found = map.getLayerByName('dup');
    expect(found).toBeDefined();
    expect(found!.id).toBe(1);
  });

  it('getTileLayer is an alias for getLayerByName', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 1, name: 'test', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    expect(map.getTileLayer('test')).toBe(map.getLayerByName('test'));
  });

  it('getTileAt convenience', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 1, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    const ref = { tileset: ts, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY };
    map.setTileAt(1, 5, 5, ref);
    const t = map.getTileAt(1, 5, 5);
    expect(t).not.toBeNull();
    expect(t!.localTileId).toBe(3);
  });

  it('getTileAt returns null for non-existent layer', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    expect(map.getTileAt(999, 0, 0)).toBeNull();
  });

  it('setTileAt throws for non-existent layer', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    expect(() => map.setTileAt(999, 0, 0, ref)).toThrow();
  });

  it('clearTileAt throws for non-existent layer', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    expect(() => map.clearTileAt(999, 0, 0)).toThrow();
  });

  it('multiple tilesets', () => {
    const ts1 = makeTileset('a', 32);
    const ts2 = makeTileset('b', 64);
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts1, ts2],
      layers: [
        new TileLayer({ id: 0, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts1, ts2] }),
      ],
    });
    expect(map.tilesets).toHaveLength(2);
    expect(map.getTileset('a')).toBe(ts1);
    expect(map.getTileset('b')).toBe(ts2);
  });

  it('addTileset adds and prevents duplicates', () => {
    const ts1 = makeTileset('unique', 16);
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    map.addTileset(ts1);
    expect(map.tilesets).toHaveLength(1);
    const ts2 = makeTileset('unique', 16);
    expect(() => map.addTileset(ts2)).toThrow();
  });

  it('map properties are frozen', () => {
    const props = { author: 'test' };
    const map = new TileMap({
      width: 16, height: 16,
      tileWidth: 16, tileHeight: 16,
      properties: props,
    });
    expect(map.properties.author).toBe('test');
    props.author = 'changed';
    expect(map.properties.author).toBe('test');
    expect(Object.isFrozen(map.properties)).toBe(true);
  });

  it('coordinate conversion', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 16,
    });
    expect(map.tileToPixel(5, 3)).toEqual({ x: 160, y: 48 });
    expect(map.pixelToTile(160, 48)).toEqual({ tx: 5, ty: 3 });
  });

  it('pixelToTile uses floor', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    expect(map.pixelToTile(31, 31)).toEqual({ tx: 0, ty: 0 });
    expect(map.pixelToTile(32, 32)).toEqual({ tx: 1, ty: 1 });
  });

  it('destroy is idempotent', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [
        new TileLayer({ id: 0, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
      ],
    });
    map.destroy();
    map.destroy();
    expect(map.destroyed).toBe(true);
  });

  it('operations after destroy throw', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
    });
    map.destroy();
    expect(() => map.addTileset(ts)).toThrow();
    expect(() => map.addLayer(
      new TileLayer({ id: 0, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }),
    )).toThrow();
  });

  it('destroys layers on destroy', () => {
    const layer = new TileLayer({ id: 0, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] });
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: [layer],
    });
    map.destroy();
    expect(layer.destroyed).toBe(true);
  });

  it('tilesets copy is independent of caller', () => {
    const tsArr = [makeTileset('base', 16)];
    const map = new TileMap({
      width: 16, height: 16,
      tileWidth: 16, tileHeight: 16,
      tilesets: tsArr,
    });
    tsArr.push(makeTileset('extra', 16));
    expect(map.tilesets).toHaveLength(1);
  });

  it('layers copy is independent of caller', () => {
    const layer = new TileLayer({ id: 0, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] });
    const layerArr = [layer];
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
      layers: layerArr,
    });
    layerArr.push(new TileLayer({ id: 1, name: 'extra', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] }));
    expect(map.layers).toHaveLength(1);
  });

  it('texture ownership: TileMap destroy does not affect tileset textures', () => {
    const tex = fakeTexture();
    const region = new TextureRegion(tex, { x: 0, y: 0, width: 128, height: 128 });
    const tileset = new TileSet({
      name: 'ts',
      texture: region,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
    });
    const map = new TileMap({
      width: 16, height: 16,
      tileWidth: 32, tileHeight: 32,
      tilesets: [tileset],
    });
    map.destroy();
    expect(tileset.texture).toBe(region);
    expect(tileset.name).toBe('ts');
  });

  it('revision increments on structural changes only (not cell mutations)', () => {
    const map = new TileMap({
      width: 64, height: 64,
      tileWidth: 32, tileHeight: 32,
      tilesets: [ts],
    });
    expect(map.revision).toBe(0);
    map.addTileset(makeTileset('extra', 16));
    expect(map.revision).toBe(1);

    const layer = new TileLayer({ id: 1, name: 'l', width: 64, height: 64, tileWidth: 32, tileHeight: 32, tilesets: [ts] });
    map.addLayer(layer);
    expect(map.revision).toBe(2);

    // Cell mutation through layer does NOT increment map revision
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    map.setTileAt(1, 0, 0, ref);
    expect(map.revision).toBe(2); // unchanged — layer tracks cell revisions
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Immutability / defensive copy tests
// ═══════════════════════════════════════════════════════════════════════

describe('immutability', () => {
  it('TileMap tilesets array is copied', () => {
    const tsArr = [makeTileset('base', 16)];
    const map = new TileMap({
      width: 16, height: 16,
      tileWidth: 16, tileHeight: 16,
      tilesets: tsArr,
    });
    expect(map.tilesets).not.toBe(tsArr);
  });

  it('cloneTiles mutation does not affect chunk', () => {
    const chunk = new TileChunk(0, 0, 2, 2);
    chunk._setRawAt(0, 0, 1);
    const clone = chunk.cloneTiles();
    clone[0] = 99;
    expect(chunk.getRawAt(0, 0)).toBe(1);
  });

  it('readonly chunk from layer has no writable tiles', () => {
    const ts = makeTileset('base', 16);
    const layer = new TileLayer({
      id: 0, name: 'l', width: 32, height: 32,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);

    const chunk = layer.getChunk(0, 0)!;
    // The public ReadonlyTileChunk interface has no 'tiles' property
    const chunkAsAny = chunk as Record<string, unknown>;
    // Verify that 'tiles' is undefined (private member)
    expect(chunkAsAny.tiles).toBeUndefined();
    // Verify that _setRawAt is still there (internal, but not public API intent)
    // The key point is tiles is NOT exposed
  });

  it('clone can modify other chunks through public API only', () => {
    const ts = makeTileset('base', 16);
    const layer = new TileLayer({
      id: 0, name: 'l', width: 32, height: 32,
      tileWidth: 16, tileHeight: 16, tilesets: [ts],
    });
    const ref = { tileset: ts, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY };
    layer.setTileAt(0, 0, ref);

    // Get a readonly chunk view — the chunk is separate from tileset/clone
    const chunk = layer.getChunk(0, 0)!;
    const clone = chunk.cloneTiles();
    clone[0] = 0; // mutate clone

    // Original layer tile still exists
    expect(layer.getTileAt(0, 0)).not.toBeNull();
  });
});
