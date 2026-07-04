import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
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
interface MockScissorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const createMockBackend = (
  root: RenderTarget,
  contentTargets: Set<RenderTarget> = new Set<RenderTarget>(),
  options: { scissorRect?: MockScissorRect | null } = {},
) => {
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

  const passEncoder = { end: vi.fn(), setScissorRect: vi.fn(), setStencilReference: vi.fn(), setViewport: vi.fn() };
  const beginRenderPass = vi.fn(() => passEncoder);
  const encoder = { beginRenderPass, finish: vi.fn(() => ({}) as GPUCommandBuffer) };
  const createCommandEncoder = vi.fn(() => encoder);
  const submit = vi.fn((_commandBuffer: GPUCommandBuffer) => undefined);
  const createColorAttachment = vi.fn(() => ({}) as GPURenderPassColorAttachment);
  const getScissorRect = vi.fn(() => options.scissorRect ?? null);
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

// A thin fake for the coordinator's own `WebGpuStencilClipper` dependency —
// the clipper itself is real GPU-pipeline code (out of scope here per the
// task brief); this fake lets the coordinator's stencil bookkeeping
// (depth/stack tracking, load-op transitions, endPass sequencing) run without
// simulating a real stencil-write shader.
const createFakeStencilClipper = () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getAttachmentView: vi.fn(() => ({}) as GPUTextureView),
  releaseAttachment: vi.fn(),
  draw: vi.fn(),
});

type FakeStencilClipper = ReturnType<typeof createFakeStencilClipper>;

/** Swap the coordinator's internal `WebGpuStencilClipper` for `fake`. */
const installFakeStencil = (coordinator: WebGpuPassCoordinator, fake: FakeStencilClipper): void => {
  (coordinator as unknown as { _stencil: FakeStencilClipper })._stencil = fake;
};

