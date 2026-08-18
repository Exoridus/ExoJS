/**
 * WebGPU control cells for `webgl2-cache-as-texture-text.test.ts`.
 *
 * The contract is backend-independent - text must be correct on the first
 * frame it is drawn, and a `cacheAsTexture` subtree containing text must be
 * correct on its first bake - but the defect that motivated the WebGL2 suite
 * was a WebGL-only one (a global pixel-store flag leaking from one texture
 * upload into the next). WebGPU has no equivalent global upload state, so
 * these cells exist to prove the backend stays correct, not to reproduce
 * anything.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 96;

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

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
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

const red: readonly [number, number, number, number] = [255, 0, 0, 255];
const black: readonly [number, number, number, number] = [0, 0, 0, 255];

/** Mirrors the WebGL2 suite's scene and probes exactly. */
const buildScene = (): { root: Container; cached: Container } => {
  const root = new Container();
  const cached = new Container();
  const graphics = new Graphics();
  const text = new Text('MW', { fillColor: Color.white, fontSize: 24 });

  graphics.fillStyle = Color.red;
  graphics.drawRectangle(0, 0, 72, 72);
  text.setPosition(4, 4);

  cached.addChild(graphics);
  cached.addChild(text);
  root.addChild(cached);

  return { root, cached };
};

const expectContract = (backend: WebGpuBackend): void => {
  const readPixel = readWebGpuPixels(backend, canvasSize);

  expectPixelNear(readPixel(66, 66), red);
  expectPixelNear(readPixel(88, 88), black);
};

describe('WebGPU control: cacheAsTexture + Text correctness', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('cell 1 — a cached subtree with text is correct on the first bake and every replay', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    scene.cached.cacheAsTexture = true;

    try {
      if (!(await renderScene(ctx, backend, scene.root))) return;
      expectContract(backend);

      if (!(await renderScene(ctx, backend, scene.root))) return;
      expectContract(backend);

      scene.cached.invalidateCache();

      if (!(await renderScene(ctx, backend, scene.root))) return;
      expectContract(backend);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — UNcached text is correct on frame 0, not only from frame 1', async ctx => {
    const backend = await setupBackend();
    const scene = buildScene();

    try {
      if (!(await renderScene(ctx, backend, scene.root))) return;
      expectContract(backend);

      if (!(await renderScene(ctx, backend, scene.root))) return;
      expectContract(backend);
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });
});
