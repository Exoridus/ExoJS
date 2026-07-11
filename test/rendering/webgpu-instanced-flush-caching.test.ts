/**
 * WebGPU nine-slice / repeating-sprite flush hot-path caching (issue #277, F5b).
 *
 * Both instanced renderers used to create a fresh single-texture bind group and
 * rewrite the 128-byte projection/group uniform on EVERY batch flush — per-frame
 * GPU object churn that scales with flush count even for completely static
 * scenes. These tests drive the REAL WebGpuBackend + renderers against a mock
 * device (see webgpuMockEnvironment) and require, after warmup:
 *
 * - a static frame creates ZERO new bind groups and issues ZERO projection
 *   writes while still drawing,
 * - a view mutation re-writes the projection exactly once, then skips again,
 * - a texture resize (fresh view identity) rebuilds the cached bind group once.
 */

import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { countLabel, createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

const renderFrame = (backend: WebGpuBackend, nodes: readonly RenderNode[]): void => {
  // resetStats is the frame boundary: it resets the frame-scoped transform
  // buffer (same driving pattern as the browser suite).
  backend.resetStats();
  backend.clear(Color.black);

  for (const node of nodes) {
    node.render(backend);
  }

  backend.flush();
};

describe('WebGPU NineSliceSprite flush hot-path caching', () => {
  const uniformLabel = 'nine-slice:uniform-buffer';
  const textureBindGroupLabel = 'nine-slice:texture-bind-group';

  const makeSprite = (texture: Texture): NineSliceSprite => new NineSliceSprite(texture, { slices: 4, border: 4, width: 48, height: 48 });

  test('a static frame after warmup creates no new bind groups and skips the projection write', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const texture = createCanvasTexture();
      const sprite = makeSprite(texture);

      renderFrame(backend, [sprite]);

      expect(environment.bindGroupCount()).toBeGreaterThan(0);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel)).toBe(1);

      const bindGroupsAfterWarmup = environment.bindGroupCount();
      const writesAfterWarmup = environment.writeBufferLabels().length;
      const drawsAfterWarmup = environment.drawIndexedCount();

      renderFrame(backend, [sprite]);

      expect(environment.drawIndexedCount()).toBe(drawsAfterWarmup + 1);
      expect(environment.bindGroupLabels().slice(bindGroupsAfterWarmup)).toEqual([]);
      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesAfterWarmup)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a view mutation re-writes the projection uniform exactly once, then skips again', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const texture = createCanvasTexture();
      const sprite = makeSprite(texture);

      renderFrame(backend, [sprite]);
      renderFrame(backend, [sprite]);

      const writesBeforePan = environment.writeBufferLabels().length;

      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesBeforePan)).toBe(1);

      const writesAfterPan = environment.writeBufferLabels().length;

      renderFrame(backend, [sprite]);

      expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesAfterPan)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a texture resize (fresh view identity) rebuilds the cached texture bind group once', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const source = document.createElement('canvas');

      source.width = 16;
      source.height = 16;

      const texture = new Texture(source);

      texture.generateMipMap = false;
      texture.updateSource();

      const sprite = makeSprite(texture);

      renderFrame(backend, [sprite]);
      renderFrame(backend, [sprite]); // warm: cache hit established

      const mark = environment.bindGroupLabels().length;

      source.width = 32;
      source.height = 32;
      texture.updateSource();
      renderFrame(backend, [sprite]);

      expect(countLabel(environment.bindGroupLabels(), textureBindGroupLabel, mark)).toBe(1);

      const afterRebuild = environment.bindGroupLabels().length;

      renderFrame(backend, [sprite]);

      expect(countLabel(environment.bindGroupLabels(), textureBindGroupLabel, afterRebuild)).toBe(0);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});

describe('WebGPU RepeatingSprite flush hot-path caching', () => {
  const uniformLabel = 'repeating-sprite:uniform-buffer';

  // A bare Texture source resolves to the shader (GPU-sampler-wrap) strategy;
  // a TextureRegion source resolves to the geometry (CPU repeat-quads) strategy.
  const makeShaderSprite = (texture: Texture): RepeatingSprite => new RepeatingSprite(texture, { width: 48, height: 48 });
  const makeGeoSprite = (texture: Texture): RepeatingSprite =>
    new RepeatingSprite(new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }), { width: 48, height: 48 });

  for (const [name, make, textureBindGroupLabel] of [
    ['shader', makeShaderSprite, 'repeating-sprite:texture-bind-group:shader'],
    ['geometry', makeGeoSprite, 'repeating-sprite:texture-bind-group:geo'],
  ] as const) {
    describe(`${name} strategy`, () => {
      test('a static frame after warmup creates no new bind groups and skips the projection write', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
          const backend = await createMockBackend(environment);
          const texture = createCanvasTexture();
          const sprite = make(texture);

          renderFrame(backend, [sprite]);

          expect(environment.bindGroupCount()).toBeGreaterThan(0);
          expect(countLabel(environment.writeBufferLabels(), uniformLabel)).toBe(1);

          const bindGroupsAfterWarmup = environment.bindGroupCount();
          const writesAfterWarmup = environment.writeBufferLabels().length;
          const drawsAfterWarmup = environment.drawIndexedCount();

          renderFrame(backend, [sprite]);

          expect(environment.drawIndexedCount()).toBe(drawsAfterWarmup + 1);
          expect(environment.bindGroupLabels().slice(bindGroupsAfterWarmup)).toEqual([]);
          expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesAfterWarmup)).toBe(0);

          backend.destroy();
        } finally {
          environment.restore();
        }
      });

      test('a view mutation re-writes the projection uniform exactly once, then skips again', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
          const backend = await createMockBackend(environment);
          const texture = createCanvasTexture();
          const sprite = make(texture);

          renderFrame(backend, [sprite]);
          renderFrame(backend, [sprite]);

          const writesBeforePan = environment.writeBufferLabels().length;

          backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
          renderFrame(backend, [sprite]);

          expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesBeforePan)).toBe(1);

          const writesAfterPan = environment.writeBufferLabels().length;

          renderFrame(backend, [sprite]);

          expect(countLabel(environment.writeBufferLabels(), uniformLabel, writesAfterPan)).toBe(0);

          backend.destroy();
        } finally {
          environment.restore();
        }
      });

      test('a texture resize (fresh view identity) rebuilds the cached texture bind group once', async () => {
        const environment = createMockWebGpuEnvironment();

        try {
          const backend = await createMockBackend(environment);
          const source = document.createElement('canvas');

          source.width = 16;
          source.height = 16;

          const texture = new Texture(source);

          texture.generateMipMap = false;
          texture.updateSource();

          const sprite = make(texture);

          renderFrame(backend, [sprite]);
          renderFrame(backend, [sprite]); // warm: cache hit established

          const mark = environment.bindGroupLabels().length;

          source.width = 32;
          source.height = 32;
          texture.updateSource();
          renderFrame(backend, [sprite]);

          expect(countLabel(environment.bindGroupLabels(), textureBindGroupLabel, mark)).toBe(1);

          const afterRebuild = environment.bindGroupLabels().length;

          renderFrame(backend, [sprite]);

          expect(countLabel(environment.bindGroupLabels(), textureBindGroupLabel, afterRebuild)).toBe(0);

          backend.destroy();
        } finally {
          environment.restore();
        }
      });
    });
  }
});
