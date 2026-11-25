/**
 * WebGL2 animated image textures: authored frames reach the screen, shared
 * handles upload once per frame, retained and cached subtrees refresh, and
 * repeated load/switch/destroy releases every decoder and frame.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';

import { describeAnimatedImageRendering } from './_animatedImageScenes';
import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';

const canvasSize = 64;

describeAnimatedImageRendering({
  name: 'WebGL2',
  create: async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const proto = WebGL2RenderingContext.prototype;
    const originalImage = proto.texImage2D;
    const originalSub = proto.texSubImage2D;
    let uploads = 0;

    const counts = (args: readonly unknown[]): boolean => {
      const last = args[args.length - 1];

      return typeof last === 'object' && last !== null && !ArrayBuffer.isView(last);
    };

    proto.texImage2D = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      if (counts(args)) {
        uploads++;
      }

      return (originalImage as (...args: unknown[]) => void).apply(this, args);
    } as typeof proto.texImage2D;
    proto.texSubImage2D = function (this: WebGL2RenderingContext, ...args: unknown[]) {
      if (counts(args)) {
        uploads++;
      }

      return (originalSub as (...args: unknown[]) => void).apply(this, args);
    } as typeof proto.texSubImage2D;

    return {
      render: async (_ctx, root: RenderNode) => {
        backend.resetStats();
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();

        return true;
      },
      pixel: (x, y) => readWebGl2Pixel(backend, x, y),
      uploads: () => uploads,
      destroy: () => {
        proto.texImage2D = originalImage;
        proto.texSubImage2D = originalSub;
        backend.destroy();
      },
    };
  },
});
