/**
 * WebGPU tile-chunk single-pass browser test.
 *
 * `WebGpuTileChunkRenderer` used to write its shared instance buffer from offset
 * 0 on every flush and end (submit) the pass at the tail of each one. Since the
 * render pass survives a renderer switch, flush k+1's write would otherwise land
 * under the draws flush k had already recorded into the still-open pass —
 * `queue.writeBuffer` is ordered against the submit, not against the individual
 * draws inside it — so the unconditional pass end was load-bearing. A frame with
 * N tile-chunk flushes therefore cost N passes and N submits.
 *
 * The flush path now appends at a pass-scoped cursor and adds the base offset at
 * bind time, so the whole frame collapses to ONE pass and ONE submit. Distinct
 * tileset colours AND distinct positions per flush are what makes an aliasing
 * regression visible: a flush whose bytes were overwritten by a later one paints
 * the later tile's colour at the later tile's coordinates, leaving its own cell
 * at the black clear.
 *
 * The second test covers the other half of the same budget: a projection
 * rewrite is a pass boundary here, so the skip state has to compare group
 * CONTENT rather than the backend's monotonic group-transform id. A retained
 * group entered and left around tile chunks restores byte-identical group bytes
 * while that id advances twice — under an id comparison every boundary split
 * the frame, at one extra pass and submit per boundary.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { TileMapNode } from '@codexo/exojs-tilemap';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';
import { createSolidTexture, singleTileMap, wireTilemapRenderers } from './_tilemapScene';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;
const tileSize = 16;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  // Both bindings: the tilemap renderer draws the chunks, and the sprite
  // renderer closes the frame (see the trailing-sprite note below).
  wireTilemapRenderers(backend);
  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render `body` inside a validation error scope; returns false on a device-loss skip. */
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

/** Count `device.queue.submit` calls for exactly one invocation of `body`. */
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

const hexToRgba = (hex: string): RgbaTuple => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];

// One 16x16 tile per node, each on its OWN tileset texture: a texture change is
// what breaks the tile-chunk batch, so rendering these back to back produces one
// flush per node.
const tileColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] as const;
// Laid out across the top two rows of the 64x64 canvas, clear of the trailing
// sprite below.
const tilePositions = [
  [0, 0],
  [tileSize, 0],
  [0, tileSize],
  [tileSize, tileSize],
] as const;

