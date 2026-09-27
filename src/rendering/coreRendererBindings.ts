import type { RenderingApplicationOptions } from '#core/application/ApplicationOptions';
import { defineRendererBinding } from '#extensions/defineRendererBinding';
import type { RendererBinding } from '#extensions/Extension';
import { Mesh } from '#rendering/mesh/Mesh';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { Text } from '#rendering/text/Text';
import { Video } from '#rendering/video/Video';
import { WebGl2MeshRenderer } from '#rendering/webgl2/WebGl2MeshRenderer';
import { WebGl2ScalableSpriteRenderer } from '#rendering/webgl2/WebGl2ScalableSpriteRenderer';
import { WebGl2SpriteRenderer } from '#rendering/webgl2/WebGl2SpriteRenderer';
import { WebGl2TextRenderer } from '#rendering/webgl2/WebGl2TextRenderer';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuScalableSpriteRenderer } from '#rendering/webgpu/WebGpuScalableSpriteRenderer';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';
import { WebGpuVideoRenderer } from '#rendering/webgpu/WebGpuVideoRenderer';

import type { Drawable } from './Drawable';
import type { RenderBackend } from './RenderBackend';
import { RenderBackendType } from './RenderBackendType';
import type { Renderer } from './Renderer';

/**
 * Build the core renderer binding array for a given rendering options config.
 * Text and BitmapText share one binding (same renderer class).
 * Particles are in @codexo/exojs-particles, not in Core.
 * @internal
 */
export const buildCoreRendererBindings = (options: RenderingApplicationOptions): RendererBinding[] => {
  const spriteRendererBatchSize = options.spriteRendererBatchSize ?? 4096;

  type BackendRendererMap<Target extends Drawable> = Partial<Record<RenderBackendType, () => Renderer<RenderBackend, Target>>>;

  const spriteRenderers: BackendRendererMap<Sprite> = {
    [RenderBackendType.WebGl2]: () => new WebGl2SpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuSpriteRenderer(),
  };
  const meshRenderers: BackendRendererMap<Mesh> = {
    [RenderBackendType.WebGl2]: () => new WebGl2MeshRenderer(),
    [RenderBackendType.WebGpu]: () => new WebGpuMeshRenderer(),
  };
  const textRenderers: BackendRendererMap<Text | BitmapText> = {
    [RenderBackendType.WebGl2]: () => new WebGl2TextRenderer(),
    [RenderBackendType.WebGpu]: () => new WebGpuTextRenderer(),
  };
  const scalableSpriteRenderers: BackendRendererMap<NineSliceSprite | RepeatingSprite> = {
    [RenderBackendType.WebGl2]: () => new WebGl2ScalableSpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuScalableSpriteRenderer(),
  };
  const videoRenderers: BackendRendererMap<Video> = {
    [RenderBackendType.WebGpu]: () => new WebGpuVideoRenderer(),
  };

  return [
    defineRendererBinding([Sprite], backend => spriteRenderers[backend.backendType]?.()),
    defineRendererBinding([Video], backend => videoRenderers[backend.backendType]?.()),
    defineRendererBinding([Mesh], backend => meshRenderers[backend.backendType]?.()),
    // Text and BitmapText share the same renderer class - one multi-target binding.
    defineRendererBinding([Text, BitmapText], backend => textRenderers[backend.backendType]?.()),
    defineRendererBinding([NineSliceSprite, RepeatingSprite], backend => scalableSpriteRenderers[backend.backendType]?.()),
  ];
};
