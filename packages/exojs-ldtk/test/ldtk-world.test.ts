import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { AssetLoaderContext, Destroyable, LoaderScope, Texture } from '@codexo/exojs';
import { MapLevelSide, mapObjectDescriptors, MapObjectSpawner, TileMap } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import type { LdtkData } from '../src/LdtkData';
import { ldtkToMapWorld } from '../src/ldtkToMapWorld';
import { ldtkToTileMap } from '../src/ldtkToTileMap';
import { loadLdtkProject } from '../src/loadLdtkProject';
import { LdtkFormatError } from '../src/validate';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PKG_DIR =
  basename(process.cwd()) === 'exojs-ldtk' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-ldtk');
const FIXTURES_DIR = join(PKG_DIR, 'test', 'fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
}

function fakeTexture(): Texture {
  return { width: 4096, height: 4096, uid: 0, label: 'test', destroy: () => {}, destroyed: false } as unknown as Texture;
}

/** A loader scope that records what it claims and when it is released. */
interface FakeScope extends LoaderScope {
  readonly claims: string[];
  readonly children: FakeScope[];
  readonly released: boolean;
}

function fakeScope(name: string, claims: string[], fixtures: Record<string, unknown>): FakeScope {
  const children: FakeScope[] = [];
  let released = false;

  const scope = {
    name,
    claims,
    children,
    get released() {
      return released;
    },
    async load(asset: { source?: string } | string) {
      const source = typeof asset === 'string' ? asset : (asset.source ?? '');
      claims.push(source);
      if (source.endsWith('.png')) return fakeTexture();
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`ldtk-world.test: no fixture registered for "${source}"`);
    },
    createScope(options?: { name?: string }) {
      const child = fakeScope(options?.name ?? '', claims, fixtures);
      children.push(child);
      return child;
    },
    destroy() {
      released = true;
      for (const child of children) child.destroy();
    },
  };

  return scope as unknown as FakeScope;
}

function makeContext(claims: string[], fixtures: Record<string, unknown>): AssetLoaderContext {
  return {
    loader: {} as AssetLoaderContext['loader'],
    scope: fakeScope('asset', claims, fixtures),
    identityKey: 'test',
    resolveUrl: (source: string) => source,
    fetchText: vi.fn(),
    fetchArrayBuffer: vi.fn(),
    fetchJson: vi.fn(async (source: string) => {
      claims.push(source);
      if (Object.hasOwn(fixtures, source)) return fixtures[source];
      throw new Error(`ldtk-world.test: no fixture registered for "${source}"`);
    }) as unknown as AssetLoaderContext['fetchJson'],
  };
}

const STREAMING_FIXTURES: Record<string, unknown> = {
  'streaming.ldtk': loadFixture('streaming.ldtk'),
  'levels/Forest.ldtkl': loadFixture('Forest.ldtkl'),
  'levels/Cave.ldtkl': loadFixture('Cave.ldtkl'),
};

class Thing implements Destroyable {

  public destroyed = false;

  public constructor(public readonly id: string) {}

  public destroy(): void {
    this.destroyed = true;
  }
}

// ── World model ──────────────────────────────────────────────────────────────

describe('ldtkToMapWorld', () => {
  it('models level identity, bounds and externality', () => {
    const [world] = ldtkToMapWorld(loadFixture('streaming.ldtk') as LdtkData);

    expect(world!.levels.map(level => level.id)).toEqual(['level-forest', 'level-cave', 'level-sky']);
    expect(world!.getLevelByName('Cave')).toMatchObject({
      id: 'level-cave',
      index: 1,
      external: true,
      bounds: { x: 64, y: 0, width: 64, height: 64 },
    });
    expect(world!.getLevel('level-sky')?.external).toBe(false);
    expect(world!.bounds).toEqual({ x: 0, y: -64, width: 128, height: 128 });
  });

  it('maps LDtk direction codes onto sides and keeps unrecognised ones as adjacencies', () => {
    const [world] = ldtkToMapWorld(loadFixture('streaming.ldtk') as LdtkData);

    expect(world!.getLevel('level-forest')?.neighbours).toEqual([
      { id: 'level-cave', side: MapLevelSide.East },
      { id: 'level-sky', side: MapLevelSide.Above },
      { id: 'level-elsewhere', side: MapLevelSide.North },
      { id: 'level-cave', side: MapLevelSide.Unknown },
    ]);
    // The level outside this world is dropped from the resolved neighbour list.
    expect(world!.getNeighbours('level-forest').map(level => level.id)).toEqual([
      'level-cave',
      'level-sky',
      'level-cave',
    ]);
  });

  it('carries level fields and the reserved LDtk keys as level properties', () => {
    const [world] = ldtkToMapWorld(loadFixture('streaming.ldtk') as LdtkData);

    expect(world!.getLevel('level-forest')?.properties).toMatchObject({
      ldtkUid: 1,
      ldtkIid: 'level-forest',
      worldX: 0,
      worldY: 0,
    });
  });

  it('keeps multi-world documents in separate worlds', () => {
    const worlds = ldtkToMapWorld(loadFixture('multi-world.ldtk') as LdtkData);

    expect(worlds.map(world => world.name)).toEqual(['WorldA', 'WorldB']);
    expect(worlds[0]!.levels.map(level => level.name)).toEqual(['A_Level1', 'A_Level2']);
    // Indices keep counting across worlds, matching LdtkMap.levels' flattened order.
    expect(worlds[1]!.levels[0]!.index).toBe(2);
    expect(worlds[1]!.levels[0]!.properties.ldtkWorldIid).toBe('world-b-iid');
  });
});

