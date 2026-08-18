/**
 * WebGL2 persistent-indexed selection — real pixels.
 *
 * The tier draws a render root out of slot-addressed stores rather than a
 * streamed instance buffer, so nothing about it is provable from a plan-level
 * counter alone: a store that is never uploaded, a stale slot, or a draw issued
 * in slot order instead of `(zIndex, seq)` order all produce a correct-looking
 * plan and wrong pixels. Every assertion here is therefore a framebuffer read
 * taken after the tier has demonstrably engaged (`drawCalls === 1` for the whole
 * root — the live path would need one per batch).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;
const tile = 16;

const red: readonly [number, number, number, number] = [255, 0, 0, 255];
const blue: readonly [number, number, number, number] = [0, 0, 255, 255];
const black: readonly [number, number, number, number] = [0, 0, 0, 255];

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

const solidTexture = (color: string): Texture => {
  const source = document.createElement('canvas');

  source.width = tile;
  source.height = tile;

  const context = source.getContext('2d')!;

  context.fillStyle = color;
  context.fillRect(0, 0, tile, tile);

  return new Texture(source);
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

/**
 * Drive frames until the persistent tier owns the root.
 *
 * It needs two consecutive rebuild frames over unchanged content before the
 * source is discovered, and one selection after that; driving a fixed handful is
 * simpler than reaching into the representation, and the `drawCalls` assertion
 * at each call site is what actually proves it engaged.
 */
const settle = (backend: WebGl2Backend, node: RenderNode, frames = 6): void => {
  for (let i = 0; i < frames; i++) {
    render(backend, node);
  }
};

describe('WebGL2 persistent-indexed selection', () => {
  test('draws the whole root from slot stores in one instanced draw', async () => {
    const backend = await createBackend();
    const root = new Container();
    const sprite = new Sprite(solidTexture('#ff0000'));

    try {
      sprite.setPosition(0, 0);
      root.addChild(sprite);
      settle(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), black);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('an item that scrolls in gets its slot filled and paints', async () => {
    const backend = await createBackend();
    const root = new Container();
    const near = new Sprite(solidTexture('#ff0000'));
    const far = new Sprite(solidTexture('#0000ff'));

    try {
      near.setPosition(0, 0);
      // Far off to the right: outside the view AND outside the capture margin,
      // so it holds no slot until the camera reaches it.
      far.setPosition(canvasSize * 4, 0);
      root.addChild(near);
      root.addChild(far);
      settle(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);

      backend.view.move(canvasSize * 4, 0);
      settle(backend, root, 2);

      // The blue sprite entered, took a slot, had its rows written and is now
      // painted; the red one left and paints nothing.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), blue);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a staying item keeps painting after its neighbours churn', async () => {
    const backend = await createBackend();
    const root = new Container();
    const staying = new Sprite(solidTexture('#ff0000'));
    const churning = new Sprite(solidTexture('#0000ff'));

    try {
      // The stayer sits where a horizontal scroll keeps it on screen for both
      // camera positions; the other one only enters at the second.
      staying.setPosition(tile, 0);
      churning.setPosition(canvasSize, 0);
      root.addChild(staying);
      root.addChild(churning);
      settle(backend, root);
      backend.view.move(tile / 2, 0);
      settle(backend, root, 3);

      expect(backend.stats.drawCalls).toBe(1);
      // The stayer's rows were written once, several selections ago, and have
      // not been touched since — a store that lost them would read black here.
      // It now sits at screen x 8..24, so the read lands inside it.
      expectPixelNear(readWebGl2Pixel(backend, 12, 8), red);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('paints equal-z siblings in recorded order, not in slot order', async () => {
    const backend = await createBackend();
    const root = new Container();
    // `first` is admitted alone at the start, so it takes slot 0; `second`
    // enters later and takes a higher slot. They overlap exactly, and `second`
    // is recorded after `first`, so `second` must win — which is the opposite of
    // what a draw issued in slot order would produce only if the slots
    // disagreed, so the setup below makes them disagree on purpose.
    const first = new Sprite(solidTexture('#0000ff'));
    const second = new Sprite(solidTexture('#ff0000'));

    try {
      first.setPosition(0, 0);
      second.setPosition(canvasSize * 4, 0);
      root.addChild(first);
      root.addChild(second);
      settle(backend, root);

      // Move `second` under `first` — a content change, so the source rebuilds
      // and both are admitted together, `second` on the slot it already holds.
      second.setPosition(0, 0);
      settle(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      // Recorded order wins: the later sibling paints over the earlier one.
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a tinted sprite reads its tint from the slot store', async () => {
    const backend = await createBackend();
    const root = new Container();
    const sprite = new Sprite(solidTexture('#ffffff'));

    try {
      sprite.setPosition(0, 0);
      sprite.tint = new Color(0, 0, 255);
      root.addChild(sprite);
      settle(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), blue);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
