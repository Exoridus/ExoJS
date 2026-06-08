import { describe, expect, it, beforeEach } from 'vitest';
import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { resetExtensionRegistryForTesting } from '../../src/extensions/testing';
import { tiledExtension } from '../src/tiledExtension';
import { TiledMap } from '../src/TiledMap';

describe('@codexo/exojs-tiled root', () => {
  it('tiledExtension has correct id', () => {
    expect(tiledExtension.id).toBe('@codexo/exojs-tiled');
  });

  it('tiledExtension has asset bindings', () => {
    expect(tiledExtension.assets).toBeDefined();
    expect(tiledExtension.assets!.length).toBe(1);
  });

  it('tiledExtension asset binding targets TiledMap', () => {
    const binding = tiledExtension.assets![0];
    expect(binding.type).toBe(TiledMap);
  });

  it('tiledExtension asset binding has typeName tiledMap', () => {
    const binding = tiledExtension.assets![0];
    expect(binding.typeName).toBe('tiledMap');
  });

  it('tiledExtension asset binding has tmj extension', () => {
    const binding = tiledExtension.assets![0];
    expect(binding.extensions).toContain('tmj');
  });

  it('root import does NOT register in ExtensionRegistry', () => {
    const registry = ExtensionRegistry.list();
    expect(registry.some(e => e.id === '@codexo/exojs-tiled')).toBe(false);
  });
});

describe('@codexo/exojs-tiled/register', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('register entry registers tiledExtension', async () => {
    resetExtensionRegistryForTesting();
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-tiled')).toBe(true);
  });
});

describe('TiledMap basic structure', () => {
  it('stores map dimensions', () => {
    const data = {
      width: 4, height: 4, tilewidth: 16, tileheight: 16,
      orientation: 'orthogonal', layers: [], tilesets: [],
    };
    const map = new TiledMap(data, []);
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
    expect(map.tileWidth).toBe(16);
    expect(map.tileHeight).toBe(16);
  });

  it('destroy() does not throw', () => {
    const map = new TiledMap({ width: 1, height: 1, tilewidth: 16, tileheight: 16, layers: [], tilesets: [] }, []);
    expect(() => map.destroy()).not.toThrow();
  });
});

describe('export parity', () => {
  it('root and register have same named exports', async () => {
    const root = await import('../src/index');
    const register = await import('../src/register');
    const rootKeys = Object.keys(root).filter(k => k !== 'default').sort();
    const registerKeys = Object.keys(register).filter(k => k !== 'default').sort();
    expect(rootKeys).toEqual(registerKeys);
  });
});
