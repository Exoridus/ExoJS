import { WebGpuStorageBuffer } from '#rendering/webgpu/compute/WebGpuStorageBuffer';

interface TestBuffer {
  bytes: Uint8Array<ArrayBuffer>;
  destroyed: boolean;
  pending: boolean;
  mapped: boolean;
  finishMap(error?: Error): void;
  destroy(): void;
  mapAsync(): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

const createDevice = (): {
  device: GPUDevice;
  buffers: TestBuffer[];
  submissions: number;
} => {
  const buffers: TestBuffer[] = [];
  const state = { device: null as unknown as GPUDevice, buffers, submissions: 0 };

  state.device = {
    createBuffer: ({ size }: GPUBufferDescriptor): GPUBuffer => {
      let settle: { resolve(): void; reject(error: Error): void } | null = null;
      const buffer: TestBuffer = {
        bytes: new Uint8Array(size),
        destroyed: false,
        pending: false,
        mapped: false,
        finishMap(error?: Error): void {
          const pending = settle;

          settle = null;
          buffer.pending = false;

          if (error !== undefined) {
            pending?.reject(error);
          } else {
            buffer.mapped = true;
            pending?.resolve();
          }
        },
        mapAsync: vi.fn((): Promise<void> => {
          if (buffer.pending || buffer.mapped || buffer.destroyed) {
            return Promise.reject(new Error('buffer unavailable for mapping'));
          }

          buffer.pending = true;

          return new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
          });
        }),
        getMappedRange: (offset = 0, size = buffer.bytes.byteLength - offset): ArrayBuffer => {
          if (!buffer.mapped) {
            throw new Error('buffer is not mapped');
          }

          return buffer.bytes.buffer.slice(offset, offset + size);
        },
        unmap: vi.fn((): void => {
          buffer.mapped = false;
        }),
        destroy: vi.fn((): void => {
          buffer.destroyed = true;
          buffer.finishMap(new Error('buffer destroyed'));
        }),
      };

      buffers.push(buffer);

      return buffer as unknown as GPUBuffer;
    },
    createCommandEncoder: (): GPUCommandEncoder => {
      const copies: Array<() => void> = [];

      return {
        copyBufferToBuffer: (source: TestBuffer, sourceOffset: number, target: TestBuffer, targetOffset: number, size: number): void => {
          copies.push(() => {
            target.bytes.set(source.bytes.subarray(sourceOffset, sourceOffset + size), targetOffset);
          });
        },
        finish: (): Array<() => void> => copies,
      } as unknown as GPUCommandEncoder;
    },
    queue: {
      submit: (commands: Array<Array<() => void>>): void => {
        state.submissions++;

        for (const command of commands) {
          for (const copy of command) {
            copy();
          }
        }
      },
    },
  } as unknown as GPUDevice;

  return state;
};

beforeEach(() => {
  vi.stubGlobal('GPUBufferUsage', { STORAGE: 128, COPY_DST: 8, COPY_SRC: 4, MAP_READ: 1 });
  vi.stubGlobal('GPUMapMode', { READ: 1 });
});

afterEach(() => vi.unstubAllGlobals());

