/**
 * HDR working format on WebGPU: an `Rgba16F` working target carries a value
 * above display white through the render, and the output transform's Reinhard
 * mapping compresses it to the expected fraction before the sRGB encode -
 * proving there is no intermediate RGBA8 clamp anywhere in the path. The
 * counterpart of `webgl2-hdr-output.test.ts`, run against a real adapter.
 *
 * A browser without an adapter, or an adapter without `Rgba16F` rendering,
 * skips explicitly: the case is recorded as not run, never as a pass.
 *
 * Run via:  pnpm test:browser:webgpu
 */
import { expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { OutputTransform } from '#rendering/OutputTransform';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, readWebGpuPixels, webGpuAvailable } from './_backendSetup';

const canvasSize = 2;

const createWhiteTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  return new Texture(source);
};

/** Draw an opaque full-canvas white sprite into `target` `passes` times under additive blending - each pass adds linear 1.0. */
const accumulateLinearWhite = (backend: WebGpuBackend, target: RenderTexture, source: Texture, passes: number): void => {
  backend.setRenderTarget(target).clear(Color.transparentBlack);

  for (let i = 0; i < passes; i++) {
    const root = new Container();
    const sprite = new Sprite(source);

    sprite.width = canvasSize;
    sprite.height = canvasSize;
    sprite.setBlendMode(BlendModes.Additive);
    root.addChild(sprite);
    root.render(backend);
    backend.flush();
    root.destroy();
  }
};

const srgbEncode = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

test('an Rgba16F working target holds a linear value above 1.0 without clamping on WebGPU', async ctx => {
  if (!(await webGpuAvailable())) {
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('no WebGPU adapter in this browser');
  }

  const backend = await createWebGpuTestBackend(canvasSize);

  if (!backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    backend.destroy();
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('adapter cannot render to Rgba16F');
  }

  const white = createWhiteTexture();
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba16F });

  try {
    accumulateLinearWhite(backend, target, white, 4);

    const [r, g, b] = await backend.readPixels(target, 0, 0, 1, 1, 'float32');

    expect(r).toBeCloseTo(4, 5);
    expect(g).toBeCloseTo(4, 5);
    expect(b).toBeCloseTo(4, 5);
  } finally {
    white.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('the output transform reinhard-maps an HDR working value of 2 to 2/3 and 4 to 4/5 at the WebGPU canvas', async ctx => {
  if (!(await webGpuAvailable())) {
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('no WebGPU adapter in this browser');
  }

  const backend = await createWebGpuTestBackend(canvasSize);

  if (!backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    backend.destroy();
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('adapter cannot render to Rgba16F');
  }

  const white = createWhiteTexture();
  const outputTransform = new OutputTransform();

  outputTransform.setOptions({ toneMapping: 'reinhard' });

  try {
    for (const [passes, expectedFraction] of [
      [2, 2 / 3],
      [4, 4 / 5],
    ] as const) {
      const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba16F });

      accumulateLinearWhite(backend, target, white, passes);

      outputTransform.present(backend, target, false, Color.black);
      backend.flush();

      const [r, , , a] = readWebGpuPixels(backend, canvasSize)(0, 0);

      expect(r).toBeCloseTo(Math.round(srgbEncode(expectedFraction) * 255), 0);
      expect(a).toBe(255);

      target.destroy();
    }
  } finally {
    white.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});
