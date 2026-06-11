import { describe, expect, it, vi } from 'vitest';

import type { PixelSnapMode } from '@codexo/exojs';
import { TextureRegion } from '@codexo/exojs';
import { Texture } from '@codexo/exojs';

import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileMap } from '../src/TileMap';
import { TileMapNode } from '../src/TileMapNode';
import { TileMapView } from '../src/TileMapView';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// ── helpers (conventions shared with nodes.test.ts / view.test.ts) ─────

function fakeTexture(width = 512, height = 512): Texture {
  return {
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(name = 'tiles'): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
  });
}

interface BoundaryLayerOpts {
  readonly id?: number;
  readonly name?: string;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/**
 * A 40×8 layer (default 32-tile chunks) with tiles written on BOTH sides of
 * the chunk-x boundary: chunks (0,0) and (1,0) are non-empty and loaded, and
 * the tiles at x = 31 / x = 32 are direct neighbours across the seam.
 */
function makeBoundaryLayer(tileset: TileSet, opts: BoundaryLayerOpts = {}): TileLayer {
  const layer = new TileLayer({
    id: opts.id ?? 1,
    name: opts.name ?? 'ground',
    width: 40,
    height: 8,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [tileset],
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
  });
  const ref = { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY };

  layer.setTileAt(31, 0, ref); // last column of chunk (0,0)
  layer.setTileAt(32, 0, ref); // first column of chunk (1,0) — across the seam
  layer.setTileAt(0, 7, ref);
  layer.setTileAt(39, 7, ref);

  return layer;
}

/** An empty 4×4 layer — constructible, but produces zero chunk nodes. */
function makeEmptyLayer(tileset: TileSet, id = 1, name = 'empty'): TileLayer {
  return new TileLayer({ id, name, width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
}

/** A 40×8 map with two boundary-spanning layers: background (1), ground (2). */
function makeBoundaryMap(): { map: TileMap; tileset: TileSet } {
  const tileset = makeTileset();
  const map = new TileMap({
    name: 'world',
    width: 40,
    height: 8,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [tileset],
    layers: [
      makeBoundaryLayer(tileset, { id: 1, name: 'background' }),
      makeBoundaryLayer(tileset, { id: 2, name: 'ground' }),
    ],
  });
  return { map, tileset };
}

/** The pixel-snap mode of every chunk drawable, in build order. */
function chunkModes(node: TileLayerNode): PixelSnapMode[] {
  return node.chunkNodes.map(chunk => chunk.pixelSnapMode);
}

// ═══════════════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════════════

describe('pixelSnapMode defaults', () => {
  it('defaults to none on a fresh TileLayerNode and its chunk drawables', () => {
    const node = new TileLayerNode(makeBoundaryLayer(makeTileset()));

    expect(node.pixelSnapMode).toBe('none');
    expect(node.chunkNodes).toHaveLength(2); // sanity: spans a chunk boundary
    expect(chunkModes(node)).toEqual(['none', 'none']);
  });

  it('defaults to none on a fresh TileMapNode and all descendants', () => {
    const { map } = makeBoundaryMap();
    const node = new TileMapNode(map);

    expect(node.pixelSnapMode).toBe('none');
    expect(node.layerNodes).toHaveLength(2);
    for (const layerNode of node.layerNodes) {
      expect(layerNode.pixelSnapMode).toBe('none');
      expect(chunkModes(layerNode)).toEqual(['none', 'none']);
    }
  });

  it('defaults to none on a fresh TileMapView and all descendants', () => {
    const { map } = makeBoundaryMap();
    const view = map.createView();

    expect(view.pixelSnapMode).toBe('none');
    expect(view.layers).toHaveLength(2);
    for (const layerNode of view.layers) {
      expect(layerNode.pixelSnapMode).toBe('none');
      expect(chunkModes(layerNode)).toEqual(['none', 'none']);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileLayerNode
// ═══════════════════════════════════════════════════════════════════════

describe('TileLayerNode.pixelSnapMode', () => {
  it('cascades geometry and position to every chunk node across the chunk boundary', () => {
    const node = new TileLayerNode(makeBoundaryLayer(makeTileset()));

    expect(node.chunkNodes).toHaveLength(2);

    for (const mode of ['geometry', 'position'] as const) {
      node.pixelSnapMode = mode;

      expect(node.pixelSnapMode).toBe(mode);
      expect(chunkModes(node)).toEqual([mode, mode]);
    }
  });

  it('throws on an invalid value and atomically keeps the prior mode', () => {
    const node = new TileLayerNode(makeBoundaryLayer(makeTileset()));

    expect(() => {
      node.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(node.pixelSnapMode).toBe('none');
    expect(chunkModes(node)).toEqual(['none', 'none']);

    node.pixelSnapMode = 'geometry';

    expect(() => {
      node.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(node.pixelSnapMode).toBe('geometry');
    expect(chunkModes(node)).toEqual(['geometry', 'geometry']);
  });

  it('validates even for an empty layer with no chunk drawables to delegate to', () => {
    const node = new TileLayerNode(makeEmptyLayer(makeTileset()));

    expect(node.chunkNodes).toHaveLength(0);
    expect(node.pixelSnapMode).toBe('none');

    expect(() => {
      node.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(node.pixelSnapMode).toBe('none');

    node.pixelSnapMode = 'geometry';
    expect(node.pixelSnapMode).toBe('geometry');
  });

  it('setting the same value twice is a no-op (no throw, no re-propagation)', () => {
    const node = new TileLayerNode(makeBoundaryLayer(makeTileset()));

    expect(() => {
      node.pixelSnapMode = 'none'; // same as the default
    }).not.toThrow();
    expect(node.pixelSnapMode).toBe('none');

    node.pixelSnapMode = 'geometry';

    // Diverge one chunk on purpose, then re-set the same node value: the
    // no-op must not touch the chunk drawables again.
    node.chunkNodes[0].pixelSnapMode = 'none';
    node.pixelSnapMode = 'geometry';

    expect(node.pixelSnapMode).toBe('geometry');
    expect(chunkModes(node)).toEqual(['none', 'geometry']);

    // A real change re-propagates to every chunk.
    node.pixelSnapMode = 'position';
    expect(chunkModes(node)).toEqual(['position', 'position']);
  });

  it('refresh() applies the mode to newly built chunk nodes', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 40, height: 8, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);

    node.pixelSnapMode = 'geometry';
    expect(node.chunkNodes).toHaveLength(1);

    // A tile in a previously-empty chunk is reflected only after refresh().
    layer.setTileAt(32, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    node.refresh();

    expect(node.chunkNodes).toHaveLength(2);
    expect(node.pixelSnapMode).toBe('geometry');
    expect(chunkModes(node)).toEqual(['geometry', 'geometry']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapNode
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapNode.pixelSnapMode', () => {
  it('cascades to every layer node and every chunk drawable', () => {
    const { map } = makeBoundaryMap();
    const node = new TileMapNode(map);

    expect(node.layerNodes).toHaveLength(2);

    for (const mode of ['geometry', 'position'] as const) {
      node.pixelSnapMode = mode;

      expect(node.pixelSnapMode).toBe(mode);
      for (const layerNode of node.layerNodes) {
        expect(layerNode.pixelSnapMode).toBe(mode);
        expect(chunkModes(layerNode)).toEqual([mode, mode]);
      }
    }
  });

  it('throws on an invalid value and atomically keeps the prior mode', () => {
    const { map } = makeBoundaryMap();
    const node = new TileMapNode(map);

    node.pixelSnapMode = 'position';

    expect(() => {
      node.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(node.pixelSnapMode).toBe('position');
    for (const layerNode of node.layerNodes) {
      expect(layerNode.pixelSnapMode).toBe('position');
      expect(chunkModes(layerNode)).toEqual(['position', 'position']);
    }
  });

  it('validates on a map with no layers', () => {
    const map = new TileMap({ name: 'empty', width: 4, height: 4, tileWidth: 32, tileHeight: 32 });
    const node = new TileMapNode(map);

    expect(node.layerNodes).toHaveLength(0);

    expect(() => {
      node.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(node.pixelSnapMode).toBe('none');

    node.pixelSnapMode = 'geometry';
    expect(node.pixelSnapMode).toBe('geometry');
  });

  it('setting the same value twice is a no-op', () => {
    const { map } = makeBoundaryMap();
    const node = new TileMapNode(map);

    node.pixelSnapMode = 'geometry';

    expect(() => {
      node.pixelSnapMode = 'geometry';
    }).not.toThrow();
    expect(node.pixelSnapMode).toBe('geometry');
  });

  it('refreshLayers() re-applies the mode to rebuilt and newly added layers', () => {
    const { map, tileset } = makeBoundaryMap();
    const node = new TileMapNode(map);

    node.pixelSnapMode = 'geometry';

    map.addLayer(makeBoundaryLayer(tileset, { id: 3, name: 'roofs' }));
    node.refreshLayers();

    expect(node.layerNodes).toHaveLength(3);
    for (const layerNode of node.layerNodes) {
      expect(layerNode.pixelSnapMode).toBe('geometry');
      expect(chunkModes(layerNode)).toEqual(['geometry', 'geometry']);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapView
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapView.pixelSnapMode', () => {
  it('cascades to every layer node and chunk drawable, banded or not', () => {
    const { map } = makeBoundaryMap();
    // 'background' is banded; 'ground' stays view-owned (unbanded).
    const view = map.createView({ bands: { lower: ['background'] } });

    view.pixelSnapMode = 'geometry';

    expect(view.pixelSnapMode).toBe('geometry');
    expect(view.layers).toHaveLength(2);
    for (const layerNode of view.layers) {
      expect(layerNode.pixelSnapMode).toBe('geometry');
      expect(chunkModes(layerNode)).toEqual(['geometry', 'geometry']);
    }

    view.pixelSnapMode = 'position';
    for (const layerNode of view.layers) {
      expect(chunkModes(layerNode)).toEqual(['position', 'position']);
    }
  });

  it('throws on an invalid value and atomically keeps the prior mode', () => {
    const { map } = makeBoundaryMap();
    const view = map.createView();

    view.pixelSnapMode = 'geometry';

    expect(() => {
      view.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(view.pixelSnapMode).toBe('geometry');
    for (const layerNode of view.layers) {
      expect(layerNode.pixelSnapMode).toBe('geometry');
      expect(chunkModes(layerNode)).toEqual(['geometry', 'geometry']);
    }
  });

  it('validates on a view over a map with no layers', () => {
    const map = new TileMap({ name: 'empty', width: 4, height: 4, tileWidth: 32, tileHeight: 32 });
    const view = new TileMapView(map);

    expect(view.layers).toHaveLength(0);

    expect(() => {
      view.pixelSnapMode = 'bogus' as PixelSnapMode;
    }).toThrow(/pixelSnapMode/);
    expect(view.pixelSnapMode).toBe('none');

    view.pixelSnapMode = 'position';
    expect(view.pixelSnapMode).toBe('position');
  });

  it('setting the same value twice is a no-op', () => {
    const { map } = makeBoundaryMap();
    const view = map.createView();

    view.pixelSnapMode = 'geometry';

    expect(() => {
      view.pixelSnapMode = 'geometry';
    }).not.toThrow();
    expect(view.pixelSnapMode).toBe('geometry');
  });

  it('refreshLayers() applies the mode to nodes built for added layers', () => {
    const { map, tileset } = makeBoundaryMap();
    const view = map.createView();
    const existing = view.getLayerNodeById(1)!;

    view.pixelSnapMode = 'geometry';

    map.addLayer(makeBoundaryLayer(tileset, { id: 9, name: 'extra' }));
    view.refreshLayers();

    const added = view.getLayerNodeById(9)!;

    expect(view.getLayerNodeById(1)).toBe(existing); // identity retained
    expect(added.pixelSnapMode).toBe('geometry');
    expect(chunkModes(added)).toEqual(['geometry', 'geometry']);
    for (const layerNode of view.layers) {
      expect(layerNode.pixelSnapMode).toBe('geometry');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Render-only contract — purely visual, never a data/geometry mutation
// ═══════════════════════════════════════════════════════════════════════

describe('pixelSnapMode render-only contract', () => {
  it('toggling never rebuilds chunk geometry: pages keep the same reference', () => {
    const node = new TileLayerNode(makeBoundaryLayer(makeTileset()));
    const [first, second] = [node.chunkNodes[0], node.chunkNodes[1]];
    const firstPages = first.pages; // builds + caches against the chunk revision
    const secondPages = second.pages;
    const revisionBefore = node.layer.revision;

    node.pixelSnapMode = 'geometry';

    expect(first.pages).toBe(firstPages);
    expect(second.pages).toBe(secondPages);

    node.pixelSnapMode = 'position';
    node.pixelSnapMode = 'none';

    expect(first.pages).toBe(firstPages);
    expect(second.pages).toBe(secondPages);
    expect(node.layer.revision).toBe(revisionBefore); // no revision bump
  });

  it('leaves layer offsets, node transforms, tile data, and bounds untouched', () => {
    const tileset = makeTileset();
    const layer = makeBoundaryLayer(tileset, { offsetX: 64, offsetY: -32 });
    const map = new TileMap({
      name: 'm',
      width: 40,
      height: 8,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [layer],
    });
    const view = map.createView();
    const node = view.getLayerNodeById(1)!;
    const seamChunk = node.chunkNodes[1]; // chunk (1,0), origin x = 32 tiles
    const pagesBefore = seamChunk.pages;
    const tileBefore = layer.getTileAt(32, 0)!;
    const rawBefore = layer.getRawTileAt(31, 0);
    const revisionBefore = layer.revision;

    view.pixelSnapMode = 'geometry';

    // Layer data and offsets are untouched …
    expect(layer.offsetX).toBe(64);
    expect(layer.offsetY).toBe(-32);
    expect(layer.getRawTileAt(31, 0)).toBe(rawBefore);
    expect(layer.revision).toBe(revisionBefore);

    const tileAfter = layer.getTileAt(32, 0)!;

    expect(tileAfter.tileset).toBe(tileBefore.tileset);
    expect(tileAfter.localTileId).toBe(tileBefore.localTileId);

    // … logical node transforms stay logical …
    expect(node.x).toBe(64);
    expect(node.y).toBe(-32);
    expect(seamChunk.x).toBe(1024); // 1 chunk × 32 tiles × 32 px
    expect(seamChunk.y).toBe(0);

    // … and the cached geometry plus culling bounds are unchanged.
    expect(seamChunk.pages).toBe(pagesBefore);

    const layerBounds = node.getLocalBounds();

    expect(layerBounds.width).toBe(40 * 32);
    expect(layerBounds.height).toBe(8 * 32);

    const chunkBounds = seamChunk.getLocalBounds();

    expect(chunkBounds.width).toBe(8 * 32); // clamped edge chunk: 8 tiles wide
    expect(chunkBounds.height).toBe(8 * 32);
  });
});
