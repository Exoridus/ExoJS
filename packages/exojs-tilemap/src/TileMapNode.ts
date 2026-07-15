import type { Rectangle } from '@codexo/exojs';
import { Container } from '@codexo/exojs';
import type { PixelSnapMode } from '@codexo/exojs/renderer-sdk';

import { aggregateChildLocalBounds } from './nodeBounds';
import { assertPixelSnapMode } from './pixelSnap';
import { TileLayerNode } from './TileLayerNode';
import type { TileMap } from './TileMap';

/**
 * Options for a {@link TileMapNode}.
 * @advanced
 */
export interface TileMapNodeOptions {
  /**
   * Whether the map's chunk nodes participate in per-chunk view culling.
   * Forwarded to every {@link TileLayerNode}. Defaults to `true`.
   */
  readonly cullable?: boolean;
}

/**
 * A convenience scene node that renders a whole {@link TileMap} as a
 * {@link Container} of one {@link TileLayerNode} per tile layer, in map layer
 * order (back-to-front by document order).
 *
 * `TileMapNode` owns **only** its layer nodes — never application actors. Use
 * it for the simple, non-interleaved case (no actors between layers); for
 * actor interleaving, place individual `TileLayerNode`s into your own scene
 * graph instead.
 *
 * The node references — but never owns — the {@link TileMap}: destroying the
 * node frees its layer/chunk nodes and their cached GPU geometry, while the
 * `TileMap` data and Loader-owned tileset textures survive (free them via
 * `TileMap.destroy()` / `Loader.destroy()` respectively).
 *
 * Layers added to or removed from the map after construction are reflected only
 * after {@link TileMapNode.refreshLayers}.
 *
 * @advanced
 */
export class TileMapNode extends Container {
  private readonly _map: TileMap;
  private readonly _cullChunks: boolean;
  private readonly _layerNodes: TileLayerNode[] = [];
  private _pixelSnapMode: PixelSnapMode = 'none';

  public constructor(map: TileMap, options?: TileMapNodeOptions) {
    super();

    this._map = map;
    this._cullChunks = options?.cullable ?? true;

    this._buildLayerNodes();
  }

  /** The runtime map this node renders. */
  public get map(): TileMap {
    return this._map;
  }

  /**
   * Render-only pixel-snap mode applied to every layer (and forwarded to every
   * chunk node, current and rebuilt). Snaps tile chunk origins to the active
   * render target's device-pixel grid for crisp tiles; with integer tile pitch
   * the grid stays exact and adjacent chunks/layers cannot drift apart. Purely
   * visual — tile data, layer offsets, chunk revisions, and culling are
   * unchanged. Setting the current value is a no-op; an invalid value throws and
   * leaves the prior mode unchanged.
   *
   * @default 'none'
   * @stable
   */
  public get pixelSnapMode(): PixelSnapMode {
    return this._pixelSnapMode;
  }

  public set pixelSnapMode(mode: PixelSnapMode) {
    if (mode === this._pixelSnapMode) {
      return;
    }

    assertPixelSnapMode(mode);
    this._pixelSnapMode = mode;

    for (const node of this._layerNodes) {
      node.pixelSnapMode = mode;
    }
  }

  /** The layer render nodes, in map layer order. */
  public get layerNodes(): readonly TileLayerNode[] {
    return this._layerNodes;
  }

  /** Find the layer node rendering the named layer, or `undefined`. */
  public getLayerNode(name: string): TileLayerNode | undefined {
    return this._layerNodes.find(node => node.layer.name === name);
  }

  /**
   * Rebuild the layer-node children from the map's current layers. Call after
   * layers are structurally added to or removed from the map.
   */
  public refreshLayers(): this {
    const previous = [...this._layerNodes];

    this.removeChildren();
    this._layerNodes.length = 0;

    for (const node of previous) {
      node.destroy();
    }

    this._buildLayerNodes();

    return this;
  }

  public override getLocalBounds(): Rectangle {
    const bounds = super.getLocalBounds();

    if (this._map.bounded) {
      bounds.set(0, 0, this._map.pixelWidth!, this._map.pixelHeight!);
    } else if (this._layerNodes.length > 0) {
      aggregateChildLocalBounds(this._layerNodes, bounds);
    }

    return bounds;
  }

  public override destroy(): void {
    const layerNodes = [...this._layerNodes];

    this._layerNodes.length = 0;

    super.destroy();

    for (const node of layerNodes) {
      node.destroy();
    }
  }

  private _buildLayerNodes(): void {
    for (const layer of this._map.layers) {
      const node = new TileLayerNode(layer, { cullable: this._cullChunks });

      if (this._pixelSnapMode !== 'none') {
        node.pixelSnapMode = this._pixelSnapMode;
      }

      this._layerNodes.push(node);
      this.addChild(node);
    }
  }
}
