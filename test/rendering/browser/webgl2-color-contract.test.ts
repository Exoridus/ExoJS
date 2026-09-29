/**
 * WebGL2 colour contract, on the default routes.
 *
 * The first two cases pin the storage/sampling pair; the rest pin what a
 * default source and a default working surface add up to - an ordinary image
 * decoded on sample, premultiplied in linear light, blended in linear light into
 * an sRGB attachment, and encoded once on the way to the canvas.
 */
import { expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { OutputTransform } from '#rendering/OutputTransform';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

/** A premultiplied (alpha-carrying) canvas - `readWebGl2Pixel`'s alpha channel is otherwise always 255. */
const createTransparentCanvasBackend = async (size: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const app = {
    canvas,
    options: {
      canvas: { width: size, height: size },
      clearColor: Color.black,
      rendering: { alphaMode: 'premultiplied', webglAttributes: { preserveDrawingBuffer: true } },
    },
  } as unknown as Application;
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const pixelTexture = (colorSpace: 'srgb' | 'linear-srgb'): Texture =>
  Texture.fromPixels({ colorSpace, alphaMode: 'straight', levels: [{ data: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 }] });

test('WebGL2 decodes sRGB storage while leaving UNORM raw samples unchanged', async () => {
  const backend = await createWebGl2TestBackend(2);
  const srgbTarget = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });
  const unormTarget = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });
  const srgb = pixelTexture('srgb');
  const unorm = pixelTexture('linear-srgb');

  try {
    for (const [texture, target] of [
      [srgb, srgbTarget],
      [unorm, unormTarget],
    ] as const) {
      const root = new Container();
      const sprite = new Sprite(texture);

      sprite.width = 2;
      sprite.height = 2;
      root.addChild(sprite);
      backend.setRenderTarget(target).clear();
      root.render(backend);
      backend.flush();
      root.destroy();
    }

    const srgbPixels = await backend.readPixels(srgbTarget, 0, 0, 1, 1);
    const unormPixels = await backend.readPixels(unormTarget, 0, 0, 1, 1);

    expect(srgbPixels[0]).toBeCloseTo(0.21586 * 255, 0);
    expect(unormPixels[0]).toBe(128);
  } finally {
    srgb.destroy();
    unorm.destroy();
    srgbTarget.destroy();
    unormTarget.destroy();
    backend.destroy();
  }
});

test('WebGL2 accepts an sRGB framebuffer attachment for clear and readback', async () => {
  const backend = await createWebGl2TestBackend(2);
  const target = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

  try {
    backend.setRenderTarget(target).clear();

    expect(await backend.readPixels(target, 0, 0, 1, 1)).toEqual(new Uint8ClampedArray([0, 0, 0, 255]));
  } finally {
    target.destroy();
    backend.destroy();
  }
});

