/**
 * WebGPU effect / cache render-target resolution browser tests.
 *
 * The resolution POLICY is backend-agnostic (plan builder + effect executor) and
 * is pinned in detail by the WebGL2 twin. What is backend-specific, and what
 * this file exists for, is the two values the policy reads off the device:
 * `rootResolution` - derived from the canvas backing store against the logical
 * root target - and `maxTextureSize`, which on WebGPU comes from the granted
 * device's `maxTextureDimension2D` with the spec default standing in.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); this only skips when the software adapter drops the
 * device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WEBGPU_DEFAULT_MAX_TEXTURE_DIMENSION_2D } from '#rendering/webgpu/webgpuStorageLimits';

import { wireCoreRenderers } from './_coreRenderers';

/** Logical stage side, in design units. */
const LOGICAL = 64;
/** Side of the filtered/cached sprite, in logical units. */
const CONTENT = 32;

const makeApp = (canvas: HTMLCanvasElement, pixelRatio: number): Application =>
  ({
    canvas,
    options: { clearColor: Color.black, canvas: { width: LOGICAL, height: LOGICAL, pixelRatio } },
  }) as unknown as Application;

const setupBackend = async (pixelRatio: number): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = LOGICAL * pixelRatio;
  canvas.height = LOGICAL * pixelRatio;

  const backend = new WebGpuBackend(makeApp(canvas, pixelRatio));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

/** Record the texel size of every pooled render target the backend hands out. */
const recordTargetSizes = (backend: WebGpuBackend): { sizes: Array<[number, number]>; restore: () => void } => {
  const owner = backend as unknown as Record<string, unknown>;
  const original = backend.acquireRenderTexture.bind(backend);
  const sizes: Array<[number, number]> = [];

  owner['acquireRenderTexture'] = (width: number, height: number): RenderTexture => {
    sizes.push([width, height]);

    return original(width, height);
  };

  return {
    sizes,
    restore: (): void => {
      delete owner['acquireRenderTexture'];
    },
  };
};

const createSubject = (texture: Texture): Container => {
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = CONTENT;
  sprite.height = CONTENT;
  sprite.setPosition(0, 0);
  root.addChild(sprite);

  return root;
};

describe('WebGPU effect target resolution', () => {
  test('rootResolution is the ratio between the backing store and the logical root target', async () => {
    let backend: WebGpuBackend;

    try {
      backend = await setupBackend(2);
    } catch (error) {
      if (isDeviceLoss(error)) {
        return;
      }

      throw error;
    }

    try {
      expect(backend.rootResolution).toBe(2);
      expect(backend.renderTarget.width).toBe(LOGICAL);
    } finally {
      backend.destroy();
    }
  });

  test('maxTextureSize reports the granted device limit, never below the spec default', async () => {
    let backend: WebGpuBackend;

    try {
      backend = await setupBackend(1);
    } catch (error) {
      if (isDeviceLoss(error)) {
        return;
      }

      throw error;
    }

    try {
      // A conformant device is never granted less than the default, so anything
      // below it means the accessor read the wrong thing rather than that the
      // device is small.
      expect(backend.maxTextureSize).toBeGreaterThanOrEqual(WEBGPU_DEFAULT_MAX_TEXTURE_DIMENSION_2D);
    } finally {
      backend.destroy();
    }
  });

  test('a filter target and a cache target both inherit the surface resolution', async () => {
    let backend: WebGpuBackend;

    try {
      backend = await setupBackend(2);
    } catch (error) {
      if (isDeviceLoss(error)) {
        return;
      }

      throw error;
    }

    const texture = createSolidTexture('#ffffff');
    const filtered = createSubject(texture);
    const cached = createSubject(texture);
    const filter = new ColorMatrixFilter().tint(Color.white);
    const recorder = recordTargetSizes(backend);

    filtered.filters = [filter];
    cached.cacheAsTexture = true;

    try {
      backend.clear(Color.black);
      filtered.render(backend);
      cached.render(backend);
      backend.flush();

      expect(recorder.sizes).toEqual([
        [CONTENT * 2, CONTENT * 2],
        [CONTENT * 2, CONTENT * 2],
      ]);
      expect(cached._renderPlanGetCacheTexture()?.width).toBe(CONTENT * 2);
      expect(cached._renderPlanGetCacheTexture()?.height).toBe(CONTENT * 2);
    } finally {
      recorder.restore();
      filtered.destroy();
      cached.destroy();
      filter.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
