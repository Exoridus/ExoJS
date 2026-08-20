/**
 * WebGL2 renderer-matrix browser tests - retained instruction-set replay.
 *
 * Pixel cells for the flush-level batch cache: a retained group whose
 * playback was recorded replays through `_replayRetainedBatch` from
 * group-owned resources (persistent instance buffer + group transform
 * texture) and must produce BYTE-IDENTICAL frames to the entry-replay slow
 * path - the recorded bytes ARE the slow path's bytes, the transform rows
 * are the same group-relative rows, and everything view/group-dependent is
 * resolved live at replay. Cells: tier byte-equality, camera pan and group
 * move on the replay path (no recapture - spy-asserted), child-mutation
 * fallback + recapture, tint change, texture swap.
 *
 * Scaffolded from webgl2-retained-container.test.ts.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

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

/** Full-framebuffer snapshot for byte-identical tier comparisons. */
const readCanvas = (backend: WebGl2Backend): Uint8Array => {
  const buf = new Uint8Array(canvasSize * canvasSize * 4);
  const gl = backend.context;

  gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  return buf;
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

/**
 * Standard cell scene: one live sprite OUTSIDE (and before) the retained
 * group, so the group's shared transform rows never start at row 0 - the
 * group-local node-index rebase is load-bearing in every pixel assertion,
 * and the replay path interleaves with a live batch every frame.
 *
 * Layout (canvas 64x64): blue outside sprite at (48,0)-(64,16); group at
 * (8,24) with a red sprite at group-local (0,0) -> world (8,24)-(24,40) and
 * a green sprite (distinct texture -> multi-slot batch) at group-local
 * (16,16) -> world (24,40)-(40,56).
 */
const buildScene = () => {
  const blue = createSolidTexture('#0000ff');
  const red = createSolidTexture('#ff0000');
  const green = createSolidTexture('#00ff00');
  const root = new Container();
  const outside = new Sprite(blue);
  const group = new RetainedContainer();
  const redSprite = new Sprite(red);
  const greenSprite = new Sprite(green);

  outside.setPosition(48, 0);
  root.addChild(outside);

  greenSprite.setPosition(16, 16);
  group.addChild(redSprite);
  group.addChild(greenSprite);
  group.setPosition(8, 24);
  root.addChild(group);

  const destroy = (): void => {
    root.destroy();
    blue.destroy();
    red.destroy();
    green.destroy();
  };

  return { root, group, redSprite, greenSprite, red, destroy };
};

const expectBaseScenePixels = (backend: WebGl2Backend): void => {
  expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live outside sprite
  expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 0, 0, 255]); // red inside the group
  expectPixelNear(readWebGl2Pixel(backend, 28, 44), [0, 255, 0, 255]); // green inside the group
  expectPixelNear(readWebGl2Pixel(backend, 4, 60), [0, 0, 0, 255]); // background
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 renderer matrix: retained instruction-set replay cells', () => {
  test('cell 1 — the instruction-replay tier is byte-identical to the entry-replay and collect tiers', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
    const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

    try {
      // F1 - full collect + fragment capture (slow tier).
      render(backend, scene.root);

      const collectFrame = readCanvas(backend);

      expectBaseScenePixels(backend);
      expect(replaySpy).not.toHaveBeenCalled();

      // F2 - entry replay + instruction recording (the recording source).
      render(backend, scene.root);

      const recordFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1);
      expect(replaySpy).not.toHaveBeenCalled();

      // F3/F4 - instruction splice: recorded batches replay from group-owned
      // resources. Same bytes, same rows, same live uniforms -> identical.
      render(backend, scene.root);

      const replayFrame = readCanvas(backend);

      expect(replaySpy).toHaveBeenCalled();

      render(backend, scene.root);

      const steadyFrame = readCanvas(backend);

      expect(beginSpy).toHaveBeenCalledTimes(1); // never re-recorded
      expectBaseScenePixels(backend);
      expect(recordFrame).toEqual(collectFrame);
      expect(replayFrame).toEqual(recordFrame);
      expect(steadyFrame).toEqual(recordFrame);
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — camera pan on the replay path: live projection, no recapture', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Pan the camera 16px right: everything must appear 16px further left.
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // replay, not recapture
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 36, 8), [0, 0, 255, 255]); // outside sprite 32..48
      expectPixelNear(readWebGl2Pixel(backend, 4, 28), [255, 0, 0, 255]); // red now at -8..8 (clipped) / 0..8 visible
      expectPixelNear(readWebGl2Pixel(backend, 12, 44), [0, 255, 0, 255]); // green now 8..24
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [0, 0, 0, 255]); // old red spot is background
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — group move on the replay path: one live group matrix relocates the cached batches', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // Move the WHOLE group: content revisions untouched (a group move is
      // decoupled by design), so the set keeps replaying - via live u_group.
      scene.group.setPosition(24, 8);
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 28, 12), [255, 0, 0, 255]); // red 24..40 x 8..24
      expectPixelNear(readWebGl2Pixel(backend, 44, 28), [0, 255, 0, 255]); // green 40..56 x 24..40
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [0, 0, 0, 255]); // old red spot is background
      expectPixelNear(readWebGl2Pixel(backend, 52, 8), [0, 0, 255, 255]); // live sprite unaffected
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — transform-only child move: fast row-patch on a real GPU, no re-record, pixels track the move', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');
      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      // A pure transform move on a direct child stays content-clean, so the
      // group keeps its recording and patches just this child's row in
      // place. The pixel readback is the stale-render guard on a real GPU.
      scene.redSprite.setPosition(32, 0); // world (40,24)-(56,40)
      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled(); // NO re-record: the recording is patched in place
      expect(replaySpy).toHaveBeenCalled(); // still splicing the instruction set
      expectPixelNear(readWebGl2Pixel(backend, 44, 28), [255, 0, 0, 255]); // patched to the NEW spot
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [0, 0, 0, 255]); // old spot cleared

      // The fast tier keeps splicing the patched row, byte-stable, no re-record.
      const patchedFrame = readCanvas(backend);

      render(backend, scene.root);

      expect(beginSpy).not.toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalledTimes(2);
      expect(readCanvas(backend)).toEqual(patchedFrame);
      expectPixelNear(readWebGl2Pixel(backend, 44, 28), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 28, 44), [0, 255, 0, 255]); // green sibling untouched
    } finally {
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — tint change inside the group is never served stale by the fast tier', async () => {
    const backend = await createBackend();
    // Tint multiplies the texture color per channel, so the tinted sprite
    // needs a WHITE texture for the tint to be pixel-observable.
    const white = createSolidTexture('#ffffff');
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(white);

    try {
      group.addChild(sprite);
      group.setPosition(8, 24);
      root.addChild(group);

      render(backend, root); // F1 capture
      render(backend, root); // F2 record
      render(backend, root); // F3 splice
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 255, 255, 255]);

      // Tint is baked into the recorded instance bytes (word 6) - the setter
      // bumps the content revision, so the set recaptures instead of
      // replaying stale bytes.
      sprite.tint = new Color(0, 255, 0);
      render(backend, root); // dirty collect
      render(backend, root); // recapture
      render(backend, root); // splice of the fresh recording

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, root); // steady replay

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [0, 255, 0, 255]); // white texture x green tint
    } finally {
      root.destroy();
      white.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — texture swap inside the group recaptures with the new texture binding', async () => {
    const backend = await createBackend();
    const scene = buildScene();
    const yellow = createSolidTexture('#ffff00');

    try {
      render(backend, scene.root); // F1 capture
      render(backend, scene.root); // F2 record
      render(backend, scene.root); // F3 splice
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 0, 0, 255]);

      // Texture identity is part of the recorded batch descriptor (slot
      // list); the swap bumps the content revision -> recapture.
      scene.redSprite.setTexture(yellow);
      render(backend, scene.root); // dirty collect
      render(backend, scene.root); // recapture
      render(backend, scene.root); // splice of the fresh recording

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, scene.root); // steady replay

      expect(replaySpy).toHaveBeenCalled();
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 255, 0, 255]); // yellow now
      expectPixelNear(readWebGl2Pixel(backend, 28, 44), [0, 255, 0, 255]); // sibling untouched
    } finally {
      yellow.destroy();
      scene.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — texture RESIZE inside the group is never served stale UVs by the fast tier', async () => {
    const backend = await createBackend();

    // Dedicated scene: the group sprite samples a canvas texture through a
    // PINNED 16x16 frame, so a source resize changes only the UV
    // normalization - the instance words the recorder baked are
    // view-independent DATA that would silently go stale. A resize bumps only
    // the texture version, never a node revision, so the fragment stays
    // clean and ONLY the backend's collect-time validation can catch it.
    const src = document.createElement('canvas');

    src.width = 16;
    src.height = 16;

    const ctx = src.getContext('2d')!;

    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 16, 16);

    const tex = new Texture(src);
    const blue = createSolidTexture('#0000ff');
    const root = new Container();
    const outside = new Sprite(blue); // keeps the group-local rebase load-bearing
    const group = new RetainedContainer();
    const sprite = new Sprite(tex);

    outside.setPosition(48, 0);
    sprite.textureFrame = new Rectangle(0, 0, 16, 16); // pinned across the resize
    group.addChild(sprite);
    group.setPosition(8, 24);
    root.addChild(outside);
    root.addChild(group);

    try {
      render(backend, root); // F1 capture
      render(backend, root); // F2 record
      render(backend, root); // F3 splice

      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 20, 36), [255, 0, 0, 255]);

      // Resize the source to 32x32: left half green, right half blue. The
      // recorded UV words are normalized against the OLD 16x16 size (u in
      // 0..1 over the full width); live packing normalizes the pinned 16x16
      // frame against the NEW 32x32 size (u in 0..0.5 -> pure green). A
      // stale replay samples the full new width, so blue bleeds into the
      // right half of the quad.
      src.width = 32;
      src.height = 32;
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(0, 0, 16, 32);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(16, 0, 16, 32);
      tex.updateSource();

      const beginSpy = vi.spyOn(backend, '_beginRetainedCapture');

      render(backend, root); // validation must reject -> live fallback + re-record

      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 20, 36), [0, 255, 0, 255]); // stale UVs would show BLUE here
      expect(beginSpy).toHaveBeenCalledTimes(1); // re-recorded the same frame

      const replaySpy = vi.spyOn(backend, '_replayRetainedBatch');

      render(backend, root); // the fresh recording replays

      expect(replaySpy).toHaveBeenCalled();
      expect(beginSpy).toHaveBeenCalledTimes(1);
      expectPixelNear(readWebGl2Pixel(backend, 20, 36), [0, 255, 0, 255]);

      // Same-size repaint: a pure content update keeps the recorded UVs
      // valid - the fast tier must keep replaying (no recapture) and sample
      // the re-uploaded pixels.
      ctx.fillStyle = '#ff00ff';
      ctx.fillRect(0, 0, 32, 32);
      tex.updateSource();
      replaySpy.mockClear();

      render(backend, root);

      expect(replaySpy).toHaveBeenCalled();
      expect(beginSpy).toHaveBeenCalledTimes(1); // still no recapture
      expectPixelNear(readWebGl2Pixel(backend, 12, 28), [255, 0, 255, 255]); // magenta via the valid cached UVs
    } finally {
      tex.destroy();
      blue.destroy();
      root.destroy();
      backend.destroy();
    }
  });
  test('cell 8 - a texture flipping vertically invalidates the recording instead of replaying stale UVs', async () => {
    const backend = await createBackend();
    const src = document.createElement('canvas');

    src.width = 16;
    src.height = 16;

    const ctx = src.getContext('2d')!;

    // Vertically asymmetric on purpose: a solid texture reads identically
    // flipped and could not catch a stale-orientation replay.
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 16, 8);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 8, 16, 8);

    const tex = new Texture(src);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(tex);

    group.addChild(sprite);
    group.setPosition(8, 24);
    root.addChild(group);

    try {
      render(backend, root); // F1 capture
      render(backend, root); // F2 record
      render(backend, root); // F3 splice

      expectPixelNear(readWebGl2Pixel(backend, 16, 28), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 16, 36), [0, 0, 255, 255]);

      // Orientation-only change: pixels, size and texture identity all stay as
      // recorded and no node revision bumps, so only backend-side validation
      // can catch that the recorded UV words carry the old vertical order.
      tex.flipY = true;

      render(backend, root); // validation must reject -> live fallback + re-record

      expectPixelNear(readWebGl2Pixel(backend, 16, 28), [0, 0, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 16, 36), [0, 255, 0, 255]);

      render(backend, root); // the fresh recording replays

      expectPixelNear(readWebGl2Pixel(backend, 16, 28), [0, 0, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 16, 36), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      tex.destroy();
      backend.destroy();
    }
  });
});
