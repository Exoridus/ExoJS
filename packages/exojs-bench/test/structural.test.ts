import { attachWebGl2Probe, attachWebGpuProbe, summarizeStructuralCounters } from '../src/rendering/structural';

const makeFakeGl = () => {
  const calls: string[] = [];

  return {
    calls,
    drawElements: () => calls.push('drawElements'),
    drawArrays: () => calls.push('drawArrays'),
    drawElementsInstanced: () => calls.push('drawElementsInstanced'),
    bindTexture: () => calls.push('bindTexture'),
    bufferSubData: () => calls.push('bufferSubData'),
    bufferData: () => calls.push('bufferData'),
    clear: () => calls.push('clear'),
  } as unknown as WebGL2RenderingContext & { calls: string[] };
};

describe('attachWebGl2Probe', () => {
  test('counts draw calls across all draw entry points', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawElements(0, 0, 0, 0);
    gl.drawArrays(0, 0, 0);
    gl.drawElementsInstanced(0, 0, 0, 0, 0);

    expect(probe.counters.drawCalls).toBe(3);
    probe.detach();
  });

  test('counts texture binds and buffer uploads separately', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.bindTexture(0, null);
    gl.bindTexture(0, null);
    gl.bufferSubData(0, 0, new Float32Array(1));
    gl.bufferData(0, new Float32Array(1), 0);

    expect(probe.counters.textureBinds).toBe(2);
    expect(probe.counters.bufferUploads).toBe(2);
    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('still forwards to the underlying implementation', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawArrays(0, 0, 0);

    expect(gl.calls).toEqual(['drawArrays']);
    probe.detach();
  });

  test('reset() zeroes the counters', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    gl.drawArrays(0, 0, 0);
    probe.reset();

    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('detach() restores the original methods (no double counting)', () => {
    const gl = makeFakeGl();
    const probe = attachWebGl2Probe(gl);

    probe.detach();
    gl.drawArrays(0, 0, 0);

    expect(probe.counters.drawCalls).toBe(0);
    expect(gl.calls).toEqual(['drawArrays']);
  });
});

/**
 * Fake WebGPU device graph mirroring the real submission chain: the device
 * mints a FRESH encoder per `createCommandEncoder`, and each encoder mints a
 * FRESH pass per `beginRenderPass` - exactly as real WebGPU (encoders and passes
 * are single-use), which is what lets the probe instrument each ephemeral object
 * once. Every terminal method appends to a shared `calls` log so tests can prove
 * the original was still invoked after counting.
 */
const makeFakeGpu = () => {
  const calls: string[] = [];

  const makePass = () =>
    ({
      draw: () => calls.push('draw'),
      drawIndexed: () => calls.push('drawIndexed'),
      drawIndirect: () => calls.push('drawIndirect'),
      drawIndexedIndirect: () => calls.push('drawIndexedIndirect'),
      setBindGroup: () => calls.push('setBindGroup'),
      executeBundles: () => calls.push('executeBundles'),
      end: () => calls.push('end'),
    }) as unknown as GPURenderPassEncoder;

  const makeEncoder = () =>
    ({
      beginRenderPass: () => {
        calls.push('beginRenderPass');

        return makePass();
      },
      finish: () => calls.push('finish'),
    }) as unknown as GPUCommandEncoder;

  const queue = {
    writeBuffer: () => calls.push('writeBuffer'),
    writeTexture: () => calls.push('writeTexture'),
    copyExternalImageToTexture: () => calls.push('copyExternalImageToTexture'),
    submit: () => calls.push('submit'),
  } as unknown as GPUQueue;

  const device = {
    queue,
    createRenderBundleEncoder: () => ({
      draw: () => calls.push('bundleDraw'),
      drawIndexed: () => calls.push('bundleDrawIndexed'),
      setBindGroup: () => calls.push('bundleSetBindGroup'),
      finish: () => ({}),
    }),
    createCommandEncoder: () => {
      calls.push('createCommandEncoder');

      return makeEncoder();
    },
  } as unknown as GPUDevice & { calls: string[] };

  (device as unknown as { calls: string[] }).calls = calls;

  return device as GPUDevice & { calls: string[] };
};

