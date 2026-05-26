/**
 * Integration test: initializes a real WebGl2Backend against a genuine
 * WebGL2RenderingContext provided by Playwright's Chromium/SwiftShader.
 *
 * Unlike the unit tests in test/rendering/webgl2-backend.test.ts (which mock
 * the entire module), this test constructs the real class with a real GL
 * context and verifies the constructor + initialize() complete without errors.
 *
 * The RendererRegistry is mocked to skip shader compilation — the test target
 * is the WebGL2 context lifecycle (context acquisition, canvas wiring,
 * renderTarget setup), not the renderer pipeline itself.
 */

vi.mock('@/rendering/RendererRegistry', () => ({
  RendererRegistry: class {
    registerRenderer() { return this; }
    connect() { return this; }
    disconnect() { return this; }
    destroy() { return this; }
    render() { return this; }
  },
}));

import type { Application } from '@/core/Application';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';

const makeMinimalApp = (canvas: HTMLCanvasElement): Application =>
  ({ canvas, options: {} }) as unknown as Application;

describe('WebGl2Backend — real context integration', () => {
  test('constructor succeeds with a real WebGL2 context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    expect(() => new WebGl2Backend(makeMinimalApp(canvas))).not.toThrow();
  });

  test('backendType is "webgl2"', () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGl2Backend(makeMinimalApp(canvas));

    expect(backend.backendType).toBe(RenderBackendType.WebGl2);

    backend.destroy();
  });

  test('initialize() resolves without throwing', async () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGl2Backend(makeMinimalApp(canvas));

    await expect(backend.initialize()).resolves.toBe(backend);

    backend.destroy();
  });

  test('stats object is present after construction', () => {
    const canvas = document.createElement('canvas');
    const backend = new WebGl2Backend(makeMinimalApp(canvas));

    expect(backend.stats).toBeDefined();
    expect(typeof backend.stats.submittedNodes).toBe('number');

    backend.destroy();
  });
});
