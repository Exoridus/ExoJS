import { describe, expect, test } from 'vitest';

import { attachWebGlApiMetrics, attachWebGpuApiMetrics } from '../src/rendering/apiMetrics';

interface ApiCall {
  readonly name: string;
  readonly receiver: unknown;
  readonly args: readonly unknown[];
}

const fakeGl = () => {
  const calls: ApiCall[] = [];
  const target: Record<string, unknown> = {};

  for (const name of [
    'bufferData',
    'bufferSubData',
    'texImage2D',
    'texSubImage2D',
    'texImage3D',
    'texSubImage3D',
    'compressedTexImage2D',
    'compressedTexSubImage2D',
    'compressedTexImage3D',
    'compressedTexSubImage3D',
    'useProgram',
    'compileShader',
    'linkProgram',
    'deleteBuffer',
    'deleteTexture',
  ]) {
    target[name] = function (this: unknown, ...args: unknown[]): void {
      calls.push({ name, receiver: this, args });
    };
  }

  target.createBuffer = function (this: unknown): object {
    calls.push({ name: 'createBuffer', receiver: this, args: [] });

    return {};
  };

  target.createTexture = function (this: unknown): object {
    calls.push({ name: 'createTexture', receiver: this, args: [] });

    return {};
  };

  return { gl: target as unknown as WebGL2RenderingContext, target, calls };
};

const fakeGpu = () => {
  const calls: ApiCall[] = [];

  const record = (name: string) =>
    function (this: unknown, ...args: unknown[]): void {
      calls.push({ name, receiver: this, args });
    };

  const makePass = () => ({ setPipeline: record('setPipeline'), executeBundles: record('executeBundles') });
  const queue = {
    writeBuffer: record('writeBuffer'),
    writeTexture: record('writeTexture'),
    copyExternalImageToTexture: record('copyExternalImageToTexture'),
    submit: record('submit'),
  };
  const pipelinePromise = Promise.resolve({} as GPURenderPipeline);
  const target = {
    queue,
    createBuffer(this: unknown, ...args: unknown[]) {
      calls.push({ name: 'createBuffer', receiver: this, args });

      return { size: (args[0] as GPUBufferDescriptor).size, destroy: record('destroyBuffer') };
    },
    createTexture(this: unknown, ...args: unknown[]) {
      calls.push({ name: 'createTexture', receiver: this, args });

      return { destroy: record('destroyTexture') };
    },
    createCommandEncoder(this: unknown, ...args: unknown[]) {
      calls.push({ name: 'createCommandEncoder', receiver: this, args });

      return {
        beginRenderPass(this: unknown, ...passArgs: unknown[]) {
          calls.push({ name: 'beginRenderPass', receiver: this, args: passArgs });

          return makePass();
        },
        beginComputePass: () => makePass(),
      };
    },
    createRenderBundleEncoder: () => makePass(),
    createShaderModule: record('createShaderModule'),
    createRenderPipeline: record('createRenderPipeline'),
    createComputePipeline: record('createComputePipeline'),
    createRenderPipelineAsync: () => pipelinePromise,
    createComputePipelineAsync: () => pipelinePromise,
  };

  return { device: target as unknown as GPUDevice, target, calls, pipelinePromise };
};

