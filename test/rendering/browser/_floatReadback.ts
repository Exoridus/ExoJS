import { expect } from 'vitest';

import { Rectangle } from '#math/Rectangle';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { type ColorTextureFormat, TextureFormat } from '#rendering/types';

import { driveUntilSettled } from './_pixelReaderDrive';

const shader = createFilterShader({
  glsl: {
    fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(floor(gl_FragCoord.x) - 2.5, 2.0 - floor(gl_FragCoord.y) + 2.25, -0.5, 1.0);
}`,
  },
  wgsl: `@fragment fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(floor(position.x) - 2.5, floor(position.y) + 2.25, -0.5, 1.0);
}`,
});

export const checkFloatReadback = async (backend: RenderBackend, format: ColorTextureFormat): Promise<void> => {
  const context = new RenderingContext(backend);
  const target = new RenderTexture(19, 3, { format });
  const input = new RenderTexture(1, 1);
  const filter = ShaderFilter.from(shader);
  const reader = context.createPixelReader(target, { dataType: 'float32', region: new Rectangle(1, 1, 17, 2), slots: 1 });
  const transferBytes = backend.backendType === RenderBackendType.WebGl2 || format === TextureFormat.Rgba32F ? 16 : 8;
  const check = (data: Float32Array, width: number, height: number, x: number, y: number): void => {
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        expect(Array.from(data.subarray((row * width + col) * 4, (row * width + col + 1) * 4))).toEqual([col + x - 2.5, row + y + 2.25, -0.5, 1]);
      }
    }
  };

  try {
    filter.apply(backend, input, target);
    backend.resetStats();
    const full = await context.readPixels(target, { dataType: 'float32' });
    check(full.data, 19, 3, 0, 0);
    expect(backend.stats.downloadBytes).toBe(19 * 3 * transferBytes);
    const region = await context.readPixels(target, { dataType: 'float32', region: new Rectangle(1, 1, 17, 2) });
    check(region.data, 17, 2, 1, 1);
    const read = reader.request()!;
    expect(read.ready).toBe(false);
    await driveUntilSettled(backend, read);
    expect(read.failed).toBe(false);
    const storage = read.data!.data;
    check(storage, 17, 2, 1, 1);
    expect(backend.stats.downloadBytes).toBe(17 * 2 * transferBytes);
    read.release();
    const reused = reader.request()!;
    expect(reused).toBe(read);
    await driveUntilSettled(backend, reused);
    expect(reused.data!.data).toBe(storage);
    check(storage, 17, 2, 1, 1);
    reused.release();
  } finally {
    reader.destroy();
    filter.destroy();
    input.destroy();
    target.destroy();
  }
};