test('WebGl2OutputPass round-trips an sRGB gray through the linear working target back to the same byte', async () => {
  const backend = await createWebGl2TestBackend(2);
  const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const gray = pixelTexture('srgb'); // authored sRGB byte 128, decoded linear on sample.
  const outputTransform = new OutputTransform();

  try {
    const root = new Container();
    const sprite = new Sprite(gray);

    sprite.width = 2;
    sprite.height = 2;
    root.addChild(sprite);
    backend.setRenderTarget(source).clear();
    root.render(backend);
    root.destroy();

    outputTransform.present(backend, source, false, Color.black);
    backend.flush();
    // `present` runs as a coordinator child pass, which restores whatever
    // target was active before it - `source`, set directly above rather than
    // through the coordinator. Rebind the canvas explicitly before reading it.
    backend.setRenderTarget(null);

    const [r, g, b, a] = readWebGl2Pixel(backend, 0, 0);

    // Gray 128 decoded to linear and re-encoded to sRGB lands back on 128,
    // within a hardware sRGB LUT's rounding.
    expect(r).toBeCloseTo(128, 0);
    expect(g).toBeCloseTo(128, 0);
    expect(b).toBeCloseTo(128, 0);
    expect(a).toBe(255);
  } finally {
    gray.destroy();
    source.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});

test('WebGl2OutputPass computes E(C/a)*a for a transparent target, collapsing to zero at alpha zero', async () => {
  const backend = await createTransparentCanvasBackend(2);
  const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const outputTransform = new OutputTransform();

  try {
    // Linear-PMA gray at 50% coverage: `clear` on an sRGB target decodes RGB
    // and copies alpha unchanged (`Color.writeLinear`, no premultiply of its
    // own), giving stored (0.21586, 0.21586, 0.21586, 0.5) directly.
    backend.setRenderTarget(source).clear(new Color(128, 128, 128, 0.5));

    outputTransform.present(backend, source, true, Color.black);
    backend.flush();
    backend.setRenderTarget(null); // rebind the canvas - see the note above.

    const [r, , , a] = readWebGl2Pixel(backend, 0, 0);

    expect(a).toBeCloseTo(128, 0); // alpha 0.5 -> byte ~128
    // Unassociate (0.21586 / 0.5 = 0.43172), encode, re-associate by 0.5.
    const straightEncoded = 1.055 * 0.43172 ** (1 / 2.4) - 0.055;

    expect(r).toBeCloseTo(Math.round(straightEncoded * 0.5 * 255), 0);

    // Fully uncovered: collapses to zero rather than dividing by alpha.
    backend.setRenderTarget(source).clear(Color.transparentBlack);
    outputTransform.present(backend, source, true, Color.black);
    backend.flush();
    backend.setRenderTarget(null);

    expect(readWebGl2Pixel(backend, 0, 0)).toEqual([0, 0, 0, 0]);
  } finally {
    source.destroy();
    outputTransform.destroy();
    backend.destroy();
  }
});

/** An ordinary browser-rasterized image: sRGB colour, no explicit interpretation. */
const grayImage = (byte: number, alpha = 1): Texture => {
  const source = document.createElement('canvas');

  source.width = 1;
  source.height = 1;

  const context = source.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build test textures.');

  context.fillStyle = `rgba(${byte}, ${byte}, ${byte}, ${alpha})`;
  context.fillRect(0, 0, 1, 1);

  return new Texture(source);
};

const spriteOf = (texture: Texture, size: number, alpha = 1): Container => {
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = size;
  sprite.height = size;
  sprite.tint = new Color(0xffffff, alpha);
  root.addChild(sprite);

  return root;
};

test('WebGL2 gives an ordinary image sRGB storage and decodes it on sample', async () => {
  const backend = await createWebGl2TestBackend(2);
  const target = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const image = grayImage(128);

  try {
    expect(image.resolvedMetadata.storageFormat).toBe(TextureFormat.Rgba8Srgb);
    expect(image.colorSpace).toBe('srgb');

    const root = spriteOf(image, 2);

    backend.setRenderTarget(target).clear(Color.black);
    root.render(backend);
    backend.flush();
    root.destroy();

    // The sample decoded to linear 0.2159 and the sRGB attachment re-encoded it
    // on write, so the stored byte is the authored one again.
    expect(await backend.readPixels(target, 0, 0, 1, 1)).toEqual(new Uint8ClampedArray([128, 128, 128, 255]));
  } finally {
    image.destroy();
    target.destroy();
    backend.destroy();
  }
});

test('WebGL2 blends into an sRGB working target in linear light', async () => {
  const backend = await createWebGl2TestBackend(2);
  const working = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });
  const unencoded = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });
  const image = grayImage(128);

  try {
    for (const target of [working, unencoded]) {
      const root = spriteOf(image, 2, 0.5);

      backend.setRenderTarget(target).clear(Color.black);
      root.render(backend);
      backend.flush();
      root.destroy();
    }

    const blended = await backend.readPixels(working, 0, 0, 1, 1);

    // Mid-gray at half coverage over black: 0.2159 linear premultiplied by 0.5
    // lands at 0.108 linear, which the sRGB attachment stores as byte 93 or 94.
    expect(Math.abs(blended[0]! - 94)).toBeLessThanOrEqual(1);
    // A plain RGBA8 target has no encode on write, so the same draw stores the
    // linear value quantized - byte 28. Encoded-space blending on the sRGB
    // target would have produced 64 instead.
    expect((await backend.readPixels(unencoded, 0, 0, 1, 1))[0]).toBeCloseTo(28, 0);
  } finally {
    image.destroy();
    working.destroy();
    unencoded.destroy();
    backend.destroy();
  }
});
