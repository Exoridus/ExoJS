/**
 * WebGPU NineSliceSprite browser tests — opt-in, capability-aware.
 *
 * Validates the 9-region UV mapping that {@link NineSliceSprite} builds via
 * `buildNineSliceQuads`: a source texture is divided into 9 colour-coded
 * regions (4 corners, 4 edges, 1 center) and rendered at a destination size
 * much larger than the source. Correct UV mapping means:
 *  - Corners land at their exact destination position, unstretched.
 *  - Edges/center fill the remaining space (default `'stretch'` mode).
 *  - Each side's border can be sized independently (asymmetric borders),
 *    proving edges are scaled per-axis rather than uniformly.
 *
 * All WebGPU renderers use inline WGSL — no shader file mocks are needed.
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes } from '#rendering/types';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

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

// Read the presented WebGPU canvas back through a 2D canvas.
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

// ---------------------------------------------------------------------------
// Fixture: a 16x16 texture divided into 9 colour-coded regions with a uniform
// 4px slice inset on every side.
//
//   +----+--------+----+
//   | TL |  top   | TR |
//   +----+--------+----+
//   |left| center |right
//   +----+--------+----+
//   | BL | bottom | BR |
//   +----+--------+----+
//
// Nearest-neighbour sampling keeps region boundaries pixel-sharp: with the
// default linear filter, magnifying a 4px source region to a 12-24px
// destination bleeds a couple of screen pixels of the adjacent region's
// colour across every slice seam (expected GPU behaviour, not a bug), which
// would make boundary-pixel assertions flaky.
// ---------------------------------------------------------------------------

const colors = {
  tl: [255, 0, 0, 255],
  tr: [0, 255, 0, 255],
  bl: [0, 0, 255, 255],
  br: [255, 255, 0, 255],
  top: [255, 0, 255, 255],
  bottom: [0, 255, 255, 255],
  left: [255, 128, 0, 255],
  right: [128, 0, 255, 255],
  center: [255, 255, 255, 255],
} as const satisfies Record<string, RgbaTuple>;

const createNineSliceTexture = (): Texture => {
  const src = document.createElement('canvas');

  src.width = 16;
  src.height = 16;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = 'rgb(255, 0, 0)';
  ctx.fillRect(0, 0, 4, 4); // TL corner

  ctx.fillStyle = 'rgb(0, 255, 0)';
  ctx.fillRect(12, 0, 4, 4); // TR corner

  ctx.fillStyle = 'rgb(0, 0, 255)';
  ctx.fillRect(0, 12, 4, 4); // BL corner

  ctx.fillStyle = 'rgb(255, 255, 0)';
  ctx.fillRect(12, 12, 4, 4); // BR corner

  ctx.fillStyle = 'rgb(255, 0, 255)';
  ctx.fillRect(4, 0, 8, 4); // top edge

  ctx.fillStyle = 'rgb(0, 255, 255)';
  ctx.fillRect(4, 12, 8, 4); // bottom edge

  ctx.fillStyle = 'rgb(255, 128, 0)';
  ctx.fillRect(0, 4, 4, 8); // left edge

  ctx.fillStyle = 'rgb(128, 0, 255)';
  ctx.fillRect(12, 4, 4, 8); // right edge

  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(4, 4, 8, 8); // center

  return new Texture(src, { scaleMode: ScaleModes.Nearest });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU NineSliceSprite', () => {
  test('9-region UV mapping: corners, edges, and center land at their correct destination area', async ctx => {
    const backend = await setupBackend();

    const texture = createNineSliceTexture();
    const root = new Container();
    // Destination 48x48 at (8,8) → occupies [8,56) on both axes.
    // Uniform border of 12 → columns/rows at abs 8, 20, 44, 56.
    const sprite = new NineSliceSprite(texture, { slices: 4, border: 12, width: 48, height: 48 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Corner centers
      expectPixelNear(readPixel(14, 14), colors.tl);
      expectPixelNear(readPixel(50, 14), colors.tr);
      expectPixelNear(readPixel(14, 50), colors.bl);
      expectPixelNear(readPixel(50, 50), colors.br);

      // Edge centers
      expectPixelNear(readPixel(32, 14), colors.top);
      expectPixelNear(readPixel(32, 50), colors.bottom);
      expectPixelNear(readPixel(14, 32), colors.left);
      expectPixelNear(readPixel(50, 32), colors.right);

      // Center
      expectPixelNear(readPixel(32, 32), colors.center);

      // Corner/edge boundary sharpness (horizontal): the TL corner column
      // ends exactly at dest x=20 — one pixel inside remains corner colour,
      // one pixel past the boundary is already the (stretched) edge colour.
      expectPixelNear(readPixel(19, 14), colors.tl);
      expectPixelNear(readPixel(21, 14), colors.top);

      // Corner/edge boundary sharpness (vertical), same column.
      expectPixelNear(readPixel(14, 19), colors.tl);
      expectPixelNear(readPixel(14, 21), colors.left);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('asymmetric borders scale each edge independently per axis', async ctx => {
    const backend = await setupBackend();

    const texture = createNineSliceTexture();
    const root = new Container();
    // Destination fills the whole 64x64 canvas at (0,0).
    // border: left=8, top=16, right=24, bottom=32 (all different) →
    // columns at abs x = 0, 8, 40, 64; rows at abs y = 0, 16, 32, 64.
    const sprite = new NineSliceSprite(texture, {
      slices: 4,
      border: { left: 8, top: 16, right: 24, bottom: 32 },
      width: 64,
      height: 64,
    });

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Corner centers — each corner's footprint matches its own border size.
      expectPixelNear(readPixel(4, 8), colors.tl); // 8x16
      expectPixelNear(readPixel(52, 8), colors.tr); // 24x16
      expectPixelNear(readPixel(4, 48), colors.bl); // 8x32
      expectPixelNear(readPixel(52, 48), colors.br); // 24x32

      // Edge centers
      expectPixelNear(readPixel(24, 8), colors.top);
      expectPixelNear(readPixel(24, 48), colors.bottom);
      expectPixelNear(readPixel(4, 24), colors.left);
      expectPixelNear(readPixel(52, 24), colors.right);

      // Center
      expectPixelNear(readPixel(24, 24), colors.center);

      // Boundary sanity, at a margin clear of GPU raster rounding right on an
      // exact integer seam: still inside the top-left corner just before its
      // row boundary (y=16), then already past the (smaller) left border
      // (x=8) into the top edge, then already past the top border into the
      // left edge — proving left/top were honoured independently rather than
      // forced symmetric with right/bottom.
      expectPixelNear(readPixel(4, 12), colors.tl);
      expectPixelNear(readPixel(12, 8), colors.top);
      expectPixelNear(readPixel(4, 20), colors.left);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied uniformly across all nine regions', async ctx => {
    const backend = await setupBackend();

    const texture = createNineSliceTexture();
    const root = new Container();
    const sprite = new NineSliceSprite(texture, { slices: 4, border: 12, width: 48, height: 48 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0);
      root.addChild(sprite);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Center source colour is white; tinted red, it should render pure red.
      expectPixelNear(readPixel(32, 32), [255, 0, 0, 255]);
      // TR corner source colour is green; tinted red, the green channel must
      // be crushed out (red tint multiplies green/blue channels to 0).
      const trPixel = readPixel(50, 14);

      expect(trPixel[1]).toBeLessThan(32);
      expect(trPixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
