import { RenderBackendType } from '#rendering/RenderBackendType';
import { AbstractWebGpuRenderer } from '#rendering/webgpu/AbstractWebGpuRenderer';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';

class ProbeRenderer extends AbstractWebGpuRenderer<never> {
  public connects = 0;
  public disconnects = 0;
  public failure: 'connect' | 'flush' | 'disconnect' | null = null;

  public render(): void {}

  public flush(): void {
    if (this.failure === 'flush') {
      throw new Error('flush failed');
    }
  }

  public connected(): boolean {
    return this.getBackendOrNull() !== null;
  }

  protected onConnect(): void {
    this.connects++;

    if (this.failure === 'connect') {
      throw new Error('connect failed');
    }
  }

  protected onDisconnect(): void {
    this.disconnects++;

    if (this.failure === 'disconnect') {
      throw new Error('disconnect failed');
    }
  }
}

const backend = { backendType: RenderBackendType.WebGpu } as unknown as WebGpuBackend;

test('failed connection can be retried', () => {
  const renderer = new ProbeRenderer();

  renderer.failure = 'connect';
  expect(() => renderer.connect(backend)).toThrow('connect failed');
  expect(renderer.connected()).toBe(false);
  renderer.failure = null;
  renderer.connect(backend);
  expect(renderer.connects).toBe(2);
  renderer.disconnect();
});

test.each(['flush', 'disconnect'] as const)('failed %s still disconnects and permits reconnection', failure => {
  const renderer = new ProbeRenderer();

  renderer.connect(backend);
  renderer.failure = failure;
  expect(() => renderer.disconnect()).toThrow(`${failure} failed`);
  expect(renderer.disconnects).toBe(1);
  expect(renderer.connected()).toBe(false);
  renderer.failure = null;
  renderer.connect(backend);
  expect(renderer.connects).toBe(2);
  renderer.disconnect();
});

test('failed sprite allocation releases buffers and rebuilds resources on retry', () => {
  vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2 });
  vi.stubGlobal('GPUBufferUsage', { UNIFORM: 1, COPY_DST: 2, INDEX: 4 });
  const buffers: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];
  const device = {
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createBuffer: vi.fn(() => {
      const buffer = { destroy: vi.fn() };

      buffers.push(buffer);

      return buffer;
    }),
    queue: {
      writeBuffer: vi.fn().mockImplementationOnce(() => {
        throw new Error('upload failed');
      }),
    },
  };
  const renderer = new WebGpuSpriteRenderer();
  const backend = { backendType: RenderBackendType.WebGpu, device } as unknown as WebGpuBackend;

  try {
    expect(() => renderer.connect(backend)).toThrow('upload failed');
    expect(buffers).toHaveLength(2);
    expect(buffers.every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
    renderer.connect(backend);
    expect(device.createShaderModule).toHaveBeenCalledTimes(2);
    expect(buffers).toHaveLength(4);
    renderer.disconnect();
    expect(buffers.every(buffer => buffer.destroy.mock.calls.length === 1)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('custom material dispose hook is registered once across reconnects and releases once per dispose', () => {
  const renderer = new WebGpuSpriteRenderer();
  const internals = renderer as unknown as {
    _backend: unknown;
    _customMaterials: Map<unknown, unknown>;
    _uniformBindGroupLayout: unknown;
    _customTextureBindGroupLayout: unknown;
    _buildUserBindGroupLayout: () => unknown;
    _releaseCustomResources: (resources: unknown) => void;
    _getOrCreateCustomResources(material: unknown, device: unknown): unknown;
  };
  const callbacks: Array<() => void> = [];
  const material = {
    shader: { _resolveWgsl: () => 'fn main() {}' },
    onDispose: (callback: () => void): void => {
      callbacks.push(callback);
    },
  };
  const device = { createPipelineLayout: () => ({}) };
  const release = vi.fn();

  const connect = (): void => {
    internals._backend = { _createShaderModule: () => ({}) };
    internals._uniformBindGroupLayout = {};
    internals._customTextureBindGroupLayout = {};
    internals._buildUserBindGroupLayout = () => ({});
    internals._releaseCustomResources = release;
  };

  connect();
  internals._getOrCreateCustomResources(material, device);
  internals._customMaterials.clear();
  connect();
  internals._getOrCreateCustomResources(material, device);

  expect(callbacks).toHaveLength(1);

  for (const callback of callbacks) {
    callback();
  }

  expect(release).toHaveBeenCalledTimes(1);

  callbacks.length = 0;
  internals._getOrCreateCustomResources(material, device);

  expect(callbacks).toHaveLength(1);

  callbacks[0]!();

  expect(release).toHaveBeenCalledTimes(2);
});

test('a throwing release still drops the cached custom material resources', () => {
  const renderer = new WebGpuSpriteRenderer();
  const internals = renderer as unknown as {
    _backend: unknown;
    _customMaterials: Map<unknown, unknown>;
    _uniformBindGroupLayout: unknown;
    _customTextureBindGroupLayout: unknown;
    _buildUserBindGroupLayout: () => unknown;
    _releaseCustomResources: (resources: unknown) => void;
    _getOrCreateCustomResources(material: unknown, device: unknown): unknown;
  };
  const callbacks: Array<() => void> = [];
  const material = {
    shader: { _resolveWgsl: () => 'fn main() {}' },
    onDispose: (callback: () => void): void => {
      callbacks.push(callback);
    },
  };
  const device = { createPipelineLayout: () => ({}) };

  internals._backend = { _createShaderModule: () => ({}) };
  internals._uniformBindGroupLayout = {};
  internals._customTextureBindGroupLayout = {};
  internals._buildUserBindGroupLayout = () => ({});

  internals._releaseCustomResources = () => {
    throw new Error('release failed');
  };

  const first = internals._getOrCreateCustomResources(material, device);

  expect(() => callbacks[0]!()).toThrow('release failed');
  expect(internals._customMaterials.has(material)).toBe(false);
  expect(internals._getOrCreateCustomResources(material, device)).not.toBe(first);
});
