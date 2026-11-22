import { describe, expect, it } from 'vitest';

import { ImmediateMesh } from '#rendering/mesh/ImmediateMesh';
import { Mesh } from '#rendering/mesh/Mesh';
import { Sprite } from '#rendering/sprite/Sprite';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
import { WebGpuMeshRenderer } from '#rendering/webgpu/WebGpuMeshRenderer';
import { WebGpuScalableSpriteRenderer } from '#rendering/webgpu/WebGpuScalableSpriteRenderer';
import { WebGpuSpriteRenderer } from '#rendering/webgpu/WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from '#rendering/webgpu/WebGpuTextRenderer';
import { WebGpuVideoRenderer } from '#rendering/webgpu/WebGpuVideoRenderer';

import { makeTestApp, makeTestCanvas } from './browser/_backendSetup';
import { wireCoreRenderers } from './browser/_coreRenderers';

const createBackend = (): WebGpuBackend => new WebGpuBackend(makeTestApp(makeTestCanvas(128), 128));

describe('browser fixture renderer bindings', () => {
  it('retains every core WebGPU renderer by default', () => {
    const backend = createBackend();

    try {
      wireCoreRenderers(backend);

      expect([...backend.rendererRegistry.renderers()].map(renderer => renderer.constructor)).toEqual([
        WebGpuSpriteRenderer,
        WebGpuVideoRenderer,
        WebGpuMeshRenderer,
        WebGpuTextRenderer,
        WebGpuScalableSpriteRenderer,
      ]);
    } finally {
      backend.destroy();
    }
  });

  it('resolves the bounce scene sprites and lighting batches with only their two renderers', () => {
    const backend = createBackend();
    const sprite = new Sprite(null);
    const batchMesh = new ImmediateMesh();

    try {
      wireCoreRenderers(backend, {}, [Sprite, Mesh]);

      const renderer = backend.rendererRegistry.resolve(sprite);

      expect(renderer).toBeInstanceOf(WebGpuSpriteRenderer);
      expect(backend.rendererRegistry.resolve(batchMesh)).toBeInstanceOf(WebGpuMeshRenderer);
      expect([...backend.rendererRegistry.renderers()].length).toBe(2);
    } finally {
      sprite.destroy();
      batchMesh.destroy();
      backend.destroy();
    }
  });

  it('creates separate renderer state for each independently owned backend', () => {
    const first = createBackend();
    const second = createBackend();
    const sprite = new Sprite(null);

    try {
      wireCoreRenderers(first, {}, [Sprite, Mesh]);
      wireCoreRenderers(second, {}, [Sprite, Mesh]);

      const firstRenderer = first.rendererRegistry.resolve(sprite);
      const secondRenderer = second.rendererRegistry.resolve(sprite);

      expect(secondRenderer).not.toBe(firstRenderer);
      first.destroy();
      expect(second.rendererRegistry.resolve(sprite)).toBe(secondRenderer);
    } finally {
      sprite.destroy();
      first.destroy();
      second.destroy();
    }
  });
});
