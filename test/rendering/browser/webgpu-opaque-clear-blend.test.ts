/**
 * WebGPU: a render texture cleared to an opaque colour keeps the fixed-function
 * Multiply shortcut for the rest of the frame, and renders exactly what the
 * backdrop compositor renders over the same, unprovable, coverage. Every clear
 * that does not leave the target opaque keeps the compositor. The WebGL2 spec
 * asserts the same.
 *
 * A clear executes as the load op of the next GPU pass, so it also has to
 * execute with the colour it was requested with, not whatever clear colour is
 * current once that pass opens.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { StencilAttachmentMode } from '#rendering/pass/RenderPassDescriptor';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes, TextureFormat } from '#rendering/types';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { createWebGpuTestBackend, drawWebGpuEncoded, readWebGpuFrame, readWebGpuPixels, webGpuAvailable } from './_backendSetup';
import { createSolidTexture } from './_crossRendererBlendScene';
import { buildOpaqueClearBlendScene, expectFramesNear, opaqueClearColor, opaqueClearSize } from './_opaqueClearBlendScene';
import { expectPixelNear, PIXEL_TOLERANCE } from './_pixels';

interface SkipContext {
  skip: (reason: string) => void;
}

const renderScene = async (
  ctx: SkipContext,
  backend: WebGpuBackend,
  fill: boolean,
  clear: Color,
): Promise<{ frame: Uint8ClampedArray; composited: number } | null> => {
  const scene = buildOpaqueClearBlendScene(fill);
  const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

  try {
    if (!(await drawWebGpuEncoded(ctx, backend, () => scene.root.render(backend), clear))) {
      return null;
    }

    return { frame: readWebGpuFrame(backend, opaqueClearSize).slice(), composited: compose.mock.calls.length };
  } finally {
    compose.mockRestore();
    scene.dispose();
  }
};

const multiplySprite = (): { sprite: Sprite; dispose: () => void } => {
  const texture = createSolidTexture('rgb(140, 200, 250)');
  const sprite = new Sprite(texture);

  sprite.blendMode = BlendModes.Multiply;

  return {
    sprite,
    dispose: (): void => {
      sprite.destroy();
      texture.destroy();
    },
  };
};

describe('WebGPU Multiply over an opaque-cleared render texture', () => {
  test('keeps the fixed-function path and matches the backdrop compositor', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(opaqueClearSize);

    try {
      const shortcut = await renderScene(ctx, backend, false, opaqueClearColor);
      const composited = await renderScene(ctx, backend, true, Color.transparentBlack);

      if (shortcut === null || composited === null) {
        return;
      }

      expect(shortcut.composited).toBe(0);
      expect(composited.composited).toBeGreaterThan(0);
      expectFramesNear(shortcut.frame, composited.frame, PIXEL_TOLERANCE);
    } finally {
      backend.destroy();
    }
  });

  test('a transparent clear keeps the compositor, which leaves the source untouched over nothing', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(opaqueClearSize);
    const { sprite, dispose } = multiplySprite();
    const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

    try {
      if (!(await drawWebGpuEncoded(ctx, backend, () => sprite.render(backend), Color.transparentBlack))) {
        return;
      }

      expect(compose).toHaveBeenCalled();
      // The fixed-function shortcut would multiply the source by black here.
      expectPixelNear(readWebGpuPixels(backend, opaqueClearSize)(4, 4), [140, 200, 250, 255]);
    } finally {
      compose.mockRestore();
      dispose();
      backend.destroy();
    }
  });

  test('a translucent clear keeps the compositor', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(opaqueClearSize);
    const { sprite, dispose } = multiplySprite();
    const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

    try {
      if (!(await drawWebGpuEncoded(ctx, backend, () => sprite.render(backend), new Color(40, 60, 90, 0.5)))) {
        return;
      }

      expect(compose).toHaveBeenCalled();
    } finally {
      compose.mockRestore();
      dispose();
      backend.destroy();
    }
  });

  test('content kept from the previous frame keeps the compositor', async () => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(opaqueClearSize);
    const target = new RenderTexture(opaqueClearSize, opaqueClearSize, { format: TextureFormat.Rgba8Srgb });
    const { sprite, dispose } = multiplySprite();

    try {
      backend.resetStats();
      backend.setRenderTarget(target);
      backend.clear(opaqueClearColor);
      backend.flush();

      backend.resetStats();
      backend.setRenderTarget(target);

      const compose = vi.spyOn(backend, 'composeWithBackdropBlend');

      sprite.render(backend);
      backend.flush();
      expect(compose).toHaveBeenCalled();
      compose.mockRestore();
    } finally {
      backend.setRenderTarget(null);
      dispose();
      target.destroy();
      backend.destroy();
    }
  });

  test('a clear executes with its own colour after a child pass restores the previous one', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(opaqueClearSize);
    const empty = new Container();

    try {
      const drawn = await drawWebGpuEncoded(
        ctx,
        backend,
        () => {
          const coordinator = backend.passCoordinator;

          coordinator.withChildPass(
            {
              target: coordinator.activeTarget,
              view: coordinator.activeView,
              load: 'clear',
              clearColor: Color.red,
              stencil: StencilAttachmentMode.None,
            },
            () => empty.render(backend),
          );
        },
        Color.blue,
      );

      if (!drawn) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, opaqueClearSize)(4, 4), [255, 0, 0, 255]);
    } finally {
      empty.destroy();
      backend.destroy();
    }
  });
});
