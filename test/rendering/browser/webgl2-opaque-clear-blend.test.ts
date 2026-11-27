/**
 * WebGL2: a render texture cleared to an opaque colour keeps the fixed-function
 * Multiply shortcut for the rest of the frame, and renders exactly what the
 * backdrop compositor renders over the same, unprovable, coverage. Every clear
 * that does not leave the target opaque keeps the compositor. The WebGPU spec
 * asserts the same.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { BlendModes } from '#rendering/types';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Frame, readWebGl2Pixel, renderWebGl2Encoded } from './_backendSetup';
import { createSolidTexture } from './_crossRendererBlendScene';
import { buildOpaqueClearBlendScene, expectFramesNear, opaqueClearColor, opaqueClearSize } from './_opaqueClearBlendScene';
import { expectPixelNear, PIXEL_TOLERANCE } from './_pixels';

const renderScene = (backend: WebGl2Backend, fill: boolean, clear: Color): { frame: Uint8Array; composited: number } => {
  const scene = buildOpaqueClearBlendScene(fill);
  const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

  try {
    renderWebGl2Encoded(backend, scene.root, clear);

    return { frame: readWebGl2Frame(backend, opaqueClearSize), composited: compose.mock.calls.length };
  } finally {
    compose.mockRestore();
    scene.dispose();
  }
};

describe('WebGL2 Multiply over an opaque-cleared render texture', () => {
  test('keeps the fixed-function path and matches the backdrop compositor', async () => {
    const backend = await createWebGl2TestBackend(opaqueClearSize);

    try {
      const shortcut = renderScene(backend, false, opaqueClearColor);
      const composited = renderScene(backend, true, Color.transparentBlack);

      expect(shortcut.composited).toBe(0);
      expect(composited.composited).toBeGreaterThan(0);
      expectFramesNear(shortcut.frame, composited.frame, PIXEL_TOLERANCE);
    } finally {
      backend.destroy();
    }
  });

  test('a transparent clear keeps the compositor, which leaves the source untouched over nothing', async () => {
    const backend = await createWebGl2TestBackend(opaqueClearSize);
    const texture = createSolidTexture('rgb(140, 200, 250)');
    const root = new Container();
    const sprite = new Sprite(texture);

    sprite.blendMode = BlendModes.Multiply;
    root.addChild(sprite);

    const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

    try {
      renderWebGl2Encoded(backend, root, Color.transparentBlack);

      expect(compose).toHaveBeenCalled();
      // The fixed-function shortcut would multiply the source by black here.
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [140, 200, 250, 255]);
    } finally {
      compose.mockRestore();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test.each([
    ['a translucent clear', (backend: WebGl2Backend) => renderWebGl2Encoded(backend, new Container(), new Color(40, 60, 90, 0.5))],
    [
      'content kept from the previous frame',
      (backend: WebGl2Backend) => {
        renderWebGl2Encoded(backend, new Container(), opaqueClearColor);
        backend.resetStats();
      },
    ],
  ])('%s keeps the compositor', async (_name, prepare) => {
    const backend = await createWebGl2TestBackend(opaqueClearSize);
    const texture = createSolidTexture('rgb(140, 200, 250)');
    const sprite = new Sprite(texture);

    sprite.blendMode = BlendModes.Multiply;

    try {
      prepare(backend);

      const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

      sprite.render(backend);
      backend.flush();
      expect(compose).toHaveBeenCalled();
      compose.mockRestore();
    } finally {
      sprite.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
