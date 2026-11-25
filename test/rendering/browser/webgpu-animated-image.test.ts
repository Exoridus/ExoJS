/**
 * WebGPU animated image textures: authored frames reach the screen, shared
 * handles upload once per frame, retained and cached subtrees refresh, and
 * repeated load/switch/destroy releases every decoder and frame.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { RenderNode } from '#rendering/RenderNode';

import { describeAnimatedImageRendering } from './_animatedImageScenes';
import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';

const canvasSize = 64;

describeAnimatedImageRendering({
  name: 'WebGPU',
  create: async () => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const proto = GPUQueue.prototype;
    const original = proto.copyExternalImageToTexture;
    let uploads = 0;
    let read: ReturnType<typeof readWebGpuPixels> | null = null;

    proto.copyExternalImageToTexture = function (this: GPUQueue, ...args: Parameters<GPUQueue['copyExternalImageToTexture']>) {
      uploads++;

      return original.apply(this, args);
    };

    return {
      render: async (ctx, root: RenderNode) => {
        const rendered = await renderWebGpuOnce(ctx, backend, root);

        read = rendered ? readWebGpuPixels(backend, canvasSize) : null;

        return rendered;
      },
      pixel: (x, y) => read!(x, y),
      uploads: () => uploads,
      destroy: () => {
        proto.copyExternalImageToTexture = original;
        backend.destroy();
      },
    };
  },
});
