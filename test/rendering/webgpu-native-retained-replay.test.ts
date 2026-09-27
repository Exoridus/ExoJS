import { describe, expect, it, vi } from 'vitest';

import type { WebGpuRetainedBatchPayload } from '#rendering/webgpu/retainedGroupResources';
import { WebGpuNativeRetainedReplay } from '#rendering/webgpu/WebGpuNativeRetainedReplay';
import type { WebGpuActiveRenderPass } from '#rendering/webgpu/WebGpuPassCoordinator';

const fixture = (count = 32) => {
  const encoder = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
    finish: vi.fn(() => ({})),
  };
  const device = { createRenderBundleEncoder: vi.fn(() => encoder) } as unknown as GPUDevice;
  const executeBundles = vi.fn();
  const activePass = { pass: { executeBundles }, stencilEnabled: false, depthWrites: false } as unknown as WebGpuActiveRenderPass;
  const owner = { instanceBuffer: {} as GPUBuffer };
  const payloads = Array.from({ length: count }, (_, byteOffset) => ({ bundle: owner, byteOffset }) as unknown as WebGpuRetainedBatchPayload);
  const args = {
    device,
    activePass,
    colorFormat: 'rgba8unorm' as GPUTextureFormat,
    pipeline: {} as GPURenderPipeline,
    group0: {} as GPUBindGroup,
    group1: {} as GPUBindGroup,
    indexBuffer: {} as GPUBuffer,
    indexFormat: 'uint16' as GPUIndexFormat,
    indexCount: 6,
    instanceCount: 2,
    group2: null as GPUBindGroup | null,
  };
  const cache = new WebGpuNativeRetainedReplay();
  const frame = { id: 0, remainingBuilds: 32 };
  const draw = (payload = payloads[0]!): boolean =>
    cache.draw(
      args.device,
      args.activePass,
      payload,
      args.colorFormat,
      args.pipeline,
      args.group0,
      args.group1,
      args.indexBuffer,
      args.indexFormat,
      args.indexCount,
      args.instanceCount,
      args.group2,
    );
  const replay = (id: number, budget = 32): boolean[] => {
    frame.id = id;
    frame.remainingBuilds = budget;
    cache.beginFrame(frame);
    return payloads.map(draw);
  };
  return { cache, frame, draw, replay, args, payloads, owner, encoder, executeBundles };
};

const observe = (f: ReturnType<typeof fixture>): void => {
  for (let id = 1; id <= 30; id++) expect(f.replay(id).every(native => !native)).toBe(true);
};

