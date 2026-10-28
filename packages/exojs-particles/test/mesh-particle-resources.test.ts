/// <reference types="@webgpu/types" />

import { Geometry, type Material } from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParticleSystem } from '../src/ParticleSystem';
import { WebGpuParticleRenderer } from '../src/renderers/WebGpuParticleRenderer';
import { MeshParticles } from '../src/renderModes/MeshParticles';

interface BufferDouble {
  readonly size: number;
  readonly bytes: Uint8Array;
  destroy(): void;
}

interface Resources {
  meshBuffer: GPUBuffer;
  indexBuffer: GPUBuffer | null;
  indexCount: number;
}

interface RendererInternals {
  _createResources(mode: MeshParticles, material: Material, device: GPUDevice): Resources;
  _syncMeshBuffer(device: GPUDevice, resources: Resources, mode: MeshParticles): void;
  _destroyResources(resources: Resources): void;
}

const createDevice = (): GPUDevice =>
  ({
    createShaderModule: () => ({}),
    createBuffer: ({ size }: GPUBufferDescriptor): BufferDouble => ({ size, bytes: new Uint8Array(size), destroy: vi.fn() }),
    queue: {
      writeBuffer(buffer: BufferDouble, offset: number, source: ArrayBuffer, sourceOffset: number, size: number): void {
        expect(offset + size).toBeLessThanOrEqual(buffer.size);
        expect(size % 4).toBe(0);
        buffer.bytes.set(new Uint8Array(source, sourceOffset, size), offset);
      },
    },
  }) as unknown as GPUDevice;

describe('mutable particle mesh GPU resources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('grows before upload, keeps current nonindexed draw counts and reuses capacity on shrink', () => {
    vi.stubGlobal('GPUBufferUsage', { VERTEX: 32, INDEX: 16, COPY_DST: 8 });

    const geometry = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 16, 0, 0, 16]),
      stride: 8,
    });
    const mode = new MeshParticles({ geometry });
    const system = new ParticleSystem({ capacity: 1 });
    const renderer = new WebGpuParticleRenderer() as unknown as RendererInternals;
    const device = createDevice();
    const resources = renderer._createResources(mode, mode.material, device);
    const first = resources.meshBuffer;

    geometry.vertexData = new Float32Array([0, 0, 32, 0, 32, 32, 0, 32]);
    geometry.invalidate();
    mode.build(system, system._storage);
    renderer._syncMeshBuffer(device, resources, mode);

    expect(resources.meshBuffer.size).toBeGreaterThanOrEqual(64);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(resources.indexCount).toBe(4);

    const grown = resources.meshBuffer;

    geometry.vertexData = new Float32Array([0, 0, 8, 0, 0, 8]);
    geometry.invalidate();
    mode.build(system, system._storage);
    renderer._syncMeshBuffer(device, resources, mode);

    expect(resources.meshBuffer).toBe(grown);
    expect(resources.indexCount).toBe(3);

    renderer._destroyResources(resources);
    mode.destroy();
    geometry.destroy();
    system.destroy();
  });

  it('uploads in-place index edits even when the count is unchanged', () => {
    vi.stubGlobal('GPUBufferUsage', { VERTEX: 32, INDEX: 16, COPY_DST: 8 });

    const geometry = new Geometry({
      attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
      vertexData: new Float32Array([0, 0, 16, 0, 0, 16]),
      stride: 8,
      indices: new Uint16Array([0, 1, 2]),
    });
    const mode = new MeshParticles({ geometry });
    const system = new ParticleSystem({ capacity: 1 });
    const renderer = new WebGpuParticleRenderer() as unknown as RendererInternals;
    const device = createDevice();
    const resources = renderer._createResources(mode, mode.material, device);

    geometry.indices!.set([2, 1, 0]);
    geometry.invalidate();
    mode.build(system, system._storage);
    renderer._syncMeshBuffer(device, resources, mode);

    const bytes = (resources.indexBuffer as unknown as BufferDouble).bytes;

    expect(Array.from(new Uint16Array(bytes.buffer, 0, 3))).toEqual([2, 1, 0]);

    renderer._destroyResources(resources);
    mode.destroy();
    geometry.destroy();
    system.destroy();
  });
});
