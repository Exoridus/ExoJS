/**
 * Compact angular averages for a radiance cascade, on WebGPU.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { createFilterShader, ShaderFilter } from '#rendering/filters/ShaderFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';

import { angularAverageShader } from '../../../packages/exojs-lighting/src/backends/transportShaders';
import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';

const TILE = 4;
const groups = [20, 52, 84, 116] as const;
const fixtureShader = createFilterShader({
  wgsl: `@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let index = floor(position.y) * 4.0 + floor(position.x);
  let value = (index + 1.0) * 8.0 / 255.0;
  return vec4<f32>(value, value, value, 1.0);
}`,
});

describe('radiance angular average (WebGPU)', () => {
  test('packs each four-direction linear mean into its own compact texel', async ctx => {
    const backend = await createWebGpuTestBackend(TILE);
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
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      const read = readWebGpuPixels(backend, TILE);

      expect(read(0, 0)[0]).toBe(groups[0]);
      expect(read(3, 0)[0]).toBe(groups[1]);
      expect(read(0, 3)[0]).toBe(groups[2]);
      expect(read(3, 3)[0]).toBe(groups[3]);
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
