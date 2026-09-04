import type { RenderingApplicationOptions } from '#core/Application';
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
import { WebGl2NineSliceSpriteRenderer } from '#rendering/webgl2/WebGl2NineSliceSpriteRenderer';
import { WebGl2RepeatingSpriteRenderer } from '#rendering/webgl2/WebGl2RepeatingSpriteRenderer';
import { WebGl2SpriteRenderer } from '#rendering/webgl2/WebGl2SpriteRenderer';
import { WebGl2TextRenderer } from '#rendering/webgl2/WebGl2TextRenderer';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuNineSliceSpriteRenderer } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { WebGpuRepeatingSpriteRenderer } from '#rendering/webgpu/WebGpuRepeatingSpriteRenderer';
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
  const nineSliceRenderers: BackendRendererMap<NineSliceSprite> = {
    [RenderBackendType.WebGl2]: () => new WebGl2NineSliceSpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuNineSliceSpriteRenderer(),
  };
  const repeatingSpriteRenderers: BackendRendererMap<RepeatingSprite> = {
    [RenderBackendType.WebGl2]: () => new WebGl2RepeatingSpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuRepeatingSpriteRenderer(),
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
    defineRendererBinding([NineSliceSprite], backend => nineSliceRenderers[backend.backendType]?.()),
    defineRendererBinding([RepeatingSprite], backend => repeatingSpriteRenderers[backend.backendType]?.()),
  ];
};
