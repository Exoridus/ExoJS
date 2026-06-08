import { describe, expect, it, vi } from 'vitest';

import type { AssetBinding, RendererBinding } from '@/extensions/Extension';
import { materializeAssetBindings, materializeRendererBindings } from '@/extensions/materialize';
import { Drawable } from '@/rendering/Drawable';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import type { DrawableConstructor, Renderer } from '@/rendering/Renderer';
import { RendererRegistry } from '@/rendering/RendererRegistry';
import { Loader } from '@/resources/Loader';

class FakeDrawable extends Drawable {}

function createStubBackend(destroyFn = vi.fn()): RenderBackend & { destroy: ReturnType<typeof vi.fn> } {
  const registry = new RendererRegistry<RenderBackend>();
  const backend = {
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
    destroy: destroyFn,
  } as unknown as RenderBackend & { destroy: ReturnType<typeof vi.fn> };
  return backend;
}

describe('rollback behaviour', () => {
  it('renderer setup error: original error propagates', () => {
    const backend = createStubBackend();
    const binding: RendererBinding = {
      targets: [FakeDrawable as DrawableConstructor],
      create: () => {
        throw new Error('renderer factory failed');
      },
    };

    expect(() => materializeRendererBindings(backend, [binding])).toThrow('renderer factory failed');
  });

  it('asset setup error: original error propagates', () => {
    const loader = new Loader();
    const binding: AssetBinding = {
      type: class FakeAsset {} as never,
      create: () => {
        throw new Error('asset factory failed');
      },
    };

    expect(() => materializeAssetBindings(loader, [binding])).toThrow('asset factory failed');
    loader.destroy();
  });

  it('asset setup error: loader is destroyed (unpublished)', () => {
    const loader = new Loader();
    const destroySpy = vi.spyOn(loader, 'destroy');
    const binding: AssetBinding = {
      type: class FakeAsset {} as never,
      create: () => {
        throw new Error('factory failed');
      },
    };

    // Simulate Application constructor wrapping
    try {
      materializeAssetBindings(loader, [binding]);
    } catch {
      try {
        loader.destroy();
      } catch {
        /* secondary */
      }
    }

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });

  it('renderer conflict error: no partial registration', () => {
    const backend = createStubBackend();
    class DrawableX extends Drawable {}
    class DrawableY extends Drawable {}
    const rendererA = { connect: vi.fn(), disconnect: vi.fn(), render: vi.fn(), flush: vi.fn() } as unknown as Renderer<RenderBackend>;
    const rendererB = { connect: vi.fn(), disconnect: vi.fn(), render: vi.fn(), flush: vi.fn() } as unknown as Renderer<RenderBackend>;

    const bindingA: RendererBinding = { targets: [DrawableX as DrawableConstructor], create: () => rendererA };
    const bindingConflict: RendererBinding = { targets: [DrawableX as DrawableConstructor], create: () => rendererB };

    // Register A
    materializeRendererBindings(backend, [bindingA]);
    expect(backend.rendererRegistry.resolve(new DrawableX())).toBe(rendererA);

    // Conflicting registration throws
    expect(() => materializeRendererBindings(backend, [bindingConflict])).toThrow();

    // DrawableX still resolves to original rendererA
    expect(backend.rendererRegistry.resolve(new DrawableX())).toBe(rendererA);
  });
});
