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
