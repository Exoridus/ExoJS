import type { RenderingApplicationOptions } from '@/core/Application';
import type { RendererBinding } from '@/extensions/Extension';
import { ParticleSystem } from '@/particles/ParticleSystem';

import { Mesh } from './mesh/Mesh';
import { RenderBackendType } from './RenderBackendType';
import type { Renderer } from './Renderer';
import { Sprite } from './sprite/Sprite';
import { BitmapText } from './text/BitmapText';
import { Text } from './text/Text';
import { WebGl2MeshRenderer } from './webgl2/WebGl2MeshRenderer';
import { WebGl2ParticleRenderer } from './webgl2/WebGl2ParticleRenderer';
import { WebGl2SpriteRenderer } from './webgl2/WebGl2SpriteRenderer';
import { WebGl2TextRenderer } from './webgl2/WebGl2TextRenderer';
import { WebGpuMeshRenderer } from './webgpu/WebGpuMeshRenderer';
import { WebGpuParticleRenderer } from './webgpu/WebGpuParticleRenderer';
import { WebGpuSpriteRenderer } from './webgpu/WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from './webgpu/WebGpuTextRenderer';

/**
 * Build the core renderer binding array for a given rendering options config.
 * Text and BitmapText share one binding (same renderer class).
 * Particles remain in core in PR-1 (moved to @codexo/exojs-particles in PR-2).
 * @internal
 */
export function buildCoreRendererBindings(options: RenderingApplicationOptions): RendererBinding[] {
  const spriteRendererBatchSize = options.spriteRendererBatchSize ?? 4096;
  const particleRendererBatchSize = options.particleRendererBatchSize ?? 8192;

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
  const particleRenderers: BackendRendererMap = {
    [RenderBackendType.WebGl2]: () => new WebGl2ParticleRenderer(particleRendererBatchSize),
    [RenderBackendType.WebGpu]: () => new WebGpuParticleRenderer(),
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
      targets: [ParticleSystem],
      create: backend => particleRenderers[backend.backendType]?.(),
    },
  ];
}
