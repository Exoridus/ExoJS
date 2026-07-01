import { describe, expect, it } from 'vitest';

import type { LdtkData } from '../src/LdtkData';
import { LdtkMap } from '../src/LdtkMap';
import { ldtkToTileMap } from '../src/ldtkToTileMap';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal well-formed LDtk document with one level and no tile layers. */
const minimalData: LdtkData = {
  jsonVersion: '1.5.3',
  defaultGridSize: 16,
  defs: {
    tilesets: [],
    layers: [],
  },
  levels: [
    {
      identifier: 'Level_0',
      uid: 1,
      iid: 'aaaaaaaa-0000-0000-0000-000000000001',
      worldX: 0,
      worldY: 0,
      pxWid: 256,
      pxHei: 128,
      layerInstances: [],
    },
  ],
};

/** Multi-level document to verify per-level TileMap generation. */
const multiLevelData: LdtkData = {
  jsonVersion: '1.5.3',
  defaultGridSize: 16,
  defs: {
    tilesets: [],
    layers: [],
  },
  levels: [
    {
      identifier: 'World_01',
      uid: 10,
      iid: 'aaaaaaaa-0000-0000-0000-000000000010',
      worldX: 0,
      worldY: 0,
      pxWid: 320,
      pxHei: 192,
      layerInstances: [],
    },
    {
      identifier: 'World_02',
      uid: 11,
      iid: 'aaaaaaaa-0000-0000-0000-000000000011',
      worldX: 320,
      worldY: 0,
      pxWid: 160,
      pxHei: 96,
      layerInstances: [],
    },
  ],
};

