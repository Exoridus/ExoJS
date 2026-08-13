/**
 * WebGPU sprite-variant group-content gates.
 *
 * NineSliceSprite and RepeatingSprite keep one shared projection UBO per
 * renderer. Entering and leaving an identity render group advances the
 * backend's group id twice but restores byte-identical matrix content. Those
 * boundaries must therefore neither rewrite the UBO nor split the open pass.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;
const spriteSize = 12;
const positions = [2, 20, 38] as const;
const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
] as const satisfies readonly RgbaTuple[];

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

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const createSolidTexture = (color: string, size = 8): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d')!;

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderGuarded = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, body: () => void): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    body();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

const countSubmits = (backend: WebGpuBackend, body: () => void): number => {
  const queue = getBackendDevice(backend).queue;
  const real = queue.submit.bind(queue);
  let count = 0;

  queue.submit = ((buffers: Iterable<GPUCommandBuffer>): undefined => {
    count++;

    return real(buffers);
  }) as GPUQueue['submit'];

  try {
    body();
  } finally {
    queue.submit = real;
  }

  return count;
};

type VariantSprite = NineSliceSprite | RepeatingSprite;

const verifyIdentityGroupKeepsSinglePass = async (
  ctx: { skip: (reason: string) => void },
  createVariant: (texture: Texture) => VariantSprite,
): Promise<void> => {
  const backend = await setupBackend();
  const white = createSolidTexture('#ffffff');
  const trailingTexture = createSolidTexture('#ff00ff');
  const variants = colors.map(([r, g, b], index) => {
    const sprite = createVariant(white);

    sprite.setPosition(positions[index]!, 2);
    sprite.tint = new Color(r, g, b, 1);

    return sprite;
  });
  const trailing = new Sprite(trailingTexture);

  trailing.setPosition(54, 2);
  trailing.width = 8;
  trailing.height = 8;

  const identityGroup = new Matrix();
  const render = (): void => {
    backend.resetStats();
    backend.clear(Color.black);

    variants[0]!.render(backend);
    backend._setRenderGroupTransform(identityGroup);
    variants[1]!.render(backend);
    backend._setRenderGroupTransform(null);
    variants[2]!.render(backend);
    trailing.render(backend);
    backend.flush();
  };

  try {
    for (let frame = 0; frame < 3; frame++) {
      if (!(await renderGuarded(ctx, backend, render))) {
        return;
      }
    }

    const groupIdBefore = backend.renderGroupTransformId;
    const submits = countSubmits(backend, render);

    expect(backend.renderGroupTransformId - groupIdBefore).toBe(2);
    expect(backend.stats.drawCalls).toBe(variants.length + 1);
    expect(backend.stats.renderPasses).toBe(1);
    expect(submits).toBe(1);

    const readPixel = readWebGpuPixels(backend, canvasSize);

    for (let i = 0; i < variants.length; i++) {
      expectPixelNear(readPixel(positions[i]! + spriteSize / 2, 2 + spriteSize / 2), colors[i]!);
    }

    expectPixelNear(readPixel(58, 6), [255, 0, 255, 255]);
  } finally {
    variants.forEach(sprite => sprite.destroy());
    trailing.destroy();
    white.destroy();
    trailingTexture.destroy();
    backend.destroy();
  }
};

describe('WebGPU sprite variants — group content keeps a single pass', () => {
  test('NineSliceSprite ignores identity-only group id changes', async ctx => {
    await verifyIdentityGroupKeepsSinglePass(ctx, texture => new NineSliceSprite(texture, { slices: 2, border: 2, width: spriteSize, height: spriteSize }));
  });

  test('RepeatingSprite ignores identity-only group id changes', async ctx => {
    await verifyIdentityGroupKeepsSinglePass(ctx, texture => new RepeatingSprite(texture, { width: spriteSize, height: spriteSize }));
  });
});
