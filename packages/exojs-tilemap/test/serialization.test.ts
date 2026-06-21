import type { Loadable, Loader } from '@codexo/exojs';
import { Prefab, registerSerializer } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { TileMap } from '../src/TileMap';
import { tilemapExtension } from '../src/tilemapExtension';
import { TileMapNode } from '../src/TileMapNode';
import { tileMapNodeSerializer } from '../src/tilemapSerializers';

/** Minimal Loader stand-in implementing the two methods the serialization context uses. */
function fakeLoader(map: TileMap, source: string): Loader {
  return {
    keyFor: (resource: object) => (resource === map ? { type: TileMap, source } : null),
    peek: (type: Loadable, alias: string) => (type === TileMap && alias === source ? map : null),
  } as unknown as Loader;
}

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
    node.pixelSnapMode = 'position';

    const data = Prefab.from(node, loader).toJSON();

    expect(data.type).toBe('TileMapNode');
    expect(data.map).toBe('world.tmj');
    expect(data.pixelSnapMode).toBe('position');

    const restored = Prefab.fromJSON(data).instantiate(loader) as TileMapNode;

    expect(restored).toBeInstanceOf(TileMapNode);
    expect(restored.map).toBe(map);
    expect(restored.pixelSnapMode).toBe('position');

    node.destroy();
    restored.destroy();
    map.destroy();
  });

  it('throws when the referenced map is not pre-loaded', () => {
    const emptyLoader = { keyFor: () => null, peek: () => null } as unknown as Loader;

    expect(() => Prefab.fromJSON({ type: 'TileMapNode', map: 'missing.tmj' }).instantiate(emptyLoader)).toThrow(/pre-loaded/);
  });
});
