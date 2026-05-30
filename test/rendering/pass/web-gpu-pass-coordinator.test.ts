import { Color } from '@/core/Color';
import { Matrix } from '@/math/Matrix';
import { Rectangle } from '@/math/Rectangle';
import { Geometry } from '@/rendering/geometry/Geometry';
import { type RenderPassDescriptor, StencilAttachmentMode } from '@/rendering/pass/RenderPassDescriptor';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { View } from '@/rendering/View';
import { type WebGpuPassBackend, WebGpuPassCoordinator } from '@/rendering/webgpu/WebGpuPassCoordinator';

// A stateful mock backend (no GPU device) that records delegated calls and
// reports per-target content presence via a caller-controlled set.
const createMockBackend = (root: RenderTarget, contentTargets: Set<RenderTarget> = new Set<RenderTarget>()) => {
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
  const targetHasContent = vi.fn((target: RenderTarget) => contentTargets.has(target));

  const backend: WebGpuPassBackend = {
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
    _targetHasContent: targetHasContent,
  };

  return { backend, setRenderTarget, setView, clear, flush, pushScissorRect, popScissorRect, pushStencilClip, popStencilClip, targetHasContent };
};

const descriptor = (
  target: RenderTarget | null,
  view: View | null,
  load: 'clear' | 'load',
  clearColor: Color | null,
  stencil: StencilAttachmentMode = StencilAttachmentMode.None,
): RenderPassDescriptor => ({ target, view, load, clearColor, stencil });

describe('WebGpuPassCoordinator', () => {
  test('resolveLoad clears a target that has no content yet', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);
    const target = new RenderTexture(32, 32);

    try {
      expect(coordinator.resolveLoad(target, false)).toBe('clear');
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('resolveLoad loads a target that already has content', () => {
    const root = new RenderTarget(64, 64, true);
    const target = new RenderTexture(32, 32);
    const { backend } = createMockBackend(root, new Set<RenderTarget>([target]));
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      // No explicit clear requested + the target holds content → preserve it.
      expect(coordinator.resolveLoad(target, false)).toBe('load');
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('resolveLoad always clears when a clear is explicitly requested', () => {
    const root = new RenderTarget(64, 64, true);
    const target = new RenderTexture(32, 32);
    const { backend } = createMockBackend(root, new Set<RenderTarget>([target]));
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      expect(coordinator.resolveLoad(target, true)).toBe('clear');
    } finally {
      target.destroy();
      root.destroy();
    }
  });

  test('withChildPass restores the previous target and view, even when the body throws', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);
    const child = new RenderTexture(32, 32);
    const childView = new View(16, 16, 32, 32);

    try {
      let targetDuringBody: RenderTarget | null = null;

      coordinator.withChildPass(descriptor(child, childView, 'clear', Color.transparentBlack), () => {
        targetDuringBody = coordinator.activeTarget;
      });

      expect(targetDuringBody).toBe(child);
      expect(coordinator.activeTarget).toBe(root);
      expect(coordinator.activeView).toBe(root.view);

      expect(() =>
        coordinator.withChildPass(descriptor(child, childView, 'load', null), () => {
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

  test('scissor and stencil delegate to the backend; endPass flushes', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, pushScissorRect, popScissorRect, pushStencilClip, popStencilClip, flush } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);
    const bounds = new Rectangle(0, 0, 8, 8);
    const shape = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 8, 0, 0, 8]),
      stride: 8,
    });
    const transform = new Matrix();

    try {
      coordinator.pushScissorRect(bounds);
      coordinator.popScissorRect();
      coordinator.pushStencilClip(shape, transform);
      coordinator.popStencilClip();
      coordinator.endPass();

      expect(pushScissorRect).toHaveBeenCalledWith(bounds);
      expect(popScissorRect).toHaveBeenCalledTimes(1);
      expect(pushStencilClip).toHaveBeenCalledWith(shape, transform);
      expect(popStencilClip).toHaveBeenCalledTimes(1);
      expect(flush).toHaveBeenCalledTimes(1);
    } finally {
      transform.destroy();
      shape.destroy();
      bounds.destroy();
      root.destroy();
    }
  });
});
