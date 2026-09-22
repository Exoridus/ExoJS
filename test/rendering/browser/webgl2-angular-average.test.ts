/**
 * Compact angular averages for a radiance cascade, on WebGL2.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';

import { angularAverageShader } from '../../../packages/exojs-lighting/src/backends/transportShaders';
import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';

const TILE = 4;
const groups = [20, 52, 84, 116] as const;
const fixtureShader = createFilterShader({
  glsl: {
    fragment: `#version 300 es
precision highp float;
uniform sampler2D uTexture;
out vec4 fragColor;
void main() {
  float index = floor(gl_FragCoord.y) * 4.0 + floor(gl_FragCoord.x);
  float value = (index + 1.0) * 8.0 / 255.0;
  fragColor = vec4(value, value, value, 1.0);
}`,
  },
});

describe('radiance angular average (WebGL2)', () => {
  test('packs each four-direction linear mean into its own compact texel', async () => {
    const backend = await createWebGl2TestBackend(TILE);
    const texture = new RenderTexture(TILE, TILE);
    const raw = new RenderTexture(TILE, TILE);
    const compact = new RenderTexture(TILE / 2, TILE / 2);
    const fixture = ShaderFilter.from(fixtureShader);
    const filter = ShaderFilter.from(angularAverageShader);
    const root = new Container();
    const sprite = new Sprite(compact);

    filter.uniforms.uTile.set(TILE);
    fixture.apply(backend, texture, raw);
    filter.apply(backend, raw, compact);
    sprite.width = TILE;
    sprite.height = TILE;
    root.addChild(sprite);

    try {
      renderWebGl2Once(backend, root, Color.black);

      expect(readWebGl2Pixel(backend, 0, 3)[0]).toBe(groups[0]);
      expect(readWebGl2Pixel(backend, 3, 3)[0]).toBe(groups[1]);
      expect(readWebGl2Pixel(backend, 0, 0)[0]).toBe(groups[2]);
      expect(readWebGl2Pixel(backend, 3, 0)[0]).toBe(groups[3]);
    } finally {
      root.destroy();
      filter.destroy();
      fixture.destroy();
      texture.destroy();
      raw.destroy();
      compact.destroy();
      backend.destroy();
    }
  });
});
