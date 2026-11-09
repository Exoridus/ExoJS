import type { ApiCounters } from './telemetry';

/** API observations for a deep-profile window; byte counts describe requests, not VRAM residency. */
export interface DetailedApiProbe {
  readonly counters: ApiCounters;
  reset(): void;
  detach(): void;
}

const emptyCounters = (): ApiCounters => ({
  bufferUploadCalls: 0,
  bufferUploadBytes: 0,
  bufferAllocationCalls: 0,
  bufferAllocationBytes: 0,
  textureUploadCalls: 0,
  programBinds: 0,
  pipelineBinds: 0,
  renderPasses: 0,
  queueSubmits: 0,
  buffersCreated: 0,
  buffersDestroyed: 0,
  texturesCreated: 0,
  texturesDestroyed: 0,
  shaderCompilations: 0,
  pipelineCreations: 0,
});

type ApiObject = Record<string, unknown>;
type Observation = (args: readonly unknown[], result: unknown) => void;

interface Recorder {
  readonly probe: DetailedApiProbe;
  wrap(target: ApiObject, method: string, observe: Observation, persistent?: boolean): void;
}

/** Restore persistent API objects only; keeping encoder/pass restores would retain every frame. */
const createRecorder = (): Recorder => {
  const counters = emptyCounters();
  const restores: Array<() => void> = [];
  let active = true;

  return {
    probe: {
      counters,
      reset(): void {
        Object.assign(counters, emptyCounters());
      },
      detach(): void {
        active = false;

        while (restores.length > 0) {
          restores.pop()!();
        }
      },
    },
    wrap(target, method, observe, persistent = true): void {
      const original = target[method];

      if (typeof original !== 'function') {
        return;
      }

      const descriptor = Object.getOwnPropertyDescriptor(target, method);

      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        const result = Reflect.apply(original, this, args);

        if (active) {
          observe(args, result);
        }

        return result;
      };

      Object.defineProperty(
        target,
        method,
        descriptor !== undefined && 'value' in descriptor
          ? { ...descriptor, value: wrapped }
          : { configurable: true, enumerable: descriptor?.enumerable ?? false, writable: true, value: wrapped },
      );

      if (persistent) {
        restores.push(() => {
          if (descriptor === undefined) {
            delete target[method];
          } else {
            Object.defineProperty(target, method, descriptor);
          }
        });
      }
    },
  };
};

const isObject = (value: unknown): value is ApiObject => typeof value === 'object' && value !== null;

const unsignedInteger = (value: unknown, fallback = 0): number => {
  if (value === undefined) {
    return fallback;
  }

  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : Number.NaN;
};

/** Typed-array ranges use elements; DataView and raw (including shared) buffers use bytes. */
const sourceBytes = (source: unknown, offsetValue: unknown, lengthValue: unknown, zeroMeansRemaining: boolean): number => {
  if (!isObject(source)) {
    return 0;
  }

  const view = ArrayBuffer.isView(source);
  const tag = view ? '' : Object.prototype.toString.call(source);

  if (!view && tag !== '[object ArrayBuffer]' && tag !== '[object SharedArrayBuffer]') {
    return 0;
  }

  const elementSize = view && typeof source.BYTES_PER_ELEMENT === 'number' ? source.BYTES_PER_ELEMENT : 1;
  const elementCount = (source.byteLength as number) / elementSize;
  const offset = unsignedInteger(offsetValue);
  // WebGL's zero sentinel applies after WebIDL converts length to GLuint.
  const convertedLength = zeroMeansRemaining && typeof lengthValue === 'number' ? lengthValue >>> 0 : unsignedInteger(lengthValue);
  const length = lengthValue === undefined || (zeroMeansRemaining && convertedLength === 0) ? elementCount - offset : convertedLength;

  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset > elementCount || length < 0 || offset + length > elementCount) {
    return 0;
  }

  return length * elementSize;
};

const TEXTURE_UPLOAD_METHODS = [
  'texImage2D',
  'texSubImage2D',
  'texImage3D',
  'texSubImage3D',
  'compressedTexImage2D',
  'compressedTexSubImage2D',
  'compressedTexImage3D',
  'compressedTexSubImage3D',
] as const;

/**
 * Observe WebGL upload entry points, allocation requests and program work.
 * Texture calls include storage initialization; no transferred texture bytes are inferred.
 * Shader and pipeline counts are compileShader and linkProgram calls, not completed compilation.
 */