describe('WebGpuNativeRetainedReplay', () => {
  it('requires 32 batches and 30 complete prior stable frames', () => {
    const small = fixture(31);
    for (let id = 1; id <= 40; id++) expect(small.replay(id).some(Boolean)).toBe(false);
    const f = fixture();
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    expect(f.args.device.createRenderBundleEncoder).toHaveBeenCalledTimes(32);
    expect(f.replay(32, 0).every(Boolean)).toBe(true);
  });

  it('encodes the resource tuple once and reuses the same bundle array', () => {
    const f = fixture();
    f.args.group2 = {} as GPUBindGroup;
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    const bundles = f.executeBundles.mock.calls[0]![0];
    f.draw();
    expect(f.executeBundles).toHaveBeenLastCalledWith(bundles);
    expect(f.args.device.createRenderBundleEncoder).toHaveBeenCalledWith({ colorFormats: ['rgba8unorm'] });
    expect(f.encoder.setPipeline).toHaveBeenCalledWith(f.args.pipeline);
    expect(f.encoder.setBindGroup).toHaveBeenCalledWith(0, f.args.group0);
    expect(f.encoder.setBindGroup).toHaveBeenCalledWith(1, f.args.group1);
    expect(f.encoder.setBindGroup).toHaveBeenCalledWith(2, f.args.group2);
    expect(f.encoder.setVertexBuffer).toHaveBeenCalledWith(0, f.owner.instanceBuffer, 0);
    expect(f.encoder.setIndexBuffer).toHaveBeenCalledWith(f.args.indexBuffer, 'uint16');
    expect(f.encoder.drawIndexed).toHaveBeenCalledWith(6, 2);
  });

  it('shares a bounded build budget across owners', () => {
    const first = fixture();
    const second = fixture();
    observe(first);
    observe(second);
    const budget = { id: 31, remainingBuilds: 3 };
    first.cache.beginFrame(budget);
    second.cache.beginFrame(budget);
    expect(first.draw(first.payloads[0])).toBe(true);
    expect(second.draw(second.payloads[0])).toBe(true);
    expect(first.draw(first.payloads[1])).toBe(true);
    expect(second.draw(second.payloads[1])).toBe(false);
    expect(budget.remainingBuilds).toBe(0);
    expect(first.draw(first.payloads[0])).toBe(true);
  });

  it.each(['device', 'pipeline', 'group0', 'group1', 'group2', 'indexBuffer', 'indexFormat', 'indexCount', 'instanceCount', 'colorFormat'] as const)(
    'resets the whole group when %s changes within a frame',
    key => {
      const f = fixture();
      observe(f);
      expect(f.replay(31).every(Boolean)).toBe(true);
      const replacements = {
        device: { createRenderBundleEncoder: vi.fn() },
        pipeline: {},
        group0: {},
        group1: {},
        group2: {},
        indexBuffer: {},
        indexFormat: 'uint32',
        indexCount: 12,
        instanceCount: 4,
        colorFormat: 'bgra8unorm',
      };
      Object.assign(f.args, { [key]: replacements[key] });
      expect(f.draw()).toBe(false);
      expect(f.draw(f.payloads[1])).toBe(false);
    },
  );

  it.each(['buffer', 'offset'] as const)('resets when the payload %s changes', field => {
    const f = fixture();
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    if (field === 'buffer') f.owner.instanceBuffer = {} as GPUBuffer;
    else Object.assign(f.payloads[0]!, { byteOffset: 128 });
    expect(f.draw()).toBe(false);
    expect(f.draw(f.payloads[1])).toBe(false);
  });

  it.each(['stencilEnabled', 'depthWrites'] as const)('falls back and restarts observation for %s', field => {
    const f = fixture();
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    Object.assign(f.args.activePass, { [field]: true });
    expect(f.draw()).toBe(false);
    Object.assign(f.args.activePass, { [field]: false });
    expect(f.draw()).toBe(false);
  });

  it('restarts after a skipped frame, incomplete frame, or explicit invalidation', () => {
    const f = fixture();
    observe(f);
    expect(f.replay(32).some(Boolean)).toBe(false);
    for (let id = 33; id <= 62; id++) f.replay(id);
    expect(f.draw()).toBe(true);
    f.cache.beginFrame({ id: 63, remainingBuilds: 32 });
    f.draw();
    expect(f.replay(64).some(Boolean)).toBe(false);
    for (let id = 65; id <= 94; id++) f.replay(id);
    expect(f.draw()).toBe(true);
    f.cache.invalidate();
    expect(f.draw()).toBe(false);
  });

  it('restarts when a new batch appears after the initial observation frame', () => {
    const f = fixture();
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    expect(f.draw({ ...f.payloads[0]! })).toBe(false);
    expect(f.draw()).toBe(false);
  });

  it('counts each batch once when a frame repeats only one batch', () => {
    const f = fixture();
    for (let id = 1; id <= 29; id++) f.replay(id);
    f.cache.beginFrame({ id: 30, remainingBuilds: 32 });
    for (let repeat = 0; repeat < 32; repeat++) expect(f.draw()).toBe(false);
    expect(f.replay(31).some(Boolean)).toBe(false);
    expect(f.args.device.createRenderBundleEncoder).not.toHaveBeenCalled();
  });

  it('spreads promotion across frames without spending budget on cached batches', () => {
    const f = fixture(64);
    observe(f);
    expect(f.replay(31).filter(Boolean)).toHaveLength(32);
    expect(f.frame.remainingBuilds).toBe(0);
    expect(f.replay(32).filter(Boolean)).toHaveLength(64);
    expect(f.frame.remainingBuilds).toBe(0);
    expect(f.replay(33, 0).every(Boolean)).toBe(true);
    expect(f.args.device.createRenderBundleEncoder).toHaveBeenCalledTimes(64);
  });
  it('allows content changes and multiple passes with identical resources', () => {
    const f = fixture();
    observe(f);
    expect(f.replay(31).every(Boolean)).toBe(true);
    Object.assign(f.owner.instanceBuffer, { contents: 42 });
    const executeBundles = vi.fn();
    f.args.activePass = { ...f.args.activePass, pass: { executeBundles } as unknown as GPURenderPassEncoder };
    f.cache.beginFrame(f.frame);
    expect(f.draw()).toBe(true);
    expect(executeBundles).toHaveBeenCalledOnce();
    expect(f.args.device.createRenderBundleEncoder).toHaveBeenCalledTimes(32);
  });
});
