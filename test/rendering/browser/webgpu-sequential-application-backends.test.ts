/**
 * Sequential `Application` lifecycles in ONE document and ONE JS realm.
 *
 * The DPR probe reloads the page to change backend rather than booting a second
 * one into the live page: while it was being built, the first WebGL2
 * `Application` on a page that had already run a WebGPU one was seen to fail on
 * `[ExoJS] shader: vertex shader failed to compile`, reaching the page as an
 * uncaught error while the cell still reported plausible timings. Several
 * `Application`s one after another is a valid engine lifecycle either way, so
 * this spec pins the whole order matrix — no reload, no fresh browser context,
 * no second document.
 *
 * The failure does NOT reproduce here, nor in the probe's own page under
 * Chromium or Edge, headless or headed, across all six probe scenes and forty
 * alternating crossings. That makes this a standing contract rather than a
 * regression test for a known-live defect: an ownership leak across the backend
 * boundary would surface as one of these six orders going red on whichever
 * machine or lane does hit it.
 *
 * Every sequence also watches `window`'s `error` and `unhandledrejection`: a
 * renderer failure that only surfaces as an uncaught error must fail the test,
 * not slip past a green pixel assertion. Both nets are verified to bite — a
 * deliberately broken `sprite.vert` fails five of the six orders with exactly
 * the message above.
 *
 * Runs in the WebGPU lane because that is the only browser project where BOTH
 * backends are available:  pnpm test:browser:webgpu
 */

import type { Application as ApplicationType } from '#core/Application';
import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGl2Pixel, readWebGpuPixels, webGpuAvailable } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;

type BackendChoice = 'webgl2' | 'webgpu';

/**
 * Collects everything that reaches the page instead of a caller: uncaught
 * errors, unhandled rejections, and the errors the engine reports through
 * `Application.onError` rather than throwing.
 */
interface ErrorSink {
  readonly entries: string[];
  release(): void;
}

const describeError = (value: unknown): string => {
  if (value instanceof Error) {
    // `RenderError.detail` carries the driver's compile log — the decisive part.
    const detail = (value as { detail?: unknown }).detail;

    return `${value.name}: ${value.message}${typeof detail === 'string' ? `\n${detail}` : ''}`;
  }

  return String(value);
};

const captureGlobalErrors = (): ErrorSink => {
  const entries: string[] = [];
  const onError = (event: ErrorEvent): void => {
    entries.push(`window.error — ${describeError(event.error ?? event.message)}`);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    entries.push(`unhandledrejection — ${describeError(event.reason)}`);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return {
    entries,
    release: (): void => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    },
  };
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

const startApplication = async (backend: BackendChoice, sink: ErrorSink): Promise<ApplicationType> => {
  const app = new Application({
    backend: { type: backend },
    clearColor: Color.black,
    hello: false,
    canvas: { width: canvasSize, height: canvasSize, pixelRatio: 1 },
    rendering: {
      webglAttributes: {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        // Readback happens outside a compositing frame, but an explicit
        // preserve keeps the assertion independent of when the browser presents.
        preserveDrawingBuffer: true,
        stencil: false,
        depth: false,
      },
    },
  });

  app.onError.add(error => {
    sink.entries.push(`Application.onError — ${describeError(error)}`);
  });

  await app.start();
  // The frame loop would keep clearing the surface underneath the manual
  // single-frame render below.
  app.stop();

  return app;
};

/** Draws one solid-colour sprite and asserts it landed, on whichever backend `app` ended up with. */
const renderAndAssertSprite = (app: ApplicationType): void => {
  const texture = createSolidTexture('#ff0000');
  const root = new Container();
  const sprite = new Sprite(texture);

  try {
    sprite.setPosition(8, 8);
    root.addChild(sprite);

    app.backend.resetStats();
    app.backend.clear(Color.black);
    app.rendering.render(root);
    app.backend.flush();

    if (app.backend instanceof WebGl2Backend) {
      expectPixelNear(readWebGl2Pixel(app.backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(app.backend, 40, 40), [0, 0, 0, 255]);
    } else {
      const read = readWebGpuPixels(app.backend as WebGpuBackend, canvasSize);

      expectPixelNear(read(16, 16), [255, 0, 0, 255]);
      expectPixelNear(read(40, 40), [0, 0, 0, 255]);
    }
  } finally {
    root.destroy();
    texture.destroy();
  }
};

const expectedBackendType = (choice: BackendChoice): RenderBackendType => (choice === 'webgpu' ? RenderBackendType.WebGpu : RenderBackendType.WebGl2);

/**
 * Runs the whole order end to end: each `Application` is created, rendered,
 * asserted and fully destroyed before the next one is constructed.
 */
const runSequence = async (
  ctx: { skip: (reason: string) => void },
  order: readonly BackendChoice[],
  options: { readonly awaitDestroy?: boolean } = {},
): Promise<void> => {
  const awaitDestroy = options.awaitDestroy ?? true;

  if (!(await webGpuAvailable())) {
    ctx.skip('no WebGPU adapter — a backend-crossing lifecycle cannot be measured here');

    return;
  }

  const sink = captureGlobalErrors();
  const teardowns: Array<Promise<void>> = [];

  try {
    for (const [index, choice] of order.entries()) {
      const app = await startApplication(choice, sink);

      try {
        expect(app.backend.backendType, `application ${index + 1} (${choice}) did not get the requested backend`).toBe(expectedBackendType(choice));

        renderAndAssertSprite(app);
      } finally {
        const teardown = app.destroy();

        teardowns.push(teardown);

        if (awaitDestroy) await teardown;
      }
    }

    // Every backend has to be back down before this spec yields the lane: the
    // browser projects run files concurrently, and a handful of undead GPU
    // devices/contexts is enough to starve a neighbouring spec's video decode.
    await Promise.all(teardowns);
    // Give a rejection queued during teardown a turn to surface.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(sink.entries, `uncaught errors during ${order.join(' → ')}:\n${sink.entries.join('\n\n')}`).toEqual([]);
  } finally {
    sink.release();
  }
};

describe('Sequential Application backends in one document', () => {
  test('WebGPU → destroy → WebGL2', async ctx => {
    await runSequence(ctx, ['webgpu', 'webgl2']);
  });

  test('WebGL2 → destroy → WebGPU', async ctx => {
    await runSequence(ctx, ['webgl2', 'webgpu']);
  });

  test('WebGPU → destroy → WebGPU', async ctx => {
    await runSequence(ctx, ['webgpu', 'webgpu']);
  });

  test('WebGL2 → destroy → WebGL2', async ctx => {
    await runSequence(ctx, ['webgl2', 'webgl2']);
  });

  test('WebGPU → WebGL2 → WebGPU → WebGL2 survives more than one crossing', async ctx => {
    await runSequence(ctx, ['webgpu', 'webgl2', 'webgpu', 'webgl2']);
  });

  // The probe fires `destroy()` and constructs the next Application without
  // awaiting it — the shape the failure was first seen in.
  test('WebGPU → un-awaited destroy → WebGL2', async ctx => {
    await runSequence(ctx, ['webgpu', 'webgl2'], { awaitDestroy: false });
  });
});
