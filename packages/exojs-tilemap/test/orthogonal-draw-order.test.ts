import { type Texture, TextureRegion, View } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { ChunkPayload } from '../src/ChunkSource';
import { ChunkStreamer } from '../src/ChunkStreamer';
import type { TileChunk } from '../src/TileChunk';
import type { TileChunkNode } from '../src/TileChunkNode';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileSet, type TileSetOptions } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

// Paints every quad a layer node draws, in the node's draw order, into a sparse
// pixel map, and compares it with an independent painter that follows Tiled's
// right-down render order: rows top to bottom, each row left to right, every
// tile bottom-left anchored on its cell. Each pixel records which tile covered
// it last, so any painter-order difference between overlapping tiles shows up
// as a differing pixel, whatever the chunk layout.

const TILE = 4;
const CHUNK = 2;

/** A texture region of its own, so every atlas and image is a distinct texture. */
const region = (width: number, height: number): TextureRegion =>
  new TextureRegion({ width, height, flipY: false } as Texture, { x: 0, y: 0, width, height });

type Offsets = Pick<TileSetOptions, 'offsetX' | 'offsetY'>;

const atlasSet = (name: string, width = TILE, height = TILE, offsets: Offsets = {}): TileSet =>
  new TileSet({ name, texture: region(width * 2, height), tileWidth: width, tileHeight: height, tileCount: 2, ...offsets });

const imageSet = (name: string, sizes: ReadonlyArray<readonly [number, number]>, offsets: Offsets = {}): TileSet =>
  new TileSet({
    name,
    tileWidth: Math.max(...sizes.map(([width]) => width)),
    tileHeight: Math.max(...sizes.map(([, height]) => height)),
    tileImages: sizes.map(([width, height]) => region(width, height)),
    ...offsets,
  });

interface Placement {
  readonly tx: number;
  readonly ty: number;
  readonly tileset: TileSet;
  readonly id?: number;
}

type Pixels = Map<string, string>;

const label = (tileset: TileSet, tx: number, ty: number): string => `${tileset.name}@${tx},${ty}`;

const fill = (pixels: Pixels, left: number, top: number, right: number, bottom: number, value: string): void => {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      pixels.set(`${x},${y}`, value);
    }
  }
};

const artworkSize = (placement: Placement): readonly [number, number] => {
  const { tileset, id = 0 } = placement;
  const image = tileset.tileImages?.[id];

  return image ? [image.width, image.height] : [tileset.tileWidth, tileset.tileHeight];
};

/** What Tiled shows for these tiles with the `right-down` render order. */
const tiledReference = (placements: readonly Placement[]): Pixels => {
  const pixels: Pixels = new Map();
  const ordered = [...placements].sort((a, b) => a.ty - b.ty || a.tx - b.tx);

  for (const placement of ordered) {
    const [width, height] = artworkSize(placement);
    const left = placement.tx * TILE + placement.tileset.offsetX;
    const bottom = (placement.ty + 1) * TILE + placement.tileset.offsetY;

    fill(pixels, left, bottom - height, left + width, bottom, label(placement.tileset, placement.tx, placement.ty));
  }

  return pixels;
};

/** What the node draws, child by child and quad by quad, in layer-local pixels. */
const rendered = (node: TileLayerNode): Pixels => {
  const pixels: Pixels = new Map();

  for (const child of node.children) {
    const chunk = child as TileChunkNode;

    for (const page of chunk.pages) {
      for (const quad of page.quads) {
        const left = chunk.x + quad.x0;
        const bottom = chunk.y + quad.y1;
        // The cell is recovered from the bottom-left anchoring, so a quad placed
        // on the wrong cell differs from the reference as well.
        const tx = (left - page.tileset.offsetX) / TILE;
        const ty = (bottom - page.tileset.offsetY) / TILE - 1;

        fill(pixels, left, chunk.y + quad.y0, chunk.x + quad.x1, bottom, label(page.tileset, tx, ty));
      }
    }
  }

  return pixels;
};

/** Pixels whose topmost tile differs, as readable lines (empty when the images match). */
const differences = (actual: Pixels, expected: Pixels): string[] => {
  const lines: string[] = [];

  for (const key of new Set([...actual.keys(), ...expected.keys()])) {
    if (actual.get(key) !== expected.get(key)) {
      lines.push(`(${key}) drew ${actual.get(key) ?? 'nothing'}, Tiled shows ${expected.get(key) ?? 'nothing'}`);
    }
  }

  return lines.slice(0, 8);
};

