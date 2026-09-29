/**
 * Backend-neutral numerical colour probes.
 *
 * Every probe renders a small deterministic scene and compares raw attachment
 * bytes (or floats) and display bytes against an independent CPU oracle. The
 * oracle here deliberately re-derives the sRGB transfer instead of importing
 * the engine's helpers, so a wrong transfer in the engine cannot cancel out.
 *
 * Tolerances: an RGBA8 result carries the rounding of one storage quantization
 * of the source and one of the destination, so channel comparisons allow two
 * code values; Float16 results allow `max(0.002, 0.002 * |expected|)`.
 * A gamma, premultiplication or double-transfer mistake moves a result by tens
 * of code values, far outside both bounds.
 */
import { describe, expect, onTestFinished, test } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { OutputTransform } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderingContext } from '#rendering/RenderingContext';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, ScaleModes, TextureFormat } from '#rendering/types';

import type { RgbaTuple } from './_pixels';

export const srgbEncode = (linear: number): number => (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055);

export const srgbDecode = (encoded: number): number => (encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4);

export const toByte = (unit: number): number => unit * 255;

export const RGBA8_TOLERANCE = 2;

export const halfFloatTolerance = (expected: number): number => Math.max(0.002, Math.abs(expected) * 0.002);

export interface ColorProbeHarness {
  readonly backend: RenderBackend;
  readonly size: number;
  /** Reads one top-left-indexed canvas pixel after the last {@link OutputTransform.present}. */
  canvasPixel(x: number, y: number): RgbaTuple;
  /** Runs `action` and fails on any runtime validation error the backend raised meanwhile. */
  checked<T>(action: () => Promise<T> | T): Promise<T>;
  destroy(): void;
}

export type OpenColorProbeHarness = (size: number) => Promise<ColorProbeHarness>;

export const expectBytes = (actual: ArrayLike<number>, expected: readonly number[], tolerance: number = RGBA8_TOLERANCE): void => {
  expected.forEach((value, channel) => {
    expect(Math.abs(actual[channel]! - value), `channel ${channel}: got ${actual[channel]}, expected ${value}`).toBeLessThanOrEqual(tolerance);
  });
};

interface Disposable {
  destroy(): void;
}

type SourceColorSpace = 'srgb' | 'linear-srgb' | 'none';

export const pixelTexture = (
  colorSpace: SourceColorSpace,
  alphaMode: 'straight' | 'premultiplied',
  width: number,
  height: number,
  bytes: readonly number[],
): Texture => Texture.fromPixels({ colorSpace, alphaMode, levels: [{ data: new Uint8Array(bytes), width, height }] });

export const solidPixelTexture = (colorSpace: SourceColorSpace, bytes: readonly number[]): Texture => pixelTexture(colorSpace, 'straight', 1, 1, bytes);

interface SceneOptions {
  x?: number;
  y?: number;
  alpha?: number;
  tint?: Color;
  additive?: boolean;
}

export const spriteScene = (texture: Texture | RenderTexture, width: number, height: number, options: SceneOptions = {}): Container => {
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = width;
  sprite.height = height;
  sprite.setPosition(options.x ?? 0, options.y ?? 0);
  sprite.tint = options.tint ?? new Color(0xffffff, options.alpha ?? 1);

  if (options.additive === true) sprite.setBlendMode(BlendModes.Additive);

  root.addChild(sprite);

  return root;
};

/** Draws `root` into `target`, clearing first unless `clear` is null, then submits and destroys the scene. */
export const drawInto = (backend: RenderBackend, target: RenderTexture, root: RenderNode, clear: Color | null = Color.black): void => {
  backend.setRenderTarget(target);

  if (clear !== null) backend.clear(clear);

  root.render(backend);
  backend.flush();
  root.destroy();
};

const checkerboard2x2 = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255];

