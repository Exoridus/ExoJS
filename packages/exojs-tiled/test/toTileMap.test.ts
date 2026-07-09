import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type AssetLoaderContext,Texture } from '@codexo/exojs';
import { type TileLayer, TileMap, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it,vi } from 'vitest';

import { loadTiledMap } from '../src/loadTiledMap';
import { TiledGroupLayer, TiledImageLayer, TiledObjectLayer, TiledTileLayer } from '../src/TiledLayer';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';
import { TiledFormatError } from '../src/validate';

// ── Fixture loading ──────────────────────────────────────────────────────────

const PKG_DIR = basename(process.cwd()) === 'exojs-tiled' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-tiled');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

// ── Mock context factory ─────────────────────────────────────────────────────
//
// loader.load resolves Texture sub-loads (sized to match each fixture atlas so
// the runtime TileSet's atlas-dimension validation passes) and TiledMap
// sub-loads (used by the runtime binding to share the Loader cache).

const TEXTURE_SIZES: Record<string, { w: number; h: number }> = {
  'tiles-a.png': { w: 64, h: 32 },
  'tiles-b.png': { w: 80, h: 20 },
};

function makeContext(fixtures: Record<string, unknown>) {
  const loaderLoad = vi.fn();

  const context: AssetLoaderContext = {
    loader: { load: loaderLoad } as unknown as AssetLoaderContext['loader'],
    identityKey: 'test',
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string): Promise<unknown> => {
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`toTileMap.test: no fixture for "${source}"`);
    }),
  };

  loaderLoad.mockImplementation(async (token: unknown): Promise<unknown> => {
    // Both Texture and TiledMap sub-loads now arrive as `X.of(src)` descriptors
    // (asset form); read the source from the descriptor.
    const asset = token as { kind?: unknown; source?: unknown } | null;
    if (asset?.kind === 'texture') {
      const src = asset.source as string;
      const tex = new Texture();
      const size = TEXTURE_SIZES[src] ?? { w: 256, h: 256 };
      tex.width = size.w;
      tex.height = size.h;
      return tex;
    }
    if (asset?.kind === 'tiledMap') {
      return loadTiledMap(asset.source as string, context);
    }
    throw new Error(`toTileMap.test: unexpected loader.load token: ${String(token)}`);
  });

  return { context, loaderLoad };
}

const richFixtures = {
  'orthogonal-rich.tmj': loadFixture('orthogonal-rich.tmj'),
  'tileset-b.tsj': loadFixture('tileset-b.tsj'),
};

// Expected flip transforms for the 8 Ground cells, in row-major order. The
// fixture encodes all 8 (flipX, flipY, diagonal) combinations on base gid 1.
const EXPECTED_FLIPS: readonly { flipX: boolean; flipY: boolean; diagonal: boolean }[] = [
  { flipX: false, flipY: false, diagonal: false },
  { flipX: true, flipY: false, diagonal: false },
  { flipX: false, flipY: true, diagonal: false },
  { flipX: true, flipY: true, diagonal: false },
  { flipX: false, flipY: false, diagonal: true },
  { flipX: true, flipY: false, diagonal: true },
  { flipX: false, flipY: true, diagonal: true },
  { flipX: true, flipY: true, diagonal: true },
];

// ── Source-model parsing breadth ─────────────────────────────────────────────

describe('TiledMap source model — orthogonal-rich.tmj', () => {
  const { context } = makeContext(richFixtures);

  it('parses two tilesets sorted by firstGid (embedded + external)', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    expect(map.tilesets).toHaveLength(2);
    expect(map.tilesets[0].name).toBe('tiles-a');
    expect(map.tilesets[0].firstGid).toBe(1);
    expect(map.tilesets[1].name).toBe('tiles-b');
    expect(map.tilesets[1].firstGid).toBe(9);
    expect(map.tilesets[1].source).toBe('tileset-b.tsj');
  });

  it('preserves spacing and margin from the external .tsj', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    expect(map.tilesets[1].spacing).toBe(4);
    expect(map.tilesets[1].margin).toBe(2);
  });

  it('parses all four layer types (tile, object, image, group)', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    expect(map.layers).toHaveLength(4);
    expect(map.layers[0]).toBeInstanceOf(TiledTileLayer);
    expect(map.layers[1]).toBeInstanceOf(TiledObjectLayer);
    expect(map.layers[2]).toBeInstanceOf(TiledImageLayer);
    expect(map.layers[3]).toBeInstanceOf(TiledGroupLayer);
  });

  it('preserves layer offsets, opacity, visibility, and properties', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const ground = map.layers[0] as TiledTileLayer;
    expect(ground.offsetX).toBe(8);
    expect(ground.offsetY).toBe(-4);
    expect(ground.opacity).toBe(0.5);
    expect(ground.visible).toBe(true);
    expect(ground.getProperty('role')?.value).toBe('base');
  });

  it('preserves map properties and tile-level properties', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    expect(map.getProperty('mood')?.value).toBe('calm');
    const tileDef = map.tilesets[0].getTile(0);
    expect(tileDef?.properties?.find(p => p.name === 'solid')?.value).toBe(true);
  });

  it('parses object-layer objects including a tile-object gid', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const objects = (map.layers[1] as TiledObjectLayer).objects;
    expect(objects).toHaveLength(3);
    expect(objects[0].name).toBe('hero');
    expect(objects[0].point).toBe(true);
    expect(objects[1].gid).toBe(2);
    expect(objects[2].text?.text).toBe('Hello');
  });

  it('preserves a group layer with a nested tile layer', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const group = map.layers[3] as TiledGroupLayer;
    expect(group.layers).toHaveLength(1);
    expect(group.layers[0]).toBeInstanceOf(TiledTileLayer);
    expect(group.layers[0].name).toBe('DecorTiles');
  });
});

