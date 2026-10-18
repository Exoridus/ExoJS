import { afterEach, describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

interface TextureAllocation {
  readonly internalFormat: number;
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBufferView | null;
}

interface ColorHarness {
  readonly backend: WebGl2Backend;
  readonly allocations: TextureAllocation[];
  readonly pixelStores: Array<readonly [number, number | boolean]>;
  destroy(): void;
}

const createHarness = (): ColorHarness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const allocations: TextureAllocation[] = [];
  const pixelStores: Array<readonly [number, number | boolean]> = [];
  const mutable = context as unknown as Record<string, unknown>;

  mutable['texImage2D'] = (...args: unknown[]): void => {
    const [unusedTarget, unusedLevel, internalFormat, fourth, fifth, sixth, seventh, eighth, ninth] = args;

    void unusedTarget;
    void unusedLevel;

    if (args.length === 6) {
      const source = sixth as { width: number; height: number };

      allocations.push({ internalFormat: internalFormat as number, width: source.width, height: source.height, data: null });

      return;
    }

    void fourth;
    void fifth;
    void sixth;
    void seventh;
    void eighth;
    allocations.push({
      internalFormat: internalFormat as number,
      width: fourth as number,
      height: fifth as number,
      data: ninth as ArrayBufferView | null,
    });
  };

  mutable['pixelStorei'] = (pname: number, value: number | boolean): void => {
    pixelStores.push([pname, value]);
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);

  allocations.length = 0;

  return {
    backend,
    allocations,
    pixelStores,
    destroy(): void {
      backend.destroy();
    },
  };
};

describe('WebGl2Backend sRGB textures', () => {
  let harness: ColorHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('uploads raw sRGB RGBA8 bytes into SRGB8_ALPHA8 without transforming them', () => {
    harness = createHarness();
    const bytes = new Uint8Array([128, 64, 32, 255]);
    const texture = Texture.fromPixels({ colorSpace: 'srgb', alphaMode: 'straight', levels: [{ data: bytes, width: 1, height: 1 }] });

    harness.backend.bindTexture(texture, 0);

    expect(harness.allocations).toEqual([{ internalFormat: harness.backend.context.SRGB8_ALPHA8, width: 1, height: 1, data: bytes }]);
    expect(harness.pixelStores).toEqual([]);

    texture.destroy();
  });

  test('realizes an sRGB render attachment as SRGB8_ALPHA8', () => {
    harness = createHarness();
    const target = new RenderTexture(4, 2, { format: TextureFormat.Rgba8Srgb });

    harness.backend.setRenderTarget(target);

    expect(harness.allocations).toEqual([{ internalFormat: harness.backend.context.SRGB8_ALPHA8, width: 4, height: 2, data: null }]);

    target.destroy();
  });

  test('applies browser pixel-store state only around a browser-source upload and restores it', () => {
    harness = createHarness();
    const source = { width: 1, height: 1 } as unknown as HTMLCanvasElement;
    const texture = new Texture(source);
    const gl = harness.backend.context;

    harness.backend.bindTexture(texture, 0);

    // A default browser source is uploaded straight and unconverted into the
    // normalization pass, which premultiplies it; the state does not outlive it.
    expect(harness.pixelStores).toEqual([
      [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false],
      [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE],
      [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL],
    ]);

    texture.destroy();
  });

  test('stores a default browser source as sRGB and premultiplies it through the normalization pass', () => {
    harness = createHarness();
    const texture = new Texture({ width: 1, height: 1 } as unknown as HTMLCanvasElement);
    const gl = harness.backend.context;

    harness.backend.bindTexture(texture, 0);

    expect(harness.allocations.length).toBeGreaterThan(0);
    expect(harness.allocations.every(allocation => allocation.internalFormat === gl.SRGB8_ALPHA8)).toBe(true);

    texture.destroy();
  });

  test('rejects an incomplete sRGB framebuffer after attaching it', () => {
    harness = createHarness();
    const context = harness.backend.context as unknown as Record<string, unknown>;
    const target = new RenderTexture(4, 2, { format: TextureFormat.Rgba8Srgb });

    context['checkFramebufferStatus'] = (): number => 0x8cd6;

    expect(() => harness?.backend.setRenderTarget(target)).toThrow(/framebuffer.*incomplete/i);

    target.destroy();
  });
});