export const defineColorContractProbes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<{ h: ColorProbeHarness; own: <T extends Disposable>(resource: T) => T }> => {
    const resources: Disposable[] = [];
    const h = await open(4);

    onTestFinished(() => {
      while (resources.length > 0) resources.pop()!.destroy();
      h.destroy();
    });

    return {
      h,
      own: resource => {
        resources.push(resource);

        return resource;
      },
    };
  };

  describe(`${title}: numerical colour probes`, () => {
    test('an sRGB gray decodes to linear on sample while none data stays numeric', async () => {
      const { h, own } = await start();
      const linearTarget = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const srgb = own(solidPixelTexture('srgb', [128, 128, 128, 255]));
      const none = own(solidPixelTexture('none', [128, 128, 128, 255]));

      await h.checked(async () => {
        const decoded = toByte(srgbDecode(128 / 255));

        drawInto(h.backend, linearTarget, spriteScene(srgb, 2, 2));
        expectBytes(await h.backend.readPixels(linearTarget, 0, 0, 1, 1), [decoded, decoded, decoded, 255]);

        drawInto(h.backend, linearTarget, spriteScene(none, 2, 2));
        expectBytes(await h.backend.readPixels(linearTarget, 0, 0, 1, 1), [128, 128, 128, 255]);
      });
    });

    test('an sRGB gray decodes to 0.2158605 in Float16 and none data to 128/255', async ctx => {
      const { h, own } = await start();

      if (!h.backend.supportsColorFormat(TextureFormat.Rgba16F)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- capability: names the missing format
        ctx.skip('Rgba16F is not renderable on this device');

        return;
      }

      const target = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba16F }));
      const srgb = own(solidPixelTexture('srgb', [128, 128, 128, 255]));
      const none = own(solidPixelTexture('none', [128, 128, 128, 255]));

      await h.checked(async () => {
        drawInto(h.backend, target, spriteScene(srgb, 2, 2));

        const decoded = await h.backend.readPixels(target, 0, 0, 1, 1, 'float32');

        expect(Math.abs(decoded[0]! - 0.2158605001)).toBeLessThanOrEqual(halfFloatTolerance(0.2158605001));
        expect(Math.abs(srgbDecode(128 / 255) - 0.2158605001)).toBeLessThan(1e-9);

        drawInto(h.backend, target, spriteScene(none, 2, 2));

        const data = await h.backend.readPixels(target, 0, 0, 1, 1, 'float32');

        expect(Math.abs(data[0]! - 128 / 255)).toBeLessThanOrEqual(halfFloatTolerance(128 / 255));
      });
    });

    test('an sRGB gray is decoded once and encoded once through direct, tinted, cached-intermediate and canvas routes', async () => {
      const { h, own } = await start();
      const gray = own(solidPixelTexture('srgb', [128, 128, 128, 255]));
      const white = own(solidPixelTexture('srgb', [255, 255, 255, 255]));
      const direct = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const tinted = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const cache = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const cached = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const outputTransform = own(new OutputTransform());

      await h.checked(async () => {
        drawInto(h.backend, direct, spriteScene(gray, 2, 2));
        expectBytes(await h.backend.readPixels(direct, 0, 0, 1, 1), [128, 128, 128, 255]);

        drawInto(h.backend, tinted, spriteScene(white, 2, 2, { tint: new Color(128, 128, 128, 1) }));
        expectBytes(await h.backend.readPixels(tinted, 0, 0, 1, 1), [128, 128, 128, 255]);

        drawInto(h.backend, cache, spriteScene(gray, 2, 2));
        drawInto(h.backend, cached, spriteScene(cache, 2, 2));
        expectBytes(await h.backend.readPixels(cached, 0, 0, 1, 1), [128, 128, 128, 255]);

        outputTransform.present(h.backend, direct, false, Color.black);
        h.backend.flush();
        h.backend.setRenderTarget(null);
        expectBytes(h.canvasPixel(0, 0), [128, 128, 128, 255]);
      });

      // Decoding or encoding twice would land far outside the bound.
      expect(Math.abs(toByte(srgbDecode(128 / 255)) - 128)).toBeGreaterThan(RGBA8_TOLERANCE * 10);
      expect(Math.abs(toByte(srgbEncode(128 / 255)) - 128)).toBeGreaterThan(RGBA8_TOLERANCE * 10);
    });

    test('bilinear filtering blends in linear light: a black/white midpoint is linear 0.5, displayed byte 188', async () => {
      const { h, own } = await start();
      const stripes = own(pixelTexture('srgb', 'straight', 2, 2, checkerboard2x2));
      const raw = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const encoded = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));

      await h.checked(async () => {
        // A 4x2 sprite at x=-1.5 puts pixel 0's centre exactly between the two texel columns.
        drawInto(h.backend, raw, spriteScene(stripes, 4, 2, { x: -1.5 }));
        expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [127.5, 127.5, 127.5, 255]);

        const displayed = toByte(srgbEncode(0.5));

        drawInto(h.backend, encoded, spriteScene(stripes, 4, 2, { x: -1.5 }));
        expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [displayed, displayed, displayed, 255]);
        expect(Math.abs(displayed - 128)).toBeGreaterThan(50);
      });
    });

    test('a generated 1x1 mip of a black/white source averages in linear light', async () => {
      const { h, own } = await start();
      const stripes = own(pixelTexture('srgb', 'straight', 2, 2, checkerboard2x2));
      const encoded = own(new RenderTexture(1, 1, { format: TextureFormat.Rgba8Srgb }));

      stripes.setScaleMode(ScaleModes.LinearMipmapLinear);

      await h.checked(async () => {
        const displayed = toByte(srgbEncode(0.5));

        drawInto(h.backend, encoded, spriteScene(stripes, 1, 1));
        expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [displayed, displayed, displayed, 255]);
      });
    });

    test('a half-transparent edge carries no hidden colour and composites with weighted premultiplied coverage', async () => {
      const { h, own } = await start();
      const edge = own(pixelTexture('srgb', 'straight', 2, 1, [255, 0, 0, 255, 0, 0, 255, 0]));
      const overBlack = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const overWhite = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));

      await h.checked(async () => {
        // Linear red 1 at coverage 1 mixed with hidden blue at coverage 0: premultiplied (0.5, 0, 0) at alpha 0.5.
        drawInto(h.backend, overBlack, spriteScene(edge, 4, 2, { x: -1.5 }), Color.black);
        expectBytes(await h.backend.readPixels(overBlack, 0, 0, 1, 1), [127.5, 0, 0, 255]);

        drawInto(h.backend, overWhite, spriteScene(edge, 4, 2, { x: -1.5 }), Color.white);
        expectBytes(await h.backend.readPixels(overWhite, 0, 0, 1, 1), [255, 127.5, 127.5, 255]);
      });
    });

    test('a transparent result is straight-encoded per coverage and an opaque matte result encodes the premultiplied colour', async () => {
      const { h, own } = await start();
      const context = new RenderingContext(h.backend);
      const translucent = own(pixelTexture('linear-srgb', 'straight', 1, 1, [128, 128, 128, 64]));
      const working = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const region = new Rectangle(0, 0, 1, 1);

      await h.checked(async () => {
        drawInto(h.backend, working, spriteScene(translucent, 2, 2), Color.transparentBlack);

        const alpha = 64 / 255;
        const premultiplied = (128 / 255) * alpha;
        const straight = toByte(srgbEncode(premultiplied / alpha));
        const matted = toByte(srgbEncode(premultiplied));

        // Dividing a stored 8-bit premultiplied value by a 6-bit-range alpha amplifies its rounding, hence three codes.
        const transparent = await context.readImageData(working, { region });

        expectBytes(transparent.data, [straight, straight, straight, 64], 3);

        const opaque = await context.readImageData(working, { region, background: Color.black });

        expectBytes(opaque.data, [matted, matted, matted, 255], 3);
        expect(Math.abs(straight - matted)).toBeGreaterThan(50);
      });
    });

    test('white at half alpha over black is linear 0.5, displayed 188, and stacks by exact source-over coverage', async () => {
      const { h, own } = await start();
      const white = own(solidPixelTexture('srgb', [255, 255, 255, 255]));
      const raw = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const encoded = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const partial = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));

      await h.checked(async () => {
        drawInto(h.backend, raw, spriteScene(white, 2, 2, { alpha: 0.5 }));
        expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [127.5, 127.5, 127.5, 255]);

        const displayed = toByte(srgbEncode(0.5));

        drawInto(h.backend, encoded, spriteScene(white, 2, 2, { alpha: 0.5 }));
        expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [displayed, displayed, displayed, 255]);

        // Destination alpha 0.25, then source alpha 0.5: 0.5 + 0.25 * (1 - 0.5).
        drawInto(h.backend, partial, spriteScene(white, 2, 2, { alpha: 0.25 }), Color.transparentBlack);
        drawInto(h.backend, partial, spriteScene(white, 2, 2, { alpha: 0.5 }), null);

        const stacked = toByte(0.5 + 0.25 * 0.5);

        expectBytes(await h.backend.readPixels(partial, 0, 0, 1, 1), [stacked, stacked, stacked, stacked]);
      });
    });

    test('numeric data survives untouched, and reading it as sRGB colour would be a visible error', async () => {
      const { h, own } = await start();
      const normal = own(solidPixelTexture('none', [128, 128, 255, 255]));
      const mistaken = own(solidPixelTexture('srgb', [128, 128, 255, 255]));
      const raw = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));

      await h.checked(async () => {
        drawInto(h.backend, raw, spriteScene(normal, 2, 2));

        const data = await h.backend.readPixels(raw, 0, 0, 1, 1);

        expectBytes(data, [128, 128, 255, 255], 1);
        // Tangent-space x is 2 * 128/255 - 1, about 0.004; one code moves it by 0.008.
        expect(Math.abs((2 * data[0]!) / 255 - 1)).toBeLessThanOrEqual(0.02);

        drawInto(h.backend, raw, spriteScene(mistaken, 2, 2));

        const wrong = await h.backend.readPixels(raw, 0, 0, 1, 1);

        expect((2 * wrong[0]!) / 255 - 1).toBeLessThan(-0.5);
      });
    });

    for (const value of [2, 4, 16]) {
      test(`an HDR value of ${value} survives accumulation, an identity pass and the reinhard output map`, async ctx => {
        const { h, own } = await start();

        if (!h.backend.supportsColorFormat(TextureFormat.Rgba16F)) {
          // eslint-disable-next-line vitest/no-disabled-tests -- capability: names the missing format
          ctx.skip('Rgba16F is not renderable on this device');

          return;
        }

        const white = own(solidPixelTexture('srgb', [255, 255, 255, 255]));
        const hdr = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba16F }));
        const copy = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba16F }));
        const outputTransform = own(new OutputTransform());

        await h.checked(async () => {
          h.backend.setRenderTarget(hdr).clear(Color.transparentBlack);

          for (let pass = 0; pass < value; pass++) {
            const root = spriteScene(white, 2, 2, { additive: true });

            root.render(h.backend);
            h.backend.flush();
            root.destroy();
          }

          const raw = await h.backend.readPixels(hdr, 0, 0, 1, 1, 'float32');

          expect(Math.abs(raw[0]! - value)).toBeLessThanOrEqual(halfFloatTolerance(value));

          drawInto(h.backend, copy, spriteScene(hdr, 2, 2), Color.transparentBlack);

          const identity = await h.backend.readPixels(copy, 0, 0, 1, 1, 'float32');

          expect(Math.abs(identity[0]! - value)).toBeLessThanOrEqual(halfFloatTolerance(value));

          outputTransform.setOptions({ toneMapping: 'reinhard' });
          outputTransform.present(h.backend, hdr, false, Color.black);
          h.backend.flush();
          h.backend.setRenderTarget(null);

          const mapped = toByte(srgbEncode(value / (value + 1)));

          expectBytes(h.canvasPixel(0, 0), [mapped, mapped, mapped, 255]);
        });
      });
    }

    test('render-target GPU memory matches width * height * bytes-per-pixel and returns to baseline on release', async () => {
      const { h } = await start();
      const formats = [
        [TextureFormat.Rgba8, 4],
        [TextureFormat.Rgba8Srgb, 4],
        [TextureFormat.Rgba16F, 8],
        [TextureFormat.Rgba32F, 16],
      ] as const;

      await h.checked(async () => {
        for (const [format, bytesPerPixel] of formats) {
          if (!h.backend.supportsColorFormat(format)) continue;

          const baseline = h.backend.stats.gpuMemoryBytes;
          const target = new RenderTexture(5, 3, { format });

          // Clear-only: a draw would also grow shared per-frame storage, which is not the target's own footprint.
          h.backend.setRenderTarget(target).clear(Color.white);
          h.backend.flush();
          await h.backend.readPixels(target, 0, 0, 1, 1, bytesPerPixel > 4 ? 'float32' : 'uint8');

          expect(h.backend.stats.gpuMemoryBytes - baseline, `${format}: logical bytes of a 5x3 target`).toBe(5 * 3 * bytesPerPixel);

          h.backend.setRenderTarget(null);
          target.destroy();

          expect(h.backend.stats.gpuMemoryBytes, `${format}: baseline after release`).toBe(baseline);
        }
      });
    });

    test('repeated draws without a clear, resizes and target-format switches keep the exact result', async () => {
      const { h, own } = await start();
      const white = own(solidPixelTexture('srgb', [255, 255, 255, 255]));
      const gray = own(solidPixelTexture('srgb', [128, 128, 128, 255]));
      const feedback = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));
      const encoded = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb }));
      const raw = own(new RenderTexture(2, 2, { format: TextureFormat.Rgba8 }));

      await h.checked(async () => {
        // No clear between the two half-alpha draws: 0.5, then 0.5 + 0.5 * 0.5.
        drawInto(h.backend, feedback, spriteScene(white, 2, 2, { alpha: 0.5 }));
        drawInto(h.backend, feedback, spriteScene(white, 2, 2, { alpha: 0.5 }), null);
        expectBytes(await h.backend.readPixels(feedback, 0, 0, 1, 1), [toByte(0.75), toByte(0.75), toByte(0.75), 255]);

        const decoded = toByte(srgbDecode(128 / 255));

        for (const step of [1, 2, 3]) {
          drawInto(h.backend, encoded, spriteScene(gray, 2, 2));
          expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [128, 128, 128, 255]);
          drawInto(h.backend, raw, spriteScene(gray, 2, 2));
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [decoded, decoded, decoded, 255]);

          encoded.setSize(2 + step, 2 + step);
          expect(encoded.format).toBe(TextureFormat.Rgba8Srgb);
        }
      });
    });
  });
};
