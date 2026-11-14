import { WebGpuStorageBuffer } from '#rendering/webgpu/compute/WebGpuStorageBuffer';

const withDevice = async (run: (device: GPUDevice) => Promise<void>): Promise<void> => {
  const adapter = await navigator.gpu.requestAdapter();

  if (adapter === null) {
    throw new Error('A WebGPU adapter is required.');
  }

  const device = await adapter.requestDevice();

  device.pushErrorScope('validation');

  try {
    await run(device);
    expect(await device.popErrorScope()).toBeNull();
  } finally {
    device.destroy();
  }
};

describe('WebGpuStorageBuffer native readback', () => {
  test('overlapping reads retain each submitted snapshot', async () => {
    await withDevice(async device => {
      const storage = new WebGpuStorageBuffer(device, 16);
      const first = new Uint32Array(4);
      const second = new Uint32Array(4);

      try {
        storage.write(new Uint32Array([1, 2, 3, 4]));
        const firstRead = storage.read(first);

        storage.write(new Uint32Array([5, 6, 7, 8]));
        const secondRead = storage.read(second);

        await Promise.all([firstRead, secondRead]);
        expect([...first]).toEqual([1, 2, 3, 4]);
        expect([...second]).toEqual([5, 6, 7, 8]);
      } finally {
        storage.destroy();
      }
    });
  });

  test('a caller-owned encoder copies only its recorded range before mapping', async () => {
    await withDevice(async device => {
      const storage = new WebGpuStorageBuffer(device, 16);
      const target = new Uint32Array(1);

      try {
        storage.write(new Uint32Array([11, 22, 33, 44]));
        const encoder = device.createCommandEncoder();
        const complete = storage.recordRead(encoder, target, 8);

        device.queue.submit([encoder.finish()]);
        await complete();
        expect([...target]).toEqual([33]);
      } finally {
        storage.destroy();
      }
    });
  });

  test('reusing staging slots preserves subsequent contents', async () => {
    await withDevice(async device => {
      const storage = new WebGpuStorageBuffer(device, 8);
      const target = new Uint32Array(2);

      try {
        for (let i = 1; i <= 4; i++) {
          storage.write(new Uint32Array([i, i + 10]));
          await storage.read(target);
          expect([...target]).toEqual([i, i + 10]);
        }
      } finally {
        storage.destroy();
      }
    });
  });
});