const layerOf = (tilesets: readonly TileSet[], bounds?: { width: number; height: number }): TileLayer =>
  new TileLayer({
    id: 1,
    name: 'ground',
    tileWidth: TILE,
    tileHeight: TILE,
    chunkWidth: CHUNK,
    chunkHeight: CHUNK,
    tilesets,
    ...bounds,
  });

const place = (layer: TileLayer, placements: readonly Placement[]): void => {
  for (const { tx, ty, tileset, id = 0 } of placements) {
    layer.setTileAt(tx, ty, { tileset, localTileId: id, transform: TILE_TRANSFORM_IDENTITY });
  }
};

const chunkOf = (placement: Placement): string => `${Math.floor(placement.tx / CHUNK)},${Math.floor(placement.ty / CHUNK)}`;

const payloadOf = (source: TileLayer, cx: number, cy: number): ChunkPayload | null => {
  const chunk = source.getChunk(cx, cy);

  if (chunk === undefined) {
    return null;
  }

  const tiles = new Uint32Array(chunk.width * chunk.height);

  for (let ly = 0; ly < chunk.height; ly++) {
    for (let lx = 0; lx < chunk.width; lx++) {
      tiles[ly * chunk.width + lx] = chunk.getRawAt(lx, ly);
    }
  }

  return { width: chunk.width, height: chunk.height, tiles };
};

/** Streams chunks of an authored world into an empty layer, the way a chunk provider installs them. */
class World {
  public readonly source: TileLayer;
  public readonly target: TileLayer;
  public readonly node: TileLayerNode;
  private readonly _placements: readonly Placement[];

  public constructor(tilesets: readonly TileSet[], placements: readonly Placement[]) {
    this._placements = placements;
    this.source = layerOf(tilesets);
    this.target = layerOf(tilesets);
    place(this.source, placements);
    this.node = new TileLayerNode(this.target);
  }

  public load(...chunks: ReadonlyArray<readonly [number, number]>): this {
    for (const [cx, cy] of chunks) {
      this.target._adoptChunk(cx, cy, payloadOf(this.source, cx, cy)!);
    }

    return this;
  }

  public unload(...chunks: ReadonlyArray<readonly [number, number]>): this {
    for (const [cx, cy] of chunks) {
      this.target._evictChunk(cx, cy);
    }

    return this;
  }

  /** Differences between the node's image and Tiled's for the chunks resident right now. */
  public differences(): string[] {
    const resident = new Set([...this.target.loadedChunks()].map(chunk => `${chunk.cx},${chunk.cy}`));

    return differences(rendered(this.node), tiledReference(this._placements.filter(placement => resident.has(chunkOf(placement)))));
  }
}

/** Every cell of a rectangle, except the ones listed in `except`. */
const groundCells = (tileset: TileSet, x0: number, y0: number, x1: number, y1: number, except: readonly Placement[]): Placement[] => {
  const taken = new Set(except.map(({ tx, ty }) => `${tx},${ty}`));
  const cells: Placement[] = [];

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      if (!taken.has(`${tx},${ty}`)) {
        cells.push({ tx, ty, tileset });
      }
    }
  }

  return cells;
};

const chunkGrid = (minCx: number, minCy: number, maxCx: number, maxCy: number): Array<[number, number]> => {
  const chunks: Array<[number, number]> = [];

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      chunks.push([cx, cy]);
    }
  }

  return chunks;
};

