import type { Loadable, Loader } from '@codexo/exojs';
import { PixelSnapMode, Prefab, registerSerializer, SERIALIZATION_VERSION, type SerializedNode } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TileMap } from '../src/TileMap';
import { tilemapExtension } from '../src/tilemapExtension';
import { TileMapNode } from '../src/TileMapNode';
import { tileMapNodeSerializer } from '../src/tilemapSerializers';

/** Minimal Loader stand-in implementing the two methods the serialization context uses. */
const fakeLoader = (map: TileMap, source: string): Loader => {
  return {
    keyFor: (resource: object) => (resource === map ? { type: TileMap, source } : null),
    _peekResource: (type: Loadable, source_: string) => (type === TileMap && source_ === source ? map : null),
  } as unknown as Loader;
};

/** Wrap a hand-written node descriptor in the versioned document frame `fromJSON` expects. */
const prefabDocument = (root: SerializedNode) => {
  return { version: SERIALIZATION_VERSION, root };
};

// Register the serializer into the default registry, exactly as the extension's
// `serializers` binding does at Application construction.
registerSerializer('TileMapNode', TileMapNode, tileMapNodeSerializer);

describe('tilemap serialization', () => {
  it('carries the TileMapNode serializer on the extension descriptor', () => {
    const typeNames = (tilemapExtension.serializers ?? []).map(binding => binding.typeName);

    expect(typeNames).toContain('TileMapNode');
  });

  it('round-trips a TileMapNode (map reference + pixelSnapMode) via Prefab', () => {
    const map = new TileMap({ name: 'world', width: 4, height: 4, tileWidth: 32, tileHeight: 32 });
    const loader = fakeLoader(map, 'world.tmj');
    const node = new TileMapNode(map);
    node.pixelSnapMode = PixelSnapMode.Position;

    const data = Prefab.from(node, loader).toJSON();

    expect(data.version).toBe(SERIALIZATION_VERSION);
    expect(data.root.type).toBe('TileMapNode');
    expect(data.root.map).toBe('world.tmj');
    expect(data.root.pixelSnapMode).toBe('position');

    const restored = Prefab.fromJSON(data).instantiate(loader) as TileMapNode;

    expect(restored).toBeInstanceOf(TileMapNode);
    expect(restored.map).toBe(map);
    expect(restored.pixelSnapMode).toBe(PixelSnapMode.Position);

    node.destroy();
    restored.destroy();
    map.destroy();
  });

  it('throws when the referenced map is not pre-loaded', () => {
    const emptyLoader = { keyFor: () => null, _peekResource: () => null } as unknown as Loader;

    expect(() => Prefab.fromJSON(prefabDocument({ type: 'TileMapNode', map: 'missing.tmj' })).instantiate(emptyLoader)).toThrow(/pre-loaded/);
  });

  it('throws when no map field is present at all (procedural map, never given a source key)', () => {
    const emptyLoader = { keyFor: () => null, _peekResource: () => null } as unknown as Loader;

    expect(() => Prefab.fromJSON(prefabDocument({ type: 'TileMapNode' })).instantiate(emptyLoader)).toThrow(/pre-loaded/);
  });

  it('omits the map/pixelSnapMode keys entirely for a procedural map with default pixelSnapMode', () => {
    const map = new TileMap({ name: 'procedural', width: 4, height: 4, tileWidth: 32, tileHeight: 32 });
    const node = new TileMapNode(map); // pixelSnapMode stays PixelSnapMode.None
    const loaderWithoutSourceKey = { keyFor: () => null, _peekResource: () => null } as unknown as Loader;

    const data = Prefab.from(node, loaderWithoutSourceKey).toJSON();

    expect(data.root.map).toBeUndefined();
    expect(data.root.pixelSnapMode).toBeUndefined();

    node.destroy();
    map.destroy();
  });

  it('read() leaves pixelSnapMode at its default when the field is absent from the data', () => {
    const map = new TileMap({ name: 'world', width: 4, height: 4, tileWidth: 32, tileHeight: 32 });
    const loader = fakeLoader(map, 'world.tmj');

    const restored = Prefab.fromJSON(prefabDocument({ type: 'TileMapNode', map: 'world.tmj' })).instantiate(loader) as TileMapNode;

    expect(restored.pixelSnapMode).toBe(PixelSnapMode.None);

    restored.destroy();
    map.destroy();
  });
});
