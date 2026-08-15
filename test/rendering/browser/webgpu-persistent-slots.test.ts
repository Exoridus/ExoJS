/// <reference types="@webgpu/types" />

/**
 * WebGPU persistent-indexed selection — real pixels.
 *
 * The counterpart of `webgl2-persistent-slots.test.ts`, against the same plan
 * layer and the same slot semantics but a WebGPU-native store (four storage
 * buffers, an order stream indexed by `@builtin(instance_index)`, no vertex
 * buffer at all).
 *
 * Nothing about the tier is provable from a plan-level counter alone: a store
 * that is never uploaded, a stale slot, or a draw issued in slot order instead
 * of `(zIndex, seq)` order all produce a correct-looking plan and wrong pixels.
 * Every assertion here is therefore a framebuffer read taken after the tier has
 * demonstrably engaged (`drawCalls === 1` for the whole root — the live path
 * would need one per batch).
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { isDeviceLoss, readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;
const tile = 16;

const red: readonly [number, number, number, number] = [255, 0, 0, 255];
const blue: readonly [number, number, number, number] = [0, 0, 255, 255];
const black: readonly [number, number, number, number] = [0, 0, 0, 255];

const createBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  } as unknown as Application;

  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const solidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = tile;
  source.height = tile;

  const context = source.getContext('2d')!;

  context.fillStyle = color;
  context.fillRect(0, 0, tile, tile);

  return new Texture(source);
};

const render = (backend: WebGpuBackend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

/**
 * Drive frames until the persistent tier owns the root, then one more under a
 * validation scope so the final frame — the one every pixel assertion reads —
 * is proven free of WebGPU validation errors.
 *
 * The tier needs two consecutive rebuild frames over unchanged content before
 * the source is discovered, and one selection after that; driving a fixed
 * handful is simpler than reaching into the representation, and the `drawCalls`
 * assertion at each call site is what actually proves it engaged.
 *
 * Only the last frame is scoped: `pushErrorScope` around several `flush()`es
 * would fold more than one submit into one scope, which this suite has
 * established is not a supported shape.
 */
