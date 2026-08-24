import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { ObjectKind, type TileMapObject } from '../src/ObjectLayer';
import { buildTileCollisionGeometry } from '../src/tileCollision';
import { TileLayer } from '../src/TileLayer';
import { TileSet } from '../src/TileSet';
import type { TileDefinition, TileTransform } from '../src/types';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// ── Test helpers ──────────────────────────────────────────────────────────

function fakeTexture(): Texture {
  return {
    destroyed: false,
    destroy: () => {},
    height: 512,
    label: 'test',
    uid: 0,
    width: 512,
  } as unknown as Texture;
}

function fakeRegion(): TextureRegion {
  return new TextureRegion(fakeTexture(), { height: 512, width: 512, x: 0, y: 0 });
}

/** A tile-local collision shape, defaulting to a full 16×16 tile rectangle. */
function shape(overrides: Partial<TileMapObject> = {}): TileMapObject {
  return {
    kind: ObjectKind.Rectangle,
    id: 1,
    name: '',
    type: 'solid',
    x: 0,
    y: 0,
    width: 16,
    height: 16,
    rotation: 0,
    visible: true,
    properties: {},
    ...overrides,
  } as TileMapObject;
}

interface TileSetSetup {
  readonly tileWidth?: number;
  readonly tileHeight?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

function makeTileset(
  collisionByTile: Record<number, readonly TileMapObject[]>,
  setup: TileSetSetup = {},
): TileSet {
  const tileset = new TileSet({
    name: 'ts',
    texture: fakeRegion(),
    tileWidth: setup.tileWidth ?? 16,
    tileHeight: setup.tileHeight ?? 16,
    tileCount: 16,
    columns: 4,
    offsetX: setup.offsetX ?? 0,
    offsetY: setup.offsetY ?? 0,
  });
  const definitions: TileDefinition[] = Object.entries(collisionByTile).map(([id, collision]) => ({
    localTileId: Number(id),
    collision,
  }));
  tileset._setDefinitions(definitions);

  return tileset;
}

interface LayerSetup {
  readonly offsetX?: number;
  readonly offsetY?: number;
}

function makeLayer(tileset: TileSet, setup: LayerSetup = {}): TileLayer {
  return new TileLayer({
    id: 1,
    name: 'ground',
    width: 8,
    height: 8,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [tileset],
    offsetX: setup.offsetX ?? 0,
    offsetY: setup.offsetY ?? 0,
  });
}

function place(
  layer: TileLayer,
  tileset: TileSet,
  tx: number,
  ty: number,
  localTileId = 0,
  transform: TileTransform = TILE_TRANSFORM_IDENTITY,
): void {
  layer.setTileAt(tx, ty, { tileset, localTileId, transform });
}

// ═══════════════════════════════════════════════════════════════════════════

describe('buildTileCollisionGeometry — per-tile shapes', () => {
  it('places a partial tile-local rectangle at its exact layer-space position', () => {
    // A 8×4 box at tile-local (4, 8) on the tile at column 2, row 3.
    const tileset = makeTileset({ 0: [shape({ x: 4, y: 8, width: 8, height: 4 })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 2, 3);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([]);
    expect(geometry.shapes).toHaveLength(1);
    expect(geometry.shapes[0]).toMatchObject({
      kind: ObjectKind.Rectangle,
      x: 2 * 16 + 4,
      y: 3 * 16 + 8,
      width: 8,
      height: 4,
      rotation: 0,
      tx: 2,
      ty: 3,
    });
  });

  it('keeps the source object reachable on every emitted shape', () => {
    const source = shape({ x: 2, y: 2, width: 4, height: 4, type: 'ladder', name: 'rung' });
    const tileset = makeTileset({ 0: [source] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]!.source).toBe(source);
    expect(geometry.shapes[0]!.source.type).toBe('ladder');
  });

  it('passes a polygon through unmerged with correct layer-space coordinates', () => {
    const polygon = shape({
      kind: ObjectKind.Polygon,
      x: 2,
      y: 3,
      width: 0,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 0, y: 8 },
      ],
    });
    const tileset = makeTileset({ 0: [polygon] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 1, 1);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([]);
    expect(geometry.shapes).toHaveLength(1);
    expect(geometry.shapes[0]).toMatchObject({
      kind: ObjectKind.Polygon,
      x: 16 + 2,
      y: 16 + 3,
      rotation: 0,
    });
    expect(geometry.shapes[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 8 },
    ]);
  });

  it('passes an ellipse through unmerged with correct layer-space coordinates', () => {
    const tileset = makeTileset({
      0: [shape({ kind: ObjectKind.Ellipse, x: 0, y: 4, width: 16, height: 8 })],
    });
    const layer = makeLayer(tileset);
    place(layer, tileset, 3, 0);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([]);
    expect(geometry.shapes).toHaveLength(1);
    expect(geometry.shapes[0]).toMatchObject({
      kind: ObjectKind.Ellipse,
      x: 48,
      y: 4,
      width: 16,
      height: 8,
    });
  });

  it('never merges non-rectangular geometry, however many identical tiles carry it', () => {
    const tileset = makeTileset({
      0: [
        shape({
          kind: ObjectKind.Polygon,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          points: [
            { x: 0, y: 16 },
            { x: 16, y: 16 },
            { x: 16, y: 0 },
          ],
        }),
      ],
    });
    const layer = makeLayer(tileset);

    for (let tx = 0; tx < 4; tx++) {
      place(layer, tileset, tx, 0);
    }

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([]);
    expect(geometry.shapes).toHaveLength(4);
    expect(geometry.shapes.map(entry => entry.x)).toEqual([0, 16, 32, 48]);
  });
});

describe('buildTileCollisionGeometry — merging', () => {
  it('merges a 4×1 run of full-tile boxes into a single rectangle', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);

    for (let tx = 0; tx < 4; tx++) {
      place(layer, tileset, tx, 0);
    }

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes).toEqual([]);
    expect(geometry.rects).toHaveLength(1);
    expect(geometry.rects[0]).toEqual({ x: 0, y: 0, width: 64, height: 16, type: 'solid' });
  });

  it('emits one rectangle per tile when merging is disabled', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);

    for (let tx = 0; tx < 4; tx++) {
      place(layer, tileset, tx, 0);
    }

    expect(buildTileCollisionGeometry(layer, { merge: false }).rects).toHaveLength(4);
  });

  it('merges a solid 3×3 block into a single rectangle', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);

    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        place(layer, tileset, tx, ty);
      }
    }

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toHaveLength(1);
    expect(geometry.rects[0]).toEqual({ x: 0, y: 0, width: 48, height: 48, type: 'solid' });
  });

  it('does not merge across a gap', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0);
    place(layer, tileset, 1, 0);
    place(layer, tileset, 3, 0);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([
      { x: 0, y: 0, width: 32, height: 16, type: 'solid' },
      { x: 48, y: 0, width: 16, height: 16, type: 'solid' },
    ]);
  });

  it('does not merge tiles whose collision shapes carry different type strings', () => {
    const tileset = makeTileset({
      0: [shape({ type: 'solid' })],
      1: [shape({ type: 'water' })],
    });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0);
    place(layer, tileset, 1, 0, 1);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toHaveLength(2);
    expect(geometry.rects.map(rect => rect.type)).toEqual(['solid', 'water']);
  });
});

