/**
 * `RenderingContext.readImageData` (R30): a display-referred, sRGB-encoded
 * read that reuses the same output transform every frame's canvas goes
 * through, run once against an off-screen target. Proves the raw/display
 * separation end to end: `readPixels` returns a working format's own storage
 * unchanged (including an `Rgba8Srgb` target, previously rejected outright),
 * while `readImageData` always returns a tone-mapped sRGB byte.
 *
 * Run via:  pnpm test:browser:webgl
 */
import { expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';

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

const pixelTexture = (colorSpace: 'srgb' | 'linear-srgb'): Texture =>
  Texture.fromPixels({ colorSpace, alphaMode: 'straight', levels: [{ data: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 }] });

test("readPixels returns an Rgba8Srgb target's own stored bytes - previously rejected outright", async () => {
  const backend = await createWebGl2TestBackend(canvasSize);
  const context = new RenderingContext(backend);
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba8Srgb });
  const gray = pixelTexture('srgb');

  try {
    const root = new Container();
    const sprite = new Sprite(gray);

    sprite.width = canvasSize;
    sprite.height = canvasSize;
    root.addChild(sprite);
    backend.setRenderTarget(target).clear();
    root.render(backend);
    root.destroy();

    const { data } = await context.readPixels(target);

    // The raw stored byte is the source's own sRGB-encoded 128, unchanged -
    // no decode, no display transform.
    expect(data[0]).toBe(128);
  } finally {
    gray.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('readImageData maps a linear working target to the expected sRGB byte', async () => {
  const backend = await createWebGl2TestBackend(canvasSize);
  const context = new RenderingContext(backend);
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba8Srgb });
  const gray = pixelTexture('srgb');

  try {
    const root = new Container();
    const sprite = new Sprite(gray);

    sprite.width = canvasSize;
    sprite.height = canvasSize;
    root.addChild(sprite);
    backend.setRenderTarget(target).clear();
    root.render(backend);
    root.destroy();

    const { data } = await context.readImageData(target);

    // A gray sRGB byte 128, decoded to linear and re-encoded by the display
    // transform, lands back on 128 within hardware sRGB LUT rounding.
    expect(data[0]).toBeCloseTo(128, 0);
    expect(data[3]).toBe(255);
  } finally {
    gray.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('readImageData reinhard-maps an HDR working value of 4 to the expected sRGB byte', async () => {
  const backend = await createWebGl2TestBackend(canvasSize);

  if (!backend.supportsColorFormat(TextureFormat.Rgba16F)) {
    backend.destroy();

    return;
  }

  const context = new RenderingContext(backend);
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba16F });
  const white = createSolidTexture('#ffffff');

  const srgbEncode = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

  try {
    backend.setRenderTarget(target).clear(Color.transparentBlack);

    for (let i = 0; i < 4; i++) {
      const root = new Container();
      const sprite = new Sprite(white);

      sprite.width = canvasSize;
      sprite.height = canvasSize;
      sprite.setBlendMode(BlendModes.Additive);
      root.addChild(sprite);
      root.render(backend);
      backend.flush();
      root.destroy();
    }

    const { data } = await context.readImageData(target, { toneMapping: 'reinhard' });

    expect(data[0]).toBeCloseTo(Math.round(srgbEncode(4 / 5) * 255), 0);
  } finally {
    white.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('readImageData rejects a zero-alpha pixel carrying color, unless a background is given', async () => {
  const backend = await createWebGl2TestBackend(canvasSize);
  const context = new RenderingContext(backend);
  const target = new RenderTexture(canvasSize, canvasSize, { format: TextureFormat.Rgba8Srgb });

  try {
    // Construct the invalid state directly: a color-only clear (colorMask
    // excludes alpha) over an already-transparent target leaves stored RGB
    // nonzero at alpha 0 - not producible through ordinary premultiplied
    // drawing, but the exact byte pattern `readImageData` has to refuse
    // rather than silently erase.
    const gl = backend.context;

    backend.setRenderTarget(target).clear(Color.transparentBlack);
    gl.bindFramebuffer(gl.FRAMEBUFFER, backend._renderTargetFramebuffer(target));
    gl.colorMask(true, true, true, false);
    gl.clearColor(0.5, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    await expect(context.readImageData(target)).rejects.toThrow(/zero alpha but nonzero color/);

    const composited = await context.readImageData(target, { background: Color.black });

    expect(composited.data[3]).toBe(255);
  } finally {
    target.destroy();
    backend.destroy();
  }
});