describe('orthogonal draw order across chunk borders', () => {
  it('draws tall artwork in the top row of a chunk over the chunk above it, whichever loads first', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE, TILE * 3]]);
    // The tree stands in the top row of chunk (0, 1) and rises through chunk (0, 0).
    const tree: Placement = { tx: 0, ty: 2, tileset: props };
    const placements = [tree, ...groundCells(ground, 0, 0, 2, 4, [tree])];

    for (const order of [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 1],
        [0, 0],
      ],
    ] as const) {
      const world = new World([ground, props], placements).load(...order);

      expect(world.differences(), `load order ${JSON.stringify(order)}`).toEqual([]);
      world.node.destroy();
    }
  });

  it('draws like Tiled when a ChunkStreamer loads the chunk nearest the view first', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE, TILE * 3]]);
    const tree: Placement = { tx: 0, ty: 2, tileset: props };
    const world = new World([ground, props], [tree, ...groundCells(ground, 0, 0, 2, 4, [tree])]);
    const view = new View(CHUNK * TILE * 0.5, CHUNK * TILE * 1.5, 2, 2);
    const streamer = new ChunkStreamer(world.target, { getChunk: (cx, cy) => payloadOf(world.source, cx, cy) }, view, {
      loadRadius: 0,
      unloadRadius: 1,
    });

    streamer.update();
    expect([...world.target.loadedChunks()].map(chunk => [chunk.cx, chunk.cy])).toEqual([[0, 1]]);

    view.setCenter(CHUNK * TILE * 0.5, CHUNK * TILE * 0.5);
    streamer.update();

    expect(world.target.getChunk(0, 0)).toBeDefined();
    expect(world.differences()).toEqual([]);
    streamer.destroy();
    world.node.destroy();
  });

  it('draws artwork wider and taller than its cell over earlier rows of the next chunk column', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE * 2, TILE * 2]]);
    // Row 1 of chunk (0, 0) reaches up and right into row 0 of chunk (1, 0). Tiled draws
    // row 0 first, so the overhang is on top - drawing whole chunks one after the other
    // puts chunk (1, 0)'s ground over it in either chunk order.
    const crate: Placement = { tx: 1, ty: 1, tileset: props };
    const placements = [crate, ...groundCells(ground, 0, 0, 4, 2, [crate])];

    for (const order of [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [0, 0],
      ],
    ] as const) {
      const world = new World([ground, props], placements).load(...order);

      expect(world.differences(), `load order ${JSON.stringify(order)}`).toEqual([]);
      world.node.destroy();
    }
  });

  it('draws artwork shifted down and left by its tile offset under later rows of the previous chunk column', () => {
    const ground = atlasSet('ground');
    const shifted = atlasSet('shifted', TILE, TILE, { offsetX: -2, offsetY: 2 });
    // Cell (2, 0) of chunk (1, 0) sits half over cell (1, 1) of chunk (0, 0), which Tiled draws later.
    const sign: Placement = { tx: 2, ty: 0, tileset: shifted };
    const world = new World([ground, shifted], [sign, ...groundCells(ground, 0, 0, 4, 2, [sign])]).load([1, 0], [0, 0]);

    expect(world.differences()).toEqual([]);
    world.node.destroy();
  });

  it('orders overhangs across both chunk axes, with negative chunk coordinates, in any load order', () => {
    const ground = atlasSet('ground');
    const deco = atlasSet('deco', TILE * 2, TILE * 2);
    const props = imageSet('props', [
      [TILE, TILE * 3],
      [TILE * 3, TILE],
      [TILE * 2, TILE * 3],
    ]);
    const features: Placement[] = [
      { tx: -3, ty: -1, tileset: props, id: 0 },
      { tx: -1, ty: -2, tileset: deco },
      { tx: -1, ty: 1, tileset: props, id: 2 },
      { tx: 0, ty: -3, tileset: props, id: 1 },
      { tx: 1, ty: 0, tileset: deco },
      { tx: 1, ty: 3, tileset: props, id: 2 },
      { tx: -2, ty: 2, tileset: props, id: 1 },
    ];
    const placements = [...features, ...groundCells(ground, -4, -4, 4, 4, features)];
    const chunks = chunkGrid(-2, -2, 1, 1);
    const orders = [
      chunks,
      [...chunks].reverse(),
      [...chunks].sort(([ax, ay], [bx, by]) => ((ax * 7 + ay * 3) & 7) - ((bx * 7 + by * 3) & 7)),
    ];

    for (const order of orders) {
      const world = new World([ground, deco, props], placements).load(...order);

      expect(world.differences(), `load order ${JSON.stringify(order)}`).toEqual([]);
      world.node.destroy();
    }
  });

  it('keeps drawing like Tiled through unload and reload sequences', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [
      [TILE, TILE * 3],
      [TILE * 2, TILE * 2],
    ]);
    const features: Placement[] = [
      { tx: 0, ty: 2, tileset: props, id: 0 },
      { tx: 1, ty: 1, tileset: props, id: 1 },
      { tx: 3, ty: 3, tileset: props, id: 1 },
    ];
    const world = new World([ground, props], [...features, ...groundCells(ground, 0, 0, 4, 4, features)]);

    world.load([1, 1], [0, 1], [1, 0], [0, 0]);
    expect(world.differences()).toEqual([]);
    world.unload([0, 0]);
    expect(world.differences()).toEqual([]);
    world.load([0, 0]);
    expect(world.differences()).toEqual([]);
    world.unload([1, 0], [0, 1]).load([0, 1]);
    expect(world.differences()).toEqual([]);
    world.load([1, 0]);
    expect(world.differences()).toEqual([]);
    // Re-installing a resident chunk replaces it in place.
    world.load([0, 0], [1, 1]);
    expect(world.differences()).toEqual([]);
    world.node.destroy();
  });

  it('draws partial edge chunks of a bounded layer like Tiled, before and after refresh', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [
      [TILE * 2, TILE * 2],
      [TILE, TILE * 3],
    ]);
    const features: Placement[] = [
      { tx: 1, ty: 3, tileset: props, id: 0 },
      { tx: 3, ty: 4, tileset: props, id: 0 },
      { tx: 4, ty: 2, tileset: props, id: 1 },
    ];
    const placements = [...features, ...groundCells(ground, 0, 0, 5, 5, features)];
    const layer = layerOf([ground, props], { width: 5, height: 5 });

    place(layer, placements);

    const node = new TileLayerNode(layer);

    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.refresh();
    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.destroy();
  });

  it('follows edits that swap ordinary tiles for overhanging artwork and back', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE * 2, TILE * 2]]);
    const placements = groundCells(ground, 0, 0, 4, 4, []);
    const layer = layerOf([ground, props]);

    place(layer, placements);

    const node = new TileLayerNode(layer);
    const crate: Placement = { tx: 1, ty: 3, tileset: props };
    const withCrate = [...placements.filter(({ tx, ty }) => tx !== 1 || ty !== 3), crate];

    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    expect(node.chunkNodes).toHaveLength(4);
    place(layer, [crate]);
    expect(differences(rendered(node), tiledReference(withCrate))).toEqual([]);
    expect(node.chunkNodes).toHaveLength(4 * CHUNK);
    place(layer, [{ tx: 1, ty: 3, tileset: ground }]);
    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.refresh();
    expect(node.chunkNodes).toHaveLength(4);
    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.destroy();
  });

  it('follows overhanging artwork written straight into chunk storage', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE * 2, TILE * 2]]);
    const placements = groundCells(ground, 0, 0, 4, 4, []);
    const layer = layerOf([ground, props]);

    place(layer, placements);

    const node = new TileLayerNode(layer);
    const crate: Placement = { tx: 1, ty: 1, tileset: props };
    const source = layerOf([ground, props]);

    place(source, [crate]);

    const chunk = layer.getChunk(0, 0) as TileChunk;

    chunk._getRawStorage()[1 * CHUNK + 1] = source.getRawTileAt(1, 1);
    chunk._markDirty();

    expect(differences(rendered(node), tiledReference([...placements.filter(({ tx, ty }) => tx !== 1 || ty !== 1), crate]))).toEqual([]);
    node.destroy();
  });

  it('draws the same image for the same content whatever the load and edit sequence', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [
      [TILE * 2, TILE * 3],
      [TILE, TILE * 2],
    ]);
    const features: Placement[] = [
      { tx: 1, ty: 1, tileset: props, id: 0 },
      { tx: 2, ty: 3, tileset: props, id: 1 },
    ];
    const placements = [...features, ...groundCells(ground, 0, 0, 4, 4, features)];
    const chunks = chunkGrid(0, 0, 1, 1);
    const first = new World([ground, props], placements).load(...chunks);
    const streamed = new World([ground, props], placements).load(...[...chunks].reverse());
    const refreshed = new World([ground, props], placements).load(...chunks);

    streamed.unload([0, 0], [1, 0]).load([1, 0], [0, 0]);
    refreshed.node.refresh();
    place(refreshed.target, [{ tx: 0, ty: 0, tileset: props, id: 1 }]);
    place(refreshed.target, [{ tx: 0, ty: 0, tileset: ground }]);

    expect(differences(rendered(streamed.node), rendered(first.node))).toEqual([]);
    expect(differences(rendered(refreshed.node), rendered(first.node))).toEqual([]);
    expect(first.differences()).toEqual([]);
    first.node.destroy();
    streamed.node.destroy();
    refreshed.node.destroy();
  });
});

