import type { Rectangle } from '@codexo/exojs';
import { Container } from '@codexo/exojs';
import type { PixelSnapMode, RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';

import { assertPixelSnapMode } from './pixelSnap';
import { TileChunkNode } from './TileChunkNode';
import type { TileLayer } from './TileLayer';

/**
 * Options for a {@link TileLayerNode}. All optional; reserved for forward
 * compatibility.
 * @advanced
 */
export interface TileLayerNodeOptions {
  /**
   * Whether the layer's chunk nodes participate in per-chunk view culling.
   * Defaults to `true`. Disable only for tiny, always-on-screen layers where
   * the per-chunk bounds test is pure overhead.
   */
  readonly cullable?: boolean;
}

/**
 * A scene node that renders one generic {@link TileLayer} as a
 * {@link Container} of per-chunk {@link TileChunkNode} drawables.
 *
 * Each non-empty loaded chunk becomes one child positioned at its pixel
 * origin, so the engine's existing per-node culling drops individual chunks and
 * the render-plan optimiser batches them by tileset texture. The layer's pixel
 * `offset` is applied to this node's transform; `visible` and `opacity` are
 * read live from the runtime layer on every frame (no rebuild required).
 *
 * The node references — but never owns — the {@link TileLayer}: destroying it
 * frees its chunk nodes and their cached geometry but leaves the layer, map,
 * and Loader-owned textures intact.
 *
 * Structural changes to the layer (tiles written into previously-empty chunks)
 * are reflected only after {@link TileLayerNode.refresh}; in-place edits to
 * existing chunks are picked up automatically via chunk revisions.
 *
 * @advanced
 */
export class TileLayerNode extends Container {
  private readonly _layer: TileLayer;
  private readonly _cullChunks: boolean;
  private readonly _chunkNodes: TileChunkNode[] = [];
  private _syncedOpacity = -1;
  private _pixelSnapMode: PixelSnapMode = 'none';
  private readonly _baseOffsetX: number;
  private readonly _baseOffsetY: number;

  public constructor(layer: TileLayer, options?: TileLayerNodeOptions) {
    super();

    this._layer = layer;
    this._cullChunks = options?.cullable ?? true;
    this._baseOffsetX = layer.offsetX;
    this._baseOffsetY = layer.offsetY;

    this.setPosition(layer.offsetX, layer.offsetY);
    this._buildChunkNodes();
  }

  /** The runtime layer this node renders. */
  public get layer(): TileLayer {
    return this._layer;
  }

  /**
   * Render-only pixel-snap mode applied to every chunk node in this layer (and
   * to chunks rebuilt later by {@link refresh}). Each chunk's rendered origin is
   * snapped to the active render target's device-pixel grid; because chunk
   * origins are integer multiples of the integer tile pitch from the same layer
   * origin, the whole grid stays exact and adjacent chunks cannot drift apart.
   *
   * Purely visual: tile data, the layer offset, chunk content revisions, and
   * culling bounds are never changed. `'geometry'` and `'position'` both resolve
   * to coherent origin snapping for tile chunks (chunk quads are already on the
   * integer pixel grid by construction). Setting the current value is a no-op;
   * an invalid value throws and leaves the prior mode unchanged.
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

    for (const chunk of this._chunkNodes) {
      chunk.pixelSnapMode = mode;
    }
  }

  /**
   * Rebuild the chunk-node children from the layer's current loaded chunks.
   * Call after structural mutation that creates or empties chunks. In-place
   * tile edits to existing chunks do not need a refresh.
   */
  public refresh(): this {
    const previous = [...this._chunkNodes];

    this.removeChildren();
    this._chunkNodes.length = 0;

    for (const child of previous) {
      child.destroy();
    }

    this._syncedOpacity = -1;
    this._buildChunkNodes();

    return this;
  }

  /** The chunk render nodes owned by this layer node, in build order. @internal */
  public get chunkNodes(): readonly TileChunkNode[] {
    return this._chunkNodes;
  }

  public override getLocalBounds(): Rectangle {
    const bounds = super.getLocalBounds();

    bounds.set(0, 0, this._layer.pixelWidth, this._layer.pixelHeight);

    return bounds;
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (!this._layer.visible) {
      return;
    }

    this._syncOpacity();

    const layer = this._layer;

    if (layer.parallaxX !== 1 || layer.parallaxY !== 1) {
      const camCenter = builder.view.center;
      const prevX = this.x;
      const prevY = this.y;

      this.x = this._baseOffsetX + camCenter.x * (1 - layer.parallaxX);
      this.y = this._baseOffsetY + camCenter.y * (1 - layer.parallaxY);

      super._collectContent(builder);

      this.x = prevX;
      this.y = prevY;
    } else {
      super._collectContent(builder);
    }
  }

  public override destroy(): void {
    const children = [...this._chunkNodes];

    this._chunkNodes.length = 0;

    super.destroy();

    for (const child of children) {
      child.destroy();
    }
  }

  private _buildChunkNodes(): void {
    const layer = this._layer;

    for (const chunk of layer.loadedChunks()) {
      if (chunk.empty) {
        continue;
      }

      const node = new TileChunkNode(
        chunk,
        layer.tilesets,
        layer.tileWidth,
        layer.tileHeight,
        layer.chunkWidth,
        layer.chunkHeight,
      );

      node.cullable = this._cullChunks;

      if (this._pixelSnapMode !== 'none') {
        node.pixelSnapMode = this._pixelSnapMode;
      }

      this._chunkNodes.push(node);
      this.addChild(node);
    }

    this._syncOpacity();
  }

  /** Propagate the layer's live opacity onto the chunk tints if it changed. */
  private _syncOpacity(): void {
    const opacity = this._layer.opacity;

    if (opacity === this._syncedOpacity) {
      return;
    }

    for (const child of this._chunkNodes) {
      child.tint.a = opacity;
    }

    this._syncedOpacity = opacity;
  }
}
