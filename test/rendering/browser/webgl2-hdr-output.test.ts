/**
 * HDR working format (R29): an `Rgba16F` working target carries a value above
 * display white through the render, and the output transform's Reinhard
 * mapping compresses it to the expected fraction before the sRGB encode -
 * proving there is no intermediate RGBA8 clamp anywhere in the path.
 *
 * Run via:  pnpm test:browser:webgl
 */
import { expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { OutputTransform, resolveOutputTransformOptions } from '#rendering/OutputTransform';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';

const canvasSize = 2;

const createSolidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = canvasSize;
  source.height = canvasSize;

  const ctx = source.getContext('2d');

  if (!ctx) {
    throw new Error('2D context required.');
  }

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  return new Texture(source);
};

/** Draw an opaque full-canvas white sprite into `target` `passes` times under additive blending - each pass adds linear 1.0. */
const accumulateLinearWhite = (
  backend: Awaited<ReturnType<typeof createWebGl2TestBackend>>,
  target: RenderTexture,
  source: Texture,
  passes: number,
): void => {
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

test('an Rgba16F working target holds a linear value above 1.0 without clamping', async ctx => {
  const backend = await createWebGl2TestBackend(canvasSize);

  if (!backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    backend.destroy();
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('context cannot render to Rgba16F');
  }

  const white = createSolidTexture('#ffffff');
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba16F });

  try {
    accumulateLinearWhite(backend, target, white, 4);

    const [r, g, b] = await backend.readPixels(target, 0, 0, 1, 1, 'float32');

    // Alpha is not asserted: Additive's alpha factors (ONE, ONE_MINUS_SRC_ALPHA)
    // are ordinary source-over coverage accumulation, which converges toward 1
    // rather than summing - only RGB carries the unbounded HDR energy here.
    expect(r).toBeCloseTo(4, 5);
    expect(g).toBeCloseTo(4, 5);
    expect(b).toBeCloseTo(4, 5);
  } finally {
    white.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('the output transform reinhard-maps an HDR working value of 2 to 2/3 and 4 to 4/5 at the canvas', async ctx => {
  const backend = await createWebGl2TestBackend(canvasSize);

  if (!backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    backend.destroy();
    // eslint-disable-next-line vitest/no-disabled-tests -- runtime guard: capability, not a failure
    ctx.skip('context cannot render to Rgba16F');
  }

  const white = createSolidTexture('#ffffff');
  const outputTransform = new OutputTransform();

  outputTransform.setOptions({ toneMapping: 'reinhard' });

  const srgbEncode = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

  try {
    for (const [passes, expectedFraction] of [
      [2, 2 / 3],
      [4, 4 / 5],
    ] as const) {
      const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba16F });

      accumulateLinearWhite(backend, target, white, passes);

      outputTransform.present(backend, target, false, Color.black);
      backend.flush();
      backend.setRenderTarget(null);

      const [r] = readWebGl2Pixel(backend, 0, 0);

      expect(r).toBeCloseTo(Math.round(srgbEncode(expectedFraction) * 255), 0);

      target.destroy();
    }
  } finally {
    white.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});

test('resolveOutputTransformOptions rejects an unrecognised working format before any target is allocated', () => {
  expect(() => resolveOutputTransformOptions({ workingFormat: 'float' as never })).toThrow(/workingFormat/);
});
