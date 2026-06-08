import { Color } from '#core/Color';
import { type Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { type Geometry } from '#rendering/geometry/Geometry';
import { type RenderPassDescriptor, StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { View } from '#rendering/View';
import { type WebGpuPassBackend, WebGpuPassCoordinator } from '#rendering/webgpu/WebGpuPassCoordinator';

// A stateful mock backend with a minimal GPU device (createCommandEncoder →
// encoder → beginRenderPass → pass) so the coordinator's real acquire/end pass
// cycle runs without a real adapter. Records delegated calls and reports
// per-target content presence via a caller-controlled set.
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

  const passEncoder = { end: vi.fn(), setScissorRect: vi.fn() };
  const beginRenderPass = vi.fn(() => passEncoder);
  const encoder = { beginRenderPass, finish: vi.fn(() => ({}) as GPUCommandBuffer) };
  const createCommandEncoder = vi.fn(() => encoder);
  const submit = vi.fn((_commandBuffer: GPUCommandBuffer) => undefined);
  const createColorAttachment = vi.fn(() => ({}) as GPURenderPassColorAttachment);
  const getScissorRect = vi.fn(() => null);
  const getAttachmentPixelSize = vi.fn((target: RenderTarget) => ({ width: target.width, height: target.height }));
  const stats = createRenderStats();

  const backend: WebGpuPassBackend = {
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentView;
    },
    device: { createCommandEncoder } as unknown as GPUDevice,
    renderTargetFormat: 'rgba8unorm' as GPUTextureFormat,
    stats,
    setRenderTarget,
    setView,
    clear,
    flush,
    pushScissorRect,
    popScissorRect,
    pushStencilClip,
    popStencilClip,
    createColorAttachment,
    getScissorRect,
    submit,
    _targetHasContent: targetHasContent,
    _getAttachmentPixelSize: getAttachmentPixelSize,
  };

  return {
    backend,
    stats,
    setRenderTarget,
    setView,
    clear,
    flush,
    pushScissorRect,
    popScissorRect,
    pushStencilClip,
    popStencilClip,
    targetHasContent,
    beginRenderPass,
    passEncoder,
    submit,
  };
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

  test('scissor delegates to the backend', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, pushScissorRect, popScissorRect } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);
    const bounds = new Rectangle(0, 0, 8, 8);

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

  test('popStencilClip on an empty target is a no-op (no pass opened)', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, beginRenderPass } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      expect(coordinator.stencilActive).toBe(false);
      expect(() => coordinator.popStencilClip()).not.toThrow();
      expect(coordinator.unbalancedStencilClips()).toBe(0);
      expect(beginRenderPass).not.toHaveBeenCalled();
    } finally {
      root.destroy();
    }
  });

  test('acquirePass opens one GPU pass and is idempotent; endPass ends + submits it', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, stats, beginRenderPass, passEncoder, submit } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      expect(coordinator.hasActivePass).toBe(false);

      const active = coordinator.acquirePass();

      // A second acquire returns the same open pass — no extra GPU pass.
      expect(coordinator.acquirePass()).toBe(active);
      expect(beginRenderPass).toHaveBeenCalledTimes(1);
      expect(stats.renderPasses).toBe(1);
      expect(coordinator.hasActivePass).toBe(true);

      coordinator.endPass();

      expect(passEncoder.end).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(coordinator.hasActivePass).toBe(false);

      // endPass with no open pass is a no-op (no extra end/submit).
      coordinator.endPass();
      expect(passEncoder.end).toHaveBeenCalledTimes(1);
      expect(submit).toHaveBeenCalledTimes(1);
    } finally {
      root.destroy();
    }
  });
});