// ── toTileMap conversion ─────────────────────────────────────────────────────

describe('TiledMap.toTileMap() — orthogonal-rich.tmj', () => {
  const { context, loaderLoad } = makeContext(richFixtures);

  it('is synchronous and performs no I/O', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    loaderLoad.mockClear();
    (context.fetchJson as ReturnType<typeof vi.fn>).mockClear();

    const runtime = map.toTileMap();

    expect(runtime).toBeInstanceOf(TileMap);
    expect(runtime).not.toBeInstanceOf(Promise);
    expect(loaderLoad).not.toHaveBeenCalled();
    expect(context.fetchJson).not.toHaveBeenCalled();
  });

  it('runtime.layers contains only tile layers (Spawns → objectLayers, Background → imageLayers, group flattened)', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();
    // Ground + DecorTiles (flattened out of the group); object/image layers are separate.
    expect(runtime.layers.map(l => l.name)).toEqual(['Ground', 'DecorTiles']);
  });

  it('converts both tilesets and transfers spacing/margin', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();
    expect(runtime.tilesets).toHaveLength(2);
    const tsB = runtime.getTileset('tiles-b');
    expect(tsB).toBeInstanceOf(TileSet);
    expect(tsB?.spacing).toBe(4);
    expect(tsB?.margin).toBe(2);
  });

  it('decodes all 8 flip/transform combinations on the Ground layer', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();
    const ground = runtime.getTileLayer('Ground')!;

    for (let i = 0; i < EXPECTED_FLIPS.length; i++) {
      const tile = ground.getTileAt(i % 4, Math.floor(i / 4));
      expect(tile, `cell ${i}`).not.toBeNull();
      expect(tile!.tileset.name).toBe('tiles-a');
      expect(tile!.localTileId).toBe(0);
      expect({ flipX: tile!.transform.flipX, flipY: tile!.transform.flipY, diagonal: tile!.transform.diagonal })
        .toEqual(EXPECTED_FLIPS[i]);
    }
  });

  it('resolves multi-tileset GIDs to the correct runtime tileset', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();
    const decor = runtime.getTileLayer('DecorTiles')!;
    const tile = decor.getTileAt(0, 0);
    expect(tile).not.toBeNull();
    expect(tile!.tileset.name).toBe('tiles-b');
    expect(tile!.localTileId).toBe(0);
  });

  it('carries map/layer/tileset metadata (class, tint, offset, background, renderorder, draworder)', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();

    // Map level.
    expect(runtime.class).toBe('level');
    expect(runtime.backgroundColor).toBe(0x223344);
    expect(runtime.renderOrder).toBe('right-down');

    // Tileset level (class + visual tile offset).
    const tsA = runtime.getTileset('tiles-a')!;
    expect(tsA.class).toBe('terrainSet');
    expect(tsA.offsetX).toBe(2);
    expect(tsA.offsetY).toBe(-3);

    // Tile layer level (class + tint colour parsed to 0xRRGGBB).
    const ground = runtime.getTileLayer('Ground')!;
    expect(ground.class).toBe('terrainLayer');
    expect(ground.tintColor).toBe(0xff8800);

    // Object layer draw order.
    const spawns = runtime.getObjectLayer('Spawns')!;
    expect(spawns.drawOrder).toBe('index');
  });

  it('carries per-tile properties and animation frames into the runtime tileset', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = map.toTileMap();
    const tsA = runtime.getTileset('tiles-a')!;

    // Per-tile property carried (previously dropped at conversion).
    expect(tsA.getTileDefinition(0)?.properties?.solid).toBe(true);

    // Per-tile animation carried (previously dropped at conversion).
    const anim = tsA.getTileDefinition(1)?.animation;
    expect(anim).toHaveLength(2);
    expect(anim?.[0]).toEqual({ localTileId: 1, duration: 120 });
    expect(anim?.[1]).toEqual({ localTileId: 2, duration: 120 });

    // Per-tile collision shapes carried from the tile's objectgroup.
    const collision = tsA.getTileDefinition(3)?.collision;
    expect(collision).toHaveLength(1);
    expect(collision?.[0].kind).toBe('rectangle');
    expect(collision?.[0]).toMatchObject({ x: 2, y: 2, width: 12, height: 12 });
  });

  it('is deterministic across repeated calls and does not take texture ownership', async () => {
    const map = await loadTiledMap('orthogonal-rich.tmj', context);
    const first = map.toTileMap();
    const second = map.toTileMap();

    expect(first).not.toBe(second); // distinct instances
    expect(first.layers.map(l => l.name)).toEqual(second.layers.map(l => l.name));

    // Destroying one converted map must not affect the shared textures or a
    // second conversion (textures are Loader-owned).
    first.destroy();
    const third = map.toTileMap();
    expect(third.getTileLayer('Ground')!.getTileAt(0, 0)).not.toBeNull();
  });
});

