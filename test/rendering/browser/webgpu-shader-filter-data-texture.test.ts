/**
 * A `ShaderFilter` must be able to read a 32-bit float `DataTexture`.
 *
 * WebGPU only allows `rgba32float` to be sampled through a filterable-float
 * binding where the device carries the optional `float32-filterable` feature,
 * and the backend hands out a nearest sampler for such a texture regardless.
 * A bind group layout that declares it as an ordinary filterable float is
 * therefore rejected wherever that feature is absent, which is where a filter
 * reading a table of geometry, indices or any other packed data would break.
 *
 * What decides is the device, not the adapter: a feature that was not asked
 * for at device creation may not be used even where the hardware has it. The
 * second spec therefore builds a device without it on whatever GPU is present,
 * which is what makes the red and green halves of the contract observable on
 * one machine.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Mesh } from '#rendering/mesh/Mesh';
import { DataTexture } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/**
 * Make every adapter requested from here on report no `float32-filterable`, so
 * the backend cannot ask for it and the device it builds genuinely lacks it.
 *
 * The adapter's own feature set is what the backend reads to decide what to
 * require, so hiding it there is what produces a real device without the
 * feature - as opposed to a device that has it and a `features.has` that lies,
 * which validation would ignore. Returns the undo.
 */
const hideFloat32Filterable = (): (() => void) => {
  const gpu = navigator.gpu;
  const patched = new Proxy(gpu, {
    get(target, property) {
      if (property !== 'requestAdapter') {
        const value = Reflect.get(target, property, target) as unknown;

        return typeof value === 'function' ? value.bind(target) : value;
      }

      return async (options?: GPURequestAdapterOptions): Promise<GPUAdapter | null> => {
        const adapter = await target.requestAdapter(options);

        if (adapter === null) {
          return null;
        }

        return new Proxy(adapter, {
          get(inner, name) {
            if (name === 'features') {
              return new Set([...inner.features].filter(feature => feature !== 'float32-filterable'));
            }

            const value = Reflect.get(inner, name, inner) as unknown;

            return typeof value === 'function' ? value.bind(inner) : value;
          },
        });
      };
    },
  });

  Object.defineProperty(navigator, 'gpu', { value: patched, configurable: true });

  return () => {
    Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true });
  };
};

/**
 * Two texels of a float table, read by index rather than by coordinate: the
 * left half of the output takes texel 0 and the right half texel 1. A filtered
 * read would blend the two across the middle; a mis-declared binding would
 * fail validation before any of it ran.
 */
const tableFragSrc = `
@group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(1) var uTable: texture_2d<f32>;
@group(1) @binding(2) var uTableSampler: sampler;

@fragment
fn fragmentMain(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
    let index = select(0, 1, vUv.x > 0.5);

    return textureLoad(uTable, vec2<i32>(index, 0), 0);
}
`;

const floatTable = (): DataTexture<TextureFormat.Rgba32F> =>
  new DataTexture({
    width: 2,
    height: 1,
    format: TextureFormat.Rgba32F,
    scaleMode: ScaleModes.Nearest,
    data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
  });

const readTexturePixel = (backend: WebGpuBackend, texture: RenderTexture, x: number, y: number): readonly [number, number, number, number] => {
  const mesh = new Mesh({
    vertices: new Float32Array([0, 0, canvasSize, 0, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize, 0, canvasSize]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    texture,
  });

  try {
    backend.resetStats();
    backend.clear(Color.black);
    mesh.render(backend);
    backend.flush();
  } finally {
    mesh.destroy();
  }

  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx2d = readback.getContext('2d');

  if (!ctx2d) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx2d.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  const { data } = ctx2d.getImageData(x, y, 1, 1);

  return [data[0], data[1], data[2], data[3]];
};

describe('ShaderFilter reads a float32 DataTexture on WebGPU', () => {
  test('binds an rgba32float table without a validation error and loads it by index', async ctx => {
    const backend = await setupBackend();
    const device = getBackendDevice(backend);

    const input = new RenderTexture(canvasSize, canvasSize);
    const output = new RenderTexture(canvasSize, canvasSize);
    const table = floatTable();
    const filter = new ShaderFilter({ wgsl: tableFragSrc, textures: { uTable: table } });

    try {
      device.pushErrorScope('validation');

      let validationError: GPUError | null;

      try {
        filter.apply(backend, input, output);
        validationError = await device.popErrorScope();
      } catch (error) {
        if (isDeviceLoss(error)) {
          // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
          ctx.skip('WebGPU device lost mid-test — unstable software adapter');

          return;
        }

        throw error;
      }

      expect(validationError).toBeNull();

      const [leftR, leftG, leftB] = readTexturePixel(backend, output, canvasSize / 4, canvasSize / 2);
      const [rightR, rightG, rightB] = readTexturePixel(backend, output, (canvasSize * 3) / 4, canvasSize / 2);

      expect(leftR).toBeGreaterThan(200);
      expect(leftB).toBeLessThan(20);
      expect(rightB).toBeGreaterThan(200);
      expect(rightR).toBeLessThan(20);
      expect(leftG).toBeLessThan(20);
      expect(rightG).toBeLessThan(20);
    } finally {
      filter.destroy();
      table.destroy();
      input.destroy();
      output.destroy();
      backend.destroy();
    }
  });

  test('holds on a device that never asked for float32-filterable, where the old declaration is rejected', async ctx => {
    const restore = hideFloat32Filterable();
    let backend: WebGpuBackend | null = null;

    try {
      backend = await setupBackend();

      const device = getBackendDevice(backend);

      expect(device.features.has('float32-filterable')).toBe(false);

      const input = new RenderTexture(canvasSize, canvasSize);
      const output = new RenderTexture(canvasSize, canvasSize);
      const table = floatTable();
      const filter = new ShaderFilter({ wgsl: tableFragSrc, textures: { uTable: table } });

      try {
        device.pushErrorScope('validation');

        let validationError: GPUError | null;

        try {
          filter.apply(backend, input, output);
          validationError = await device.popErrorScope();
        } catch (error) {
          if (isDeviceLoss(error)) {
            // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
            ctx.skip('WebGPU device lost mid-test — unstable software adapter');

            return;
          }

          throw error;
        }

        expect(validationError).toBeNull();

        const [leftR, leftB] = [
          readTexturePixel(backend, output, canvasSize / 4, canvasSize / 2)[0],
          readTexturePixel(backend, output, canvasSize / 4, canvasSize / 2)[2],
        ];

        expect(leftR).toBeGreaterThan(200);
        expect(leftB).toBeLessThan(20);

        // The declaration this pass used to emit, on the same device: a
        // filterable-float entry for a format that is not filterable here.
        // Without this half the green above would also pass on a device that
        // happens to carry the feature, and prove nothing about portability.
        device.pushErrorScope('validation');
        device.createBindGroup({
          layout: device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }],
          }),
          entries: [{ binding: 0, resource: backend.getTextureBinding(table).view }],
        });

        expect(await device.popErrorScope()).not.toBeNull();
      } finally {
        filter.destroy();
        table.destroy();
        input.destroy();
        output.destroy();
      }
    } finally {
      backend?.destroy();
      restore();
    }
  });
});
