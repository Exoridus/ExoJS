/**
 * WebGPU browser smoke tests.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe), so these tests exercise the API directly rather
 * than skipping when it looks unavailable — a missing adapter here is a
 * genuine failure, not an environment gap.
 *
 * Run via:  pnpm test:browser:webgpu
 */

vi.mock('#rendering/RendererRegistry', () => ({
  RendererRegistry: class {
    registerRenderer() {
      return this;
    }
    connect() {
      return this;
    }
    disconnect() {
      return this;
    }
    destroy() {
      return this;
    }
    render() {
      return this;
    }
    resolve() {
      return { connect: () => {}, render: () => {}, flush: () => {}, disconnect: () => {} };
    }
    renderers() {
      return [][Symbol.iterator]();
    }
  },
}));

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

// ── Section 1: raw WebGPU API availability ────────────────────────────────

describe('WebGPU API — navigator.gpu', () => {
  test('navigator.gpu is present', () => {
    expect(navigator.gpu).toBeDefined();
  });

  test('getPreferredCanvasFormat() returns a known format', () => {
    const format = navigator.gpu.getPreferredCanvasFormat();

    expect(['bgra8unorm', 'rgba8unorm']).toContain(format);
  });
});

// ── Section 2: adapter & device ───────────────────────────────────────────

describe('WebGPU API — adapter and device', () => {
  test('requestAdapter() resolves to a non-null GPUAdapter', async () => {
    const adapter = await navigator.gpu.requestAdapter();

    expect(adapter).not.toBeNull();
  });

  test('requestDevice() returns a GPUDevice and can be destroyed', async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();

    expect(device).toBeDefined();
    expect(typeof device.createBuffer).toBe('function');

    device.destroy();
  });

  test('GPUDevice.lost promise resolves to a GPUDeviceLostInfo when device is destroyed', async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    const lostPromise = device.lost;

    device.destroy();

    const info = await lostPromise;

    expect(typeof info.reason).toBe('string');
  });
});

// ── Section 3: WebGpuBackend integration ─────────────────────────────────

describe('WebGpuBackend — real GPU initialization', () => {
  const makeApp = (canvas: HTMLCanvasElement): Application =>
    ({
      canvas,
      options: {
        canvas: { width: 64, height: 64 },
        clearColor: Color.black,
      },
    }) as unknown as Application;

  test('backendType is RenderBackendType.WebGpu', () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGpuBackend(makeApp(canvas));

    expect(backend.backendType).toBe(RenderBackendType.WebGpu);
  });

  test('initialize() resolves with the backend instance', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const backend = new WebGpuBackend(makeApp(canvas));

    await expect(backend.initialize()).resolves.toBe(backend);

    backend.destroy();
  });

  test('stats object is defined after initialize()', async () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    expect(backend.stats).toBeDefined();
    expect(typeof backend.stats.submittedNodes).toBe('number');

    backend.destroy();
  });

  test('clear() and flush() complete without throwing after initialize()', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const backend = new WebGpuBackend(makeApp(canvas));

    await backend.initialize();

    expect(() => {
      backend.clear(Color.black);
      backend.flush();
    }).not.toThrow();

    backend.destroy();
  });
});
