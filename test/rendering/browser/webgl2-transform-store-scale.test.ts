/**
 * WebGL2 browser test - shared transform store past `MAX_TEXTURE_SIZE` rows.
 *
 * The store used to address a logical transform row as the transform texture's
 * Y coordinate, which capped a frame at `MAX_TEXTURE_SIZE` shared-transform
 * nodes: beyond that, allocating the texture failed with `GL_INVALID_VALUE`,
 * every `texelFetch` read an incomplete texture, and the scene rendered black
 * (measured on desktop Chromium at 20,000 sprites, limit 16384). Rows are now
 * packed several per texture line.
 *
 * These cells are pixel proofs rather than `getError()` checks: a marker sprite
 * at a row index far past the old limit has its own position AND its own tint,
 * so a shader that resolved high rows to the wrong texel - or clamped them to a
 * low line - fails here even when allocation succeeds.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { TRANSFORM_ROWS_PER_TEXTURE_LINE, TRANSFORM_TEXELS_PER_ROW } from '#rendering/shader/transformTextureLayout';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const canvasSize = 64;

// Comfortably past the 16384 the reproduced failure was measured at, and past
// every conformant context's guaranteed floor of 2048.
const wideNodeCount = 20000;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
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
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const createWhiteTexture = (size = 4): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

/** The store's private texture, read only to report the chosen dimensions. */
const transformTextureSize = (backend: WebGl2Backend): { width: number; height: number } => {
  const texture = (backend as unknown as { _transformTexture: { width: number; height: number } | null })._transformTexture;

  if (texture === null) throw new Error('The transform texture must exist after a frame that drew shared-transform nodes.');

  return { width: texture.width, height: texture.height };
};

const glErrorOf = (backend: WebGl2Backend): number => backend.context.getError();

/**
 * A scene of `nodeCount` sprites sharing one texture, all but the markers
 * stacked in a 4x4 corner so every one of them stays on screen (and therefore
 * consumes a transform row) without disturbing the sampled pixels.
 *
 * Markers sit at the listed child positions; the child order is the order the
 * plan assigns node indices in, so the last marker's row is `nodeCount - 1`.
 */
interface Marker {
  readonly childIndex: number;
  readonly x: number;
  readonly y: number;
  readonly tint: Color;
}

const buildWideScene = (nodeCount: number, markers: readonly Marker[], parent: Container) => {
  const texture = createWhiteTexture();
  const fillerTint = new Color(30, 30, 30);
  const byChildIndex = new Map(markers.map(marker => [marker.childIndex, marker]));
  const sprites: Sprite[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const sprite = new Sprite(texture);
    const marker = byChildIndex.get(i);

    if (marker === undefined) {
      sprite.setPosition(0, 0);
      sprite.tint = fillerTint;
    } else {
      sprite.setPosition(marker.x, marker.y);
      sprite.tint = marker.tint;
    }

    parent.addChild(sprite);
    sprites.push(sprite);
  }

  return { texture, sprites };
};

