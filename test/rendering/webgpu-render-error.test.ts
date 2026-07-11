/**
 * Render-fail surface (S3 diagnostics, minimal slice) — contracts 6, 7 and 10:
 *
 *  6. WebGPU `uncapturederror` (validation) → backend.onRenderError dispatched
 *     with code 'validation'; a second identical event does NOT re-dispatch
 *     (dedupe by code + message).
 *  7. WebGPU custom-material WGSL with a syntax error → onRenderError with
 *     code 'shader-compile' and resource = the label; engine does not crash.
 * 10. Signal teardown: backend.destroy() destroys onRenderError without
 *     throwing.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import type { RenderError } from '#rendering/RenderError';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

type UncapturedListener = (event: { error: unknown }) => void;

interface MockWebGpuEnvironment {
  readonly canvas: HTMLCanvasElement;
  readonly addEventListener: MockInstance;
  readonly removeEventListener: MockInstance;
  readonly createShaderModule: MockInstance;
  dispatchUncapturedError(error: unknown): void;
  /** Configure compilation-info messages returned for subsequently created modules. */
  setCompilationMessages(messages: Array<{ type: string; lineNum: number; linePos: number; message: string }>): void;
  restore(): void;
}

class FakeGpuValidationError {
  public constructor(public readonly message: string) {}
}

class FakeGpuOutOfMemoryError {
  public constructor(public readonly message: string) {}
}

const createMockWebGpuEnvironment = (): MockWebGpuEnvironment => {
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  const previousTextureUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage');
  const previousValidationError = Object.getOwnPropertyDescriptor(globalThis, 'GPUValidationError');
  const previousOomError = Object.getOwnPropertyDescriptor(globalThis, 'GPUOutOfMemoryError');

  const uncapturedListeners: UncapturedListener[] = [];
  let compilationMessages: Array<{ type: string; lineNum: number; linePos: number; message: string }> = [];

  const addEventListener = vi.fn((type: string, listener: UncapturedListener) => {
    if (type === 'uncapturederror') {
      uncapturedListeners.push(listener);
    }
  });
  const removeEventListener = vi.fn((type: string, listener: UncapturedListener) => {
    if (type === 'uncapturederror') {
      const index = uncapturedListeners.indexOf(listener);

      if (index >= 0) {
        uncapturedListeners.splice(index, 1);
      }
    }
  });
  const createShaderModule = vi.fn(() => {
    const messages = compilationMessages;

    return {
      getCompilationInfo: () => Promise.resolve({ messages }),
    } as unknown as GPUShaderModule;
  });

  const device = {
    createShaderModule,
    createBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
    createPipelineLayout: vi.fn(() => ({}) as GPUPipelineLayout),
    createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    createRenderPipeline: vi.fn(() => ({}) as GPURenderPipeline),
    createCommandEncoder: vi.fn(),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() }) as unknown as GPUBuffer),
    createTexture: vi.fn(() => ({ destroy: vi.fn(), createView: vi.fn(() => ({})) }) as unknown as GPUTexture),
    createSampler: vi.fn(() => ({}) as GPUSampler),
    addEventListener,
    removeEventListener,
    lost: new Promise<GPUDeviceLostInfo>(() => undefined),
    queue: { writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;

  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({})) }) as unknown as GPUTexture),
  } as unknown as GPUCanvasContext;

  const gpu = {
    requestAdapter: vi.fn(async () => ({ requestDevice: vi.fn(async () => device) }) as unknown as GPUAdapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm' as GPUTextureFormat),
  } as unknown as GPU;

  const canvas = document.createElement('canvas');

  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
  Object.defineProperty(globalThis, 'GPUTextureUsage', {
    configurable: true,
    value: { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 },
  });
  Object.defineProperty(globalThis, 'GPUValidationError', { configurable: true, value: FakeGpuValidationError });
  Object.defineProperty(globalThis, 'GPUOutOfMemoryError', { configurable: true, value: FakeGpuOutOfMemoryError });
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn((contextType: string) => (contextType === 'webgpu' ? context : null)),
  });

  const restoreDescriptor = (target: object, key: string, descriptor: PropertyDescriptor | undefined): void => {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      Object.defineProperty(target, key, { configurable: true, value: undefined });
    }
  };

  return {
    canvas,
    addEventListener,
    removeEventListener,
    createShaderModule,
    dispatchUncapturedError: (error: unknown): void => {
      for (const listener of [...uncapturedListeners]) {
        listener({ error });
      }
    },
    setCompilationMessages: (messages): void => {
      compilationMessages = messages;
    },
    restore: (): void => {
      restoreDescriptor(navigator, 'gpu', previousGpu);
      restoreDescriptor(globalThis, 'GPUTextureUsage', previousTextureUsage);
      restoreDescriptor(globalThis, 'GPUValidationError', previousValidationError);
      restoreDescriptor(globalThis, 'GPUOutOfMemoryError', previousOomError);
    },
  };
};