describe('orthogonal draw order inside one chunk', () => {
  it('stacks overhanging atlas tiles over tiles of a later-listed atlas in cell order', () => {
    const trees = atlasSet('trees', TILE, TILE * 2);
    const flowers = atlasSet('flowers');
    // The tree in row 1 rises over the flower in row 0 of the same chunk; Tiled draws the tree last.
    const placements: Placement[] = [
      { tx: 0, ty: 0, tileset: flowers },
      { tx: 0, ty: 1, tileset: trees },
      { tx: 1, ty: 1, tileset: flowers },
    ];
    const layer = layerOf([trees, flowers]);

    place(layer, placements);

    const node = new TileLayerNode(layer);

    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.destroy();
  });

  it('draws a tile after an earlier-listed atlas tile reaching over its cell, as Tiled does', () => {
    const ground = atlasSet('ground');
    const bridges = atlasSet('bridges', TILE * 2, TILE);
    const sunk = atlasSet('sunk', TILE, TILE, { offsetY: 2 });
    // The bridge reaches right over (1, 0) and the sunk tile down over (0, 1); Tiled draws both covered cells later.
    const placements: Placement[] = [
      { tx: 0, ty: 0, tileset: bridges },
      { tx: 1, ty: 0, tileset: ground },
      { tx: 1, ty: 1, tileset: sunk },
      { tx: 0, ty: 1, tileset: ground },
    ];
    const layer = layerOf([ground, bridges, sunk]);

    place(layer, placements);

    const node = new TileLayerNode(layer);

    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    node.destroy();
  });

  it('keeps batching tiles by atlas when overhangs only cover cells drawn before them', () => {
    const ground = atlasSet('ground');
    const trees = atlasSet('trees', TILE, TILE * 3);
    const flowers = atlasSet('flowers');
    const features: Placement[] = [
      { tx: 0, ty: 1, tileset: flowers },
      { tx: 1, ty: 1, tileset: trees },
      { tx: 0, ty: 3, tileset: trees },
      { tx: 1, ty: 2, tileset: flowers },
      { tx: 3, ty: 3, tileset: trees },
    ];
    const placements = [...features, ...groundCells(ground, 0, 0, 4, 4, features)];
    const layer = layerOf([trees, ground, flowers]);

    place(layer, placements);

    const node = new TileLayerNode(layer);

    expect(differences(rendered(node), tiledReference(placements))).toEqual([]);
    // Every tree reaches only up, so ground and flowers batch per atlas and the trees follow.
    expect(node.chunkNodes.map(chunk => chunk.pages.map(page => page.tileset.name).join(' '))).toEqual([
      'ground flowers trees',
      'ground',
      'ground flowers trees',
      'ground trees',
    ]);
    node.destroy();
  });

  it('keeps one page per atlas when no tile reaches past its cell', () => {
    const ground = atlasSet('ground');
    const water = atlasSet('water');
    const layer = layerOf([ground, water]);

    place(layer, groundCells(ground, 0, 0, 2, 2, [{ tx: 1, ty: 0, tileset: water }]));
    place(layer, [
      { tx: 1, ty: 0, tileset: water },
      { tx: 0, ty: 1, tileset: water },
    ]);

    const node = new TileLayerNode(layer);

    expect(node.chunkNodes[0]!.pages.map(page => page.tileset.name)).toEqual(['ground', 'water']);
    node.destroy();
  });
});

