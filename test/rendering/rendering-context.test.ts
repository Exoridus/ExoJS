import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { RenderingContext } from '@/rendering/RenderingContext';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { Sprite } from '@/rendering/sprite/Sprite';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import type { View } from '@/rendering/View';

const createTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

const createMockBackend = () => {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();
  const drawEvents: Drawable[] = [];
  const clearCalls: Color[] = [];
  let flushCallCount = 0;

  const clear = vi.fn(function (this: RenderBackend, color?: Color) {
    if (color) {
      clearCalls.push(color);
    }

    return this;
  });

  const draw = vi.fn(function (this: RenderBackend, drawable: Drawable) {
    drawEvents.push(drawable);

    return this;
  });

  const setRenderTargetSpy = vi.fn(function (this: RenderBackend, target: RenderTarget | null) {
    currentTarget = target ?? root;

    return this;
  });

  const setViewSpy = vi.fn(function (this: RenderBackend, view: View | null) {
    currentTarget.setView(view);

    return this;
  });

  const backend: RenderBackend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return this.renderTarget.view;
    },
    async initialize() {
      return this;
    },
    clear,
    resize(width: number, height: number) {
      root.resize(width, height);

      return this;
    },
    setView: setViewSpy,
    setRenderTarget: setRenderTargetSpy,
    pushScissorRect() {
      return this;
    },
    popScissorRect() {
      return this;
    },
    pushStencilClip() {
      return this;
    },
    popStencilClip() {
      return this;
    },
    composeWithAlphaMask() {
      return this;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture() {
      return this;
    },
    draw,
    resetStats() {
      resetRenderStats(stats);

      return this;
    },
    execute(pass) {
      pass.execute(this);

      return this;
    },
    flush() {
      flushCallCount++;

      return this;
    },
    destroy() {
      root.destroy();
    },
  };

  return {
    backend,
    root,
    draw,
    drawEvents,
    clear,
    clearCalls,
    setRenderTargetSpy,
    setViewSpy,
    getFlushCallCount: () => flushCallCount,
  };
};

describe('RenderingContext', () => {
  test('render delegates to playRenderTree and draws a single sprite', () => {
    const { backend, drawEvents, draw } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    context.render(sprite);

    expect(draw).toHaveBeenCalled();
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBe(sprite);
  });

  test('render draws container children', () => {
    const { backend, drawEvents } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();
    const red = new Sprite(createTexture());
    const green = new Sprite(createTexture());

    container.addChild(red, green);
    context.render(container);

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(red);
    expect(drawEvents[1]).toBe(green);
  });

  test('view exposes backend view', () => {
    const { backend, root } = createMockBackend();
    const context = new RenderingContext(backend);

    expect(context.view).toBe(root.view);
  });

  test('stats exposes backend stats', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);

    expect(context.stats).toBe(backend.stats);
  });

  test('backend getter returns the injected backend', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);

    expect(context.backend).toBe(backend);
  });

  test('renderTo renders a single drawable into a RenderTexture', () => {
    const { backend, drawEvents, clear, clearCalls, root, setRenderTargetSpy, setViewSpy } = createMockBackend();
    const context = new RenderingContext(backend);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    const result = context.renderTo(sprite, { width: 128, height: 128, clearColor: Color.transparentBlack });

    expect(result).toBeInstanceOf(RenderTexture);
    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clearCalls[0].equals(Color.transparentBlack)).toBe(true);
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBe(sprite);

    const targetCalls = setRenderTargetSpy.mock.calls.map((c: unknown[]) => c[0]);

    expect(targetCalls[targetCalls.length - 1]).toBe(root);

    const viewCalls = setViewSpy.mock.calls.map((c: unknown[]) => c[0]);

    expect(viewCalls[viewCalls.length - 1]).toBe(root.view);

    result.destroy();
  });

  test('renderTo renders multiple children of a container', () => {
    const { backend, drawEvents, root } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();
    const red = new Sprite(createTexture());
    const green = new Sprite(createTexture());

    container.addChild(red, green);

    const result = context.renderTo(container, { width: 128, height: 128 });

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(red);
    expect(drawEvents[1]).toBe(green);
    expect(backend.renderTarget).toBe(root);
    expect(backend.view).toBe(root.view);

    result.destroy();
  });

  test('renderTo clears with default transparent black when no clearColor', () => {
    const { backend, clearCalls } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.renderTo(sprite, { width: 64, height: 64 });

    expect(clearCalls).toHaveLength(0);

    result.destroy();
  });

  test('renderTo clears with custom clearColor', () => {
    const { backend, clearCalls } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.renderTo(sprite, { width: 64, height: 64, clearColor: Color.red });

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0].equals(Color.red)).toBe(true);

    result.destroy();
  });

  test('renderTo restores previous render target on exception', () => {
    const { backend, root, draw } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());
    const previousTarget = backend.renderTarget;
    const previousView = backend.view;

    draw.mockImplementation(() => {
      throw new Error('forced render error');
    });

    expect(() => {
      context.renderTo(sprite, { width: 64, height: 64 });
    }).toThrow('forced render error');

    expect(backend.renderTarget).toBe(previousTarget);
    expect(backend.view).toBe(previousView);
  });

  test('renderTo does not mutate the RenderTexture dimensions', () => {
    const { backend } = createMockBackend();
    const context = new RenderingContext(backend);
    const sprite = new Sprite(createTexture());

    const result = context.renderTo(sprite, { width: 64, height: 64 });

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);

    result.destroy();
  });

  test('renderTo restores state even when no drawables are rendered', () => {
    const { backend, root } = createMockBackend();
    const context = new RenderingContext(backend);
    const container = new Container();

    const result = context.renderTo(container, { width: 32, height: 32 });

    expect(backend.renderTarget).toBe(root);
    expect(backend.view).toBe(root.view);

    result.destroy();
  });
});
