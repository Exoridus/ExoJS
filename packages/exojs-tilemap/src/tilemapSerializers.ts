import type { NodeSerializer } from '@codexo/exojs';
import { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

import { TileMap } from './TileMap';
import { TileMapNode } from './TileMapNode';

// On-disk format: the mode is persisted as its NAME (readable JSON, robust
// against enum renumbering), mapped to/from the numeric enum here.
const pixelSnapModeNames: Record<PixelSnapMode, string> = {
  [PixelSnapMode.None]: 'none',
  [PixelSnapMode.Position]: 'position',
  [PixelSnapMode.Geometry]: 'geometry',
};

const pixelSnapModeFromName: Record<string, PixelSnapMode> = {
  none: PixelSnapMode.None,
  position: PixelSnapMode.Position,
  geometry: PixelSnapMode.Geometry,
};

/**
 * Scene serializer for {@link TileMapNode} — the convenience node that renders a
 * whole {@link TileMap}.
 *
 * Captures the **map reference** (its Loader source key) plus the render-only
 * `pixelSnapMode`; the per-layer / per-chunk nodes are derived from the map and
 * rebuilt on construction, so they are never written. The referenced `TileMap`
 * must be pre-loaded into the target Loader (e.g. `loader.load(Asset.kind('tileMap', 'world.tmj'))`)
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

    if (node.pixelSnapMode !== PixelSnapMode.None) {
      out.pixelSnapMode = pixelSnapModeNames[node.pixelSnapMode];
    }

    return out;
  },
  read(data, ctx) {
    const map = ctx.resolveAsset(typeof data.map === 'string' ? data.map : null, TileMap);

    if (map === null) {
      throw new Error('TileMapNode deserialize requires its TileMap to be pre-loaded into the Loader (procedural maps have no source key).');
    }

    const node = new TileMapNode(map);

    if (typeof data.pixelSnapMode === 'string') {
      const mode = pixelSnapModeFromName[data.pixelSnapMode];

      if (mode !== undefined) {
        node.pixelSnapMode = mode;
      }
    }

    return node;
  },
};
