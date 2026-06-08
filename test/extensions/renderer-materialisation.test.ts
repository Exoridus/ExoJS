import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBinding } from '@/extensions/Extension';
import { ExtensionRegistry } from '@/extensions/ExtensionRegistry';
import { materializeRendererBindings } from '@/extensions/materialize';
import { resetExtensionRegistryForTesting } from '@/extensions/testing';
import { Drawable } from '@/rendering/Drawable';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import type { Renderer } from '@/rendering/Renderer';
import { RendererRegistry } from '@/rendering/RendererRegistry';

// Minimal stub renderer
function createStubRenderer(): Renderer<RenderBackend> & {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
} {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    render: vi.fn(),
    flush: vi.fn(),
  } as unknown as Renderer<RenderBackend> & {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    flush: ReturnType<typeof vi.fn>;
  };
}

// Stub backend
function createStubBackend(): RenderBackend & { rendererRegistry: RendererRegistry<RenderBackend> } {
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
  } as unknown as RenderBackend & { rendererRegistry: RendererRegistry<RenderBackend> };
}

class CustomDrawableA extends Drawable {}
class CustomDrawableB extends Drawable {}
class CustomDrawableC extends Drawable {}

describe('materializeRendererBindings', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers renderer for one target', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const binding: RendererBinding = {
      targets: [CustomDrawableA],
      create: () => renderer,
    };

    materializeRendererBindings(backend, [binding]);
    expect(backend.rendererRegistry.resolve(new CustomDrawableA())).toBe(renderer);
  });

  it('registers same renderer for multiple targets (multi-target binding)', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const binding: RendererBinding = {
      targets: [CustomDrawableA, CustomDrawableB],
      create: () => renderer,
    };

    materializeRendererBindings(backend, [binding]);
    expect(backend.rendererRegistry.resolve(new CustomDrawableA())).toBe(renderer);
    expect(backend.rendererRegistry.resolve(new CustomDrawableB())).toBe(renderer);
    // Same renderer instance for both
    expect(backend.rendererRegistry.resolve(new CustomDrawableA())).toBe(backend.rendererRegistry.resolve(new CustomDrawableB()));
  });

  it('create() is called exactly once per binding', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const createFn = vi.fn(() => renderer);
    const binding: RendererBinding = { targets: [CustomDrawableA], create: createFn };

    materializeRendererBindings(backend, [binding]);
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledWith(backend);
  });

  it('skips binding when create() returns undefined (unsupported backend)', () => {
    const backend = createStubBackend();
    const binding: RendererBinding = {
      targets: [CustomDrawableA],
      create: () => undefined,
    };

    materializeRendererBindings(backend, [binding]);
    expect(() => backend.rendererRegistry.resolve(new CustomDrawableA())).toThrow();
  });

  it('throws on duplicate target across two bindings (before any mutation)', () => {
    const backend = createStubBackend();
    const rendererA = createStubRenderer();
    const rendererB = createStubRenderer();
    const bindingA: RendererBinding = { targets: [CustomDrawableA], create: () => rendererA };
    const bindingB: RendererBinding = { targets: [CustomDrawableA], create: () => rendererB };

    expect(() => materializeRendererBindings(backend, [bindingA, bindingB])).toThrow('Two bindings target the same drawable type CustomDrawableA');
  });

  it('throws when empty targets array passed to bindRenderer', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    expect(() => backend.rendererRegistry.bindRenderer([], renderer)).toThrow('A RendererBinding must declare at least one target.');
  });

  it('throws on duplicate target within single bindRenderer call', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    expect(() => backend.rendererRegistry.bindRenderer([CustomDrawableA, CustomDrawableA], renderer)).toThrow();
  });

  it('throws when target already occupied before any mutation', () => {
    const backend = createStubBackend();
    const rendererA = createStubRenderer();
    const rendererB = createStubRenderer();
    backend.rendererRegistry.bindRenderer([CustomDrawableA], rendererA);
    expect(() => backend.rendererRegistry.bindRenderer([CustomDrawableA], rendererB)).toThrow('A renderer is already registered for CustomDrawableA');
    // rendererA still registered (no partial mutation)
    expect(backend.rendererRegistry.resolve(new CustomDrawableA())).toBe(rendererA);
  });

  it('rollback: create() throwing destroys unpublished backend', () => {
    const backend = createStubBackend();
    const binding: RendererBinding = {
      targets: [CustomDrawableA],
      create: () => {
        throw new Error('factory failed');
      },
    };

    expect(() => materializeRendererBindings(backend, [binding])).toThrow('factory failed');
  });

  it('destroy on multi-target binding calls disconnect/destroy exactly once', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const binding: RendererBinding = {
      targets: [CustomDrawableA, CustomDrawableB],
      create: () => renderer,
    };

    materializeRendererBindings(backend, [binding]);
    backend.rendererRegistry.destroy();

    expect(renderer.disconnect).toHaveBeenCalledTimes(1);
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it('resolve cache: no prototype walk after first resolution', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const binding: RendererBinding = { targets: [CustomDrawableA], create: () => renderer };
    materializeRendererBindings(backend, [binding]);

    // First resolution — walks prototype chain
    const drawable = new CustomDrawableA();
    backend.rendererRegistry.resolve(drawable);

    // Spy on prototype walk
    const getProto = vi.spyOn(Object, 'getPrototypeOf');
    backend.rendererRegistry.resolve(drawable);
    backend.rendererRegistry.resolve(drawable);

    // After cache warm-up, no prototype walk
    expect(getProto).not.toHaveBeenCalled();
    getProto.mockRestore();
  });

  it('bindRenderer invalidates resolve cache', () => {
    const backend = createStubBackend();
    const rendererA = createStubRenderer();
    const rendererC = createStubRenderer();

    backend.rendererRegistry.bindRenderer([CustomDrawableA], rendererA);
    // Warm up cache
    backend.rendererRegistry.resolve(new CustomDrawableA());

    // Add new binding — should invalidate cache
    backend.rendererRegistry.bindRenderer([CustomDrawableC], rendererC);
    expect(backend.rendererRegistry.resolve(new CustomDrawableC())).toBe(rendererC);
  });

  it('ExtensionRegistry.list/get/has are NOT called during draw', () => {
    const backend = createStubBackend();
    const renderer = createStubRenderer();
    const binding: RendererBinding = { targets: [CustomDrawableA], create: () => renderer };
    materializeRendererBindings(backend, [binding]);

    const listSpy = vi.spyOn(ExtensionRegistry, 'list');
    const getSpy = vi.spyOn(ExtensionRegistry, 'get');
    const hasSpy = vi.spyOn(ExtensionRegistry, 'has');

    backend.rendererRegistry.resolve(new CustomDrawableA());
    backend.rendererRegistry.resolve(new CustomDrawableA());

    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
    expect(hasSpy).not.toHaveBeenCalled();

    listSpy.mockRestore();
    getSpy.mockRestore();
    hasSpy.mockRestore();
  });
});

describe('coreRendererBindings multi-target', () => {
  it('coreRendererBindings provides Text+BitmapText as multi-target binding', async () => {
    const { buildCoreRendererBindings } = await import('@/rendering/coreRendererBindings');
    const bindings = buildCoreRendererBindings({});
    const textBinding = bindings.find(b => b.targets.length > 1);
    expect(textBinding).toBeDefined();
    expect(textBinding!.targets).toHaveLength(2);
  });
});
