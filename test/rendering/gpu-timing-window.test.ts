import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { RenderingContext } from '#rendering/RenderingContext';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2PassCoordinator } from '#rendering/webgl2/WebGl2PassCoordinator';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createRenderBackendDouble } from '../support/render-backend-double';

const createTimedWebGl2Backend = () => {
  const endFrame = vi.fn();
  const flushRenderer = vi.fn();
  const readPixels = vi.fn();
  const backend = Object.assign(Object.create(WebGl2Backend.prototype) as object, {
    _gpuTimer: { endFrame, lastFrameMs: 3 },
    _stats: createRenderStats(),
    _flushActiveRenderer: flushRenderer,
    _context: { readPixels },
    _withReadFramebuffer: (_source: RenderTexture, operation: () => void) => operation(),
    _accountant: { recordDownload: vi.fn() },
  }) as unknown as WebGl2Backend;

  return { backend, endFrame, flushRenderer, readPixels };
};

describe('GPU frame timing window', () => {
  test('ending a WebGL2 child pass submits draws without ending the frame timer', () => {
    const { backend, endFrame, flushRenderer } = createTimedWebGl2Backend();

    new WebGl2PassCoordinator(backend).endPass();
    expect(flushRenderer).toHaveBeenCalledTimes(1);
    expect(endFrame).not.toHaveBeenCalled();

    backend.flush();
    expect(endFrame).toHaveBeenCalledTimes(1);
    expect(backend.stats.gpuFrameTimeMs).toBe(3);
  });

  test('WebGL2 pixel reads submit pending draws while later frame work remains timed', async () => {
    const { backend, endFrame, flushRenderer, readPixels } = createTimedWebGl2Backend();
    const source = new RenderTexture(2, 2);

    try {
      await backend.readPixels(source, 0, 0, 2, 2);
      expect(flushRenderer).toHaveBeenCalledTimes(1);
      expect(readPixels).toHaveBeenCalledTimes(1);
      expect(endFrame).not.toHaveBeenCalled();
      backend.flush();
      expect(endFrame).toHaveBeenCalledTimes(1);
    } finally {
      source.destroy();
    }
  });

  test('immediate geometry submits queued draws without finalizing frame timing', () => {
    const frameFlush = vi.fn();
    const flushPending = vi.fn();
    const backend = Object.assign(createRenderBackendDouble(), { flush: frameFlush, flushPending });
    const context = new RenderingContext(backend);
    const geometry = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 10, 0, 0, 10]),
      stride: 8,
    });

    try {
      context.drawGeometry(geometry, new Matrix());
      expect(flushPending).toHaveBeenCalledTimes(1);
      expect(frameFlush).not.toHaveBeenCalled();
    } finally {
      geometry.destroy();
      backend.renderTarget.destroy();
    }
  });

  test('WebGPU pending submission also preserves the frame timer', () => {
    const endFrame = vi.fn();
    const submit = vi.fn();
    const backend = Object.assign(Object.create(WebGpuBackend.prototype) as object, {
      _device: {},
      _context: {},
      _gpuTimer: { endFrame },
      _flushActiveRendererAndEndPass: submit,
    }) as unknown as WebGpuBackend;

    backend.flushPending();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(endFrame).not.toHaveBeenCalled();
  });
});