const settle = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, node: RenderNode, frames = 6): Promise<boolean> => {
  const device = getBackendDevice(backend);

  try {
    for (let i = 0; i < frames - 1; i++) {
      render(backend, node);
    }

    device.pushErrorScope('validation');
    render(backend, node);

    const validationError = await device.popErrorScope();

    expect(validationError).toBeNull();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  return true;
};

describe('WebGPU persistent-indexed selection', () => {
  test('draws the whole root from slot stores in one indexed draw', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const texture = solidTexture('#ff0000');
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(8, 8), red);
      expectPixelNear(readPixel(40, 40), black);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an item that scrolls in gets its slot filled and paints', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const nearTexture = solidTexture('#ff0000');
    const farTexture = solidTexture('#0000ff');
    const near = new Sprite(nearTexture);
    const far = new Sprite(farTexture);

    try {
      near.setPosition(0, 0);
      // Far off to the right: outside the view AND outside the capture margin,
      // so it holds no slot until the camera reaches it.
      far.setPosition(canvasSize * 4, 0);
      root.addChild(near);
      root.addChild(far);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), red);

      backend.view.move(canvasSize * 4, 0);

      if (!(await settle(ctx, backend, root, 2))) {
        return;
      }

      // The blue sprite entered, took a slot, had its rows written and is now
      // painted; the red one left and paints nothing.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), blue);
    } finally {
      root.destroy();
      nearTexture.destroy();
      farTexture.destroy();
      backend.destroy();
    }
  });

  test('a staying item keeps painting after its neighbours churn', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const stayingTexture = solidTexture('#ff0000');
    const churningTexture = solidTexture('#0000ff');
    const staying = new Sprite(stayingTexture);
    const churning = new Sprite(churningTexture);

    try {
      // The stayer sits where a horizontal scroll keeps it on screen for both
      // camera positions; the other one only enters at the second.
      staying.setPosition(tile, 0);
      churning.setPosition(canvasSize, 0);
      root.addChild(staying);
      root.addChild(churning);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      backend.view.move(tile / 2, 0);

      if (!(await settle(ctx, backend, root, 3))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);
      // The stayer's rows were written once, several selections ago, and have
      // not been touched since — a store that lost them would read black here.
      // It now sits at screen x 8..24, so the read lands inside it.
      expectPixelNear(readWebGpuPixels(backend, canvasSize)(12, 8), red);
    } finally {
      root.destroy();
      stayingTexture.destroy();
      churningTexture.destroy();
      backend.destroy();
    }
  });

  test('paints equal-z siblings in recorded order, not in slot order', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    // `first` is admitted alone at the start, so it takes slot 0; `second`
    // enters later and takes a higher slot. They then overlap exactly, and
    // `second` is recorded after `first`, so `second` must win — a draw issued
    // in physical slot order would produce the same answer only by accident,
    // which is why the setup makes the two orders disagree on purpose.
    const firstTexture = solidTexture('#0000ff');
    const secondTexture = solidTexture('#ff0000');
    const first = new Sprite(firstTexture);
    const second = new Sprite(secondTexture);

    try {
      first.setPosition(0, 0);
      second.setPosition(canvasSize * 4, 0);
      root.addChild(first);
      root.addChild(second);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      // Move `second` under `first` — a content change, so the source rebuilds
      // and both are admitted together, `second` on the slot it already holds.
      second.setPosition(0, 0);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);
      // Recorded order wins: the later sibling paints over the earlier one.
      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), red);
    } finally {
      root.destroy();
      firstTexture.destroy();
      secondTexture.destroy();
      backend.destroy();
    }
  });

  test('a tinted sprite reads its tint from the slot store', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const texture = solidTexture('#ffffff');
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.tint = new Color(0, 0, 255);
      root.addChild(sprite);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), blue);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a released slot is reused without aliasing the item that left', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const leavingTexture = solidTexture('#ff0000');
    const arrivingTexture = solidTexture('#0000ff');
    const leaving = new Sprite(leavingTexture);
    const arriving = new Sprite(arrivingTexture);

    try {
      // One item on screen, one far away. Scrolling swaps them: the departure's
      // slot goes back on the free list and the arrival pops it, so BOTH items
      // occupy the same physical slot across the two frames. A store that kept
      // the departed content would paint red where blue belongs.
      leaving.setPosition(0, 0);
      arriving.setPosition(canvasSize * 4, 0);
      root.addChild(leaving);
      root.addChild(arriving);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), red);

      backend.view.move(canvasSize * 4, 0);

      if (!(await settle(ctx, backend, root, 3))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), blue);

      // And back again, several ENTER/EXIT rounds later: the slot has now been
      // handed out twice in each direction and must still hold the right item.
      backend.view.move(-canvasSize * 4, 0);

      if (!(await settle(ctx, backend, root, 3))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGpuPixels(backend, canvasSize)(8, 8), red);
    } finally {
      root.destroy();
      leavingTexture.destroy();
      arrivingTexture.destroy();
      backend.destroy();
    }
  });

  test('two textures in one store sample through their own slots', async ctx => {
    const backend = await createBackend();
    const root = new Container();
    const redTexture = solidTexture('#ff0000');
    const blueTexture = solidTexture('#0000ff');
    const left = new Sprite(redTexture);
    const right = new Sprite(blueTexture);

    try {
      // Both on screen at once, side by side: one store, one draw, two entries
      // of the texture table — which is what the per-slot texture index in the
      // transform row's spare component addresses.
      left.setPosition(0, 0);
      right.setPosition(tile * 2, 0);
      root.addChild(left);
      root.addChild(right);

      if (!(await settle(ctx, backend, root))) {
        return;
      }

      expect(backend.stats.drawCalls).toBe(1);

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(8, 8), red);
      expectPixelNear(readPixel(tile * 2 + 8, 8), blue);
    } finally {
      root.destroy();
      redTexture.destroy();
      blueTexture.destroy();
      backend.destroy();
    }
  });
});
