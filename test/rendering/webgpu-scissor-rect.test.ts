import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

const createBackendLike = (clipDepth: number): WebGpuBackend =>
  Object.assign(Object.create(WebGpuBackend.prototype) as object, {
    _clipDepth: clipDepth,
    _clipPixelStack: [{ x: 1.5, y: 2.5, width: 10, height: 20 }],
    _renderTarget: { root: false, width: 100, height: 100 },
    _canvas: { width: 100, height: 100 },
  }) as unknown as WebGpuBackend;

describe('WebGpuBackend.getScissorRect', () => {
  test('returns null without an active clip', () => {
    expect(createBackendLike(0).getScissorRect()).toBeNull();
  });

  test('reuses one rect across calls and reflects the current clip', () => {
    const backend = createBackendLike(1);
    const first = backend.getScissorRect();

    expect(first).toEqual({ x: 1, y: 2, width: 10, height: 20 });

    const stack = (backend as unknown as { _clipPixelStack: Array<{ x: number }> })._clipPixelStack;

    stack[0]!.x = 7;

    const second = backend.getScissorRect();

    expect(second).toBe(first);
    expect(second!.x).toBe(7);
  });
});