describe('buildTileCollisionGeometry — offsets and transforms', () => {
  it('applies the layer pixel offset to merged rectangles', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset, { offsetX: 100, offsetY: -40 });
    place(layer, tileset, 1, 2);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects[0]).toEqual({ x: 116, y: -8, width: 16, height: 16, type: 'solid' });
  });

  it('applies the layer pixel offset to pass-through shapes', () => {
    const tileset = makeTileset({ 0: [shape({ x: 4, y: 4, width: 8, height: 8 })] });
    const layer = makeLayer(tileset, { offsetX: 100, offsetY: -40 });
    place(layer, tileset, 1, 2);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]).toMatchObject({ x: 120, y: -4, width: 8, height: 8 });
  });

  it('applies the tileset draw offset, matching the rendered tile position', () => {
    const tileset = makeTileset(
      { 0: [shape({ x: 0, y: 0, width: 8, height: 8 })] },
      { offsetX: 3, offsetY: -5 },
    );
    const layer = makeLayer(tileset);
    place(layer, tileset, 1, 1);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]).toMatchObject({ x: 16 + 3, y: 16 - 5 });
  });

  it('mirrors a tile-local box on a horizontally flipped tile', () => {
    // A 4-wide box hugging the tile's left edge mirrors to its right edge.
    const tileset = makeTileset({ 0: [shape({ x: 0, y: 0, width: 4, height: 16 })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0, { flipX: true, flipY: false, diagonal: false });

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]).toMatchObject({ x: 12, y: 0, width: 4, height: 16, rotation: 0 });
  });

  it('mirrors a tile-local box on a vertically flipped tile', () => {
    const tileset = makeTileset({ 0: [shape({ x: 0, y: 0, width: 16, height: 4 })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0, { flipX: false, flipY: true, diagonal: false });

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]).toMatchObject({ x: 0, y: 12, width: 16, height: 4, rotation: 0 });
  });

  it('transposes a tile-local box on a diagonally flipped tile', () => {
    const tileset = makeTileset({ 0: [shape({ x: 0, y: 0, width: 16, height: 4 })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0, { flipX: false, flipY: false, diagonal: true });

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 16, rotation: 0 });
  });

  it('still merges a full-tile box on a rotated (diagonal + flipX) tile', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0, { flipX: true, flipY: false, diagonal: true });
    place(layer, tileset, 1, 0, 0, { flipX: true, flipY: false, diagonal: true });

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.shapes).toEqual([]);
    expect(geometry.rects).toEqual([{ x: 0, y: 0, width: 32, height: 16, type: 'solid' }]);
  });

  it('mirrors polygon points and preserves their winding on a flipped tile', () => {
    const polygon = shape({
      kind: ObjectKind.Polygon,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      points: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 0, y: 8 },
      ],
    });
    const tileset = makeTileset({ 0: [polygon] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0, { flipX: true, flipY: false, diagonal: false });

    const geometry = buildTileCollisionGeometry(layer);

    // Origin mirrors from local x = 0 to x = 16; the points mirror around it and
    // reverse order so the polygon keeps its original winding.
    expect(geometry.shapes[0]).toMatchObject({ x: 16, y: 0 });
    expect(geometry.shapes[0]!.points).toEqual([
      { x: 0, y: 8 },
      { x: -8, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});

describe('buildTileCollisionGeometry — scoping and empty inputs', () => {
  it('returns an empty result for a layer with no tiles at all', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);

    expect(buildTileCollisionGeometry(layer)).toEqual({ rects: [], shapes: [] });
  });

  it('returns an empty result when no placed tile carries collision data', () => {
    const tileset = makeTileset({ 5: [shape()] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0);
    place(layer, tileset, 1, 0, 1);

    expect(buildTileCollisionGeometry(layer)).toEqual({ rects: [], shapes: [] });
  });

  it('restricts the walk to an explicit tile region', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);

    for (let tx = 0; tx < 6; tx++) {
      place(layer, tileset, tx, 0);
    }

    const geometry = buildTileCollisionGeometry(layer, {
      region: { x: 2, y: 0, width: 2, height: 1 },
    });

    expect(geometry.rects).toEqual([{ x: 32, y: 0, width: 32, height: 16, type: 'solid' }]);
  });

  it('honours an accept predicate that drops source shapes before merging', () => {
    const tileset = makeTileset({
      0: [shape({ type: 'solid' })],
      1: [shape({ type: 'decoration' })],
    });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0, 0);
    place(layer, tileset, 1, 0, 1);

    const geometry = buildTileCollisionGeometry(layer, {
      accept: object => object.type === 'solid',
    });

    expect(geometry.rects).toEqual([{ x: 0, y: 0, width: 16, height: 16, type: 'solid' }]);
  });

  it('is reachable from the package barrel', async () => {
    const barrel = await import('../src/index');

    expect(typeof barrel.buildTileCollisionGeometry).toBe('function');
  });
});

