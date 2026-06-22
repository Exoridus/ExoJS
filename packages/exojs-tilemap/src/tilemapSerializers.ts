import type { NodeSerializer } from '@codexo/exojs';
import type { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

import { TileMap } from './TileMap';
import { TileMapNode } from './TileMapNode';

/**
 * Scene serializer for {@link TileMapNode} — the convenience node that renders a
 * whole {@link TileMap}.
 *
 * Captures the **map reference** (its Loader source key) plus the render-only
 * `pixelSnapMode`; the per-layer / per-chunk nodes are derived from the map and
 * rebuilt on construction, so they are never written. The referenced `TileMap`
 * must be pre-loaded into the target Loader (e.g. `loader.load(TileMap, 'world.tmj')`)
 * before deserialize — procedurally-built maps have no source key and cannot be
 * referenced.
 *
 * Standalone `TileLayerNode` / `TileMapBand` placement (the actor-interleaving
 * cases) is not yet covered.
 *
 * @internal — registered via {@link tilemapExtension}'s `serializers` binding.
 */
export const tileMapNodeSerializer: NodeSerializer<TileMapNode> = {
  write(node, ctx) {
    const out: Record<string, unknown> = {};
    const source = ctx.keyFor(node.map);

    if (source !== null) {
      out.map = source;
    }

    if (node.pixelSnapMode !== 'none') {
      out.pixelSnapMode = node.pixelSnapMode;
    }

    return out;
  },
  read(data, ctx) {
    const map = ctx.resolveAsset(typeof data.map === 'string' ? data.map : null, TileMap);

    if (map === null) {
      throw new Error('TileMapNode deserialize requires its TileMap to be pre-loaded into the Loader (procedural maps have no source key).');
    }

    const node = new TileMapNode(map);

    // The TileMapNode setter validates the value (throws on an invalid mode).
    if (typeof data.pixelSnapMode === 'string') {
      node.pixelSnapMode = data.pixelSnapMode as PixelSnapMode;
    }

    return node;
  },
};
