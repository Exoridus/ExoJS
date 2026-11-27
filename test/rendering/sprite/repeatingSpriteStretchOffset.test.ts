import { expect, test } from 'vitest';

import { WebGl2ScalableSpriteRenderer } from '#rendering/webgl2/WebGl2ScalableSpriteRenderer';

interface InstanceWriter {
  _writeShaderInstance(sprite: unknown, nodeIndex: number): void;
}

const writeInstance = (modeX: string, modeY: string): Float32Array => {
  const renderer = Object.create(WebGl2ScalableSpriteRenderer.prototype) as InstanceWriter;
  const data = new ArrayBuffer(64);

  Object.assign(renderer, { _shaderF32: new Float32Array(data), _shaderU32: new Uint32Array(data), _shaderQuadCount: 0 });
  renderer._writeShaderInstance(
    {
      texture: {},
      region: { width: 16, height: 16 },
      width: 64,
      height: 64,
      modeX,
      modeY,
      fitX: 'clip',
      fitY: 'clip',
      offsetX: 8,
      offsetY: 4,
      tint: { toRgba8: () => 0xffffffff },
    },
    0,
  );

  return new Float32Array(data);
};

test('shader path ignores the scroll offset on stretched axes, like the geometry path', () => {
  const stretched = writeInstance('stretch', 'stretch');

  expect(stretched[6]).toBe(0);
  expect(stretched[7]).toBe(0);
});

test('shader path keeps the scroll offset on tiled axes', () => {
  const tiled = writeInstance('repeat', 'repeat');

  expect(tiled[6]).toBe(0.5);
  expect(tiled[7]).toBe(0.25);
});