export const attachWebGlApiMetrics = (gl: WebGLRenderingContext | WebGL2RenderingContext): DetailedApiProbe => {
  const { probe, wrap } = createRecorder();
  const { counters } = probe;
  const target = gl as unknown as ApiObject;
  const subranges = typeof target.texImage3D === 'function';
  const destroyed = new WeakSet<object>();

  wrap(target, 'bufferData', args => {
    const source = args[1];
    const bytes =
      typeof source === 'number'
        ? unsignedInteger(source)
        : sourceBytes(source, subranges ? args[3] : undefined, subranges ? args[4] : undefined, true);

    counters.bufferAllocationCalls += 1;
    counters.bufferAllocationBytes += Number.isFinite(bytes) ? bytes : 0;

    if (isObject(source)) {
      counters.bufferUploadCalls += 1;
      counters.bufferUploadBytes += bytes;
    }
  });
  wrap(target, 'bufferSubData', args => {
    counters.bufferUploadCalls += 1;
    counters.bufferUploadBytes += sourceBytes(args[2], subranges ? args[3] : undefined, subranges ? args[4] : undefined, true);
  });

  for (const method of TEXTURE_UPLOAD_METHODS) {
    wrap(target, method, () => {
      counters.textureUploadCalls += 1;
    });
  }

  wrap(target, 'useProgram', () => {
    counters.programBinds += 1;
  });
  wrap(target, 'compileShader', () => {
    counters.shaderCompilations += 1;
  });
  wrap(target, 'linkProgram', () => {
    counters.pipelineCreations += 1;
  });

  for (const [create, destroy, created, deleted] of [
    ['createBuffer', 'deleteBuffer', 'buffersCreated', 'buffersDestroyed'],
    ['createTexture', 'deleteTexture', 'texturesCreated', 'texturesDestroyed'],
  ] as const) {
    wrap(target, create, (_args, result) => {
      if (isObject(result)) {
        counters[created] += 1;
      }
    });
    wrap(target, destroy, args => {
      const resource = args[0];

      if (isObject(resource) && !destroyed.has(resource)) {
        destroyed.add(resource);
        counters[deleted] += 1;
      }
    });
  }

  return probe;
};

/**
 * Observe WebGPU API calls without retaining encoders, passes or resource handles.
 * Destruction is observable for resources created while attached. Mapped-memory writes and GPU copies are not CPU upload observations.
 * Shader and pipeline counts are creation calls; asynchronous promises retain their identity and are not awaited.
 */
export const attachWebGpuApiMetrics = (device: GPUDevice): DetailedApiProbe => {
  const { probe, wrap } = createRecorder();
  const { counters } = probe;
  const target = device as unknown as ApiObject;
  const queue = device.queue as unknown as ApiObject;
  const instrumented = new WeakSet<object>();
  const destroyed = new WeakSet<object>();

  wrap(queue, 'writeBuffer', args => {
    counters.bufferUploadCalls += 1;
    counters.bufferUploadBytes += sourceBytes(args[2], args[3], args[4], false);
  });

  for (const method of ['writeTexture', 'copyExternalImageToTexture']) {
    wrap(queue, method, () => {
      counters.textureUploadCalls += 1;
    });
  }

  wrap(queue, 'submit', () => {
    counters.queueSubmits += 1;
  });
  wrap(target, 'createShaderModule', () => {
    counters.shaderCompilations += 1;
  });

  for (const method of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
    wrap(target, method, () => {
      counters.pipelineCreations += 1;
    });
  }

  const instrumentPipelineCommands = (result: unknown): void => {
    if (!isObject(result) || instrumented.has(result)) {
      return;
    }

    instrumented.add(result);
    wrap(
      result,
      'setPipeline',
      () => {
        counters.pipelineBinds += 1;
      },
      false,
    );
  };

  wrap(target, 'createCommandEncoder', (_args, result) => {
    if (!isObject(result) || instrumented.has(result)) {
      return;
    }

    instrumented.add(result);
    wrap(
      result,
      'beginRenderPass',
      (_passArgs, pass) => {
        counters.renderPasses += 1;
        instrumentPipelineCommands(pass);
      },
      false,
    );
    wrap(result, 'beginComputePass', (_passArgs, pass) => instrumentPipelineCommands(pass), false);
  });
  wrap(target, 'createRenderBundleEncoder', (_args, result) => instrumentPipelineCommands(result));

  for (const [create, created, deleted] of [
    ['createBuffer', 'buffersCreated', 'buffersDestroyed'],
    ['createTexture', 'texturesCreated', 'texturesDestroyed'],
  ] as const) {
    wrap(target, create, (_args, resource) => {
      if (!isObject(resource)) {
        return;
      }

      counters[created] += 1;

      if (create === 'createBuffer') {
        const bytes = unsignedInteger(resource.size);

        counters.bufferAllocationCalls += 1;
        counters.bufferAllocationBytes += Number.isFinite(bytes) ? bytes : 0;
      }

      if (!instrumented.has(resource)) {
        instrumented.add(resource);
        wrap(
          resource,
          'destroy',
          () => {
            if (!destroyed.has(resource)) {
              destroyed.add(resource);
              counters[deleted] += 1;
            }
          },
          false,
        );
      }
    });
  }

  return probe;
};
