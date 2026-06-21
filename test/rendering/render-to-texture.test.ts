import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

class TestDrawable extends Drawable {}

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
    drawInstanced() {
      return this;
    },
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
    drawInstanced() {
      return this;
    },
    drawEvents,
    clear,
    clearCalls,
    setRenderTargetSpy,
    setViewSpy,
    getFlushCallCount: () => flushCallCount,
  };
};

/**
 * Simulate Application.renderTo using a mock backend so we can unit-test
 * the facade logic without requiring a real WebGL context.
 */
const mockRenderTo = (
  backend: RenderBackend,
  target: RenderTexture,
  node: { render: (b: RenderBackend) => void },
  options?: { clearColor?: Color; clear?: boolean; view?: View | null },
): void => {
  const { clearColor, view: userView, clear = true } = options ?? {};

  const prevTarget = backend.renderTarget;
  const prevView = backend.view;

  let tempView: View | null = null;

  try {
    const renderView = userView ?? (tempView = new View(target.width / 2, target.height / 2, target.width, target.height));

    backend.setRenderTarget(target);
    backend.setView(renderView);

    if (clear) {
      backend.clear(clearColor ?? Color.transparentBlack);
    }

    node.render(backend);
    backend.flush();
  } finally {
    backend.setRenderTarget(prevTarget);
    backend.setView(prevView);

    tempView?.destroy();
  }
};

describe('renderTo', () => {
  test('renders a single drawable into a RenderTexture', () => {
    const { backend, drawEvents, clear, clearCalls, getFlushCallCount, root, setRenderTargetSpy, setViewSpy } = createMockBackend();
    const target = new RenderTexture(128, 128);
    const texture = createTexture();
    const sprite = new Sprite(texture);

    mockRenderTo(backend, target, sprite);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(clearCalls[0].equals(Color.transparentBlack)).toBe(true);
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toBe(sprite);
    expect(getFlushCallCount()).toBe(1);

    // Verify state restoration: setRenderTarget and setView must have
    // been called with the root target / root view to restore state.
    const targetCalls = setRenderTargetSpy.mock.calls.map(c => c[0]);
    const viewCalls = setViewSpy.mock.calls.map(c => c[0]);

    expect(targetCalls[0]).toBe(target);
    expect(targetCalls[targetCalls.length - 1]).toBe(root);
    expect(viewCalls[viewCalls.length - 1]).toBe(root.view);

    target.destroy();
  });

  test('renders multiple children of a container', () => {
    const { backend, drawEvents, root } = createMockBackend();
    const target = new RenderTexture(128, 128);
    const container = new Container();
    const red = new Sprite(createTexture());
    const green = new Sprite(createTexture());

    container.addChild(red, green);
    mockRenderTo(backend, target, container);

    expect(drawEvents).toHaveLength(2);
    expect(drawEvents[0]).toBe(red);
    expect(drawEvents[1]).toBe(green);
    expect(backend.renderTarget).toBe(root);
    expect(backend.view).toBe(root.view);

    target.destroy();
  });

  test('clears with default colour (transparent black)', () => {
    const { backend, clearCalls } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite);

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0].equals(Color.transparentBlack)).toBe(true);

    target.destroy();
  });

  test('clears with custom clearColor', () => {
    const { backend, clearCalls } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite, { clearColor: Color.red });

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0].equals(Color.red)).toBe(true);

    target.destroy();
  });

  test('does not clear when clear: false', () => {
    const { backend, clearCalls } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite, { clear: false });

    expect(clearCalls).toHaveLength(0);

    target.destroy();
  });

  test('restores previous render target on exception', () => {
    const { backend, root } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const drawable = new TestDrawable();

    const previousTarget = backend.renderTarget;
    const previousView = backend.view;

    vi.spyOn(drawable, 'render').mockImplementation(() => {
      throw new Error('forced render error');
    });

    expect(() => {
      mockRenderTo(backend, target, drawable);
    }).toThrow('forced render error');

    expect(backend.renderTarget).toBe(previousTarget);
    expect(backend.view).toBe(previousView);

    target.destroy();
  });

  test('accepts an explicit view and does not destroy it', () => {
    const { backend, drawEvents } = createMockBackend();
    const target = new RenderTexture(200, 100);
    const customView = new View(50, 25, 100, 50);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite, { view: customView });

    expect(drawEvents).toHaveLength(1);
    // The user-provided view should NOT be destroyed — only a temp one we
    // created ourselves should be cleaned up.
    expect(customView.size.width).toBe(100);
    expect(customView.size.height).toBe(50);

    customView.destroy();
    target.destroy();
  });

  test('does not mutate the user-provided RenderTexture dimensions', () => {
    const { backend } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite);

    expect(target.width).toBe(64);
    expect(target.height).toBe(64);

    target.destroy();
  });

  test('flushes before restoring state', () => {
    const { backend, getFlushCallCount, setRenderTargetSpy } = createMockBackend();
    const target = new RenderTexture(64, 64);
    const sprite = new Sprite(createTexture());

    mockRenderTo(backend, target, sprite);

    // Flush must have been called before setRenderTarget was called with
    // the original target. The last setRenderTarget call should be for
    // root (state restore).
    const targetCalls = setRenderTargetSpy.mock.calls.map(c => c[0]);

    expect(targetCalls[targetCalls.length - 1]).toBe(backend.renderTarget);

    target.destroy();
  });
});

