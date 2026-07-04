import { ExtensionRegistry } from '@codexo/exojs/extensions';
import type { RenderBackend } from '@codexo/exojs/renderer-sdk';
import { RenderBackendType } from '@codexo/exojs/renderer-sdk';
import { beforeEach,describe, expect, it } from 'vitest';

import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { TileChunkNode } from '../src/TileChunkNode';
import { tilemapExtension } from '../src/tilemapExtension';
import { WebGl2TileChunkRenderer } from '../src/webgl2/WebGl2TileChunkRenderer';
import { WebGpuTileChunkRenderer } from '../src/webgpu/WebGpuTileChunkRenderer';

function fakeBackend(backendType: RenderBackendType): RenderBackend {
  return { backendType } as unknown as RenderBackend;
}

describe('@codexo/exojs-tilemap root', () => {
  it('tilemapExtension has correct id', () => {
    expect(tilemapExtension.id).toBe('@codexo/exojs-tilemap');
  });

  it('tilemapExtension has no asset bindings (renderer-only extension)', () => {
    expect(tilemapExtension.assets).toBeUndefined();
  });

  it('tilemapExtension exposes exactly one tile chunk renderer binding', () => {
    expect(tilemapExtension.renderers).toBeDefined();
    expect(tilemapExtension.renderers).toHaveLength(1);
    expect(tilemapExtension.renderers![0].targets).toContain(TileChunkNode);
  });

  it('tilemapExtension has no dependencies', () => {
    expect(tilemapExtension.dependencies).toBeUndefined();
  });

  it('root import does NOT register in ExtensionRegistry', () => {
    const registry = ExtensionRegistry.list();
    expect(registry.some(e => e.id === '@codexo/exojs-tilemap')).toBe(false);
  });

  it('the renderer binding creates the matching backend-specific renderer', () => {
    const create = tilemapExtension.renderers![0]!.create;

    expect(create(fakeBackend(RenderBackendType.WebGl2))).toBeInstanceOf(WebGl2TileChunkRenderer);
    expect(create(fakeBackend(RenderBackendType.WebGpu))).toBeInstanceOf(WebGpuTileChunkRenderer);
  });

  it('the renderer binding throws for an unsupported backend type', () => {
    const create = tilemapExtension.renderers![0]!.create;

    expect(() => create(fakeBackend('unsupported' as RenderBackendType))).toThrow(/Unsupported render backend/);
  });
});

describe('@codexo/exojs-tilemap/register', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('register entry registers tilemapExtension', async () => {
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-tilemap')).toBe(true);
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
