import { describe, expect, test } from 'vitest';

import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RendererRegistry } from '#rendering/RendererRegistry';
import { Video } from '#rendering/video/Video';
import { WebGl2SpriteRenderer } from '#rendering/webgl2/WebGl2SpriteRenderer';
import { WebGpuVideoRenderer } from '#rendering/webgpu/WebGpuVideoRenderer';

const makeVideoElement = (): HTMLVideoElement => document.createElement('video');

// `materializeRendererBindings` only reads `backend.backendType` and
// `backend.rendererRegistry`; `bindRenderer` connects a renderer only when the
// registry itself has been `.connect()`-ed to a backend, which never happens
// here, so `onConnect`/GPU setup never fires and no GPUDevice stub is needed.
const createStubBackend = (backendType: RenderBackendType): RenderBackend & { rendererRegistry: RendererRegistry<RenderBackend> } => {
  const rendererRegistry = new RendererRegistry<RenderBackend>();

  return { backendType, rendererRegistry } as unknown as RenderBackend & { rendererRegistry: RendererRegistry<RenderBackend> };
};

describe('Video renderer binding resolution', () => {
  test('WebGPU resolves Video to WebGpuVideoRenderer, not WebGpuSpriteRenderer', () => {
    const backend = createStubBackend(RenderBackendType.WebGpu);

    materializeRendererBindings(backend, buildCoreRendererBindings({}));

    const video = new Video(makeVideoElement());
    const renderer = backend.rendererRegistry.resolve(video);

    expect(renderer).toBeInstanceOf(WebGpuVideoRenderer);
    video.destroy();
  });

  test('WebGL2 still resolves Video to WebGl2SpriteRenderer via the prototype chain', () => {
    const backend = createStubBackend(RenderBackendType.WebGl2);

    materializeRendererBindings(backend, buildCoreRendererBindings({}));

    const video = new Video(makeVideoElement());
    const renderer = backend.rendererRegistry.resolve(video);

    expect(renderer).toBeInstanceOf(WebGl2SpriteRenderer);
    video.destroy();
  });
});
