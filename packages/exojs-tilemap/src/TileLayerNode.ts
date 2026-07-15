import type { Rectangle } from '@codexo/exojs';
import { Container } from '@codexo/exojs';
import type { PixelSnapMode, RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';

import { aggregateChildLocalBounds } from './nodeBounds';
import { assertPixelSnapMode } from './pixelSnap';
import type { ReadonlyTileChunk } from './TileChunk';
import { TileChunkNode } from './TileChunkNode';
import type { ChunkStructuralEvent, TileLayer } from './TileLayer';

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
 * Structural changes made via `_adoptChunk`/`_evictChunk` (chunk streaming)
 * are picked up incrementally as they happen, without a full rebuild.
 * {@link TileLayerNode.refresh} remains available for callers that mutate
 * chunk structure by other means (e.g. a bulk edit that bypasses
 * `_adoptChunk`/`_evictChunk`) and need a full resync. In-place tile edits to
 * existing chunks are picked up automatically via chunk revisions.
 *
 * @advanced
 */
export class TileLayerNode extends Container {
  private readonly _layer: TileLayer;
  private readonly _cullChunks: boolean;
  private readonly _chunkNodes: TileChunkNode[] = [];
  private _syncedOpacity = -1;
  private _syncedTint: number | null | undefined = undefined;
  private _pixelSnapMode: PixelSnapMode = 'none';
  private readonly _baseOffsetX: number;
  private readonly _baseOffsetY: number;

  /**
   * Bound once so `TileLayer._addStructuralListener`/`_removeStructuralListener`
   * add and remove the SAME function reference. Incrementally adds/removes
   * the `TileChunkNode` child for exactly the chunk that changed — never
   * triggers a full {@link refresh}, so every other chunk node's
   * revision-cached geometry survives untouched.
   */
  private readonly _onStructuralChange = (event: ChunkStructuralEvent): void => {
    const existingIndex = this._chunkNodes.findIndex(n => n.chunkX === event.cx && n.chunkY === event.cy);

    if (existingIndex !== -1) {
      const [existing] = this._chunkNodes.splice(existingIndex, 1);
      this.removeChild(existing!);
      existing!.destroy();
    }

    if (event.chunk === null || event.chunk.empty) {
      return;
    }

    const node = this._createChunkNode(event.chunk);

    this._chunkNodes.push(node);
    this.addChild(node);
    this._applyTint(node);
  };

  public constructor(layer: TileLayer, options?: TileLayerNodeOptions) {
    super();

    this._layer = layer;
    this._cullChunks = options?.cullable ?? true;
    this._baseOffsetX = layer.offsetX;
    this._baseOffsetY = layer.offsetY;

    this.setPosition(layer.offsetX, layer.offsetY);
    this._buildChunkNodes();

    if (!this._layer.bounded) {
      this.cullable = false;
    }

    this._layer._addStructuralListener(this._onStructuralChange);
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
    this._syncedTint = undefined;
    this._buildChunkNodes();

    return this;
  }

  /** The chunk render nodes owned by this layer node, in build order. @internal */
  public get chunkNodes(): readonly TileChunkNode[] {
    return this._chunkNodes;
  }

  public override getLocalBounds(): Rectangle {
    const bounds = super.getLocalBounds();

    if (this._layer.bounded) {
      bounds.set(0, 0, this._layer.pixelWidth!, this._layer.pixelHeight!);
    } else if (this._chunkNodes.length > 0) {
      aggregateChildLocalBounds(this._chunkNodes, bounds);
    }

    return bounds;
  }

  /** @internal */
  protected override _collectContent(builder: RenderPlanBuilder): void {
    if (!this._layer.visible) {
      return;
    }

    this._syncTint();

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
    this._layer._removeStructuralListener(this._onStructuralChange);

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

      const node = this._createChunkNode(chunk);

      this._chunkNodes.push(node);
      this.addChild(node);
    }

    this._syncTint();
  }

  /**
   * Construct one configured {@link TileChunkNode} for `chunk` — shared by
   * the initial bulk build ({@link _buildChunkNodes}) and the incremental
   * structural-listener handler, so a future constructor argument or
   * per-node setting only needs to be added in one place.
   */
  private _createChunkNode(chunk: ReadonlyTileChunk): TileChunkNode {
    const layer = this._layer;
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

    return node;
  }

  /**
   * Compute and apply this layer's live tint (opacity as alpha, `tintColor`
   * as RGB multiply) to a single chunk node. Used both by {@link _syncTint}'s
   * bulk pass and by the structural-listener handler for a freshly-added
   * node — a node added between two "nothing changed" full syncs must still
   * receive the current tint, which a change-detection-guarded bulk pass
   * alone would skip.
   */
  private _applyTint(node: TileChunkNode): void {
    const tintColor = this._layer.tintColor;
    const r = tintColor === null ? 255 : (tintColor >> 16) & 0xff;
    const g = tintColor === null ? 255 : (tintColor >> 8) & 0xff;
    const b = tintColor === null ? 255 : tintColor & 0xff;
    node.tint.set(r, g, b, this._layer.opacity);
  }

  /**
   * Propagate the layer's live opacity and tint colour onto every chunk
   * render tint if either changed since the last call. Opacity drives the
   * tint alpha; `tintColor` (`0xRRGGBB`) multiplies the RGB (white = no tint).
   */
  private _syncTint(): void {
    const opacity = this._layer.opacity;
    const tintColor = this._layer.tintColor;

    if (opacity === this._syncedOpacity && tintColor === this._syncedTint) {
      return;
    }

    for (const child of this._chunkNodes) {
      this._applyTint(child);
    }

    this._syncedOpacity = opacity;
    this._syncedTint = tintColor;
  }
}