describe('attachWebGpuProbe', () => {
  test('counts external image uploads and restores the queue on detach', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);
    const copy = () =>
      device.queue.copyExternalImageToTexture({} as GPUCopyExternalImageSourceInfo, {} as GPUCopyExternalImageDestInfo, [1, 1]);

    copy();
    expect(probe.counters.bufferUploads).toBe(1);
    probe.detach();
    copy();
    expect(probe.counters.bufferUploads).toBe(1);
    expect(device.calls).toEqual(['copyExternalImageToTexture', 'copyExternalImageToTexture']);
  });

  test('counts draw calls across all draw entry points', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);

    const pass = device.createCommandEncoder().beginRenderPass({} as GPURenderPassDescriptor);

    pass.draw(3);
    pass.drawIndexed(6);
    pass.drawIndirect({} as GPUBuffer, 0);
    pass.drawIndexedIndirect({} as GPUBuffer, 0);

    expect(probe.counters.drawCalls).toBe(4);
    probe.detach();
  });

  test('counts bundle draws and binds each time the bundle executes', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);
    const encoder = device.createRenderBundleEncoder({ colorFormats: ['rgba8unorm'] });

    encoder.draw(3);
    encoder.drawIndexed(6);
    encoder.setBindGroup(0, {} as GPUBindGroup);
    const bundle = encoder.finish();

    expect(probe.counters.drawCalls).toBe(0);
    const pass = device.createCommandEncoder().beginRenderPass({} as GPURenderPassDescriptor);

    pass.executeBundles([bundle, bundle]);
    expect(probe.counters.drawCalls).toBe(4);
    expect(probe.counters.textureBinds).toBe(2);
    probe.reset();
    pass.executeBundles([bundle]);
    expect(probe.counters.drawCalls).toBe(2);
    expect(probe.counters.textureBinds).toBe(1);
    expect(device.calls.filter(call => call === 'executeBundles')).toHaveLength(2);
    probe.detach();
  });

  test('counts binds and uploads separately from draws', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);

    const pass = device.createCommandEncoder().beginRenderPass({} as GPURenderPassDescriptor);

    pass.setBindGroup(0, {} as GPUBindGroup);
    pass.setBindGroup(1, {} as GPUBindGroup);
    device.queue.writeBuffer({} as GPUBuffer, 0, new Float32Array(1));
    device.queue.writeTexture({} as GPUTexelCopyTextureInfo, new Float32Array(1), {}, { width: 1, height: 1 });

    expect(probe.counters.textureBinds).toBe(2);
    expect(probe.counters.bufferUploads).toBe(2);
    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('still forwards to the underlying implementation', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);

    const pass = device.createCommandEncoder().beginRenderPass({} as GPURenderPassDescriptor);

    pass.drawIndexed(6);
    device.queue.writeBuffer({} as GPUBuffer, 0, new Float32Array(1));

    expect(device.calls).toEqual(['createCommandEncoder', 'beginRenderPass', 'drawIndexed', 'writeBuffer']);
    probe.detach();
  });

  test('reset() zeroes the counters', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);

    device
      .createCommandEncoder()
      .beginRenderPass({} as GPURenderPassDescriptor)
      .draw(3);
    probe.reset();

    expect(probe.counters.drawCalls).toBe(0);
    probe.detach();
  });

  test('detach() restores the original methods (no double counting)', () => {
    const device = makeFakeGpu();
    const probe = attachWebGpuProbe(device);

    probe.detach();

    const pass = device.createCommandEncoder().beginRenderPass({} as GPURenderPassDescriptor);

    pass.draw(3);
    device.queue.writeBuffer({} as GPUBuffer, 0, new Float32Array(1));

    expect(probe.counters.drawCalls).toBe(0);
    expect(probe.counters.bufferUploads).toBe(0);
    expect(device.calls).toEqual(['createCommandEncoder', 'beginRenderPass', 'draw', 'writeBuffer']);
  });
});
describe('structural count units', () => {
  test('preserves raw observations when an exact per-frame count can be reported', () => {
    const totals = { drawCalls: 6, textureBinds: 9, bufferUploads: 3 };
    const result = summarizeStructuralCounters(totals, 3);

    totals.drawCalls = 0;
    expect(result.structural).toEqual({ drawCalls: 2, textureBinds: 3, bufferUploads: 1 });
    expect(result.structuralMeasurement).toEqual({
      schemaVersion: 1,
      basis: 'per-frame',
      frames: 3,
      totals: { drawCalls: 6, textureBinds: 9, bufferUploads: 3 },
    });
    expect(result.note).toBeNull();
  });

  test('labels uneven observations as totals rather than changing units silently', () => {
    const totals = { drawCalls: 7, textureBinds: 9, bufferUploads: 3 };
    const result = summarizeStructuralCounters(totals, 3);

    expect(result.structural).toEqual(totals);
    expect(result.structuralMeasurement).toMatchObject({ schemaVersion: 1, basis: 'total', frames: 3, totals });
    expect(result.note).toContain('raw totals');
  });
});
