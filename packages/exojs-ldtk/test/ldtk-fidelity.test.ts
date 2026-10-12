import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { AssetFactoryContext, Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { LdtkData, LdtkEntityInstance } from '../src/LdtkData';
import { buildLdtkTileDefinitions, loadLdtkMap } from '../src/loadLdtkMap';
import { validateLdtkData } from '../src/validate';

const PKG_DIR = basename(process.cwd()) === 'exojs-ldtk' ? process.cwd() : join(process.cwd(), 'packages', 'exojs-ldtk');
const fixture = (): LdtkData => JSON.parse(readFileSync(join(PKG_DIR, 'test', 'fixtures', 'fidelity.ldtk'), 'utf-8')) as LdtkData;

/** A dependency scope answering the document request with `document` and every image with a blank atlas. */
const contextFor = (document: unknown): AssetFactoryContext =>
  ({
    source: 'fidelity.ldtk',
    resourceKey: 'test|fidelity.ldtk',
    sourceKey: 'url:fidelity.ldtk',
    locator: 'url:fidelity.ldtk',
    dependencies: {
      load: vi.fn(async (asset: unknown): Promise<unknown> =>
        (asset as { _config: { type: string } })._config.type === 'json'
          ? document
          : ({ width: 64, height: 32, uid: 0, destroy: () => {}, destroyed: false } as unknown as Texture),
      ),
    },
  }) as unknown as AssetFactoryContext;

const loadFidelity = async (document: unknown = fixture()) => loadLdtkMap(contextFor(document));

describe('LDtk authored-data fidelity', () => {
  it('gives each level its background colour: its own, else the project default', async () => {
    const map = await loadFidelity();

    expect(map.levels.map(level => level.backgroundColor)).toEqual([0x696a79, 0x102030]);
  });

  it('falls back to the project default when a level carries no resolved colour', async () => {
    const data = fixture();
    const levels = data.levels.map(level => ({ ...level, __bgColor: undefined }));
    const map = await loadFidelity({ ...data, levels });

    expect(map.levels.map(level => level.backgroundColor)).toEqual([0x696a79, 0x102030]);
  });

  it("exposes an entity's definition tags as the reserved ldtkTags property", async () => {
    const [slime, sign] = (await loadFidelity()).levels[0]!.objectLayers[0]!.objects;

    // The reserved key wins over the authored field of the same name, like the level keys.
    expect(slime!.properties).toEqual({ hp: 2, ldtkTags: ['Enemy', 'Small'] });
    expect(sign!.properties).toEqual({});
  });

  it('keeps the editor tile, world position and colour of an entity on its typed source', async () => {
    const slime = (await loadFidelity()).levels[0]!.objectLayers[0]!.objects[0]!;
    const entity = slime.source as LdtkEntityInstance;

    expect(entity.__tile).toEqual({ tilesetUid: 1, x: 16, y: 0, w: 16, h: 16 });
    expect([entity.__worldX, entity.__worldY, entity.__smartColor]).toEqual([24, 32, '#BE4A2F']);
    // The object itself is the bounding box: the pivot (0.5, 1) is undone.
    expect([slime.x, slime.y]).toEqual([16, 16]);
  });

  it("carries the tileset's custom data and enum tags onto its tiles", async () => {
    const tileset = (await loadFidelity()).levels[0]!.tilesets[0]!;

    expect(tileset.getTileDefinition(0)?.properties).toEqual({ ldtkCustomData: 'grass' });
    expect(tileset.getTileDefinition(1)?.properties).toEqual({ ldtkEnumTags: ['Solid'] });
    expect(tileset.getTileDefinition(2)?.properties).toEqual({ ldtkEnumTags: ['Water'] });
    expect(tileset.getTileDefinition(5)?.properties).toEqual({ ldtkCustomData: '{"hp":3}', ldtkEnumTags: ['Solid'] });
    expect(tileset.getTileDefinition(3)).toBeUndefined();
  });

  it('skips tile metadata for ids outside the atlas', () => {
    const definitions = buildLdtkTileDefinitions(fixture().defs.tilesets[0]!, 8);

    expect(definitions.map(definition => definition.localTileId).sort((a, b) => a - b)).toEqual([0, 1, 2, 5]);
  });

  it('rejects malformed tile metadata and entity tags', () => {
    const data = fixture();
    const [tileset] = data.defs.tilesets;
    const badCustomData = { ...data, defs: { ...data.defs, tilesets: [{ ...tileset!, customData: [{ tileId: -1, data: 'x' }] }] } };

    expect(() => validateLdtkData(badCustomData, 'bad.ldtk')).toThrow(/customData/);

    const level = data.levels[0]!;
    const layer = level.layerInstances![0]!;
    const entity = { ...layer.entityInstances![0]!, __tags: [3] };
    const badTags = { ...data, levels: [{ ...level, layerInstances: [{ ...layer, entityInstances: [entity] }] }] };

    expect(() => validateLdtkData(badTags, 'bad.ldtk')).toThrow(/__tags/);
  });
});