describe('WebGpuStorageBuffer readback ownership', () => {
  test('overlapping reads retain the bytes of their own submitted copies', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    const first = new Uint8Array(8);
    const second = new Uint8Array(8);

    buffers[0]!.bytes.fill(1);
    const firstRead = storage.read(first);
    buffers[0]!.bytes.fill(2);
    const secondRead = storage.read(second);

    expect(buffers).toHaveLength(3);
    buffers[1]!.finishMap();
    buffers[2]!.finishMap();
    await Promise.all([firstRead, secondRead]);

    expect([...first]).toEqual(Array(8).fill(1));
    expect([...second]).toEqual(Array(8).fill(2));
    storage.destroy();
  });

  test('a foreign encoder is not mapped until its completion callback is called after submission', async () => {
    const host = createDevice();
    const storage = new WebGpuStorageBuffer(host.device, 16);
    const target = new Uint8Array(12).subarray(4, 8);
    const encoder = host.device.createCommandEncoder();

    host.buffers[0]!.bytes.set([1, 2, 3, 4], 8);
    const complete = storage.recordRead(encoder, target, 8);

    expect(host.submissions).toBe(0);
    expect(host.buffers[1]!.pending).toBe(false);
    host.device.queue.submit([encoder.finish()]);
    const firstCompletion = complete();
    const secondCompletion = complete();

    expect(firstCompletion).toBe(secondCompletion);
    host.buffers[1]!.finishMap();
    await firstCompletion;
    expect([...target]).toEqual([1, 2, 3, 4]);
    expect([...new Uint8Array(target.buffer).subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    storage.destroy();
  });

  test('only the requested subrange is copied and accounted', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 16);
    const onReadback = vi.fn();
    const target = new Uint8Array(4);

    storage.onReadback = onReadback;
    buffers[0]!.bytes.set([5, 6, 7, 8], 4);
    const read = storage.read(target, 4);

    buffers[1]!.finishMap();
    await read;
    expect([...target]).toEqual([5, 6, 7, 8]);
    expect(onReadback).toHaveBeenCalledExactlyOnceWith(4);
    storage.destroy();
  });

  test('the staging pool is bounded and completed slots can be reused', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    const reads = Array.from({ length: 3 }, () => storage.read(new Uint8Array(8)));

    await expect(storage.read(new Uint8Array(8))).rejects.toThrow(/capacity/i);
    expect(buffers).toHaveLength(4);

    for (const buffer of buffers.slice(1)) {
      buffer.finishMap();
    }

    await Promise.all(reads);
    const next = storage.read(new Uint8Array(8));

    expect(buffers).toHaveLength(4);
    buffers[1]!.finishMap();
    await next;
    storage.destroy();
  });

  test('a failed map releases its slot for a later read', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    const failure = storage.read(new Uint8Array(8));
    const assertion = failure.catch((error: unknown) => error);

    buffers[1]!.finishMap(new Error('device lost'));
    expect(await assertion).toMatchObject({ message: 'device lost' });
    const recovery = storage.read(new Uint8Array(8));

    buffers.at(-1)!.finishMap();
    await recovery;
    storage.destroy();
  });

  test('destroy releases pending and unsubmitted staging buffers and prevents later reads', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    const pending = storage.read(new Uint8Array(8));
    const failure = pending.catch((error: unknown) => error);
    const complete = storage.recordRead(device.createCommandEncoder(), new Uint8Array(8));

    storage.destroy();
    expect(await failure).toMatchObject({ message: 'buffer destroyed' });
    await expect(complete()).rejects.toThrow(/destroyed/i);
    await expect(storage.read(new Uint8Array(8))).rejects.toThrow(/destroyed/i);
    expect(buffers.every(buffer => buffer.destroyed)).toBe(true);
  });

  test('submission and recording failures release their staging reservations', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);

    vi.spyOn(device.queue, 'submit').mockImplementationOnce(() => {
      throw new Error('submission failed');
    });
    await expect(storage.read(new Uint8Array(8))).rejects.toThrow('submission failed');
    const encoder = device.createCommandEncoder();

    vi.spyOn(encoder, 'copyBufferToBuffer').mockImplementationOnce(() => {
      throw new Error('recording failed');
    });
    expect(() => storage.recordRead(encoder, new Uint8Array(8))).toThrow('recording failed');
    const read = storage.read(new Uint8Array(8));

    expect(buffers).toHaveLength(2);
    buffers[1]!.finishMap();
    await read;
    storage.destroy();
  });

  test('an empty target performs no GPU work', async () => {
    const host = createDevice();
    const storage = new WebGpuStorageBuffer(host.device, 8);

    await storage.read(new Uint8Array(0));
    await storage.recordRead(host.device.createCommandEncoder(), new Uint8Array(0))();
    expect(host.buffers).toHaveLength(1);
    expect(host.submissions).toBe(0);
    storage.destroy();
  });

  test('a detached target rejects and frees its staging slot', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    const target = new Uint8Array(8);
    const complete = storage.recordRead(device.createCommandEncoder(), target);

    structuredClone(target.buffer, { transfer: [target.buffer] });
    const completion = complete();
    const failure = completion.catch((error: unknown) => error);

    buffers[1]!.finishMap();
    expect(await failure).toMatchObject({ name: 'TypeError' });
    const next = storage.read(new Uint8Array(8));

    expect(buffers).toHaveLength(2);
    buffers[1]!.finishMap();
    await next;
    storage.destroy();
  });
  test('an out-of-bounds resized target cannot receive bytes in a different range', async () => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);
    // The test type library predates resizable ArrayBuffers.
    const backing = Reflect.construct(ArrayBuffer, [16, { maxByteLength: 32 }]) as ArrayBuffer & { resize(byteLength: number): void };
    const target = new Uint8Array(backing, 8, 8);
    const complete = storage.recordRead(device.createCommandEncoder(), target);

    backing.resize(8);
    const failure = complete().catch((error: unknown) => error);

    buffers[1]!.finishMap();
    expect(await failure).toMatchObject({ name: 'TypeError' });
    expect([...new Uint8Array(backing)]).toEqual(Array(8).fill(0));
    storage.destroy();
  });
  test.each([
    [new Uint8Array(4), -4],
    [new Uint8Array(4), 2],
    [new Uint8Array(4), 6],
    [new Uint8Array(3), 0],
    [new Uint8Array(12), 0],
  ])('rejects unaligned or out-of-range reads without allocating staging', async (target, offset) => {
    const { device, buffers } = createDevice();
    const storage = new WebGpuStorageBuffer(device, 8);

    await expect(storage.read(target, offset)).rejects.toThrow(RangeError);
    expect(buffers).toHaveLength(1);
    storage.destroy();
  });
});