describe('WebGL deep API metrics', () => {
  test('separates numeric buffer allocation from CPU uploads', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);

    gl.bufferData(0, 512, 0);
    expect(probe.counters.bufferAllocationCalls).toBe(1);
    expect(probe.counters.bufferAllocationBytes).toBe(512);
    expect(probe.counters.bufferUploadCalls).toBe(0);
    expect(probe.counters.bufferUploadBytes).toBe(0);
    probe.detach();
  });

  test('counts only the uploaded subview and typed-element range', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);
    const data = new Float32Array(new ArrayBuffer(80), 8, 10);

    gl.bufferData(0, data, 0, 2, 3);
    gl.bufferSubData(0, 128, data, 4, 2);
    expect(probe.counters.bufferUploadCalls).toBe(2);
    expect(probe.counters.bufferUploadBytes).toBe(20);
    expect(probe.counters.bufferAllocationCalls).toBe(1);
    expect(probe.counters.bufferAllocationBytes).toBe(12);
    probe.detach();
  });

  test('uses the remaining elements for WebGL2 zero or omitted length', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);
    const data = new Uint16Array(10);

    gl.bufferData(0, data, 0, 3, 0);
    gl.bufferSubData(0, 0, data, 4);
    expect(probe.counters.bufferAllocationBytes).toBe(14);
    expect(probe.counters.bufferUploadBytes).toBe(26);
    probe.detach();
  });

  test('applies WebGL2 GLuint conversion before interpreting a zero range length', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);

    gl.bufferData(0, new Uint16Array(10), 0, 3, 0.5);
    expect(probe.counters.bufferUploadBytes).toBe(14);
    expect(probe.counters.bufferAllocationBytes).toBe(14);
    probe.detach();
  });

  test('treats ArrayBuffer and DataView sizes as bytes', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);
    const view = new DataView(new ArrayBuffer(40), 8, 16);

    gl.bufferData(0, new ArrayBuffer(24), 0);
    gl.bufferSubData(0, 0, view, 3, 5);
    gl.bufferSubData(0, 0, view, 4, 0);
    expect(probe.counters.bufferUploadBytes).toBe(41);
    expect(probe.counters.bufferAllocationBytes).toBe(24);
    probe.detach();
  });

  test('keeps WebGL1 uploads whole when extra WebGL2 range arguments are ignored', () => {
    const target = { bufferSubData: () => undefined };
    const gl = target as unknown as WebGLRenderingContext;
    const probe = attachWebGlApiMetrics(gl);

    Reflect.apply(gl.bufferSubData, gl, [0, 0, new Float32Array(10), 2, 3]);
    expect(probe.counters.bufferUploadBytes).toBe(40);
    probe.detach();
  });

  test('records texture entry points and program work without fabricating texture bytes', () => {
    const { gl, target } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);

    for (const method of [
      'texImage2D',
      'texSubImage2D',
      'texImage3D',
      'texSubImage3D',
      'compressedTexImage2D',
      'compressedTexSubImage2D',
      'compressedTexImage3D',
      'compressedTexSubImage3D',
    ]) {
      (target[method] as () => void)();
    }

    gl.useProgram(null);
    gl.compileShader({} as WebGLShader);
    gl.linkProgram({} as WebGLProgram);
    expect(probe.counters.textureUploadCalls).toBe(8);
    expect(probe.counters.bufferUploadBytes).toBe(0);
    expect(probe.counters.programBinds).toBe(1);
    expect(probe.counters.shaderCompilations).toBe(1);
    expect(probe.counters.pipelineCreations).toBe(1);
    probe.detach();
  });

  test('counts each resource destruction once and ignores null handles', () => {
    const { gl } = fakeGl();
    const probe = attachWebGlApiMetrics(gl);
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();

    gl.deleteBuffer(buffer);
    gl.deleteBuffer(buffer);
    gl.deleteBuffer(null);
    gl.deleteTexture(texture);
    gl.deleteTexture(texture);
    gl.deleteTexture(null);
    expect(probe.counters.buffersCreated).toBe(1);
    expect(probe.counters.buffersDestroyed).toBe(1);
    expect(probe.counters.texturesCreated).toBe(1);
    expect(probe.counters.texturesDestroyed).toBe(1);
    probe.reset();
    gl.deleteBuffer(buffer);
    expect(probe.counters.buffersDestroyed).toBe(0);
    probe.detach();
  });

  test('forwards receiver, argument identities and return value unchanged', () => {
    const data = new Float32Array(4);
    const result = {};
    let seen: ApiCall | undefined;
    const target = {
      bufferData(this: unknown, ...args: unknown[]) {
        seen = { name: 'bufferData', receiver: this, args };

        return result;
      },
    };
    const probe = attachWebGlApiMetrics(target as unknown as WebGLRenderingContext);
    const receiver = {};

    expect(target.bufferData.call(receiver, 1, data, 2)).toBe(result);
    expect(seen?.receiver).toBe(receiver);
    expect(seen?.args[1]).toBe(data);
    expect(seen?.args).toEqual([1, data, 2]);
    probe.detach();
  });

  test('propagates the original exception without replacing it', () => {
    const failure = new Error('driver failure');
    const target = {
      bufferSubData() {
        throw failure;
      },
    };
    const probe = attachWebGlApiMetrics(target as unknown as WebGLRenderingContext);

    expect(() => target.bufferSubData()).toThrow(failure);
    probe.detach();
  });

  test('restores inherited methods and supports nested probes detached in reverse order', () => {
    const original = function (): void {
      /* no graphics work in this injected context */
    };

    const prototype = { bufferSubData: original };
    const gl = Object.create(prototype) as WebGLRenderingContext;
    const first = attachWebGlApiMetrics(gl);
    const second = attachWebGlApiMetrics(gl);

    gl.bufferSubData(0, 0, new Uint8Array(4));
    second.detach();
    gl.bufferSubData(0, 0, new Uint8Array(4));
    expect(first.counters.bufferUploadCalls).toBe(2);
    expect(second.counters.bufferUploadCalls).toBe(1);
    first.detach();
    first.detach();
    expect(Object.hasOwn(gl, 'bufferSubData')).toBe(false);
    expect(gl.bufferSubData).toBe(original);
  });
});