const expectMarkerPixels = (backend: WebGl2Backend, markers: readonly Marker[]): void => {
  for (const marker of markers) {
    // Sample the middle of the 4x4 marker quad: its colour is the tint (white
    // base texture), so one assertion covers both the transform row and the
    // tint row at that index.
    expectPixelNear(readWebGl2Pixel(backend, marker.x + 2, marker.y + 2), [marker.tint.r, marker.tint.g, marker.tint.b, 255]);
  }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 shared transform store beyond MAX_TEXTURE_SIZE', () => {
  test(`${wideNodeCount} shared-transform sprites allocate a 2D store and every marker row reads its own transform and tint`, async () => {
    const backend = await createBackend();
    const root = new Container();
    // Rows spread across the whole store: one in the first texture line, one
    // just past the old height limit, and one at the very last row.
    const markers: Marker[] = [
      { childIndex: 0, x: 8, y: 8, tint: new Color(255, 0, 0) },
      { childIndex: 16385, x: 24, y: 24, tint: new Color(0, 255, 0) },
      { childIndex: wideNodeCount - 1, x: 40, y: 40, tint: new Color(0, 0, 255) },
    ];
    const scene = buildWideScene(wideNodeCount, markers, root);

    try {
      render(backend, root);

      const size = transformTextureSize(backend);

      // The old layout asked for a `2 x capacity` texture, which is what failed:
      // capacity here is 32768, twice the measured limit. The packed layout is
      // wide and short instead.
      expect(size.width).toBe(TRANSFORM_ROWS_PER_TEXTURE_LINE * TRANSFORM_TEXELS_PER_ROW);
      expect(size.height).toBeLessThanOrEqual(backend.context.getParameter(backend.context.MAX_TEXTURE_SIZE) as number);
      expect(size.width * size.height).toBeGreaterThanOrEqual(wideNodeCount * TRANSFORM_TEXELS_PER_ROW);

      expect(glErrorOf(backend)).toBe(0);
      expectMarkerPixels(backend, markers);
      // Background stays clear: the markers landed where their own rows say,
      // not smeared across the canvas by a mis-resolved row.
      expectPixelNear(readWebGl2Pixel(backend, 60, 20), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      scene.texture.destroy();
      backend.destroy();
    }
  });

  test('a row index one past the old height limit resolves correctly', async () => {
    const backend = await createBackend();
    const root = new Container();
    const limit = backend.context.getParameter(backend.context.MAX_TEXTURE_SIZE) as number;
    // One row past what the height-indexed layout could address at all. The
    // marker IS that row, so this cell is red on the old store in the strongest
    // possible way: the texture cannot even be allocated.
    const nodeCount = limit + 1;
    const markers: Marker[] = [{ childIndex: nodeCount - 1, x: 32, y: 16, tint: new Color(255, 0, 255) }];
    const scene = buildWideScene(nodeCount, markers, root);

    try {
      render(backend, root);

      expect(glErrorOf(backend)).toBe(0);
      expectMarkerPixels(backend, markers);
    } finally {
      root.destroy();
      scene.texture.destroy();
      backend.destroy();
    }
  });

  test('moving a high-index node re-uploads its row: the old pixel clears, the new one is exact', async () => {
    const backend = await createBackend();
    const root = new Container();
    const markers: Marker[] = [{ childIndex: wideNodeCount - 1, x: 40, y: 40, tint: new Color(0, 200, 255) }];
    const scene = buildWideScene(wideNodeCount, markers, root);

    try {
      render(backend, root);
      expectMarkerPixels(backend, markers);

      // Move the highest row. Its dirty range is a texel span inside one
      // texture line, not the whole store.
      scene.sprites[wideNodeCount - 1]!.setPosition(16, 48);
      render(backend, root);

      expect(glErrorOf(backend)).toBe(0);
      expectPixelNear(readWebGl2Pixel(backend, 18, 50), [0, 200, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 42), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      scene.texture.destroy();
      backend.destroy();
    }
  });

  test('a retained group holding more than MAX_TEXTURE_SIZE rows replays, and a high row patches in place', async () => {
    const backend = await createBackend();
    const root = new Container();
    const group = new RetainedContainer();
    const markers: Marker[] = [
      { childIndex: 17000, x: 8, y: 40, tint: new Color(255, 128, 0) },
      { childIndex: wideNodeCount - 1, x: 40, y: 8, tint: new Color(0, 255, 128) },
    ];
    const scene = buildWideScene(wideNodeCount, markers, group);

    root.addChild(group);

    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');

    try {
      // F1 collect, F2 record, F3 replay from the group-owned transform store.
      render(backend, root);
      render(backend, root);
      render(backend, root);

      expect(glErrorOf(backend)).toBe(0);
      expectMarkerPixels(backend, markers);

      const recordings = beginSpy.mock.calls.length;

      // Transform-only move of the highest row in the group store: patched in
      // place, no recapture.
      scene.sprites[wideNodeCount - 1]!.setPosition(40, 24);
      render(backend, root);

      expect(beginSpy.mock.calls.length).toBe(recordings);
      expect(glErrorOf(backend)).toBe(0);
      expectPixelNear(readWebGl2Pixel(backend, 42, 26), [0, 255, 128, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 10), [0, 0, 0, 255]);
      // The other marker is untouched by the patch.
      expectPixelNear(readWebGl2Pixel(backend, 10, 42), [255, 128, 0, 255]);
    } finally {
      root.destroy();
      scene.texture.destroy();
      backend.destroy();
    }
  });
});
