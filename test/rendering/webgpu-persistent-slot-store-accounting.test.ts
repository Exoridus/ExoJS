import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { createRenderStats } from '#rendering/RenderStats';
import { persistentUniformBytes, WebGpuPersistentSlotStore } from '#rendering/webgpu/WebGpuPersistentSlotStore';

describe('WebGpuPersistentSlotStore accounting', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: { UNIFORM: 64, COPY_DST: 8, STORAGE: 128 } });
  });

  afterEach(() => {
    if (previous) {
      Object.defineProperty(globalThis, 'GPUBufferUsage', previous);
    } else {
      Object.defineProperty(globalThis, 'GPUBufferUsage', { configurable: true, value: undefined });
    }
  });

  const makeDevice = (): GPUDevice => ({ createBuffer: () => ({ destroy: () => {} }) }) as unknown as GPUDevice;

  test('counts the uniform buffer from connection and releases it with the store', () => {
    const accountant = new GpuResourceAccountant(createRenderStats());
    const store = new WebGpuPersistentSlotStore();
    const device = makeDevice();

    store.connectDevice(device, accountant);
    expect(accountant.liveBytes).toBe(persistentUniformBytes);

    store.connectDevice(device, accountant);
    expect(accountant.liveBytes).toBe(persistentUniformBytes);

    store.destroy();
    expect(accountant.liveBytes).toBe(0);
  });
});
