import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileMap } from '../src/TileMap';
import { TileMapNode } from '../src/TileMapNode';
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

interface LayerOpts {
  readonly id?: number;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

function makeLayer(tileset: TileSet, opts: LayerOpts = {}): TileLayer {
  const layer = new TileLayer({
    id: opts.id ?? 1,
    name: opts.name ?? 'ground',
    width: opts.width ?? 4,
    height: opts.height ?? 4,
    tileWidth: 32,
    tileHeight: 32,
    tilesets: [tileset],
    visible: opts.visible,
    opacity: opts.opacity,
    offsetX: opts.offsetX,
    offsetY: opts.offsetY,
  });
  return layer;
}

function fillLayer(layer: TileLayer, tileset: TileSet): TileLayer {
  for (let ty = 0; ty < layer.height; ty++) {
    for (let tx = 0; tx < layer.width; tx++) {
      layer.setTileAt(tx, ty, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    }
  }
  return layer;
}

// ═══════════════════════════════════════════════════════════════════════
// TileLayerNode
// ═══════════════════════════════════════════════════════════════════════

describe('TileLayerNode', () => {
  it('builds one chunk node per non-empty loaded chunk', () => {
    const tileset = makeTileset();
    // 40×40 map, chunk size 32 → chunks (0,0) and (1,1) once both are touched.
    const layer = new TileLayer({ id: 1, name: 'l', width: 40, height: 40, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(33, 33, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);

    expect(node.chunkNodes).toHaveLength(2);
    expect(node.children).toHaveLength(2);
  });

  it('skips empty chunks', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.clearTileAt(0, 0); // chunk materialised but now empty

    const node = new TileLayerNode(layer);

    expect(node.chunkNodes).toHaveLength(0);
  });

  it('positions the node at the layer pixel offset', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset, { offsetX: 64, offsetY: -32 });
    const node = new TileLayerNode(layer);

    expect(node.x).toBe(64);
    expect(node.y).toBe(-32);
  });

  it('parallax layer: initial position is the base offset (not parallax-shifted)', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 1, name: 'bg', width: 4, height: 4, tileWidth: 32, tileHeight: 32,
      tilesets: [tileset], offsetX: 10, offsetY: 20, parallaxX: 0.5, parallaxY: 0.5,
    });
    const node = new TileLayerNode(layer);

    // Construction must NOT apply a parallax shift — the shift is render-time only.
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });

  it('parallax layer: position is restored to base offset after _collectContent', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 1, name: 'bg', width: 4, height: 4, tileWidth: 32, tileHeight: 32,
      tilesets: [tileset], offsetX: 10, offsetY: 20, parallaxX: 0.5, parallaxY: 0.5,
    });
    const node = new TileLayerNode(layer);

    // Simulate the render-plan builder with a view whose center is at (100, 200).
    const mockBuilder = {
      view: { center: { x: 100, y: 200 } },
    };

    // Invoke the protected _collectContent via cast; it must not throw and
    // must restore the position even though children don't exist (empty layer).
    (node as unknown as { _collectContent(b: unknown): void })._collectContent(mockBuilder);

    // After the call the node position must be restored to the base offset.
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });

  it('reports local bounds as the layer pixel rect (even when empty)', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset, { width: 5, height: 3 });
    const node = new TileLayerNode(layer);

    const bounds = node.getLocalBounds();
    expect(bounds.width).toBe(5 * 32);
    expect(bounds.height).toBe(3 * 32);
  });

  it('synchronises the layer opacity onto chunk tints at construction', () => {
    const tileset = makeTileset();
    const layer = fillLayer(makeLayer(tileset, { opacity: 0.5 }), tileset);
    const node = new TileLayerNode(layer);

    expect(node.chunkNodes.length).toBeGreaterThan(0);
    for (const chunk of node.chunkNodes) {
      expect(chunk.tint.a).toBeCloseTo(0.5, 6);
    }
  });

  it('refresh() picks up chunks created after construction', () => {
    const tileset = makeTileset();
    // 40-wide map so a second chunk can appear later.
    const layer = new TileLayer({ id: 1, name: 'l', width: 40, height: 8, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    expect(node.chunkNodes).toHaveLength(1);

    layer.setTileAt(33, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    expect(node.chunkNodes).toHaveLength(1); // not auto-reflected

    node.refresh();
    expect(node.chunkNodes).toHaveLength(2);
  });

  it('_collectContent is a no-op (skips super call) when the layer is invisible', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset, { visible: false });
    const node = new TileLayerNode(layer);

    const mockBuilder = { view: { center: { x: 0, y: 0 } } };

    expect(() => (node as unknown as { _collectContent(b: unknown): void })._collectContent(mockBuilder)).not.toThrow();
  });

  it('propagates a non-null tintColor onto chunk tints (RGB channels extracted from the packed color)', () => {
    const tileset = makeTileset();
    const layer = fillLayer(
      new TileLayer({
        id: 1, name: 'tinted', width: 4, height: 4, tileWidth: 32, tileHeight: 32,
        tilesets: [tileset], tintColor: 0x336699,
      }),
      tileset,
    );
    const node = new TileLayerNode(layer);

    expect(node.chunkNodes.length).toBeGreaterThan(0);
    for (const chunk of node.chunkNodes) {
      expect(chunk.tint.r).toBe(0x33);
      expect(chunk.tint.g).toBe(0x66);
      expect(chunk.tint.b).toBe(0x99);
    }
  });

  it('destroy() frees chunk nodes but not the layer', () => {
    const tileset = makeTileset();
    const layer = fillLayer(makeLayer(tileset), tileset);
    const node = new TileLayerNode(layer);

    node.destroy();

    expect(node.chunkNodes).toHaveLength(0);
    expect(node.children).toHaveLength(0);
    expect(layer.destroyed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileChunkNode revision cache + culling bounds
// ═══════════════════════════════════════════════════════════════════════

describe('TileChunkNode geometry cache', () => {
  it('returns the same page geometry until the chunk revision changes', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer).chunkNodes[0];

    const first = node.pages;
    expect(node.pages).toBe(first); // cached, no rebuild

    layer.setTileAt(1, 1, { tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    const second = node.pages;
    expect(second).not.toBe(first); // rebuilt after revision bump
    expect(second[0].quads).toHaveLength(2);
  });

  it('does not rebuild geometry on a no-op tile write', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer).chunkNodes[0];
    const first = node.pages;

    // Writing the identical value is a no-op → revision unchanged → no rebuild.
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    expect(node.pages).toBe(first);
  });

  it('does not rebuild geometry when only the node transform changes', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer).chunkNodes[0];
    const first = node.pages;

    node.setPosition(123, 456);

    expect(node.pages).toBe(first); // geometry is transform-independent
  });

  it('exposes its chunk coordinates and empty status', () => {
    const tileset = makeTileset();
    // 40-wide map so chunk (1,1) is distinct from (0,0).
    const layer = new TileLayer({ id: 1, name: 'l', width: 40, height: 40, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    layer.setTileAt(33, 33, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const [first, second] = new TileLayerNode(layer).chunkNodes;

    expect(first!.chunkX).toBe(0);
    expect(first!.chunkY).toBe(0);
    expect(first!.isEmpty).toBe(false);

    expect(second!.chunkX).toBe(1);
    expect(second!.chunkY).toBe(1);
    expect(second!.isEmpty).toBe(false);
  });

  it('isEmpty reflects the built page geometry (recomputed lazily via pages)', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset);
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer).chunkNodes[0];
    expect(node.isEmpty).toBe(false);

    layer.clearTileAt(0, 0);
    // The chunk still exists (materialised) but its geometry is now empty.
    expect(node.isEmpty).toBe(true);
  });

  it('exposes accurate local bounds for culling (clamped edge chunk)', () => {
    const tileset = makeTileset();
    // 3×3 map, single chunk clamped to 3×3 tiles.
    const layer = makeLayer(tileset, { width: 3, height: 3 });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer).chunkNodes[0];
    const bounds = node.getLocalBounds();

    expect(bounds.width).toBe(3 * 32);
    expect(bounds.height).toBe(3 * 32);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TileMapNode
// ═══════════════════════════════════════════════════════════════════════

describe('TileMapNode', () => {
  function makeMap(): { map: TileMap; tileset: TileSet } {
    const tileset = makeTileset();
    const background = fillLayer(makeLayer(tileset, { id: 1, name: 'background' }), tileset);
    const foreground = fillLayer(makeLayer(tileset, { id: 2, name: 'foreground' }), tileset);
    const map = new TileMap({
      name: 'm',
      width: 4,
      height: 4,
      tileWidth: 32,
      tileHeight: 32,
      tilesets: [tileset],
      layers: [background, foreground],
    });
    return { map, tileset };
  }

  it('builds one layer node per map layer, preserving order', () => {
    const { map } = makeMap();
    const node = new TileMapNode(map);

    expect(node.layerNodes).toHaveLength(2);
    expect(node.layerNodes[0].layer.name).toBe('background');
    expect(node.layerNodes[1].layer.name).toBe('foreground');
    expect(node.children).toHaveLength(2);
  });

  it('resolves layer nodes by name', () => {
    const { map } = makeMap();
    const node = new TileMapNode(map);

    expect(node.getLayerNode('foreground')).toBe(node.layerNodes[1]);
    expect(node.getLayerNode('missing')).toBeUndefined();
  });

  it('reports local bounds covering the whole map (including an empty map)', () => {
    const { map } = makeMap();
    expect(new TileMapNode(map).getLocalBounds().width).toBe(4 * 32);

    const emptyMap = new TileMap({ name: 'e', width: 6, height: 2, tileWidth: 32, tileHeight: 32 });
    const emptyBounds = new TileMapNode(emptyMap).getLocalBounds();
    expect(emptyBounds.width).toBe(6 * 32);
    expect(emptyBounds.height).toBe(2 * 32);
  });

  it('destroy() frees layer/chunk nodes but never the map or its textures', () => {
    const { map, tileset } = makeMap();
    const node = new TileMapNode(map);

    node.destroy();

    expect(node.layerNodes).toHaveLength(0);
    expect(node.children).toHaveLength(0);
    expect(map.destroyed).toBe(false);
    expect(map.layers[0].destroyed).toBe(false);
    expect(tileset.texture.texture.destroy).not.toHaveBeenCalled();
  });

  it('does not own the map lifetime — the map survives node disposal', () => {
    const { map } = makeMap();
    const node = new TileMapNode(map);
    node.destroy();

    // The map is still fully usable.
    expect(map.getTileAt(1, 0, 0)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Unbounded layer/map nodes
// ═══════════════════════════════════════════════════════════════════════

describe('unbounded layer/map nodes', () => {
  it('TileLayerNode.getLocalBounds() falls back to children aggregate when unbounded, and is not cullable', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 1, name: 'l',
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    });
    layer._adoptChunk(2, 3, {
      width: 4, height: 4,
      tiles: new Uint32Array([packTile(0, 0, TILE_TRANSFORM_IDENTITY), ...new Array(15).fill(0)]),
    });

    const node = new TileLayerNode(layer);
    node.refresh();

    expect(node.cullable).toBe(false);
    const bounds = node.getLocalBounds();
    // Chunk (2,3) at 4x4 tiles of 16px starts at (2*4*16, 3*4*16) = (128, 192).
    expect(bounds.x).toBe(128);
    expect(bounds.y).toBe(192);
    expect(bounds.width).toBe(64);
    expect(bounds.height).toBe(64);
    expect(Number.isFinite(bounds.x)).toBe(true);
    expect(Number.isFinite(bounds.y)).toBe(true);
  });

  it('TileLayerNode.getLocalBounds() keeps the fixed-rect override when bounded', () => {
    const tileset = makeTileset();
    const layer = makeLayer(tileset, { width: 10, height: 10 });
    const node = new TileLayerNode(layer);
    expect(node.cullable).toBe(true);
    const bounds = node.getLocalBounds();
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(320);
    expect(bounds.height).toBe(320);
  });

  it('TileMapNode.getLocalBounds() falls back to children aggregate when the map is unbounded', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({
      id: 1, name: 'l',
      tileWidth: 16, tileHeight: 16, tilesets: [tileset],
      chunkWidth: 4, chunkHeight: 4,
    });
    layer._adoptChunk(0, 0, {
      width: 4, height: 4,
      tiles: new Uint32Array([packTile(0, 0, TILE_TRANSFORM_IDENTITY), ...new Array(15).fill(0)]),
    });
    const map = new TileMap({
      name: 'm', tileWidth: 16, tileHeight: 16,
      layers: [layer],
    });

    const node = new TileMapNode(map);
    const bounds = node.getLocalBounds();
    expect(Number.isFinite(bounds.x)).toBe(true);
    expect(Number.isFinite(bounds.y)).toBe(true);
    expect(Number.isFinite(bounds.width)).toBe(true);
    expect(Number.isFinite(bounds.height)).toBe(true);
    // Single layer, single chunk (0,0) at 4x4 tiles of 16px → (0, 0, 64, 64).
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(64);
    expect(bounds.height).toBe(64);
  });
});