// ── Object normalisation ─────────────────────────────────────────────────────

describe('LDtk object normalisation', () => {
  it('uses the entity iid as the stable id and the identifier as the kind', () => {
    const map = ldtkToTileMap(loadFixture('world.ldtk') as LdtkData);
    const [descriptor] = [...mapObjectDescriptors(map.levels[0]!)];

    expect(descriptor).toMatchObject({ id: 'cccccccc-0000-0000-0000-000000000001', kind: 'Player', name: 'Player' });
    expect(descriptor?.layer.name).toBe('Entities');
  });

  it('recovers the bounding-box corner from the pivot and exposes size and rotation', async () => {
    const project = await loadLdtkProject('streaming.ldtk', makeContext([], STREAMING_FIXTURES));
    const runtime = project.createRuntime({ scope: fakeScope('root', [], STREAMING_FIXTURES) });
    const forest = await runtime.loadLevel('level-forest');

    const enemy = [...mapObjectDescriptors(forest.map)].find(object => object.kind === 'Enemy');

    // px is the pivot anchor (bottom-centre here), so the corner is px - size * pivot.
    expect(enemy).toMatchObject({ x: 16, y: 8, width: 16, height: 32, rotation: 0 });
    expect(enemy?.properties.hp).toBe(12);
  });

  it('passes the raw entity instance through as the object source', async () => {
    const project = await loadLdtkProject('streaming.ldtk', makeContext([], STREAMING_FIXTURES));
    const runtime = project.createRuntime({ scope: fakeScope('root', [], STREAMING_FIXTURES) });
    const forest = await runtime.loadLevel('level-forest');

    const enemy = [...mapObjectDescriptors(forest.map)].find(object => object.kind === 'Enemy');

    const source = enemy?.object.source as { iid: string; defUid: number; __pivot: readonly number[] };

    expect(source.iid).toBe('entity-enemy-1');
    // Fields the format-neutral model resolves away or never carries stay
    // reachable, which is what makes `source` a usable escape hatch.
    expect(source.defUid).toBe(202);
    expect(source.__pivot).toEqual([0.5, 1]);
  });
});

// ── Lazy external levels ─────────────────────────────────────────────────────

