import { afterEach, describe, expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

interface SamplerHarness {
  readonly backend: WebGl2Backend;
  readonly texParams: Array<readonly [number, number]>;
  destroy(): void;
}

const createHarness = (): SamplerHarness => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const texParams: Array<readonly [number, number]> = [];
  const mutable = context as unknown as Record<string, unknown>;

  mutable['texParameteri'] = (_target: number, pname: number, value: number): void => {
    texParams.push([pname, value]);
  };

  const app = {
    canvas: createFakeCanvas(64, 64, context),
    options: { canvas: { width: 64, height: 64 }, rendering: { debug: false } },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);

  texParams.length = 0;

  return {
    backend,
    texParams,
    destroy(): void {
      backend.destroy();
    },
  };
};

describe('WebGl2Backend sampler filters', () => {
  let harness: SamplerHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('a mipmapped linear scale mode sends the base filter to MAG and the mip filter to MIN', () => {
    harness = createHarness();
    const gl = harness.backend.context;
    const texture = new Texture({ width: 1, height: 1 } as unknown as HTMLCanvasElement, {
      scaleMode: ScaleModes.LinearMipmapLinear,
      wrapMode: WrapModes.ClampToEdge,
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.texParams).toContainEqual([gl.TEXTURE_MAG_FILTER, ScaleModes.Linear]);
    expect(harness.texParams).toContainEqual([gl.TEXTURE_MIN_FILTER, ScaleModes.LinearMipmapLinear]);

    texture.destroy();
  });

  test('a mipmapped nearest scale mode sends the base filter to MAG and the mip filter to MIN', () => {
    harness = createHarness();
    const gl = harness.backend.context;
    const texture = new Texture({ width: 1, height: 1 } as unknown as HTMLCanvasElement, {
      scaleMode: ScaleModes.NearestMipmapNearest,
      wrapMode: WrapModes.ClampToEdge,
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.texParams).toContainEqual([gl.TEXTURE_MAG_FILTER, ScaleModes.Nearest]);
    expect(harness.texParams).toContainEqual([gl.TEXTURE_MIN_FILTER, ScaleModes.NearestMipmapNearest]);

    texture.destroy();
  });

  test('an authored partial mip chain clamps TEXTURE_MAX_LEVEL to its own level count', () => {
    harness = createHarness();
    const gl = harness.backend.context;
    const texture = Texture.fromPixels({
      colorSpace: 'none',
      alphaMode: 'straight',
      levels: [
        { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 },
        { data: new Uint8Array(2 * 2 * 4), width: 2, height: 2 },
        { data: new Uint8Array(1 * 1 * 4), width: 1, height: 1 },
      ],
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.texParams).toContainEqual([gl.TEXTURE_BASE_LEVEL, 0]);
    expect(harness.texParams).toContainEqual([gl.TEXTURE_MAX_LEVEL, 2]);

    texture.destroy();
  });

  test('a single-level texture stays mip-complete even under a mip scale mode', () => {
    harness = createHarness();
    const gl = harness.backend.context;
    const texture = new Texture({ width: 1, height: 1 } as unknown as HTMLCanvasElement, {
      scaleMode: ScaleModes.LinearMipmapLinear,
      wrapMode: WrapModes.ClampToEdge,
      generateMipMap: false,
    });

    harness.backend.bindTexture(texture, 0);

    expect(harness.texParams).toContainEqual([gl.TEXTURE_BASE_LEVEL, 0]);
    expect(harness.texParams).toContainEqual([gl.TEXTURE_MAX_LEVEL, 0]);

    texture.destroy();
  });
});
