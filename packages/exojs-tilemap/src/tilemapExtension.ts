import type { Extension, RendererBinding } from '@codexo/exojs/extensions';
import type { RenderBackend } from '@codexo/exojs/rendering';
import { RenderBackendType } from '@codexo/exojs/rendering';

import { TileChunkNode } from './TileChunkNode';
import { WebGl2TileChunkRenderer } from './webgl2/WebGl2TileChunkRenderer';
import { WebGpuTileChunkRenderer } from './webgpu/WebGpuTileChunkRenderer';

/** Per-tile instance batch size for the WebGL2 tile chunk renderer. */
const tileRendererBatchSize = 4096;

/**
 * Build the renderer binding that wires the per-backend
 * {@link import('./TileChunkNode').TileChunkNode} renderers. The binding targets
 * the internal chunk drawable; applications never construct it directly — they
 * build {@link import('./TileMapNode').TileMapNode} /
 * {@link import('./TileLayerNode').TileLayerNode}, whose chunk children resolve
 * to this renderer through the registry prototype walk.
 */
function buildTileChunkRendererBinding(batchSize: number): RendererBinding {
  return {
    targets: [TileChunkNode],
    create(backend: RenderBackend) {
      if (backend.backendType === RenderBackendType.WebGl2) {
        return new WebGl2TileChunkRenderer(batchSize);
      }

      if (backend.backendType === RenderBackendType.WebGpu) {
        return new WebGpuTileChunkRenderer();
      }

      throw new Error(`Unsupported render backend: ${String(backend.backendType satisfies never)}`);
    },
  };
}

/**
 * Default immutable tilemap extension descriptor.
 *
 * Registers the WebGL2/WebGPU tile chunk renderers (`renderers`); it carries no
 * asset bindings — there is no generic on-disk tilemap format in this slice, so
 * format adapters (e.g. `@codexo/exojs-tiled`) own loading and depend on this
 * descriptor to pull in rendering.
 *
 * Install + register directly for procedural / hand-built maps
 * (`extensions: [tilemapExtension]` plus a `TileMap` built via the runtime), or
 * receive it transitively through a format adapter's `dependencies`.
 *
 * Use with `ApplicationOptions.extensions` or call
 * `import '@codexo/exojs-tilemap/register'` for global auto-registration.
 * @advanced
 */
export const tilemapExtension: Extension = Object.freeze({
  id: '@codexo/exojs-tilemap',
  renderers: [buildTileChunkRendererBinding(tileRendererBatchSize)],
});
