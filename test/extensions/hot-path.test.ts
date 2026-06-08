import { describe, expect, it, vi } from 'vitest';

import { ExtensionRegistry } from '@/extensions/ExtensionRegistry';
import { materializeRendererBindings } from '@/extensions/materialize';
import type { RendererBinding } from '@/extensions/Extension';
import { Drawable } from '@/rendering/Drawable';
import type { DrawableConstructor, Renderer } from '@/rendering/Renderer';
import { RendererRegistry } from '@/rendering/RendererRegistry';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { Loader } from '@/resources/Loader';
import { resetExtensionRegistryForTesting } from '@/extensions/testing';
import { beforeEach } from 'vitest';

class TestDrawable extends Drawable {}

function createMinimalRenderer(): Renderer<RenderBackend> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    render: vi.fn(),
    flush: vi.fn(),
  } as unknown as Renderer<RenderBackend>;
}

function createStubBackend(): RenderBackend {
  const registry = new RendererRegistry<RenderBackend>();
  return {
    backendType: RenderBackendType.WebGl2,
    rendererRegistry: registry,
    view: null as never,
    renderTarget: null as never,
    stats: null as never,
    initialize: vi.fn(),
    resetStats: vi.fn(),
    clear: vi.fn(),
    resize: vi.fn(),
    setView: vi.fn(),
    setRenderTarget: vi.fn(),
    pushScissorRect: vi.fn(),
    popScissorRect: vi.fn(),
    pushStencilClip: vi.fn(),
    popStencilClip: vi.fn(),
    acquireRenderTexture: vi.fn(),
    releaseRenderTexture: vi.fn(),
    composeWithAlphaMask: vi.fn(),
    draw: vi.fn(),
    execute: vi.fn(),
    flush: vi.fn(),
    destroy: vi.fn(),
  } as unknown as RenderBackend;
}

describe('hot-path spy tests', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('resolve cache: no prototype walk after first draw (spy Object.getPrototypeOf)', () => {
    const backend = createStubBackend();
    const renderer = createMinimalRenderer();
    const binding: RendererBinding = { targets: [TestDrawable as DrawableConstructor], create: () => renderer };
    materializeRendererBindings(backend, [binding]);

    // First resolution warms the cache
    const drawable = new TestDrawable();
    backend.rendererRegistry.resolve(drawable);

    // Spy AFTER warm-up
    const getProto = vi.spyOn(Object, 'getPrototypeOf');
    for (let i = 0; i < 10; i++) {
      backend.rendererRegistry.resolve(drawable);
    }
    expect(getProto).not.toHaveBeenCalled();
    getProto.mockRestore();
  });

  it('ExtensionRegistry.*  are untouched during frame render', () => {
    const backend = createStubBackend();
    const renderer = createMinimalRenderer();
    const binding: RendererBinding = { targets: [TestDrawable as DrawableConstructor], create: () => renderer };
    materializeRendererBindings(backend, [binding]);

    const listSpy = vi.spyOn(ExtensionRegistry, 'list');
    const getSpy = vi.spyOn(ExtensionRegistry, 'get');
    const hasSpy = vi.spyOn(ExtensionRegistry, 'has');

    const drawable = new TestDrawable();
    for (let i = 0; i < 100; i++) {
      backend.rendererRegistry.resolve(drawable);
    }

    expect(listSpy).toHaveBeenCalledTimes(0);
    expect(getSpy).toHaveBeenCalledTimes(0);
    expect(hasSpy).toHaveBeenCalledTimes(0);

    listSpy.mockRestore();
    getSpy.mockRestore();
    hasSpy.mockRestore();
  });

  it('ExtensionRegistry.* are untouched during loader.load()', async () => {
    const loader = new Loader(); // ignore-unused: needed for the test
    const listSpy = vi.spyOn(ExtensionRegistry, 'list');
    const getSpy = vi.spyOn(ExtensionRegistry, 'get');
    const hasSpy = vi.spyOn(ExtensionRegistry, 'has');

    // Attempt load (will fail due to no real network — that's fine)
    await loader.load(class FakeAsset {} as never, 'fake.png').catch(() => {
      // expected failure
    });

    expect(listSpy).toHaveBeenCalledTimes(0);
    expect(getSpy).toHaveBeenCalledTimes(0);
    expect(hasSpy).toHaveBeenCalledTimes(0);

    listSpy.mockRestore();
    getSpy.mockRestore();
    hasSpy.mockRestore();
    loader.destroy();
  });

  it('global snapshot returns identical object for N applications (shared immutable snapshot)', async () => {
    const { buildSnapshot } = await import('@/extensions/snapshot');
    const snapshots: object[] = [];
    for (let i = 0; i < 5; i++) {
      snapshots.push(buildSnapshot([]));
    }
    // All empty snapshots should be the EMPTY_SNAPSHOT singleton
    const first = snapshots[0];
    for (const snap of snapshots.slice(1)) {
      expect(snap).toBe(first);
    }
  });
});
