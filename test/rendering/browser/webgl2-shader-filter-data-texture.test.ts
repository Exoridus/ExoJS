/**
 * A `ShaderFilter` must be able to read a 32-bit float `DataTexture`.
 *
 * The WebGL2 twin of the WebGPU binding spec: a float table is bound alongside
 * the filter's input and read by texel index, which is how the transport
 * shaders reach their geometry and emitter tables. Sampling a float texture
 * unfiltered is core WebGL2, so what this pins is the upload path and the
 * binding order rather than a capability.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describe, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const SIZE = 64;

const tableFragmentSource = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uTable;

in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = texelFetch(uTable, ivec2(vUv.x > 0.5 ? 1 : 0, 0), 0);
}
`;

const floatTable = (): DataTexture<TextureFormat.Rgba32F> =>
  new DataTexture({
    width: 2,
    height: 1,
    format: TextureFormat.Rgba32F,
    data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
  });

/** A `SIZE`-square white texture, so the filter covers the whole frame. */
const whiteTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = SIZE;
  source.height = SIZE;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build the fixture.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, SIZE, SIZE);

  return new Texture(source);
};

describe('ShaderFilter reads a float32 DataTexture on WebGL2', () => {
  test('loads an rgba32float table by texel index', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const table = floatTable();
    const texture = whiteTexture();
    const filter = new ShaderFilter({ glsl: { fragment: tableFragmentSource }, textures: { uTable: table } });
    const root = new Container();
    const sprite = new Sprite(texture);

    sprite.filters = [filter];
    root.addChild(sprite);

    try {
      renderWebGl2Once(backend, root, Color.black);

      expectPixelNear(readWebGl2Pixel(backend, SIZE / 4, SIZE / 2), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, (SIZE * 3) / 4, SIZE / 2), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      filter.destroy();
      texture.destroy();
      table.destroy();
      backend.destroy();
    }
  });
});