describe('WebGPU deep API metrics', () => {
  test('applies element-based writeBuffer offsets and sizes to typed subviews', () => {
    const { device } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);
    const data = new Float32Array(new ArrayBuffer(80), 8, 10);

    device.queue.writeBuffer({} as GPUBuffer, 64, data, 2, 3);
    device.queue.writeBuffer({} as GPUBuffer, 0, data, 2);
    device.queue.writeBuffer({} as GPUBuffer, 0, data, 2, 0);
    expect(probe.counters.bufferUploadCalls).toBe(3);
    expect(probe.counters.bufferUploadBytes).toBe(44);
    expect(probe.counters.bufferAllocationCalls).toBe(0);
    probe.detach();
  });

  test('uses byte ranges for ArrayBuffer, DataView and shared buffers', () => {
    const { device } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);

    device.queue.writeBuffer({} as GPUBuffer, 0, new ArrayBuffer(32), 4, 12);
    device.queue.writeBuffer({} as GPUBuffer, 0, new ArrayBuffer(32), 4);
    device.queue.writeBuffer({} as GPUBuffer, 0, new DataView(new ArrayBuffer(40), 8, 20), 4, 8);
    device.queue.writeBuffer({} as GPUBuffer, 0, new SharedArrayBuffer(16), 4, 8);
    expect(probe.counters.bufferUploadBytes).toBe(56);
    expect(probe.counters.bufferUploadCalls).toBe(4);
    probe.detach();
  });

  test('observes resource allocation and counts only the first destruction', () => {
    const { device } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);
    const buffer = device.createBuffer({ size: 256, usage: 0 });
    const texture = device.createTexture({ size: [2, 2], format: 'rgba8unorm', usage: 0 });

    buffer.destroy();
    buffer.destroy();
    texture.destroy();
    texture.destroy();
    expect(probe.counters.bufferAllocationCalls).toBe(1);
    expect(probe.counters.bufferAllocationBytes).toBe(256);
    expect(probe.counters.bufferUploadCalls).toBe(0);
    expect(probe.counters.buffersCreated).toBe(1);
    expect(probe.counters.buffersDestroyed).toBe(1);
    expect(probe.counters.texturesCreated).toBe(1);
    expect(probe.counters.texturesDestroyed).toBe(1);
    probe.detach();
  });

  test('reads the created buffer size without evaluating its descriptor getter again', () => {
    const { device } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);
    let reads = 0;
    const descriptor: GPUBufferDescriptor = {
      usage: 0,
      get size(): number {
        reads += 1;

        if (reads > 1) {
          throw new Error('size read twice');
        }

        return 16;
      },
    };

    expect(() => device.createBuffer(descriptor)).not.toThrow();
    expect(reads).toBe(1);
    expect(probe.counters.bufferAllocationBytes).toBe(16);
    probe.detach();
  });

  test('counts pass and bundle pipeline API calls without multiplying bundle execution', () => {
    const { device } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);
    const pipeline = {} as GPURenderPipeline;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });

    pass.setPipeline(pipeline);
    const bundle = device.createRenderBundleEncoder({ colorFormats: [] });

    bundle.setPipeline(pipeline);
    pass.executeBundles([{} as GPURenderBundle, {} as GPURenderBundle]);
    encoder.beginComputePass().setPipeline({} as GPUComputePipeline);
    device.queue.submit([]);
    expect(probe.counters.renderPasses).toBe(1);
    expect(probe.counters.pipelineBinds).toBe(3);
    expect(probe.counters.queueSubmits).toBe(1);
    probe.detach();
  });

  test('counts texture calls and shader/pipeline entry points while preserving async return identity', () => {
    const { device, pipelinePromise } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);

    device.queue.writeTexture({} as GPUTexelCopyTextureInfo, new Uint8Array(16), {}, [2, 2]);
    device.queue.copyExternalImageToTexture({} as GPUCopyExternalImageSourceInfo, {} as GPUCopyExternalImageDestInfo, [2, 2]);
    device.createShaderModule({ code: '' });
    device.createRenderPipeline({} as GPURenderPipelineDescriptor);
    device.createComputePipeline({} as GPUComputePipelineDescriptor);
    expect(device.createRenderPipelineAsync({} as GPURenderPipelineDescriptor)).toBe(pipelinePromise);
    expect(device.createComputePipelineAsync({} as GPUComputePipelineDescriptor)).toBe(pipelinePromise);
    expect(probe.counters.textureUploadCalls).toBe(2);
    expect(probe.counters.bufferUploadBytes).toBe(0);
    expect(probe.counters.shaderCompilations).toBe(1);
    expect(probe.counters.pipelineCreations).toBe(4);
    probe.detach();
  });

  test('forwards each WebGPU object receiver and arguments without changing object identity', () => {
    const { device, calls } = fakeGpu();
    const probe = attachWebGpuApiMetrics(device);
    const descriptor = { label: 'encoder' };
    const encoder = device.createCommandEncoder(descriptor);
    const passDescriptor = { colorAttachments: [] };
    const pass = encoder.beginRenderPass(passDescriptor);
    const pipeline = {} as GPURenderPipeline;

    pass.setPipeline(pipeline);
    expect(calls[0]?.receiver).toBe(device);
    expect(calls[0]?.args[0]).toBe(descriptor);
    expect(calls[1]?.receiver).toBe(encoder);
    expect(calls[1]?.args[0]).toBe(passDescriptor);
    expect(calls[2]?.receiver).toBe(pass);
    expect(calls[2]?.args[0]).toBe(pipeline);
    probe.detach();
  });

  test('reset preserves the counter object and detach disables already-created objects', () => {
    const { device, target, calls } = fakeGpu();
    const originalCreate = target.createCommandEncoder;
    const originalWrite = target.queue.writeBuffer;
    const probe = attachWebGpuApiMetrics(device);
    const counters = probe.counters;
    const buffer = device.createBuffer({ size: 16, usage: 0 });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [] });

    pass.setPipeline({} as GPURenderPipeline);
    probe.reset();
    expect(probe.counters).toBe(counters);
    expect(Object.values(counters).every(value => value === 0)).toBe(true);
    probe.detach();
    probe.detach();
    pass.setPipeline({} as GPURenderPipeline);
    encoder.beginRenderPass({ colorAttachments: [] }).setPipeline({} as GPURenderPipeline);
    buffer.destroy();
    device.queue.writeBuffer(buffer, 0, new Uint8Array(4));
    expect(Object.values(counters).every(value => value === 0)).toBe(true);
    expect(target.createCommandEncoder).toBe(originalCreate);
    expect(target.queue.writeBuffer).toBe(originalWrite);
    expect(calls.filter(call => call.name === 'destroyBuffer')).toHaveLength(1);
  });
});
