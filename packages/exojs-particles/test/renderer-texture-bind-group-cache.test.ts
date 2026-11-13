import { describe, expect, test, vi } from 'vitest';

import { WebGpuParticleRenderer } from '../src/renderers/WebGpuParticleRenderer';

interface CacheAccess {
  _device: unknown;
  _textureBindGroupLayout: unknown;
  _textureBindGroup(device: unknown, view: unknown, sampler: unknown): unknown;
}

/**
 * The per-draw texture bind group used to be created on every particle draw.
 * Its key is the resolved view and sampler - the view can be replaced by an
 * upload on any `getTextureBinding` call - so a repeat pair must reuse it.
 */
describe('WebGpuParticleRenderer texture bind groups', () => {
  test('reuses the bind group for an unchanged view and sampler', () => {
    const createBindGroup = vi.fn(() => ({}) as GPUBindGroup);
    const renderer = new WebGpuParticleRenderer() as unknown as CacheAccess;

    renderer._device = { createBindGroup };
    renderer._textureBindGroupLayout = {};

    const view = {};
    const sampler = {};
    const first = renderer._textureBindGroup(renderer._device, view, sampler);
    const second = renderer._textureBindGroup(renderer._device, view, sampler);

    expect(first).toBe(second);
    expect(createBindGroup).toHaveBeenCalledTimes(1);
  });

  test('draws through a new bind group after the view is replaced', () => {
    const createBindGroup = vi.fn(() => ({}) as GPUBindGroup);
    const renderer = new WebGpuParticleRenderer() as unknown as CacheAccess;

    renderer._device = { createBindGroup };
    renderer._textureBindGroupLayout = {};

    const sampler = {};
    const first = renderer._textureBindGroup(renderer._device, {}, sampler);
    const second = renderer._textureBindGroup(renderer._device, {}, sampler);

    expect(first).not.toBe(second);
    expect(createBindGroup).toHaveBeenCalledTimes(2);
  });
});