/** Document with entity and tile layers to verify layer conversion. */
const layeredData: LdtkData = {
  jsonVersion: '1.5.3',
  defaultGridSize: 16,
  defs: {
    tilesets: [
      {
        uid: 1,
        identifier: 'Ground',
        relPath: 'tileset.png',
        tileGridSize: 16,
        pxWid: 256,
        pxHei: 256,
        spacing: 0,
        padding: 0,
      },
    ],
    layers: [
      { uid: 101, identifier: 'Tiles', type: 'Tiles', gridSize: 16, tilesetDefUid: 1 },
      { uid: 102, identifier: 'Ground', type: 'IntGrid', gridSize: 16 },
      { uid: 103, identifier: 'Entities', type: 'Entities', gridSize: 16 },
    ],
  },
  levels: [
    {
      identifier: 'MainLevel',
      uid: 5,
      iid: 'aaaaaaaa-0000-0000-0000-000000000005',
      worldX: 0,
      worldY: 0,
      pxWid: 128,
      pxHei: 128,
      layerInstances: [
        {
          __identifier: 'Tiles',
          __type: 'Tiles',
          __cWid: 8,
          __cHei: 8,
          __gridSize: 16,
          layerDefUid: 101,
          levelId: 5,
          visible: true,
          iid: 'bbbbbbbb-0000-0000-0000-000000000001',
          __tilesetDefUid: 1,
          // gridTiles omitted → no tiles placed
          gridTiles: [{ px: [0, 0], src: [16, 0], f: 0, t: 1 }],
          autoLayerTiles: [],
        },
        {
          __identifier: 'Ground',
          __type: 'IntGrid',
          __cWid: 8,
          __cHei: 8,
          __gridSize: 16,
          layerDefUid: 102,
          levelId: 5,
          visible: true,
          iid: 'bbbbbbbb-0000-0000-0000-000000000002',
          intGridCsv: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        {
          __identifier: 'Entities',
          __type: 'Entities',
          __cWid: 8,
          __cHei: 8,
          __gridSize: 16,
          layerDefUid: 103,
          levelId: 5,
          visible: true,
          iid: 'bbbbbbbb-0000-0000-0000-000000000003',
          entityInstances: [
            {
              __identifier: 'Player',
              __type: 'Player',
              px: [32, 48],
              width: 16,
              height: 16,
              __pivot: [0, 0],
              fieldInstances: [
                { __identifier: 'speed', __type: 'Float', __value: 1.5 },
                { __identifier: 'name', __type: 'String', __value: 'Hero' },
              ],
              iid: 'cccccccc-0000-0000-0000-000000000001',
              defUid: 200,
            },
            {
              __identifier: 'Coin',
              __type: 'Coin',
              px: [64, 32],
              width: 8,
              height: 8,
              __pivot: [0, 0],
              fieldInstances: [],
              iid: 'cccccccc-0000-0000-0000-000000000002',
              defUid: 201,
            },
          ],
        },
      ],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ldtkToTileMap', () => {
  describe('LdtkMap result', () => {
    it('returns an LdtkMap instance', () => {
      const result = ldtkToTileMap(minimalData);
      expect(result).toBeInstanceOf(LdtkMap);
    });

    it('stores the raw data reference', () => {
      const result = ldtkToTileMap(minimalData);
      expect(result.data).toBe(minimalData);
    });

    it('uses the provided source string', () => {
      const result = ldtkToTileMap(minimalData, { source: 'http://example.com/world.ldtk' });
      expect(result.source).toBe('http://example.com/world.ldtk');
    });

    it('defaults source to empty string when omitted', () => {
      const result = ldtkToTileMap(minimalData);
      expect(result.source).toBe('');
    });
  });

  describe('level count and dimensions', () => {
    it('produces one TileMap per level', () => {
      const result = ldtkToTileMap(multiLevelData);
      expect(result.levels).toHaveLength(2);
    });

    it('sets TileMap name to the level identifier', () => {
      const result = ldtkToTileMap(multiLevelData);
      expect(result.levels[0]?.name).toBe('World_01');
      expect(result.levels[1]?.name).toBe('World_02');
    });

    it('computes map width and height from pixel dimensions / grid size', () => {
      const result = ldtkToTileMap(multiLevelData);
      // World_01: 320 × 192 px at 16 px/tile → 20 × 12 tiles
      expect(result.levels[0]?.width).toBe(20);
      expect(result.levels[0]?.height).toBe(12);
      // World_02: 160 × 96 px at 16 px/tile → 10 × 6 tiles
      expect(result.levels[1]?.width).toBe(10);
      expect(result.levels[1]?.height).toBe(6);
    });

    it('stores world-space metadata in TileMap.properties', () => {
      const result = ldtkToTileMap(multiLevelData);
      const map = result.levels[1];
      expect(map?.properties['worldX']).toBe(320);
      expect(map?.properties['worldY']).toBe(0);
    });
  });

  describe('getLevelByName', () => {
    it('finds a level by identifier', () => {
      const result = ldtkToTileMap(multiLevelData);
      const map = result.getLevelByName('World_02');
      expect(map).toBe(result.levels[1]);
    });

    it('returns undefined for an unknown identifier', () => {
      const result = ldtkToTileMap(multiLevelData);
      expect(result.getLevelByName('DoesNotExist')).toBeUndefined();
    });
  });

  describe('layer conversion: minimal (no tilesets)', () => {
    it('creates a TileLayer per Tiles layer without tile data when tilesets absent', () => {
      const result = ldtkToTileMap(layeredData);
      const map = result.levels[0];
      expect(map).toBeDefined();
      // Should have 2 TileLayers (Tiles + IntGrid)
      expect(map?.layers).toHaveLength(2);
    });

    it('names tile layers from the layer __identifier', () => {
      const result = ldtkToTileMap(layeredData);
      const map = result.levels[0]!;
      const names = map.layers.map(l => l.name);
      expect(names).toContain('Tiles');
      expect(names).toContain('Ground');
    });

    it('assigns correct layer dimensions (cWid × cHei)', () => {
      const result = ldtkToTileMap(layeredData);
      const tilesLayer = result.levels[0]?.layers.find(l => l.name === 'Tiles');
      expect(tilesLayer?.width).toBe(8);
      expect(tilesLayer?.height).toBe(8);
    });
  });

  describe('layer conversion: entity → ObjectLayer', () => {
    it('creates an ObjectLayer for each Entities layer', () => {
      const result = ldtkToTileMap(layeredData);
      const map = result.levels[0]!;
      expect(map.objectLayers).toHaveLength(1);
      expect(map.objectLayers[0]?.name).toBe('Entities');
    });

    it('converts entity instances to rectangle TileMapObjects', () => {
      const result = ldtkToTileMap(layeredData);
      const entities = result.levels[0]?.objectLayers[0];
      expect(entities?.objects).toHaveLength(2);
    });

    it('sets entity position, size, and type correctly', () => {
      const result = ldtkToTileMap(layeredData);
      const objects = result.levels[0]?.objectLayers[0]?.objects ?? [];
      const player = objects.find(o => o.type === 'Player');
      expect(player).toBeDefined();
      expect(player?.x).toBe(32);
      expect(player?.y).toBe(48);
      expect(player?.width).toBe(16);
      expect(player?.height).toBe(16);
      expect(player?.kind).toBe('rectangle');
    });

    it('maps scalar field instances to TileMapObject properties', () => {
      const result = ldtkToTileMap(layeredData);
      const player = result.levels[0]?.objectLayers[0]?.objects.find(
        o => o.type === 'Player',
      );
      expect(player?.properties['speed']).toBe(1.5);
      expect(player?.properties['name']).toBe('Hero');
    });

    it('produces unique numeric ids across entity instances', () => {
      const result = ldtkToTileMap(layeredData);
      const objects = result.levels[0]?.objectLayers[0]?.objects ?? [];
      const ids = objects.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('destroy', () => {
    it('destroys all owned levels', () => {
      const result = ldtkToTileMap(minimalData);
      // Just ensure destroy() does not throw
      expect(() => result.destroy()).not.toThrow();
    });
  });
});