describe('orthogonal render structure', () => {
  const chunkOrder = (node: TileLayerNode): string[] =>
    node.children.map(child => `${(child as TileChunkNode).chunkX},${(child as TileChunkNode).chunkY}`);

  for (const [name, tilesets] of [
    ['same-size atlas tiles', (): TileSet[] => [atlasSet('ground'), atlasSet('water')]],
    ['tall artwork', (): TileSet[] => [atlasSet('ground'), imageSet('trees', [[TILE, TILE * 3]])]],
    ['wide artwork', (): TileSet[] => [atlasSet('ground'), atlasSet('bridges', TILE * 3, TILE)]],
    [
      'tall and wide artwork in separate tilesets',
      (): TileSet[] => [atlasSet('trees', TILE, TILE * 3), atlasSet('bridges', TILE * 3, TILE)],
    ],
  ] as const) {
    it(`${name}: one node per chunk, in row-major chunk order whatever the load order`, () => {
      const sets = tilesets();
      const features: Placement[] = [
        { tx: 1, ty: 1, tileset: sets[1]! },
        { tx: 0, ty: 2, tileset: sets[0]! },
        { tx: 3, ty: 2, tileset: sets[1]! },
      ];
      const world = new World(sets, [...features, ...groundCells(sets[0]!, 0, 0, 4, 4, features)]).load([1, 1], [0, 1], [1, 0], [0, 0]);

      expect(chunkOrder(world.node)).toEqual(['0,0', '1,0', '0,1', '1,1']);
      expect(world.differences()).toEqual([]);
      world.node.destroy();
    });
  }

  it('keeps whole chunks and atlas batching while the layer places none of its overhanging artwork', () => {
    const ground = atlasSet('ground');
    const water = atlasSet('water');
    // Map importers hand every layer all of the map's tilesets, used or not.
    const props = atlasSet('props', TILE * 3, TILE * 4);
    const features: Placement[] = [
      { tx: 1, ty: 0, tileset: water },
      { tx: 2, ty: 3, tileset: water },
    ];
    const world = new World([ground, water, props], [...features, ...groundCells(ground, 0, 0, 4, 4, features)]).load(
      [1, 1],
      [0, 0],
      [1, 0],
      [0, 1],
    );

    expect(chunkOrder(world.node)).toEqual(['0,0', '1,0', '0,1', '1,1']);
    expect(world.node.chunkNodes.map(chunk => chunk.pages.length)).toEqual([2, 1, 1, 2]);
    expect(world.node.chunkNodes[0]!.getLocalBounds()).toMatchObject({ x: 0, y: 0, width: CHUNK * TILE, height: CHUNK * TILE });
    world.node.destroy();
  });

  it('draws one node per chunk row once artwork can reach across a chunk column into another row', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE * 2, TILE * 2]]);
    const crate: Placement = { tx: 3, ty: 3, tileset: props };
    const world = new World([ground, props], [crate, ...groundCells(ground, 0, 0, 4, 4, [crate])]).load([1, 1], [0, 0], [1, 0], [0, 1]);

    expect(world.node.chunkNodes).toHaveLength(4 * CHUNK);
    expect(chunkOrder(world.node)).toEqual(['0,0', '1,0', '0,0', '1,0', '0,1', '1,1', '0,1', '1,1']);
    world.node.destroy();
  });
});

