import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TileSet } from '../src/TileSet';
import type { TileDefinition } from '../src/types';

// ── Test helpers ──────────────────────────────────────────────────────────

function fakeTexture(width = 512, height = 512): Texture {
  return {
    width,
    height,
    uid: 0,
    label: 'test',
    destroy: () => {},
    destroyed: false,
  } as unknown as Texture;
}

function fakeRegion(width = 512, height = 512): TextureRegion {
  return new TextureRegion(fakeTexture(width, height), { x: 0, y: 0, width, height });
}

// ═══════════════════════════════════════════════════════════════════════════

describe('TileSet construction validation', () => {
  it('rejects a missing or non-string name', () => {
    expect(() => new TileSet({
      name: '',
      texture: fakeRegion(),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
    })).toThrow(/name must be a non-empty string/);
  });

  it('rejects a missing texture', () => {
    expect(() => new TileSet({
      name: 't',
      texture: undefined as unknown as TextureRegion,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 16,
    })).toThrow(/valid TextureRegion/);
  });

  it('rejects a grid whose computed width exceeds the atlas', () => {
    // 40px atlas, tileWidth 32, explicit columns 2 → grid width 64 > 40.
    expect(() => new TileSet({
      name: 't',
      texture: fakeRegion(40, 320),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 8,
      columns: 2,
    })).toThrow(/grid width exceeds atlas/);
  });

  it('rejects a grid whose computed height exceeds the atlas', () => {
    // 1 column forces every one of the 8 tiles into its own row: 8 rows * 32px = 256 > 40.
    expect(() => new TileSet({
      name: 't',
      texture: fakeRegion(320, 40),
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 8,
      columns: 1,
    })).toThrow(/grid height exceeds atlas/);
  });
});

describe('TileSet._setDefinition', () => {
  it('rejects an out-of-range localTileId', () => {
    const ts = new TileSet({ name: 't', texture: fakeRegion(), tileWidth: 32, tileHeight: 32, tileCount: 4 });
    expect(() => ts._setDefinition(4, {})).toThrow(/out of range/);
    expect(() => ts._setDefinition(-1, {})).toThrow(/out of range/);
  });

  it('copies and freezes per-tile collision shapes', () => {
    const ts = new TileSet({ name: 't', texture: fakeRegion(), tileWidth: 32, tileHeight: 32, tileCount: 4 });
    const collision = [{
      kind: 'rectangle' as const,
      id: 1, name: '', type: '', x: 0, y: 0, width: 8, height: 8, rotation: 0, visible: true, properties: {},
    }];

    ts._setDefinition(0, { collision });

    const def = ts.getTileDefinition(0);
    expect(def?.collision).toHaveLength(1);
    expect(def?.collision).not.toBe(collision); // defensive copy
    expect(Object.isFrozen(def?.collision)).toBe(true);
  });
});

describe('TileSet._setDefinitions', () => {
  it('replaces the internal definitions map from an array, copying each field', () => {
    const ts = new TileSet({ name: 't', texture: fakeRegion(), tileWidth: 32, tileHeight: 32, tileCount: 4 });
    const collision = [{
      kind: 'rectangle' as const,
      id: 1, name: '', type: '', x: 0, y: 0, width: 8, height: 8, rotation: 0, visible: true, properties: {},
    }];
    const definitions: TileDefinition[] = [
      {
        localTileId: 0,
        properties: { solid: true },
        animation: [{ localTileId: 0, duration: 100 }, { localTileId: 1, duration: 100 }],
        collision,
      },
      { localTileId: 1 }, // no properties/animation/collision at all
    ];

    ts._setDefinitions(definitions);

    const def0 = ts.getTileDefinition(0);
    expect(def0?.properties).toEqual({ solid: true });
    expect(def0?.animation).toHaveLength(2);
    expect(def0?.collision).toHaveLength(1);
    expect(def0?.collision).not.toBe(collision);

    const def1 = ts.getTileDefinition(1);
    expect(def1?.properties).toBeUndefined();
    expect(def1?.animation).toBeUndefined();
    expect(def1?.collision).toBeUndefined();
  });

  it('clears prior definitions before applying the new array', () => {
    const ts = new TileSet({ name: 't', texture: fakeRegion(), tileWidth: 32, tileHeight: 32, tileCount: 4 });
    ts._setDefinition(2, { properties: { a: 1 } });
    expect(ts.getTileDefinition(2)).toBeDefined();

    ts._setDefinitions([{ localTileId: 0 }]);

    expect(ts.getTileDefinition(2)).toBeUndefined();
    expect(ts.getTileDefinition(0)).toBeDefined();
  });
});