describe('WebGPU tile-chunk single pass', () => {
  test('many tile-chunk flushes cost ONE pass and ONE submit, with per-flush pixels correct', async ctx => {
    const backend = await setupBackend();
    const tileTextures: Texture[] = tileColors.map(color => createSolidTexture(color, tileSize));
    const nodes = tileTextures.map((texture, i) => {
      const node = new TileMapNode(singleTileMap(texture));
      const [x, y] = tilePositions[i]!;

      node.setPosition(x, y);

      return node;
    });

    // Closing the frame on a SPRITE keeps the frame boundary out of the
    // measurement: with a tile chunk last, the NEXT frame's pending clear is
    // consumed by an empty pass of the tilemap renderer, which adds a pass
    // unrelated to what this test measures.
    const spriteColor = '#ff00ff';
    const spriteTexture = createSolidTexture(spriteColor, 8);
    const trailingSprite = new Sprite(spriteTexture);

    trailingSprite.setPosition(0, 48);
    trailingSprite.width = 8;
    trailingSprite.height = 8;

    const renderScene = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      for (const node of nodes) {
        node.render(backend);
      }

      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      // Warm up so pipelines are compiled, textures are uploaded and the shared
      // instance buffer has ratcheted up to the frame's total: a capacity growth
      // legitimately splits the pass, and sizing it to the post-split flush
      // would peg it at one flush forever.
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderScene))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderScene);

      // One draw call per tile-chunk flush, plus the trailing sprite.
      expect(backend.stats.drawCalls).toBe(tileColors.length + 1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      for (let i = 0; i < tileColors.length; i++) {
        const [x, y] = tilePositions[i]!;

        expectPixelNear(readPixel(x + tileSize / 2, y + tileSize / 2), hexToRgba(tileColors[i]!));
      }

      expectPixelNear(readPixel(4, 52), hexToRgba(spriteColor));
    } finally {
      nodes.forEach(node => node.destroy());
      tileTextures.forEach(texture => texture.destroy());
      trailingSprite.destroy();
      spriteTexture.destroy();
      backend.destroy();
    }
  });

  test('entering and leaving a group that restores identical group bytes costs ONE pass and ONE submit', async ctx => {
    const backend = await setupBackend();
    // Three of the four cells; the fourth stays at the black clear.
    const groupedColors = tileColors.slice(0, 3);
    const tileTextures: Texture[] = groupedColors.map(color => createSolidTexture(color, tileSize));
    const nodes = tileTextures.map((texture, i) => {
      const node = new TileMapNode(singleTileMap(texture));
      const [x, y] = tilePositions[i]!;

      node.setPosition(x, y);

      return node;
    });

    // A group sitting at the origin with no transform of its own composes to the
    // identity — the same matrix the ungrouped draws around it are projected
    // with. Entering and leaving it therefore restores BYTE-IDENTICAL group
    // bytes while the backend's group-transform id advances twice, which is
    // exactly the case the projection skip state must not read as a change: a
    // rewrite of the shared projection UBO is a pass boundary.
    const groupTransform = new Matrix();

    const spriteColor = '#ff00ff';
    const spriteTexture = createSolidTexture(spriteColor, 8);
    const trailingSprite = new Sprite(spriteTexture);

    trailingSprite.setPosition(0, 48);
    trailingSprite.width = 8;
    trailingSprite.height = 8;

    const renderGrouped = (): void => {
      backend.resetStats();
      backend.clear(Color.black);

      nodes[0]!.render(backend);
      backend._setRenderGroupTransform(groupTransform);
      nodes[1]!.render(backend);
      backend._setRenderGroupTransform(null);
      nodes[2]!.render(backend);
      trailingSprite.render(backend);
      backend.flush();
    };

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderGrouped))) {
          return;
        }
      }

      const groupIdBefore = backend.renderGroupTransformId;
      const submits = countSubmits(backend, renderGrouped);

      // The frame really crossed two group boundaries — without this the
      // counters below would pass for a frame that never entered a group.
      expect(backend.renderGroupTransformId - groupIdBefore).toBe(2);
      // One draw call per tile-chunk flush, plus the trailing sprite.
      expect(backend.stats.drawCalls).toBe(nodes.length + 1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      for (let i = 0; i < groupedColors.length; i++) {
        const [x, y] = tilePositions[i]!;

        expectPixelNear(readPixel(x + tileSize / 2, y + tileSize / 2), hexToRgba(groupedColors[i]!));
      }

      expectPixelNear(readPixel(4, 52), hexToRgba(spriteColor));
    } finally {
      nodes.forEach(node => node.destroy());
      tileTextures.forEach(texture => texture.destroy());
      trailingSprite.destroy();
      spriteTexture.destroy();
      backend.destroy();
    }
  });

  test('a fully mask-clipped tile-chunk flush does not open or count an extra pass', async ctx => {
    const backend = await setupBackend();
    // A sprite drawn first consumes the frame's pending clear and leaves a
    // pass open holding its draw. The tile node is wrapped in a container
    // clipped to a rectangle entirely off-canvas: `pushScissorRect` (which
    // ends the sprite's open pass — a genuine boundary) resolves the clip to
    // zero pixels, so the tile chunk's quads accumulate during `render()` but
    // the mask clips all of them by the time `flush()` observes the scissor.
    // With no clear pending at that point, `flush()` must not open (and count)
    // a pass no draw lands in.
    const spriteColor = '#ff00ff';
    const spriteTexture = createSolidTexture(spriteColor, 8);
    const sprite = new Sprite(spriteTexture);

    sprite.setPosition(0, 0);
    sprite.width = 8;
    sprite.height = 8;

    const tileColor = '#ff0000';
    const tileTexture = createSolidTexture(tileColor, tileSize);
    const node = new TileMapNode(singleTileMap(tileTexture));

    node.setPosition(32, 32);

    const clipped = new Container();

    clipped.clip = true;
    clipped.clipShape = new Rectangle(1000, 1000, 8, 8); // positive size, entirely off-canvas
    clipped.addChild(node);

    const renderScene = (): void => {
      backend.resetStats();
      backend.clear(Color.black);
      sprite.render(backend);
      clipped.render(backend);
      backend.flush();
    };

    try {
      for (let frame = 0; frame < 3; frame++) {
        if (!(await renderGuarded(ctx, backend, renderScene))) {
          return;
        }
      }

      const submits = countSubmits(backend, renderScene);

      // Only the sprite actually draws; the tile chunk's quads were all
      // clipped away.
      expect(backend.stats.drawCalls).toBe(1);
      expect(backend.stats.renderPasses).toBe(1);
      expect(submits).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(4, 4), hexToRgba(spriteColor));
      // The clipped tile never drew: its cell stays at the black clear.
      expectPixelNear(readPixel(32 + tileSize / 2, 32 + tileSize / 2), [0, 0, 0, 255]);
    } finally {
      clipped.destroy();
      (clipped.clipShape as Rectangle).destroy();
      tileTexture.destroy();
      sprite.destroy();
      spriteTexture.destroy();
      backend.destroy();
    }
  });
});