describe('LdtkProject streaming', () => {
  it('loads the document and tilesets but no external level payload', async () => {
    const claims: string[] = [];
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, STREAMING_FIXTURES));

    expect(claims).toEqual(['streaming.ldtk', 'tiles.png']);
    expect(project.tilesets.size).toBe(1);
    expect(project.world.levels).toHaveLength(3);
  });

  it('fetches only the level being loaded, and releases it on unload', async () => {
    const claims: string[] = [];
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, STREAMING_FIXTURES));
    const root = fakeScope('root', claims, STREAMING_FIXTURES);
    const runtime = project.createRuntime({ scope: root });

    claims.length = 0;
    const forest = await runtime.loadLevel('level-forest');

    expect(claims).toEqual(['levels/Forest.ldtkl']);
    expect(forest.map).toBeInstanceOf(TileMap);
    expect(forest.map.name).toBe('Forest');

    const levelScope = forest.scope as unknown as FakeScope;
    runtime.unloadLevel('level-forest');

    expect(levelScope.released).toBe(true);
    // Cave was never touched.
    expect(claims).toEqual(['levels/Forest.ldtkl']);
  });

  it('needs no fetch for an inlined level', async () => {
    const claims: string[] = [];
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, STREAMING_FIXTURES));
    const runtime = project.createRuntime({ scope: fakeScope('root', claims, STREAMING_FIXTURES) });

    claims.length = 0;
    const sky = await runtime.loadLevel('level-sky');

    expect(claims).toEqual([]);
    expect(sky.map.objectLayers[0]?.objects[0]?.sourceId).toBe('entity-cloud');
  });

  it('spawns a loaded level and ties its objects to the level lifetime', async () => {
    const claims: string[] = [];
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, STREAMING_FIXTURES));
    const runtime = project.createRuntime({ scope: fakeScope('root', claims, STREAMING_FIXTURES) });
    const spawner = new MapObjectSpawner<void, Thing>({
      Enemy: descriptor => new Thing(descriptor.id),
      Chest: descriptor => new Thing(descriptor.id),
    });

    const forest = await runtime.loadLevel('level-forest', { spawner, context: undefined });
    const enemy = forest.spawns?.get('entity-enemy-1');

    expect(forest.spawns?.objects.map(thing => thing.id)).toEqual(['entity-enemy-1', 'entity-chest-1']);

    forest.destroy();

    expect(enemy?.destroyed).toBe(true);
  });

  it('reloads an external level after it was unloaded', async () => {
    const claims: string[] = [];
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, STREAMING_FIXTURES));
    const runtime = project.createRuntime({ scope: fakeScope('root', claims, STREAMING_FIXTURES) });

    const first = await runtime.loadLevel('level-forest');
    runtime.unloadLevel('level-forest');

    claims.length = 0;
    const second = await runtime.loadLevel('level-forest');

    expect(claims).toEqual(['levels/Forest.ldtkl']);
    expect(second).not.toBe(first);
    expect(second.map.destroyed).toBe(false);
    // The identity the editor assigned survives the round trip.
    expect(second.map.objectLayers[0]?.objects[0]?.sourceId).toBe('entity-enemy-1');
  });

  it('resolves an external level path against the document, not the working directory', async () => {
    const nested = structuredClone(loadFixture('streaming.ldtk')) as {
      levels: { externalRelPath?: string | null }[];
    };
    nested.levels[0]!.externalRelPath = '../levels/Forest.ldtkl';

    const fixtures = { 'maps/world.ldtk': nested, 'levels/Forest.ldtkl': loadFixture('Forest.ldtkl') };
    const claims: string[] = [];
    const project = await loadLdtkProject('maps/world.ldtk', makeContext(claims, fixtures));
    const runtime = project.createRuntime({ scope: fakeScope('root', claims, fixtures) });

    claims.length = 0;
    const forest = await runtime.loadLevel('level-forest');

    expect(claims).toEqual(['levels/Forest.ldtkl']);
    expect(forest.map.name).toBe('Forest');
  });

  it('fails the level load, not the project load, when an external level is missing', async () => {
    const claims: string[] = [];
    const fixtures = { 'streaming.ldtk': loadFixture('streaming.ldtk') };
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, fixtures));
    const root = fakeScope('root', claims, fixtures);
    const runtime = project.createRuntime({ scope: root });

    await expect(runtime.loadLevel('level-forest')).rejects.toThrow(/levels\/Forest\.ldtkl/);

    expect(runtime.isLoaded('level-forest')).toBe(false);
    expect(runtime.isLoading('level-forest')).toBe(false);
    // Another level of the same project still loads.
    await expect(runtime.loadLevel('level-sky')).resolves.toMatchObject({ id: 'level-sky' });
  });

  it('rejects a malformed external level and leaves nothing behind', async () => {
    const claims: string[] = [];
    const fixtures = {
      'streaming.ldtk': loadFixture('streaming.ldtk'),
      'levels/Forest.ldtkl': { identifier: 'Forest', uid: 1, iid: 'level-forest', worldX: 0 },
    };
    const project = await loadLdtkProject('streaming.ldtk', makeContext(claims, fixtures));
    const root = fakeScope('root', claims, fixtures);
    const runtime = project.createRuntime({ scope: root });

    await expect(runtime.loadLevel('level-forest')).rejects.toThrow(LdtkFormatError);

    expect(runtime.isLoaded('level-forest')).toBe(false);
    const worldScope = root.children[0]!;
    expect(worldScope.children.every(child => child.released)).toBe(true);
  });

  it('rejects a world name the project does not have', async () => {
    const project = await loadLdtkProject('streaming.ldtk', makeContext([], STREAMING_FIXTURES));

    expect(() => project.createRuntime({ scope: fakeScope('root', [], STREAMING_FIXTURES), world: 'nope' })).toThrow(
      /has no world named "nope"/,
    );
  });

  it('streams a named world of a multi-world project', async () => {
    const fixtures = { 'multi-world.ldtk': loadFixture('multi-world.ldtk') };
    const project = await loadLdtkProject('multi-world.ldtk', makeContext([], fixtures));
    const runtime = project.createRuntime({ scope: fakeScope('root', [], fixtures), world: 'WorldB' });

    const level = await runtime.loadLevel('dddddddd-0000-0000-0000-000000000003');

    expect(level.map.name).toBe('B_Level1');
    expect(level.map.properties.ldtkWorldIid).toBe('world-b-iid');
  });
});
