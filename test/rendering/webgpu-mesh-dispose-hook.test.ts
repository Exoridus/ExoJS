import { expect, test, vi } from 'vitest';

import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';

test('custom material dispose hook is registered once across reconnects and releases once per dispose', () => {
  vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 });

  try {
    const release = vi.fn();
    const renderer = Object.create(WebGpuMeshRenderer.prototype) as {
      _customShaders: Map<unknown, unknown>;
      _disposeHooked: WeakSet<object>;
      _device: unknown;
      _instancedTransformBindGroupLayout: unknown;
      _buildUserBindGroupLayout: () => unknown;
      _releaseCustomShaderResources: (resources: unknown) => void;
      getBackend: () => unknown;
      _getOrCreateCustomShaderResources(material: unknown): unknown;
    };

    renderer._customShaders = new Map();
    renderer._disposeHooked = new WeakSet();
    renderer._device = { createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}) };
    renderer._instancedTransformBindGroupLayout = {};
    renderer._buildUserBindGroupLayout = () => ({});
    renderer._releaseCustomShaderResources = release;
    renderer.getBackend = () => ({ _createShaderModule: () => ({}) });

    const callbacks: Array<() => void> = [];
    const material = {
      shader: { _resolveWgsl: () => 'fn main() {}' },
      onDispose: (callback: () => void): void => {
        callbacks.push(callback);
      },
    };

    renderer._getOrCreateCustomShaderResources(material);
    renderer._customShaders.clear();
    const second = renderer._getOrCreateCustomShaderResources(material);

    expect(callbacks).toHaveLength(1);

    callbacks[0]!();

    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]![0]).toBe(second);

    callbacks.length = 0;
    const third = renderer._getOrCreateCustomShaderResources(material);

    expect(callbacks).toHaveLength(1);

    callbacks[0]!();

    expect(release).toHaveBeenCalledTimes(2);
    expect(release.mock.calls[1]![0]).toBe(third);
  } finally {
    vi.unstubAllGlobals();
  }
});
