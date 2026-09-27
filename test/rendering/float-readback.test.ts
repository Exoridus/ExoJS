import { Rectangle } from '#math/Rectangle';
import type { PixelDataType } from '#rendering/pixelPayload';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import { decodeFloat16, unpackPixelRows } from '#rendering/webgpu/unpackPixelRows';

import { createPixelReadbackDouble } from '../support/pixel-readback-double';
import { createRenderBackendDouble } from '../support/render-backend-double';

describe('float readback', () => {
  test('reports and rejects unavailable readback capabilities before allocation', async () => {
    const backend = createRenderBackendDouble();
    backend.supportsReadbackFormat = format => format === TextureFormat.Rgba8;
    const allocate = vi.spyOn(backend, 'createPixelReadback');
    const context = new RenderingContext(backend);
    const target = new RenderTexture(1, 1, { format: TextureFormat.Rgba32F });

    expect(context.supportsColorFormat(target.format)).toBe(true);
    expect(context.supportsReadbackFormat(target.format)).toBe(false);
    await expect(context.readPixels(target, { dataType: 'float32' })).rejects.toThrow(/on this backend/);
    expect(() => context.createPixelReader(target, { dataType: 'float32' })).toThrow(/on this backend/);
    expect(allocate).not.toHaveBeenCalled();
  });

  test.each([TextureFormat.Rgba16F, TextureFormat.Rgba32F] as const)('float reader reuses held storage and follows resize for %s', format => {
    const backend = createRenderBackendDouble();
    const readbacks: Array<ReturnType<typeof createPixelReadbackDouble<'uint8' | 'float32'>>> = [];
    backend.createPixelReadback = (<T extends PixelDataType = 'uint8'>(
      _source: RenderTexture,
      _x: number,
      _y: number,
      width: number,
      height: number,
      slots: number,
      dataType: T = 'uint8' as T,
    ) => {
      const readback = createPixelReadbackDouble(width, height, slots, dataType);
      readbacks.push(readback);
      return readback;
    }) as RenderBackend['createPixelReadback'];
    const context = new RenderingContext(backend);
    const target = new RenderTexture(3, 2, { format });
    const reader = context.createPixelReader(target, { dataType: 'float32', slots: 1 });
    const first = reader.request()!;

    expect(first.data).toBeNull();
    readbacks[0]!.settle(-2.5);
    const payload = first.data!.data;
    expect(payload).toBeInstanceOf(Float32Array);
    expect(payload[0]).toBe(-2.5);
    first.release();
    const second = reader.request()!;
    expect(second).toBe(first);
    readbacks[0]!.settle(3.5);
    expect(second.data!.data).toBe(payload);
    expect(payload[0]).toBe(3.5);
    target.resize(1, 1);
    const resized = reader.request()!;
    expect(second.failed).toBe(true);
    readbacks[1]!.settle(-4);
    expect(resized.data!.data).toEqual(new Float32Array(4).fill(-4));
    resized.release();
    reader.destroy();
    target.destroy();
  });
  test.each([TextureFormat.Rgba16F, TextureFormat.Rgba32F] as const)('accepts explicit float payloads from %s', async format => {
    const backend = createRenderBackendDouble();
    const payload = new Float32Array([-2, 4, 0.5, 1]);
    const readPixels = vi.fn().mockResolvedValue(payload);
    const context = new RenderingContext({ ...backend, readPixels });
    const target = new RenderTexture(3, 2, { format });
    const result = await context.readPixels(target, { dataType: 'float32', region: new Rectangle(1, 1, 1, 1) });

    expect(result).toEqual({ width: 1, height: 1, data: payload });
    expect(readPixels).toHaveBeenCalledWith(target, 1, 1, 1, 1, 'float32');
  });

  test('binary16 expands signed zero, subnormals, extrema and non-finite values', () => {
    expect(Object.is(decodeFloat16(0), 0)).toBe(true);
    expect(Object.is(decodeFloat16(0x8000), -0)).toBe(true);
    expect(decodeFloat16(1)).toBe(2 ** -24);
    expect(decodeFloat16(0x8001)).toBe(-(2 ** -24));
    expect(decodeFloat16(0x3ff)).toBe(1023 * 2 ** -24);
    expect(decodeFloat16(0x400)).toBe(2 ** -14);
    expect(decodeFloat16(0x7bff)).toBe(65504);
    expect(decodeFloat16(0xfbff)).toBe(-65504);
    expect(decodeFloat16(0x7c00)).toBe(Infinity);
    expect(decodeFloat16(0xfc00)).toBe(-Infinity);
    expect(decodeFloat16(0x7c01)).toBeNaN();
    expect(decodeFloat16(0xffff)).toBeNaN();
  });

  test.each([TextureFormat.Rgba16F, TextureFormat.Rgba32F] as const)('unpacks padded %s rows into existing float storage', format => {
    const mapped = new ArrayBuffer(512);
    const view = new DataView(mapped);
    const output = new Float32Array(8);
    for (let channel = 0; channel < 4; channel++) {
      if (format === TextureFormat.Rgba16F) {
        view.setUint16(channel * 2, 0xc100, true);
        view.setUint16(256 + channel * 2, 0x4300, true);
      } else {
        view.setFloat32(channel * 4, -2.5, true);
        view.setFloat32(256 + channel * 4, 3.5, true);
      }
    }
    unpackPixelRows(mapped, output, 1, 2, 256, format);
    expect(output).toEqual(new Float32Array([-2.5, -2.5, -2.5, -2.5, 3.5, 3.5, 3.5, 3.5]));
  });

  test('rejects mismatched formats before reaching the backend', async () => {
    const backend = createRenderBackendDouble();
    const readPixels = vi.spyOn(backend, 'readPixels');
    const context = new RenderingContext(backend);
    const bytes = new RenderTexture(2, 2);
    const floats = new RenderTexture(2, 2, { format: TextureFormat.Rgba32F });

    await expect(context.readPixels(bytes, { dataType: 'float32' })).rejects.toThrow(/rgba8/);
    await expect(context.readPixels(floats)).rejects.toThrow(/rgba32f/);
    expect(() => context.createPixelReader(bytes, { dataType: 'float32' })).toThrow(/rgba8/);
    expect(readPixels).not.toHaveBeenCalled();
  });
});
