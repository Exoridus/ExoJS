import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';

class BaseDrawable extends Drawable {
  public override render(_backend: RenderBackend): this {
    return this;
  }
}

class DerivedDrawable extends BaseDrawable {}

const createRuntime = (): RenderBackend => {
  const renderTarget = new RenderTarget(100, 100, true);
  const stats = createRenderStats();
  const runtime: RenderBackend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    clear() {
      return this;
    },
    resize(width: number, height: number) {
      renderTarget.resize(width, height);

      return this;
    },
    setView(view) {
      renderTarget.setView(view);

      return this;
    },
    setRenderTarget() {
      return this;
    },
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture(texture: RenderTexture) {
      texture.destroy();

      return this;
    },
    draw() {
      return this;
    },
    drawInstanced() {
      return this;
    },
    resetStats() {
      resetRenderStats(stats);

      return this;
    },
    execute() {
      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      renderTarget.destroy();
    },
  };

  return runtime;
};

const createRenderer = (): Renderer<RenderBackend, BaseDrawable> => ({
  backendType: RenderBackendType.WebGl2,
  connect: vi.fn(),
  disconnect: vi.fn(),
  render: vi.fn(),
  flush: vi.fn(),
});

describe('RendererRegistry', () => {
  test('rejects duplicate renderer registration for the same drawable type', () => {
    const registry = new RendererRegistry<RenderBackend>();

    registry.registerRenderer(BaseDrawable, createRenderer());

    expect(() => {
      registry.registerRenderer(BaseDrawable, createRenderer());
    }).toThrow('A renderer is already registered for BaseDrawable.');
  });

  test('throws a clear error when no renderer is registered', () => {
    const registry = new RendererRegistry<RenderBackend>();

    expect(() => {
      registry.resolve(new BaseDrawable());
    }).toThrow('No renderer registered for BaseDrawable.');
  });

  test('resolves the nearest registered prototype renderer', () => {
    const registry = new RendererRegistry<RenderBackend>();
    const renderer = createRenderer();

    registry.registerRenderer(BaseDrawable, renderer);

    expect(registry.resolve(new DerivedDrawable())).toBe(renderer);
  });

  test('connects newly registered renderers immediately when already connected', () => {
    const registry = new RendererRegistry<RenderBackend>();
    const runtime = createRuntime();
    const renderer = createRenderer();

    registry.connect(runtime);
    registry.registerRenderer(BaseDrawable, renderer);

    expect(renderer.connect).toHaveBeenCalledWith(runtime);
  });
});