const createBackend = async (environment: MockWebGpuEnvironment): Promise<WebGpuBackend> => {
  const app = {
    canvas: environment.canvas,
    options: {
      canvas: { width: 128, height: 128 },
      clearColor: Color.black,
    },
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  await backend.initialize();

  return backend;
};

describe('WebGpuBackend — uncaptured error surface (contract 6)', () => {
  test('subscribes to uncapturederror during initialization', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);

      expect(environment.addEventListener).toHaveBeenCalledWith('uncapturederror', expect.any(Function));

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a validation uncapturederror dispatches onRenderError with code validation', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const errors: RenderError[] = [];

      backend.onRenderError.add(error => {
        errors.push(error);
      });

      environment.dispatchUncapturedError(new FakeGpuValidationError('binding size too small'));

      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('validation');
      expect(errors[0]!.message).toContain('binding size too small');

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an identical repeated uncapturederror does not re-dispatch (dedupe)', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const listener = vi.fn();

      backend.onRenderError.add(listener);

      environment.dispatchUncapturedError(new FakeGpuValidationError('binding size too small'));
      environment.dispatchUncapturedError(new FakeGpuValidationError('binding size too small'));
      environment.dispatchUncapturedError(new FakeGpuValidationError('binding size too small'));

      expect(listener).toHaveBeenCalledTimes(1);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a different message dispatches again after a dedupe', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const listener = vi.fn();

      backend.onRenderError.add(listener);

      environment.dispatchUncapturedError(new FakeGpuValidationError('first failure'));
      environment.dispatchUncapturedError(new FakeGpuValidationError('first failure'));
      environment.dispatchUncapturedError(new FakeGpuValidationError('second failure'));

      expect(listener).toHaveBeenCalledTimes(2);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an out-of-memory error maps to code out-of-memory; unknown errors map to internal', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const errors: RenderError[] = [];

      backend.onRenderError.add(error => {
        errors.push(error);
      });

      environment.dispatchUncapturedError(new FakeGpuOutOfMemoryError('allocation failed'));
      environment.dispatchUncapturedError({ message: 'mystery failure' });

      expect(errors).toHaveLength(2);
      expect(errors[0]!.code).toBe('out-of-memory');
      expect(errors[1]!.code).toBe('internal');

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('the uncapturederror listener is removed on destroy', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);

      backend.destroy();

      expect(environment.removeEventListener).toHaveBeenCalledWith('uncapturederror', expect.any(Function));
    } finally {
      environment.restore();
    }
  });
});

describe('WebGpuBackend — WGSL compilation checking (contract 7)', () => {
  test('a WGSL module with error-type compilation messages dispatches shader-compile with the label as resource', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const errors: RenderError[] = [];

      backend.onRenderError.add(error => {
        errors.push(error);
      });

      environment.setCompilationMessages([{ type: 'error', lineNum: 2, linePos: 5, message: 'unresolved identifier' }]);

      const module = backend._createShaderModule('@fragment\nfn main() -> BROKEN {}', 'sprite:material-shader');

      expect(module).toBeDefined();

      // getCompilationInfo resolves on the microtask queue.
      await Promise.resolve();
      await Promise.resolve();

      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe('shader-compile');
      expect(errors[0]!.resource).toBe('sprite:material-shader');
      expect(errors[0]!.message).toContain('sprite:material-shader');
      expect(errors[0]!.detail).toContain('unresolved identifier');
      expect(errors[0]!.detail).toContain(':2:5');

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a clean WGSL module dispatches nothing', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);
      const listener = vi.fn();

      backend.onRenderError.add(listener);

      environment.setCompilationMessages([{ type: 'info', lineNum: 1, linePos: 1, message: 'fine' }]);
      backend._createShaderModule('@fragment fn main() {}', 'ok-module');

      await Promise.resolve();
      await Promise.resolve();

      expect(listener).not.toHaveBeenCalled();

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a module without getCompilationInfo support does not crash', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);

      environment.createShaderModule.mockReturnValueOnce({} as unknown as GPUShaderModule);

      expect(() => backend._createShaderModule('code', 'label')).not.toThrow();

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});

describe('WebGpuBackend — signal teardown (contract 10)', () => {
  test('destroy() tears down onRenderError without throwing', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createBackend(environment);

      expect(backend.onRenderError).toBeInstanceOf(Signal);
      expect(() => {
        backend.destroy();
      }).not.toThrow();
    } finally {
      environment.restore();
    }
  });
});
