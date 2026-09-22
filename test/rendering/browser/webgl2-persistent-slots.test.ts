/**
 * WebGL2 persistent-indexed selection - real pixels.
 *
 * The tier draws a render root out of slot-addressed stores rather than a
 * streamed instance buffer, so nothing about it is provable from a plan-level
 * counter alone: a store that is never uploaded, a stale slot, or a draw issued
 * in slot order instead of `(zIndex, seq)` order all produce a correct-looking
 * plan and wrong pixels. Every assertion here is therefore a framebuffer read
 * taken after the tier has demonstrably engaged (`drawCalls === 1` for the whole
 * root - the live path would need one per batch).
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { DerivedSlotStats } from '#rendering/plan/DerivedSelectionState';
import type { RenderNode } from '#rendering/RenderNode';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
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

/** What the last selection did to the root's slot table - allocations, reuse, stayers. */
const slotStatsOf = (root: RenderNode): DerivedSlotStats => {
  const slots = root._retainedRootRepresentation().derivedProduct?.slots;

  if (slots === undefined) {
    throw new Error('the root has no derived selection state');
  }

  return slots.stats;
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
  test('a live batch flushed after a slot draw keeps its own vertex layout', async () => {
    const backend = await createBackend();
    const rootA = new Container();
    const rootB = new Container();
    const a = new Sprite(solidTexture('#ff0000'));
    const b = new Sprite(solidTexture('#0000ff'));

    try {
      // Two roots on the slot tier, drawn one after the other in every frame.
      // Then both change, so the next frame falls back to one live batch over
      // the shared instance buffer - the batch's vertex array object must still
      // carry the batch layout, not the slot path's single-attribute one.
      a.setPosition(0, 0);
      b.setPosition(tile * 2, 0);
      rootA.addChild(a);
      rootB.addChild(b);
      rootA.cullable = false;
      rootB.cullable = false;

      const frame = (): void => {
        backend.resetStats();
        backend.clear(Color.black);
        rootA.render(backend);
        rootB.render(backend);
        backend.flush();
      };

      frame();
      backend.view.move(canvasSize * 100, 0);
      frame();
      backend.view.move(-canvasSize * 100, 0);
      frame();
      frame();

      expect(backend.stats.drawCalls).toBe(2);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);
      expectPixelNear(readWebGl2Pixel(backend, tile * 2 + 8, 8), blue);

      a.setPosition(0, tile);
      b.setPosition(tile * 2, tile);
      frame();

      expectPixelNear(readWebGl2Pixel(backend, 8, tile + 8), red);
      expectPixelNear(readWebGl2Pixel(backend, tile * 2 + 8, tile + 8), blue);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), black);
    } finally {
      rootA.destroy();
      rootB.destroy();
      backend.destroy();
    }
  });

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
      // not been touched since - a store that lost them would read black here.
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
    // is recorded after `first`, so `second` must win - which is the opposite of
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

      // Move `second` under `first` - a content change, so the source rebuilds
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

  test('a churning root reaches the tier and writes only the arrival', async () => {
    const backend = await createBackend();
    const root = new Container();
    const stayingTexture = solidTexture('#ff0000');
    const churnTexture = solidTexture('#0000ff');
    const staying = new Sprite(stayingTexture);
    let churning = new Sprite(churnTexture);

    try {
      staying.setPosition(0, 0);
      churning.setPosition(tile * 2, tile * 2);
      root.addChild(staying, churning);

      // The camera never moves, so nothing here can produce the two unchanged
      // rebuild frames the ordinary build gate wants: structural churn is what
      // earns the items, and the structure delta is what keeps them.
      for (let frame = 0; frame < 5; frame++) {
        render(backend, root);
        churning.destroy();
        churning = new Sprite(churnTexture);
        churning.setPosition(tile * 2, tile * 2);
        root.addChild(churning);
      }

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      // Exactly one slot written: the arrival. A frame that rebuilt the
      // representation instead would report both as entering and re-upload the
      // stayer's rows - correct pixels, none of the saving.
      expect(slotStatsOf(root).allocated).toBe(1);
      expect(slotStatsOf(root).retained).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), blue);
      expectPixelNear(readWebGl2Pixel(backend, 40, 8), black);
    } finally {
      root.destroy();
      stayingTexture.destroy();
      churnTexture.destroy();
      backend.destroy();
    }
  });

  test('an item that moved while its container churned is rewritten, not kept', async () => {
    const backend = await createBackend();
    const root = new Container();
    const movedTexture = solidTexture('#ff0000');
    const churnTexture = solidTexture('#0000ff');
    const moved = new Sprite(movedTexture);
    let churning = new Sprite(churnTexture);

    try {
      moved.setPosition(0, 0);
      churning.setPosition(tile * 2, 0);
      root.addChild(moved, churning);

      for (let frame = 0; frame < 5; frame++) {
        render(backend, root);
        churning.destroy();
        churning = new Sprite(churnTexture);
        churning.setPosition(tile * 2, 0);
        root.addChild(churning);
      }

      // A slot's rows are written once, when its item enters, so an item that
      // moved inside a re-discovered scope has to enter again - carrying it
      // would keep drawing it from the transform it had before.
      moved.setPosition(0, tile * 2);
      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 40), red);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), black);
      expectPixelNear(readWebGl2Pixel(backend, 40, 8), blue);
    } finally {
      root.destroy();
      movedTexture.destroy();
      churnTexture.destroy();
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

  test('a masked container inside the root is painted between two slot segments', async () => {
    const backend = await createBackend();
    const root = new Container();
    const left = new Sprite(solidTexture('#ff0000'));
    const clipped = new Container();
    const inner = new Sprite(solidTexture('#0000ff'));
    const right = new Sprite(solidTexture('#ff0000'));

    try {
      left.setPosition(0, 0);
      inner.setPosition(tile, 0);
      right.setPosition(tile * 2, 0);
      // The mask keeps the left half of the blue tile: the right half stays
      // black, which is what tells a clipped draw from an unclipped one.
      root.cullable = false;
      clipped.cullable = false;
      clipped.mask = new Rectangle(tile, 0, tile / 2, tile);
      clipped.addChild(inner);
      root.addChild(left);
      root.addChild(clipped);
      root.addChild(right);
      // The source gate wants two rebuild frames over unchanged content, and
      // a clean frame under a steady camera replays instead of rebuilding - so
      // the camera leaves and comes back. The mask content is a root of its
      // own and climbs on the same frames, which the two `cullable = false`
      // above are for: a culled container is not collected on the far frame.
      render(backend, root);
      backend.view.move(canvasSize * 100, 0);
      render(backend, root);
      backend.view.move(-canvasSize * 100, 0);
      settle(backend, root, 3);

      // The order stream holds both outer sprites and is cut once, so the
      // second segment starts at offset 1 - the slot it draws has to be the one
      // the stream names, not the one at the buffer's start.
      expect(slotStatsOf(root).orderEntries).toBe(2);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), red);
      expectPixelNear(readWebGl2Pixel(backend, tile + 4, 8), blue);
      expectPixelNear(readWebGl2Pixel(backend, tile + 12, 8), black);
      expectPixelNear(readWebGl2Pixel(backend, tile * 2 + 8, 8), red);

      // The mask is live: moving it to the right half takes effect on the next
      // frame - and the root stays on the slot tier for it, because an effect
      // change on a live entry is nothing the source recorded.
      clipped.mask = new Rectangle(tile + tile / 2, 0, tile / 2, tile);
      render(backend, root);

      expect(slotStatsOf(root).orderEntries).toBe(2);

      expectPixelNear(readWebGl2Pixel(backend, tile + 4, 8), black);
      expectPixelNear(readWebGl2Pixel(backend, tile + 12, 8), blue);
      expectPixelNear(readWebGl2Pixel(backend, tile * 2 + 8, 8), red);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a live batch pending from another renderer is issued before the slot draw', async () => {
    const backend = await createBackend();
    const liveRoot = new Container();
    const slotRoot = new Container();
    // A repeating sprite is served by its own renderer, so its batch is not
    // the sprite batcher's: only the backend's active-renderer flush drains it.
    const layer = new RepeatingSprite(solidTexture('#ff0000'), { width: tile * 2, height: tile });
    const cover = new Sprite(solidTexture('#0000ff'));

    try {
      liveRoot.cullable = false;
      slotRoot.cullable = false;
      liveRoot.addChild(layer);
      cover.setPosition(0, 0);
      slotRoot.addChild(cover);

      // The live root moves every frame and never settles; the slot root is
      // drawn after it and must paint over it.
      let frameIndex = 0;
      const frame = (): void => {
        layer.setPosition((frameIndex++ % 2) * 0.5, 0);
        backend.resetStats();
        backend.clear(Color.black);
        liveRoot.render(backend);
        slotRoot.render(backend);
        backend.flush();
      };

      frame();
      backend.view.move(canvasSize * 100, 0);
      frame();
      backend.view.move(-canvasSize * 100, 0);
      frame();
      frame();
      frame();

      expect(slotStatsOf(slotRoot).orderEntries).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), blue);
      expectPixelNear(readWebGl2Pixel(backend, tile + 8, 8), red);
    } finally {
      liveRoot.destroy();
      slotRoot.destroy();
      backend.destroy();
    }
  });
});