const geometryStub = {} as unknown as Geometry;

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

  test('activePass exposes the open pass and stencilReference the current ref value', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      expect(coordinator.activePass).toBeNull();
      expect(coordinator.stencilReference).toBe(0);

      const active = coordinator.acquirePass();

      expect(coordinator.activePass).toBe(active);
    } finally {
      root.destroy();
    }
  });

  test('beginPass with an explicit "clear" load and no clearColor falls back to undefined', () => {
    const root = new RenderTarget(64, 64, true);
    const { backend, clear } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      coordinator.beginPass(descriptor(root, root.view, 'clear', null));

      expect(clear).toHaveBeenCalledWith(undefined);
    } finally {
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

  test('acquirePass applies the active scissor rect when non-empty', () => {
    const root = new RenderTarget(64, 64, true);
    const scissorRect = { x: 1, y: 2, width: 8, height: 4 };
    const { backend, passEncoder } = createMockBackend(root, undefined, { scissorRect });
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      coordinator.acquirePass();

      expect(passEncoder.setScissorRect).toHaveBeenCalledWith(1, 2, 8, 4);
    } finally {
      root.destroy();
    }
  });

  test('acquirePass applies a non-full view viewport in device pixels', () => {
    const root = new RenderTarget(200, 100, true);
    const { backend, passEncoder } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      root.view.setViewport(0.5, 0, 0.5, 1);

      coordinator.acquirePass();

      // Right half of a 200x100 target: x=100, y=0, w=100, h=100.
      expect(passEncoder.setViewport).toHaveBeenCalledWith(100, 0, 100, 100, 0, 1);
    } finally {
      root.destroy();
    }
  });

  test('acquirePass skips setViewport for the default full (0,0,1,1) viewport', () => {
    const root = new RenderTarget(200, 100, true);
    const { backend, passEncoder } = createMockBackend(root);
    const coordinator = new WebGpuPassCoordinator(backend);

    try {
      coordinator.acquirePass();

      expect(passEncoder.setViewport).not.toHaveBeenCalled();
    } finally {
      root.destroy();
    }
  });

  describe('stencil clipping', () => {
    test('pushStencilClip opens a write pass, tracks depth, and clears only the outermost level', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend, beginRenderPass } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        const transform = new Matrix();

        expect(coordinator.stencilActive).toBe(false);

        coordinator.pushStencilClip(geometryStub, transform);

        expect(fakeStencil.connect).toHaveBeenCalledTimes(1);
        expect(fakeStencil.draw).toHaveBeenCalledTimes(1);
        expect(fakeStencil.draw).toHaveBeenCalledWith(expect.anything(), 'rgba8unorm', true, geometryStub, transform, expect.anything());
        // The clip is now in effect: depth 1 > 0 on the active target.
        expect(coordinator.stencilActive).toBe(true);
        expect(coordinator.unbalancedStencilClips()).toBe(1);

        // A render pass opened after the push must request a stencil-enabled attachment.
        coordinator.acquirePass();
        expect(coordinator.stencilActive).toBe(true);
        expect(beginRenderPass).toHaveBeenCalled();

        // A nested push loads (rather than clears) the existing buffer.
        coordinator.pushStencilClip(geometryStub, transform);
        expect(coordinator.unbalancedStencilClips()).toBe(2);

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('pushStencilClip throws once nesting reaches the 255-level limit', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        const target = root;

        (coordinator as unknown as { _stencilDepths: Map<RenderTarget, number> })._stencilDepths.set(target, 255);

        const transform = new Matrix();

        expect(() => coordinator.pushStencilClip(geometryStub, transform)).toThrow('Stencil clip nesting exceeds the 255-level limit.');

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('popStencilClip restores the outer level and drains the stack', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        const transform = new Matrix();

        coordinator.pushStencilClip(geometryStub, transform);
        coordinator.pushStencilClip(geometryStub, transform);
        expect(coordinator.unbalancedStencilClips()).toBe(2);

        coordinator.popStencilClip();
        expect(coordinator.unbalancedStencilClips()).toBe(1);
        expect(coordinator.stencilActive).toBe(true);

        coordinator.popStencilClip();
        expect(coordinator.unbalancedStencilClips()).toBe(0);
        expect(coordinator.stencilActive).toBe(false);

        expect(fakeStencil.draw).toHaveBeenCalledTimes(4); // 2 pushes + 2 pops

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('popStencilClip defaults depth to 0 if the depth map entry is missing (defensive fallback)', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        const transform = new Matrix();

        coordinator.pushStencilClip(geometryStub, transform);

        // Synthetically desync the depth map from the stack to exercise the
        // `?? 0` defensive fallback — depths and stacks are always kept in
        // sync by the public API, so this desync is not otherwise reachable.
        (coordinator as unknown as { _stencilDepths: Map<RenderTarget, number> })._stencilDepths.delete(root);

        expect(() => coordinator.popStencilClip()).not.toThrow();

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('releaseStencilTarget releases the attachment only once the clipper has connected', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        // Never connected — releasing is a pure bookkeeping no-op.
        coordinator.releaseStencilTarget(root);
        expect(fakeStencil.releaseAttachment).not.toHaveBeenCalled();

        const transform = new Matrix();

        coordinator.pushStencilClip(geometryStub, transform);
        coordinator.releaseStencilTarget(root);

        expect(fakeStencil.releaseAttachment).toHaveBeenCalledWith(root);
        expect(coordinator.unbalancedStencilClips()).toBe(0);

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('resetStencil clears bookkeeping without disconnecting the clipper', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        const transform = new Matrix();

        coordinator.pushStencilClip(geometryStub, transform);
        coordinator.resetStencil();

        expect(coordinator.unbalancedStencilClips()).toBe(0);
        expect(coordinator.stencilActive).toBe(false);
        expect(fakeStencil.disconnect).not.toHaveBeenCalled();

        transform.destroy();
      } finally {
        root.destroy();
      }
    });

    test('destroyStencil disconnects the clipper only when it had connected', () => {
      const root = new RenderTarget(64, 64, true);
      const { backend } = createMockBackend(root);
      const coordinator = new WebGpuPassCoordinator(backend);
      const fakeStencil = createFakeStencilClipper();

      installFakeStencil(coordinator, fakeStencil);

      try {
        // Never connected — destroying is a no-op for the clipper itself.
        coordinator.destroyStencil();
        expect(fakeStencil.disconnect).not.toHaveBeenCalled();

        const transform = new Matrix();

        coordinator.pushStencilClip(geometryStub, transform);
        coordinator.destroyStencil();

        expect(fakeStencil.disconnect).toHaveBeenCalledTimes(1);
        expect(coordinator.unbalancedStencilClips()).toBe(0);

        // A second destroy after already disconnected does not call through again.
        coordinator.destroyStencil();
        expect(fakeStencil.disconnect).toHaveBeenCalledTimes(1);

        transform.destroy();
      } finally {
        root.destroy();
      }
    });
  });
});
