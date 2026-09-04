/**
 * Cross-backend pixel parity for browser-shaped text.
 *
 * The shaped path introduces a second raster source - whole lines the canvas
 * text engine laid out, packed into pages a node owns - alongside the shared
 * glyph atlas. Both backends have to consume it through the same seam and land
 * the same pixels, or the engine has two typographies.
 *
 * Runs in the `browser-webgpu` Chromium, where WebGPU and WebGL2 are both live
 * in one instance, so the comparison is within one browser and one font stack:
 * cross-BROWSER raster differences are expected and are not what this asserts.
 * Skips only when the software WebGPU adapter drops mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const ARABIC = 'العربية';
const HEBREW = 'שלום';
const MIXED = `Build 42 ${ARABIC}`;
const COMBINING = 'Café';

const canvasSize = 160;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
      rendering: {
        debug: false,
        webglAttributes: {
          antialias: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  }) as unknown as Application;

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  return canvas;
};

/** One scene per fixture, built fresh per backend so neither can inherit the other's state. */
const buildScene = (value: string, direction: 'ltr' | 'rtl'): Container => {
  const root = new Container();
  const text = new Text(value, { fillColor: Color.white, fontSize: 20, direction });

  text.setPosition(6, 6);
  root.addChild(text);

  return root;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const setupWebGpu = async (): Promise<WebGpuBackend> => {
  const backend = new WebGpuBackend(makeApp(makeCanvas()));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const renderWebGpu = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    expect(await device.popErrorScope()).toBeNull();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test - unstable software adapter');

      return false;
    }

    throw error;
  }

  return true;
};

const readWebGpu = (backend: WebGpuBackend): Uint8ClampedArray => {
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const rctx = readback.getContext('2d');

  if (!rctx) throw new Error('2D context required for readback.');

  rctx.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  return rctx.getImageData(0, 0, canvasSize, canvasSize).data;
};

const setupWebGl2 = async (): Promise<WebGl2Backend> => {
  const app = makeApp(makeCanvas());
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const renderWebGl2 = (backend: WebGl2Backend, root: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  root.render(backend);
  backend.flush();
};

/** Top-left-indexed RGBA readback for WebGL2 (flip the bottom-left GL buffer). */
const readWebGl2 = (backend: WebGl2Backend): Uint8Array => {
  const gl = backend.context;
  const flipped = new Uint8Array(canvasSize * canvasSize * 4);

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

  const out = new Uint8Array(canvasSize * canvasSize * 4);

  for (let y = 0; y < canvasSize; y++) {
    const src = (canvasSize - 1 - y) * canvasSize * 4;
    const dst = y * canvasSize * 4;

    out.set(flipped.subarray(src, src + canvasSize * 4), dst);
  }

  return out;
};

const luma = (frame: ArrayLike<number>, index: number): number => 0.299 * frame[index]! + 0.587 * frame[index + 1]! + 0.114 * frame[index + 2]!;

/** Coverage mask: 1 where luma > 128 (ink), else 0. */
const inkMask = (frame: ArrayLike<number>): Uint8Array => {
  const mask = new Uint8Array(canvasSize * canvasSize);

  for (let p = 0; p < mask.length; p++) {
    mask[p] = luma(frame, p * 4) > 128 ? 1 : 0;
  }

  return mask;
};

describe('Cross-backend parity: browser-shaped text renders identically on WebGL2 and WebGPU', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  const fixtures = [
    { label: 'Arabic', value: ARABIC, direction: 'ltr' },
    { label: 'Hebrew under an RTL base direction', value: HEBREW, direction: 'rtl' },
    { label: 'mixed Latin and Arabic', value: MIXED, direction: 'ltr' },
    { label: 'mixed Latin and Arabic under an RTL base direction', value: MIXED, direction: 'rtl' },
    { label: 'a combining sequence on the simple path', value: COMBINING, direction: 'ltr' },
  ] as const;

  for (const { label, value, direction } of fixtures) {
    test(`${label} lands the same pixels on both backends`, async ctx => {
      const gpu = await setupWebGpu();
      const gl = await setupWebGl2();
      const gpuScene = buildScene(value, direction);
      const glScene = buildScene(value, direction);

      if (!(await renderWebGpu(ctx, gpu, gpuScene))) return;

      renderWebGl2(gl, glScene);

      const gpuFrame = readWebGpu(gpu);
      const glFrame = readWebGl2(gl);
      const gpuMask = inkMask(gpuFrame);
      const glMask = inkMask(glFrame);

      let gpuInk = 0;
      let glInk = 0;
      let agree = 0;

      for (let p = 0; p < gpuMask.length; p++) {
        gpuInk += gpuMask[p]!;
        glInk += glMask[p]!;
        if (gpuMask[p] === glMask[p]) agree++;
      }

      // Both actually drew the line rather than an empty frame - the failure a
      // shaped path is most likely to produce is nothing at all.
      expect(gpuInk).toBeGreaterThan(40);
      expect(glInk).toBeGreaterThan(40);

      // Same shapes in the same place. A different bidi order or a missing
      // contextual form on one backend would move hundreds of pixels.
      expect(agree / gpuMask.length).toBeGreaterThan(0.97);
      expect(Math.abs(gpuInk - glInk)).toBeLessThan(gpuInk * 0.2);

      for (let p = 0; p < gpuMask.length; p++) {
        if (gpuMask[p] === 1 && glMask[p] === 1) {
          for (let c = 0; c < 3; c++) {
            expect(Math.abs(gpuFrame[p * 4 + c]! - glFrame[p * 4 + c]!)).toBeLessThanOrEqual(8);
          }
        }
      }
    });
  }

  test('a right-to-left base direction moves the ink, so the two are not the same picture', async ctx => {
    const gpu = await setupWebGpu();

    const ltrScene = buildScene(MIXED, 'ltr');
    const rtlScene = buildScene(MIXED, 'rtl');

    if (!(await renderWebGpu(ctx, gpu, ltrScene))) return;

    const ltrMask = inkMask(readWebGpu(gpu));

    if (!(await renderWebGpu(ctx, gpu, rtlScene))) return;

    const rtlMask = inkMask(readWebGpu(gpu));

    let differ = 0;

    for (let p = 0; p < ltrMask.length; p++) {
      if (ltrMask[p] !== rtlMask[p]) differ++;
    }

    // Reordering a mixed line has to be visible. If the base direction never
    // reached the browser both frames would be identical.
    expect(differ).toBeGreaterThan(20);
  });
});