// ── Direct (runtime binding) vs source (.toTileMap) equivalence ───────────────

describe('runtime binding vs source.toTileMap() equivalence', () => {
  const { context } = makeContext(richFixtures);

  function sampleLayers(map: TileMap): unknown {
    return map.layers.map(layer => ({
      name: layer.name,
      width: layer.width,
      height: layer.height,
      tiles: sampleTiles(layer),
    }));
  }

  function sampleTiles(layer: TileLayer): unknown[] {
    const out: unknown[] = [];
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const t = layer.getTileAt(x, y);
        out.push(t === null ? null : { ts: t.tileset.name, id: t.localTileId, ...t.transform });
      }
    }
    return out;
  }

  it('produces semantically equivalent runtime maps via both load paths', async () => {
    const direct = await tiledRuntimeMapBinding.create().load({ source: 'orthogonal-rich.tmj' }, context);
    const source = await loadTiledMap('orthogonal-rich.tmj', context);
    const converted = source.toTileMap();

    expect(direct).toBeInstanceOf(TileMap);
    expect(sampleLayers(direct)).toEqual(sampleLayers(converted));
    expect(direct.tilesets.map(t => t.name)).toEqual(converted.tilesets.map(t => t.name));
    expect(direct.width).toBe(converted.width);
    expect(direct.height).toBe(converted.height);
  });
});

// ── Unsupported-map rejection (no silent corruption) ─────────────────────────

describe('TiledMap.toTileMap() — rejects maps it cannot convert faithfully', () => {
  const baseLayer = {
    id: 1, name: 'Ground', type: 'tilelayer', visible: true, opacity: 1,
    x: 0, y: 0, width: 2, height: 1, data: [1, 1],
  };
  const baseTileset = {
    firstgid: 1, name: 'tiles', image: 'tiles-a.png', imagewidth: 64, imageheight: 32,
    tilewidth: 16, tileheight: 16, columns: 4, tilecount: 8,
  };

  it('throws TiledFormatError for a non-orthogonal (isometric) map', async () => {
    const { context } = makeContext({
      'iso.tmj': {
        type: 'map', version: '1.10', orientation: 'isometric', width: 2, height: 1,
        tilewidth: 16, tileheight: 16, infinite: false,
        layers: [baseLayer], tilesets: [baseTileset],
      },
    });
    const map = await loadTiledMap('iso.tmj', context);
    expect(() => map.toTileMap()).toThrow(TiledFormatError);
    expect(() => map.toTileMap()).toThrow(/orthogonal/);
  });

  it('throws TiledFormatError for an infinite map', async () => {
    const { context } = makeContext({
      'inf.tmj': {
        type: 'map', version: '1.10', orientation: 'orthogonal', width: 2, height: 1,
        tilewidth: 16, tileheight: 16, infinite: true,
        layers: [{
          id: 1, name: 'Ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0,
          width: 2, height: 1,
          chunks: [{ x: 0, y: 0, width: 2, height: 1, data: [1, 1] }],
        }],
        tilesets: [baseTileset],
      },
    });
    const map = await loadTiledMap('inf.tmj', context);
    expect(() => map.toTileMap()).toThrow(TiledFormatError);
    expect(() => map.toTileMap()).toThrow(/infinite|finite/);
  });
});

