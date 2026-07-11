/**
 * WebGPU sprite batcher texture-slot capacity — real-device acceptance test
 * (issue #274, F9b follow-up).
 *
 * The WebGPU sprite renderer used to hard-code 8 texture slots per batch;
 * the WGSL source and group(1) bind-group layout are now generated for a
 * slot count resolved from the granted device limits (16 base tier / 32
 * ceiling, see resolveSpriteBatchTextureSlots). These tests verify on the
 * REAL device that:
 *
 *  1. the device reaches at least the 16-slot tier (spec base limits),
 *  2. exactly `slots` distinct-texture sprites draw in ONE draw call — with
 *     pixel probes on slots >= 8 proving the generated shader's upper slots
 *     sample the right texture (not just that the draw count dropped),
 *  3. the (slots + 1)-th distinct texture still splits the batch.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { baseSpriteBatchTextureSlots, maxSpriteBatchTextureSlots, resolveSpriteBatchTextureSlots } from '#rendering/webgpu/WebGpuSpriteRenderer';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;
const gridColumns = 6;
const gridCell = 10;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// Distinct colours built from four channel levels (black skipped): any two
// distinct entries differ by at least 0x55 in some channel, far above the
// probe tolerance. Covers up to maxSpriteBatchTextureSlots + 1 = 33 entries.
const channelLevels = ['00', '55', 'aa', 'ff'] as const;
const paletteColor = (index: number): string => {
  const combo = index + 1; // +1 skips black (the clear colour)

  return `#${channelLevels[combo % 4]!}${channelLevels[Math.floor(combo / 4) % 4]!}${channelLevels[Math.floor(combo / 16) % 4]!}`;
};

const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

const createSolidTexture = (color: string, size = 8): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const ctx = source.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(source);
};

// A non-overlapping grid of solid sprites, one distinct texture per cell.
const buildGridScene = (textures: readonly Texture[]): Container => {
  const root = new Container();

  for (let i = 0; i < textures.length; i++) {
    const sprite = new Sprite(textures[i]!);

    sprite.setPosition((i % gridColumns) * gridCell, Math.floor(i / gridColumns) * gridCell);
    sprite.width = gridCell;
    sprite.height = gridCell;
    root.addChild(sprite);
  }

  return root;
};

const renderRoot = (backend: WebGpuBackend, root: Container): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 16): void => {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render `body`, skipping the test on a software-adapter device loss. */
const renderChecked = (ctx: { skip: (reason: string) => void }, body: () => void): boolean => {
  try {
    body();

    return true;
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }
};

describe('WebGPU sprite batcher texture-slot capacity (real device)', () => {
  test('the granted device limits reach at least the 16-slot tier', async () => {
    const backend = await setupBackend();

    try {
      const slots = resolveSpriteBatchTextureSlots(getBackendDevice(backend));

      // Spec base limits guarantee 16 sampled textures + 16 samplers per
      // stage; the backend requests up to the 32 ceiling.
      expect(slots).toBeGreaterThanOrEqual(baseSpriteBatchTextureSlots);
      expect(slots).toBeLessThanOrEqual(maxSpriteBatchTextureSlots);
    } finally {
      backend.destroy();
    }
  });

  test('exactly `slots` distinct textures draw in ONE draw call with correct pixels; the (slots+1)-th splits', async ctx => {
    const backend = await setupBackend();
    const slots = resolveSpriteBatchTextureSlots(getBackendDevice(backend));
    const colors = Array.from({ length: slots + 1 }, (_, i) => paletteColor(i));
    const textures = colors.map(color => createSolidTexture(color));
    const fullBatch = buildGridScene(textures.slice(0, slots));
    const overflow = buildGridScene(textures);

    try {
      // Warm up both scenes: pipelines, texture uploads, arena growth.
      for (let frame = 0; frame < 2; frame++) {
        if (!renderChecked(ctx, () => renderRoot(backend, fullBatch))) {
          return;
        }

        if (!renderChecked(ctx, () => renderRoot(backend, overflow))) {
          return;
        }
      }

      // `slots` distinct textures: ONE batch, ONE draw call.
      if (!renderChecked(ctx, () => renderRoot(backend, fullBatch))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);

      // Pixel probes prove the upper slots sample the RIGHT texture: cell 8
      // is the first slot past the legacy 8-slot layout, cell slots-1 is the
      // last slot of the generated layout.
      const readFull = readCanvas(backend);
      const probe = (read: (x: number, y: number) => RgbaTuple, index: number): void => {
        expectPixelNear(read((index % gridColumns) * gridCell + gridCell / 2, Math.floor(index / gridColumns) * gridCell + gridCell / 2), hexToRgba(colors[index]!));
      };

      probe(readFull, 0);
      probe(readFull, 7);
      probe(readFull, 8);
      probe(readFull, slots - 1);

      // One more distinct texture: the batch splits into exactly two draws.
      if (!renderChecked(ctx, () => renderRoot(backend, overflow))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(2);

      const readOverflow = readCanvas(backend);

      probe(readOverflow, 0);
      probe(readOverflow, slots - 1);
      probe(readOverflow, slots); // first sprite of the second batch
    } finally {
      fullBatch.destroy();
      overflow.destroy();
      textures.forEach(texture => texture.destroy());
      backend.destroy();
    }
  });
});
