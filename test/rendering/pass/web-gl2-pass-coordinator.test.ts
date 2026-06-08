import { Color } from '@/core/Color';
import { Matrix } from '@/math/Matrix';
import { Rectangle } from '@/math/Rectangle';
import { Geometry } from '@/rendering/geometry/Geometry';
import { type RenderPassDescriptor, StencilAttachmentMode } from '@/rendering/pass/RenderPassDescriptor';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { View } from '@/rendering/View';
import { type WebGl2PassBackend, WebGl2PassCoordinator } from '@/rendering/webgl2/WebGl2PassCoordinator';

// The coordinator is a thin adapter over the backend's state-transition
// methods, so a stateful mock backend (no GL context) exercises it fully in
// jsdom: it tracks the bound target/view and records every delegated call.
const createMockBackend = (root: RenderTarget) => {
  let currentTarget: RenderTarget = root;
  let currentView: View = root.view;

  const setRenderTarget = vi.fn((target: RenderTarget | null) => {
    currentTarget = target ?? root;
  });
  const setView = vi.fn((view: View | null) => {
    currentView = view ?? currentTarget.view;
  });
  const clear = vi.fn((_color?: Color) => undefined);
  const flush = vi.fn(() => undefined);
  const pushScissorRect = vi.fn((_bounds: Rectangle) => undefined);
  const popScissorRect = vi.fn(() => undefined);
  const pushStencilClip = vi.fn((_shape: Geometry, _transform: Matrix) => undefined);
  const popStencilClip = vi.fn(() => undefined);

  const backend: WebGl2PassBackend = {
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentView;
    },
    setRenderTarget,
    setView,
    clear,
    flush,
    pushScissorRect,
    popScissorRect,
    pushStencilClip,
    popStencilClip,
  };

  return { backend, setRenderTarget, setView, clear, flush, pushScissorRect, popScissorRect, pushStencilClip, popStencilClip };
};

const descriptor = (
  target: RenderTarget | null,
  view: View | null,
  load: 'clear' | 'load',
  clearColor: Color | null,
  stencil: StencilAttachmentMode = StencilAttachmentMode.None,
): RenderPassDescriptor => ({ target, view, load, clearColor, stencil });

const createTriangle = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 10, 0, 0, 10]),
    stride: 8,
  });

describe('WebGl2PassCoordinator', () => {
  test('beginPass applies target, view and clears when load is "clear"', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, setRenderTarget, setView, clear } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const child = new RenderTexture(32, 32);
    const childView = new View(16, 16, 32, 32);

    try {
      coordinator.beginPass(descriptor(child, childView, 'clear', Color.transparentBlack));

      expect(setRenderTarget).toHaveBeenCalledWith(child);
      expect(setView).toHaveBeenCalledWith(childView);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith(Color.transparentBlack);
      expect(coordinator.activeTarget).toBe(child);
      expect(coordinator.activeView).toBe(childView);
    } finally {
      childView.destroy();
      child.destroy();
      root.destroy();
    }
  });

  test('beginPass does not clear when load is "load"', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, clear } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const child = new RenderTexture(32, 32);
    const childView = new View(16, 16, 32, 32);

    try {
      coordinator.beginPass(descriptor(child, childView, 'load', null));

      expect(clear).not.toHaveBeenCalled();
    } finally {
      childView.destroy();
      child.destroy();
      root.destroy();
    }
  });

  test('withChildPass restores the previous target and view after the body', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const child = new RenderTexture(32, 32);
    const childView = new View(16, 16, 32, 32);

    let targetDuringBody: RenderTarget | null = null;
    let viewDuringBody: View | null = null;

    try {
      coordinator.withChildPass(descriptor(child, childView, 'clear', Color.transparentBlack), () => {
        targetDuringBody = coordinator.activeTarget;
        viewDuringBody = coordinator.activeView;
      });

      expect(targetDuringBody).toBe(child);
      expect(viewDuringBody).toBe(childView);
      expect(coordinator.activeTarget).toBe(root);
      expect(coordinator.activeView).toBe(root.view);
    } finally {
      childView.destroy();
      child.destroy();
      root.destroy();
    }
  });

  test('withChildPass restores target and view even when the body throws', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const child = new RenderTexture(32, 32);
    const childView = new View(16, 16, 32, 32);

    try {
      expect(() =>
        coordinator.withChildPass(descriptor(child, childView, 'clear', Color.transparentBlack), () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');

      expect(coordinator.activeTarget).toBe(root);
      expect(coordinator.activeView).toBe(root.view);
    } finally {
      childView.destroy();
      child.destroy();
      root.destroy();
    }
  });

  test('endPass flushes the active renderer', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, flush } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);

    try {
      coordinator.endPass();

      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      root.destroy();
    }
  });

  test('pushScissorRect / popScissorRect delegate to the backend', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, pushScissorRect, popScissorRect } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const bounds = new Rectangle(0, 0, 10, 10);

    try {
      coordinator.pushScissorRect(bounds);
      coordinator.popScissorRect();

      expect(pushScissorRect).toHaveBeenCalledWith(bounds);
      expect(popScissorRect).toHaveBeenCalledTimes(1);
    } finally {
      bounds.destroy();
      root.destroy();
    }
  });

  test('pushStencilClip / popStencilClip delegate to the backend', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, pushStencilClip, popStencilClip } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);
    const shape = createTriangle();
    const transform = new Matrix();

    try {
      coordinator.pushStencilClip(shape, transform);
      coordinator.popStencilClip();

      expect(pushStencilClip).toHaveBeenCalledWith(shape, transform);
      expect(popStencilClip).toHaveBeenCalledTimes(1);
    } finally {
      transform.destroy();
      shape.destroy();
      root.destroy();
    }
  });

  test('resolveLoad returns "clear" only when a clear is requested', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);

    try {
      expect(coordinator.resolveLoad(root, true)).toBe('clear');
      expect(coordinator.resolveLoad(root, false)).toBe('load');
    } finally {
      root.destroy();
    }
  });

  test('hasActivePass reflects the ambient WebGL2 target', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGl2PassCoordinator(backend);

    try {
      expect(coordinator.hasActivePass).toBe(true);
    } finally {
      root.destroy();
    }
  });
});

describe('render pass internals are not publicly exported', () => {
  test('the rendering barrel exposes neither the coordinator nor the stencil enum', async () => {
    const rendering = (await import('@/rendering/index')) as unknown as Record<string, unknown>;

    expect(rendering['WebGl2PassCoordinator']).toBeUndefined();
    expect(rendering['StencilAttachmentMode']).toBeUndefined();
    expect(rendering['RenderPassCoordinator']).toBeUndefined();
    // Sanity: a legitimately advanced pass class is still exported, so the
    // barrel actually loaded.
    expect(rendering['CallbackRenderPass']).toBeDefined();
  });
});
