import { describe, expect, it, vi } from 'vitest';

import type { RendererBinding } from '#extensions/Extension';
import { materializeRendererBindings } from '#extensions/materialize';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';

class TestDrawable extends Drawable {}

const createMinimalRenderer = (): Renderer<RenderBackend> => {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    render: vi.fn(),
    flush: vi.fn(),
  } as unknown as Renderer<RenderBackend>;
};

const createStubBackend = (): RenderBackend => {
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
};

describe('hot-path spy tests', () => {
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

  it('an empty selection reuses the frozen empty-snapshot singleton', async () => {
    const { buildSnapshot } = await import('#extensions/snapshot');
    const snapshots: object[] = [];
    for (let i = 0; i < 5; i++) {
      snapshots.push(buildSnapshot([]));
    }
    // buildSnapshot([]) must not allocate per call - every app that
    // selects nothing shares one frozen instance.
    const first = snapshots[0];
    for (const snap of snapshots.slice(1)) {
      expect(snap).toBe(first);
    }
  });
});