describe('buildTileCollisionGeometry — cell source', () => {
  it('claims cells on a layer that has no placed tiles and therefore no chunks', () => {
    const tileset = makeTileset({});
    const layer = makeLayer(tileset);

    expect([...layer.loadedChunks()]).toHaveLength(0);

    const geometry = buildTileCollisionGeometry(layer, {
      cells: (tx, ty) => (ty === 0 && tx < 3 ? 'Solid' : null),
    });

    expect(geometry.shapes).toEqual([]);
    expect(geometry.rects).toEqual([{ x: 0, y: 0, width: 48, height: 16, type: 'Solid' }]);
  });

  it('walks the full bounded extent, not just the loaded chunks', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0);

    const visited: string[] = [];
    const geometry = buildTileCollisionGeometry(layer, {
      cells: (tx, ty) => {
        visited.push(`${tx},${ty}`);

        return tx === 7 && ty === 7 ? 'Solid' : null;
      },
    });

    expect(visited).toHaveLength(64);
    expect(geometry.rects).toContainEqual({ x: 112, y: 112, width: 16, height: 16, type: 'Solid' });
  });

  it('keeps distinct classifications unmerged and distinguishable', () => {
    const tileset = makeTileset({});
    const layer = makeLayer(tileset);

    const geometry = buildTileCollisionGeometry(layer, {
      region: { x: 0, y: 0, width: 4, height: 1 },
      cells: tx => (tx < 2 ? 'Solid' : tx < 4 ? 'Water' : null),
    });

    expect(geometry.rects).toEqual([
      { x: 0, y: 0, width: 32, height: 16, type: 'Solid' },
      { x: 32, y: 0, width: 32, height: 16, type: 'Water' },
    ]);
  });

  it('lets the cell source claim a cell first, passing the tile box through as a shape', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'solid' })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 1, 1);

    const geometry = buildTileCollisionGeometry(layer, {
      cells: (tx, ty) => (tx === 1 && ty === 1 ? 'Water' : null),
    });

    expect(geometry.rects).toEqual([{ x: 16, y: 16, width: 16, height: 16, type: 'Water' }]);
    expect(geometry.shapes).toHaveLength(1);
    expect(geometry.shapes[0]).toMatchObject({ x: 16, y: 16, width: 16, height: 16, tx: 1, ty: 1 });
  });

  it('merges cell-sourced and tile-sourced cells that share a classification', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'Solid' })] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 2, 0);

    const geometry = buildTileCollisionGeometry(layer, {
      region: { x: 0, y: 0, width: 4, height: 1 },
      cells: tx => (tx < 2 ? 'Solid' : null),
    });

    expect(geometry.rects).toEqual([{ x: 0, y: 0, width: 48, height: 16, type: 'Solid' }]);
  });

  it('falls back to the loaded-chunk region on an unbounded layer', () => {
    const tileset = makeTileset({});
    const unbounded = new TileLayer({
      id: 2,
      name: 'streamed',
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [tileset],
    });

    expect(buildTileCollisionGeometry(unbounded, { cells: () => 'Solid' }).rects).toEqual([]);

    const scoped = buildTileCollisionGeometry(unbounded, {
      region: { x: -2, y: 0, width: 2, height: 1 },
      cells: () => 'Solid',
    });

    expect(scoped.rects).toEqual([{ x: -32, y: 0, width: 32, height: 16, type: 'Solid' }]);
  });

  it('is not consulted at all when no cell source is passed', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset);
    place(layer, tileset, 0, 0);

    const geometry = buildTileCollisionGeometry(layer);

    expect(geometry.rects).toEqual([{ x: 0, y: 0, width: 16, height: 16, type: 'solid' }]);
  });
});
