import type { RenderingApplicationOptions } from '#core/Application';
import type { RendererBinding } from '#extensions/Extension';
import { Mesh } from '#rendering/mesh/Mesh';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { Text } from '#rendering/text/Text';
import { WebGl2MeshRenderer } from '#rendering/webgl2/WebGl2MeshRenderer';
import { WebGl2NineSliceSpriteRenderer } from '#rendering/webgl2/WebGl2NineSliceSpriteRenderer';
import { WebGl2SpriteRenderer } from '#rendering/webgl2/WebGl2SpriteRenderer';
import { WebGl2TextRenderer } from '#rendering/webgl2/WebGl2TextRenderer';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuNineSliceSpriteRenderer } from '#rendering/webgpu/WebGpuNineSliceSpriteRenderer';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';

import { RenderBackendType } from './RenderBackendType';
import type { Renderer } from './Renderer';

/**
 * Build the core renderer binding array for a given rendering options config.
 * Text and BitmapText share one binding (same renderer class).
 * Particles are in @codexo/exojs-particles, not in Core.
 * @internal
 */
export function buildCoreRendererBindings(options: RenderingApplicationOptions): RendererBinding[] {
  const spriteRendererBatchSize = options.spriteRendererBatchSize ?? 4096;

  type BackendRendererMap = Partial<Record<RenderBackendType, () => Renderer>>;

  const spriteRenderers: BackendRendererMap = {
    [RenderBackendType.WebGl2]: () => new WebGl2SpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuSpriteRenderer(),
  };
  const meshRenderers: BackendRendererMap = {
    [RenderBackendType.WebGl2]: () => new WebGl2MeshRenderer(),
    [RenderBackendType.WebGpu]: () => new WebGpuMeshRenderer(),
  };
  const textRenderers: BackendRendererMap = {
    [RenderBackendType.WebGl2]: () => new WebGl2TextRenderer(),
    [RenderBackendType.WebGpu]: () => new WebGpuTextRenderer(),
  };
  const nineSliceRenderers: BackendRendererMap = {
    [RenderBackendType.WebGl2]: () => new WebGl2NineSliceSpriteRenderer(spriteRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuNineSliceSpriteRenderer(),
  };

  return [
    {
      targets: [Sprite],
      create: backend => spriteRenderers[backend.backendType]?.(),
    },
    {
      targets: [Mesh],
      create: backend => meshRenderers[backend.backendType]?.(),
    },
    {
      // Text and BitmapText share the same renderer class — one multi-target binding.
      targets: [Text, BitmapText],
      create: backend => textRenderers[backend.backendType]?.(),
    },
    {
      targets: [NineSliceSprite],
      create: backend => nineSliceRenderers[backend.backendType]?.(),
    },
  ];
}