/**
 * The renderTo / BackendTargetPass / cacheAsBitmap / mask / filter capture paths
 * all rely on a single backend invariant: switching the render target must drain
 * the active renderer into the OLD target first, so the buffered batch is not
 * misrouted into the target we are switching to. WebGpuBackend already holds this;
 * these tests pin it for WebGl2Backend without needing a live GL context by
 * exercising the real method against a minimal stub.
 */
describe('WebGl2Backend.setRenderTarget flush ordering', () => {
  type FlushSpy = ReturnType<typeof vi.fn>;

  interface SetRenderTargetStub {
    _renderTarget: RenderTarget;
    _rootRenderTarget: RenderTarget;
    _stats: { renderTargetChanges: number };
    _flushActiveRenderer: FlushSpy;
    _bindRenderTarget: FlushSpy;
    _applyStencilState: FlushSpy;
    setRenderTarget: (target: RenderTarget | null) => unknown;
  }

  const createStub = () => {
    const root = new RenderTarget(320, 200, true);
    // Targets observed by _flushActiveRenderer at the moment it runs. The fix is
    // correct iff each entry is the OLD target (the one bound before the switch).
    const flushedTargets: RenderTarget[] = [];

    const stub = {
      _renderTarget: root,
      _rootRenderTarget: root,
      _stats: { renderTargetChanges: 0 },
      _flushActiveRenderer: vi.fn(function (this: SetRenderTargetStub) {
        flushedTargets.push(this._renderTarget);
      }),
      _bindRenderTarget: vi.fn(),
      _applyStencilState: vi.fn(),
      setRenderTarget: WebGl2Backend.prototype.setRenderTarget,
    } as unknown as SetRenderTargetStub;

    return { stub, root, flushedTargets };
  };

  test('flushes exactly once into the OLD target when the target changes', () => {
    const { stub, root, flushedTargets } = createStub();
    const target = new RenderTexture(64, 64);

    stub.setRenderTarget(target);

    expect(stub._flushActiveRenderer).toHaveBeenCalledTimes(1);
    // Flush observed root — i.e. it ran BEFORE _renderTarget was reassigned.
    expect(flushedTargets).toEqual([root]);
    expect(stub._renderTarget).toBe(target);
    expect(stub._stats.renderTargetChanges).toBe(1);

    target.destroy();
    root.destroy();
  });

  test('does not flush when the target is unchanged', () => {
    const { stub, root } = createStub();

    stub.setRenderTarget(root);

    expect(stub._flushActiveRenderer).not.toHaveBeenCalled();
    expect(stub._stats.renderTargetChanges).toBe(0);

    root.destroy();
  });

  test('resolves a null target to root and does not flush when already on root', () => {
    const { stub, root } = createStub();

    stub.setRenderTarget(null);

    expect(stub._flushActiveRenderer).not.toHaveBeenCalled();
    expect(stub._renderTarget).toBe(root);

    root.destroy();
  });

  test('flushes into the OLD off-screen target when restoring to root (the bug scenario)', () => {
    const { stub, root, flushedTargets } = createStub();
    const target = new RenderTexture(64, 64);

    stub.setRenderTarget(target); // root -> target: flush must observe root
    stub.setRenderTarget(root); // target -> root: flush must observe target

    expect(stub._flushActiveRenderer).toHaveBeenCalledTimes(2);
    expect(flushedTargets).toEqual([root, target]);
    expect(stub._renderTarget).toBe(root);

    target.destroy();
    root.destroy();
  });
});