describe('orthogonal chunk node bounds', () => {
  it('bound every quad a chunk node draws, including artwork overhanging the chunk', () => {
    const ground = atlasSet('ground');
    const shifted = atlasSet('shifted', TILE, TILE, { offsetX: -3, offsetY: 2 });
    const props = imageSet('props', [
      [TILE, TILE * 3],
      [TILE * 3, TILE],
    ]);

    for (const tilesets of [[ground, props], [ground, shifted], [ground]]) {
      const layer = layerOf(tilesets);

      for (let ty = -2; ty < 4; ty++) {
        for (let tx = -2; tx < 4; tx++) {
          const tileset = tilesets[(tx + ty) & 1 ? tilesets.length - 1 : 0]!;

          layer.setTileAt(tx, ty, { tileset, localTileId: (tx & 1) === 0 ? 0 : 1, transform: TILE_TRANSFORM_IDENTITY });
        }
      }

      const node = new TileLayerNode(layer);

      for (const chunk of node.chunkNodes) {
        const bounds = chunk.getLocalBounds();

        for (const quad of chunk.pages.flatMap(page => page.quads)) {
          expect(bounds.left).toBeLessThanOrEqual(quad.x0);
          expect(bounds.top).toBeLessThanOrEqual(quad.y0);
          expect(bounds.right).toBeGreaterThanOrEqual(quad.x1);
          expect(bounds.bottom).toBeGreaterThanOrEqual(quad.y1);
        }
      }

      node.destroy();
    }
  });

  it('bounds a bounded layer by the artwork overhanging the map edge', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE, TILE * 3]]);
    const layer = layerOf([ground, props], { width: 4, height: 4 });

    place(layer, [{ tx: 0, ty: 0, tileset: props }]);

    const node = new TileLayerNode(layer);

    // The tree in the top row rises 2 cells above the map.
    expect(node.getBounds().top).toBeLessThanOrEqual(-2 * TILE);
    node.destroy();
  });

  it('keeps a chunk whose cells are off view but whose overhang is in view', () => {
    const ground = atlasSet('ground');
    const props = imageSet('props', [[TILE, TILE * 3]]);
    const world = new World([ground, props], [{ tx: 0, ty: 2, tileset: props }]).load([0, 1]);
    const [chunk] = world.node.chunkNodes;

    // The tree's cell starts at y = 8; its artwork reaches up to y = 0.
    expect(chunk!.getBounds().top).toBeLessThanOrEqual(0);
    world.node.destroy();
  });
});
