import { describe, expect, test, vi } from 'vitest';

import { WebGpuBackdropBlendCompositor } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

interface BackendInternals {
  _device: object;
  _context: object;
  _gpuTimer: { endFrame: () => void; lastFrameMs: number | null };
  _stats: { gpuFrameTimeMs: number | null };
  _flushActiveRendererAndEndPass: () => void;
}

const makeBackend = () => {
  const backend = Object.create(WebGpuBackend.prototype) as WebGpuBackend;
  const internals = backend as unknown as BackendInternals;
  const endFrame = vi.fn();
  const flushPasses = vi.fn();

  internals._device = {};
  internals._context = {};
  internals._gpuTimer = { endFrame, lastFrameMs: 1.5 };
  internals._stats = { gpuFrameTimeMs: null };
  internals._flushActiveRendererAndEndPass = flushPasses;

  return { backend, internals, endFrame, flushPasses };
};

describe('WebGpuBackend mid-frame flush', () => {
  test('flushPending submits the open pass but leaves the GPU timing window open', () => {
    const { backend, endFrame, flushPasses } = makeBackend();

    backend.flushPending();

    expect(flushPasses).toHaveBeenCalledTimes(1);
    expect(endFrame).not.toHaveBeenCalled();
  });

  test('flush, the frame-end seam, still closes the timing window and publishes the stat', () => {
    const { backend, internals, endFrame } = makeBackend();

    backend.flush();

    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(internals._stats.gpuFrameTimeMs).toBe(1.5);
  });
});

describe('WebGpuBackdropBlendCompositor.compose', () => {
  test('flushes the target through flushPending so the frame keeps being timed', () => {
    const compositor = new WebGpuBackdropBlendCompositor();
    const flush = vi.fn();
    const flushPending = vi.fn(() => {
      throw new Error('stop after flush');
    });
    const manager = { flush, flushPending, renderTarget: {} } as unknown as WebGpuBackend;

    (compositor as unknown as { _device: object })._device = {};

    expect(() => compositor.compose(manager, {} as never, 0, 0, 4, 4, 0 as never)).toThrow('stop after flush');
    expect(flushPending).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });
});
