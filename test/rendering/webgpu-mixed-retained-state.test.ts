import { describe, expect, test, vi } from 'vitest';

import { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuRetainedGroupBundle } from '#rendering/webgpu/WebGpuRetainedGroupBundle';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';

import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

interface ReplayState {
  uniformBuffer: GPUBuffer | null;
  flushRowPatches?(): void;
}

describe('mixed retained renderer state ownership', () => {
  test.each([true, false])('keeps both renderer states until device invalidation (destroy buffers: %s)', async destroyBuffers => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const bundle = new WebGpuRetainedGroupBundle(new GpuResourceAccountant(backend.stats), () => {});
      const mesh = new WebGpuMeshRenderer();
      const text = new WebGpuTextRenderer();
      const getMesh = (): ReplayState =>
        (mesh as unknown as { _getMeshReplayState(bundle: WebGpuRetainedGroupBundle): ReplayState })._getMeshReplayState(bundle);
      const getText = (): ReplayState =>
        (text as unknown as { _getTextReplayState(bundle: WebGpuRetainedGroupBundle, device: GPUDevice): ReplayState })._getTextReplayState(
          bundle,
          backend.device,
        );
      const meshState = getMesh();
      meshState.uniformBuffer = backend.device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM });
      const meshDestroy = vi.spyOn(meshState.uniformBuffer, 'destroy');
      const textState = getText();
      const textDestroy = vi.spyOn(textState.uniformBuffer!, 'destroy');
      const meshPatches = vi.fn();
      meshState.flushRowPatches = meshPatches;
      const textPatches = vi.spyOn(textState, 'flushRowPatches');
      const allocations = environment.createBufferLabels().length;
      bundle._recordTransformRowRange(backend.device, 0, 0);

      for (let frame = 0; frame < 10; frame++) {
        expect(getMesh()).toBe(meshState);
        expect(getText()).toBe(textState);
        bundle.flushRowPatches();
      }

      expect(environment.createBufferLabels()).toHaveLength(allocations);
      expect(meshDestroy).not.toHaveBeenCalled();
      expect(textDestroy).not.toHaveBeenCalled();
      expect(meshPatches).toHaveBeenCalledTimes(10);
      expect(textPatches).toHaveBeenCalledTimes(10);
      bundle.invalidateDeviceState(destroyBuffers);
      expect(meshDestroy).toHaveBeenCalledTimes(1);
      expect(textDestroy).toHaveBeenCalledTimes(1);
      expect(getMesh()).not.toBe(meshState);
      expect(getText()).not.toBe(textState);
      bundle.destroy();
      bundle.destroy();
      expect(meshDestroy).toHaveBeenCalledTimes(1);
      expect(textDestroy).toHaveBeenCalledTimes(1);
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