describe('TiledMap.toTileMap() — object layers', () => {
  const { context } = makeContext(richFixtures);

  it('converts an objectgroup into a data-only ObjectLayer', async () => {
    const tiled = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = tiled.toTileMap();

    expect(runtime.objectLayers).toHaveLength(1);
    const layer = runtime.getObjectLayer('Spawns');
    expect(layer).toBeDefined();
    expect(layer?.objects).toHaveLength(3);
  });

  it('maps a point object and a gid object to the right kinds with resolved tiles', async () => {
    const runtime = (await loadTiledMap('orthogonal-rich.tmj', context)).toTileMap();
    const layer = runtime.getObjectLayer('Spawns');

    const hero = layer?.getObjectByName('hero');
    expect(hero?.kind).toBe('point');
    expect(hero?.type).toBe('spawn');

    const chest = layer?.getObjectByName('chest');
    expect(chest?.kind).toBe('tile');
    if (chest?.kind === 'tile') {
      expect(chest.tile.tileset).toBeDefined();
      expect(chest.tile.localTileId).toBeGreaterThanOrEqual(0);
    }
  });

  it('query selects objects by class/type', async () => {
    const runtime = (await loadTiledMap('orthogonal-rich.tmj', context)).toTileMap();
    const layer = runtime.getObjectLayer('Spawns');

    expect(layer?.query({ type: 'spawn' })).toHaveLength(1);
    expect(layer?.query({ kind: 'tile' })).toHaveLength(1);
  });

  it('converts a text object to kind "text" with mapped TextStyle fields', async () => {
    const runtime = (await loadTiledMap('orthogonal-rich.tmj', context)).toTileMap();
    const layer = runtime.getObjectLayer('Spawns');

    const sign = layer?.getObjectByName('sign');
    expect(sign?.kind).toBe('text');
    if (sign?.kind === 'text') {
      expect(sign.text.text).toBe('Hello');
      expect(sign.text.color).toBe(0xff0000);
      expect(sign.text.bold).toBe(true);
      expect(sign.text.pixelSize).toBe(12);
      expect(sign.text.wrap).toBe(true);
    }
  });
});

describe('TiledMap.toTileMap() — image layers', () => {
  const { context } = makeContext(richFixtures);

  it('converts an imagelayer into a data-only ImageLayer with texture pre-loaded', async () => {
    const tiled = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = tiled.toTileMap();

    expect(runtime.imageLayers).toHaveLength(1);

    const layer = runtime.getImageLayer('Background');
    expect(layer).toBeDefined();
    expect(layer?.image).toContain('bg.png');
    expect(layer?.opacity).toBe(1);
    expect(layer?.repeatX).toBe(true);
    expect(layer?.repeatY).toBe(false);
    expect(layer?.texture).not.toBeNull();
  });

  it('carries the image layer custom properties through toTileMap()', async () => {
    const tiled = await loadTiledMap('orthogonal-rich.tmj', context);
    const runtime = tiled.toTileMap();

    const layer = runtime.getImageLayer('Background');
    expect(layer?.properties.parallaxLayer).toBe('sky');
  });
});

// ── Parallax forwarding ──────────────────────────────────────────────────────

describe('TiledMap.toTileMap() — parallax forwarding', () => {
  const baseTileset = {
    firstgid: 1, name: 'tiles', image: 'tiles-a.png', imagewidth: 64, imageheight: 32,
    tilewidth: 16, tileheight: 16, columns: 4, tilecount: 8,
  };

  it('forwards parallaxX and parallaxY from Tiled layer data to runtime TileLayer', async () => {
    const { context } = makeContext({
      'parallax.tmj': {
        type: 'map', version: '1.10', orientation: 'orthogonal',
        width: 2, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
        layers: [
          {
            id: 1, name: 'Background', type: 'tilelayer',
            visible: true, opacity: 1, x: 0, y: 0,
            width: 2, height: 1, data: [1, 1],
            parallaxx: 0.5, parallaxy: 0.25,
          },
        ],
        tilesets: [baseTileset],
      },
    });
    const tiled = await loadTiledMap('parallax.tmj', context);
    const runtime = tiled.toTileMap();

    const layer = runtime.getTileLayer('Background')!;
    expect(layer).toBeDefined();
    expect(layer.parallaxX).toBe(0.5);
    expect(layer.parallaxY).toBe(0.25);
  });

  it('defaults parallaxX and parallaxY to 1.0 when absent from Tiled data', async () => {
    const { context } = makeContext({
      'no-parallax.tmj': {
        type: 'map', version: '1.10', orientation: 'orthogonal',
        width: 2, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
        layers: [
          {
            id: 1, name: 'Ground', type: 'tilelayer',
            visible: true, opacity: 1, x: 0, y: 0,
            width: 2, height: 1, data: [1, 1],
          },
        ],
        tilesets: [baseTileset],
      },
    });
    const tiled = await loadTiledMap('no-parallax.tmj', context);
    const runtime = tiled.toTileMap();

    const layer = runtime.getTileLayer('Ground')!;
    expect(layer).toBeDefined();
    expect(layer.parallaxX).toBe(1);
    expect(layer.parallaxY).toBe(1);
  });
});
