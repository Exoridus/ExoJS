import type { TileMap } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import type { LdtkData, LdtkLevel } from '../src/LdtkData';
import { LdtkMap } from '../src/LdtkMap';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Build a bare LDtk level record with only the fields LdtkMap reads. */
function makeLevel(identifier: string, uid: number): LdtkLevel {
  return {
    identifier,
    uid,
    iid: `iid-${uid}`,
    worldX: 0,
    worldY: 0,
    pxWid: 16,
    pxHei: 16,
    layerInstances: [],
  };
}

/** Build LdtkData carrying the given level identifiers (in order). */
function makeData(identifiers: readonly string[]): LdtkData {
  return {
    jsonVersion: '1.5.3',
    defaultGridSize: 16,
    defs: { tilesets: [], layers: [] },
    levels: identifiers.map((id, i) => makeLevel(id, i + 1)),
  };
}

/**
 * A stand-in TileMap that records destroy() calls. LdtkMap only ever calls
 * `destroy()` on its levels and otherwise stores the references opaquely, so a
 * spy object is sufficient and keeps the unit isolated from TileMap internals.
 */
function makeFakeTileMap(): TileMap & { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn() } as unknown as TileMap & {
    destroy: ReturnType<typeof vi.fn>;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LdtkMap construction', () => {
  it('stores source, data, and levels by reference', () => {
    const data = makeData(['A']);
    const levels = [makeFakeTileMap()];
    const map = new LdtkMap('world.ldtk', data, levels);

    expect(map.source).toBe('world.ldtk');
    expect(map.data).toBe(data);
    expect(map.levels).toBe(levels);
  });

  it('keeps levels index-aligned with data.levels', () => {
    const data = makeData(['First', 'Second']);
    const first = makeFakeTileMap();
    const second = makeFakeTileMap();
    const map = new LdtkMap('', data, [first, second]);

    expect(map.levels[0]).toBe(first);
    expect(map.levels[1]).toBe(second);
  });
});

describe('LdtkMap.getLevelByName', () => {
  it('returns the runtime TileMap at the matching level index', () => {
    const data = makeData(['Intro', 'Boss']);
    const intro = makeFakeTileMap();
    const boss = makeFakeTileMap();
    const map = new LdtkMap('', data, [intro, boss]);

    expect(map.getLevelByName('Intro')).toBe(intro);
    expect(map.getLevelByName('Boss')).toBe(boss);
  });

  it('returns undefined for an unknown identifier', () => {
    const map = new LdtkMap('', makeData(['Only']), [makeFakeTileMap()]);
    expect(map.getLevelByName('Missing')).toBeUndefined();
  });

  it('resolves to the first level when identifiers are duplicated (findIndex semantics)', () => {
    const data = makeData(['Dup', 'Dup']);
    const firstDup = makeFakeTileMap();
    const secondDup = makeFakeTileMap();
    const map = new LdtkMap('', data, [firstDup, secondDup]);

    expect(map.getLevelByName('Dup')).toBe(firstDup);
  });

  it('returns undefined for a level whose TileMap slot was skipped (sparse levels)', () => {
    // data has two levels but only the first was converted; the second slot is
    // a hole. getLevelByName resolves the index then reads the (absent) slot.
    const data = makeData(['Loaded', 'External']);
    const map = new LdtkMap('', data, [makeFakeTileMap()]);

    expect(map.getLevelByName('External')).toBeUndefined();
  });
});

describe('LdtkMap.destroy', () => {
  it('destroys every owned level exactly once', () => {
    const a = makeFakeTileMap();
    const b = makeFakeTileMap();
    const map = new LdtkMap('', makeData(['A', 'B']), [a, b]);

    map.destroy();

    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).toHaveBeenCalledTimes(1);
  });

  it('forwards destroy() to each level again on a repeat call (delegates idempotence to TileMap)', () => {
    // LdtkMap.destroy does not guard itself — it simply forwards to each level,
    // relying on TileMap.destroy being idempotent. Characterize that forwarding.
    const a = makeFakeTileMap();
    const map = new LdtkMap('', makeData(['A']), [a]);

    map.destroy();
    map.destroy();

    expect(a.destroy).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there are no levels', () => {
    const map = new LdtkMap('', makeData([]), []);
    expect(() => map.destroy()).not.toThrow();
  });
});
