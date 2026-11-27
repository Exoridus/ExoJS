import type { ReadonlyRectangle } from '@codexo/exojs';
import { Container } from '@codexo/exojs';
import { PixelSnapMode, type RenderPlanBuilder } from '@codexo/exojs/renderer-sdk';

import { type ArtworkReach, artworkReach, needsRowOrder } from './chunkGeometry';
import { aggregateChildLocalBounds } from './nodeBounds';
import { assertPixelSnapMode } from './pixelSnap';
import { type ReadonlyTileChunk, TileChunk } from './TileChunk';
import { TileChunkNode } from './TileChunkNode';
import type { ChunkStructuralEvent, TileLayer } from './TileLayer';
import { PACKED_TILESET_MASK, PACKED_TILESET_SHIFT, type PackedTile } from './types';

const drawOrder = (a: TileChunkNode, b: TileChunkNode): number => a.depth - b.depth || a.firstColumn - b.firstColumn;

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
 * Tiles stack as Tiled draws them, whatever order the chunks were loaded in;
 * orthogonal layers always use Tiled's `right-down` render order. Orthogonal
 * chunks become one child each, or one child per row when the tilesets' artwork
 * can reach across a chunk column into another row (such as a tile both wider
 * and taller than the grid). Isometric chunks become diagonal slices ordered
 * across storage boundaries, preserving painter order and texture runs. Each
 * drawable has its own culling bounds, which include the artwork overhanging
 * its cells. The layer's pixel `offset`, `visible` and `opacity` are all read
 * live from the runtime layer on every frame (no rebuild required).
 *
 * A `parallax` factor other than `1` makes this node's rendered position
 * camera-dependent, resolved per frame in {@link _collectContent} by patching
 * the node position against the camera centre, then restoring it - the cull
 * test runs before that patch, so a bounded layer with parallax would be
 * culled at its static base-offset bounds while actually rendering elsewhere.
 * Such a layer therefore opts out of view culling (`cullable = false`), same
 * as an unbounded layer (exactly like {@link import('./ImageLayerNode').ImageLayerNode}).
 *
 * The node references - but never owns - the {@link TileLayer}: destroying it
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
  // Map importers hand every layer all of the map's tilesets, used or not, so the
  // artwork reach comes from the tilesets resident tiles use: one large prop set
  // must not put every ordinary layer of the map into per-row nodes. The set only
  // grows until refresh(), so a reach never shrinks under a resident node.
  private readonly _usedTilesets: Uint8Array;
  private readonly _chunkWatchers = new Map<TileChunk, (written?: PackedTile) => void>();
  private _reach: ArtworkReach = { left: 0, top: 0, right: 0, bottom: 0 };
  private _rowOrder = false;
  private _syncedOpacity = -1;
  private _syncedTint: number | null | undefined = undefined;
  private _pixelSnapMode: PixelSnapMode = PixelSnapMode.Geometry;

  /**
   * Bound once so `TileLayer._addStructuralListener`/`_removeStructuralListener`
   * add and remove the SAME function reference. Incrementally adds/removes
   * the `TileChunkNode` child for exactly the chunk that changed - never
   * triggers a full {@link refresh}, so every other chunk node's
   * revision-cached geometry survives untouched.
   */
  private readonly _onStructuralChange = (event: ChunkStructuralEvent): void => {
    for (let i = this._chunkNodes.length - 1; i >= 0; i--) {
      const node = this._chunkNodes[i];

      if (!node) {
        continue;
      }

      if (node.chunkX !== event.cx || node.chunkY !== event.cy) {
        continue;
      }

      this._chunkNodes.splice(i, 1);
      this.removeChild(node);
      node.destroy();
    }

    for (const chunk of [...this._chunkWatchers.keys()]) {
      if (chunk.cx === event.cx && chunk.cy === event.cy) {
        this._unwatch(chunk);
      }
    }

    if (event.chunk === null || event.chunk.empty) {
      return;
    }

    if (this._useChunk(event.chunk) && this._updateArtwork()) {
      this._rebuildChunkNodes();

      return;
    }

    // Chunks stream in nearest-first, not in draw order. Inserting each node at its
    // place keeps every resident node where it is; re-sorting after an append
    // would move resident nodes, at a cost quadratic in their number per chunk.
    for (const node of this._createChunkNodes(event.chunk)) {
      const index = this._drawIndex(node);

      this._chunkNodes.splice(index, 0, node);
      this.addChildAt(node, index);
    }

    this._watch(event.chunk);
  };

  public constructor(layer: TileLayer, options?: TileLayerNodeOptions) {
    super();

    this._layer = layer;
    this._cullChunks = options?.cullable ?? true;
    this._usedTilesets = new Uint8Array(layer.projection.orientation === 'orthogonal' ? layer.tilesets.length : 0);

    this.setPosition(layer.offsetX, layer.offsetY);
    this._buildChunkNodes();

    if (!this._layer.bounded || layer.parallaxX !== 1 || layer.parallaxY !== 1 || layer.parallaxScale !== 1) {
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
   * culling bounds are never changed. `PixelSnapMode.Geometry` and `PixelSnapMode.Position` both resolve
   * to coherent origin snapping for tile chunks (chunk quads are already on the
   * integer pixel grid by construction). Setting the current value is a no-op;
   * an invalid value throws and leaves the prior mode unchanged.
   *
   * Defaults to `Geometry` because a tile grid is made of quads that share
   * their edges: left unsnapped, a boundary landing between two device pixels
   * is sampled across both, so the seams blur and shimmer as the view moves.
   * Set `None` to opt out.
   *
   * @default PixelSnapMode.Geometry
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
   *
   * Overhanging artwork can switch an orthogonal layer to one node per chunk row;
   * that holds while any tileset that needed it was used since the last refresh,
   * even after its tiles are gone. A refresh re-derives it from the tiles now
   * resident.
   */
  public refresh(): this {
    this._usedTilesets.fill(0);
    this._rebuildChunkNodes();

    return this;
  }

  /** The chunk render nodes owned by this layer node, in draw order. @internal */
  public get chunkNodes(): readonly TileChunkNode[] {
    return this._chunkNodes;
  }

  /**
   * Recomputed lazily on read, so it writes `_localBounds` directly rather than
   * going through `setLocalBounds`: an invalidating write inside a getter
   * would re-dirty the node on every read.
   */
  public override getLocalBounds(): ReadonlyRectangle {
    const bounds = this._localBounds;

    // Reading the pixel extents directly (rather than gating on `bounded`)
    // is what narrows them to numbers - `bounded` is a plain boolean getter.
    const { pixelHeight, pixelWidth } = this._layer;

    bounds.set(0, 0, 0, 0);

    if (this._layer.projection.orientation !== 'orthogonal') {
      aggregateChildLocalBounds(this._chunkNodes, bounds);
    } else if (pixelWidth !== undefined && pixelHeight !== undefined) {
      bounds.set(this._layer.projection.originX, this._layer.projection.originY, pixelWidth, pixelHeight);
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

    const patchesPosition = layer.parallaxX !== 1 || layer.parallaxY !== 1;
    const patchesScale = layer.parallaxScale !== 1;

    // `offsetX`/`offsetY` are live, mutable fields (`TileColliderStreamer` and
    // `pixelToTile` already read them per call) - re-read here every frame so a
    // runtime-moved layer's rendering follows its collision rather than freezing
    // at the position it had when this node was constructed.
    if (patchesPosition || patchesScale) {
      const camCenter = builder.view.center;
      const prevScaleX = this.scale.x;
      const prevScaleY = this.scale.y;

      if (patchesPosition) {
        this.x = layer.offsetX + camCenter.x * (1 - layer.parallaxX);
        this.y = layer.offsetY + camCenter.y * (1 - layer.parallaxY);
      } else {
        this.setPosition(layer.offsetX, layer.offsetY);
      }

      if (patchesScale) {
        this.setScale(prevScaleX * layer.parallaxScale, prevScaleY * layer.parallaxScale);
      }

      try {
        super._collectContent(builder);
      } finally {
        if (patchesPosition) {
          this.setPosition(layer.offsetX, layer.offsetY);
        }

        if (patchesScale) {
          this.setScale(prevScaleX, prevScaleY);
        }
      }
    } else {
      this.setPosition(layer.offsetX, layer.offsetY);
      super._collectContent(builder);
    }
  }

  public override destroy(): void {
    this._layer._removeStructuralListener(this._onStructuralChange);
    this._unwatchAll();

    const children = [...this._chunkNodes];

    this._chunkNodes.length = 0;

    super.destroy();

    for (const child of children) {
      child.destroy();
    }
  }

  private _rebuildChunkNodes(): void {
    const previous = [...this._chunkNodes];

    this.removeChildren();
    this._chunkNodes.length = 0;

    for (const child of previous) {
      child.destroy();
    }

    this._unwatchAll();
    this._syncedOpacity = -1;
    this._syncedTint = undefined;
    this._buildChunkNodes();
  }

  private _buildChunkNodes(): void {
    const chunks = [...this._layer.loadedChunks()].filter(chunk => !chunk.empty);

    for (const chunk of chunks) {
      this._useChunk(chunk);
    }

    this._updateArtwork();

    for (const chunk of chunks) {
      this._chunkNodes.push(...this._createChunkNodes(chunk));
      this._watch(chunk);
    }

    this._chunkNodes.sort(drawOrder);

    for (const node of this._chunkNodes) {
      this.addChild(node);
    }

    this._syncTint();
  }

  /**
   * Construct the configured draw nodes for `chunk` - shared by
   * the initial bulk build ({@link _buildChunkNodes}) and the incremental
   * structural-listener handler, so a future constructor argument or
   * per-node setting only needs to be added in one place.
   */
  private _createChunkNodes(chunk: ReadonlyTileChunk): TileChunkNode[] {
    const projection = this._layer.projection;
    const banded = projection.orientation !== 'orthogonal' || this._rowOrder;
    let count = 1;

    if (projection.staggered) {
      count = projection.staggerAxis === 'x' ? chunk.height * 2 : chunk.height;
    } else if (projection.orientation === 'isometric') {
      count = chunk.width + chunk.height - 1;
    } else if (this._rowOrder) {
      count = chunk.height;
    }

    const nodes: TileChunkNode[] = [];

    for (let i = 0; i < count; i++) {
      const node = this._createChunkNode(chunk, banded ? i : undefined);

      this._applyTint(node);
      nodes.push(node);
    }

    return nodes;
  }

  /** Record the tileset `packed` draws from; `true` when no resident tile used it before. */
  private _useTile(packed: PackedTile): boolean {
    const index = (packed & PACKED_TILESET_MASK) >>> PACKED_TILESET_SHIFT;

    if (packed === 0 || index >= this._usedTilesets.length || this._usedTilesets[index] === 1) {
      return false;
    }

    this._usedTilesets[index] = 1;

    return true;
  }

  private _useChunk(chunk: ReadonlyTileChunk): boolean {
    let added = false;

    if (this._usedTilesets.length === 0) {
      return added;
    }

    for (let ly = 0; ly < chunk.height; ly++) {
      for (let lx = 0; lx < chunk.width; lx++) {
        added = this._useTile(chunk.getRawAt(lx, ly)) || added;
      }
    }

    return added;
  }

  /** Re-derive the artwork reach and row order from the used tilesets; `true` when either changed. */
  private _updateArtwork(): boolean {
    const layer = this._layer;
    const used = layer.tilesets.filter((_, index) => this._usedTilesets[index] === 1);
    const reach = artworkReach(used, layer.tileWidth, layer.tileHeight);
    const rowOrder = needsRowOrder(used, layer.tileWidth, layer.tileHeight);
    const previous = this._reach;
    const changed =
      rowOrder !== this._rowOrder ||
      reach.left !== previous.left ||
      reach.top !== previous.top ||
      reach.right !== previous.right ||
      reach.bottom !== previous.bottom;

    this._reach = reach;
    this._rowOrder = rowOrder;

    return changed;
  }

  /**
   * Follow edits of a resident chunk: a tile from a tileset no resident tile used
   * yet can widen the reach or need per-row nodes, so the nodes are rebuilt before
   * anything draws them.
   */
  private _watch(chunk: ReadonlyTileChunk): void {
    if (this._usedTilesets.length === 0 || !(chunk instanceof TileChunk) || this._chunkWatchers.has(chunk)) {
      return;
    }

    const watcher = (written?: PackedTile): void => {
      const added = written === undefined ? this._useChunk(chunk) : this._useTile(written);

      if (added && this._updateArtwork()) {
        this._rebuildChunkNodes();
      }
    };

    chunk._addDirtyListener(watcher);
    this._chunkWatchers.set(chunk, watcher);
  }

  private _unwatch(chunk: TileChunk): void {
    const watcher = this._chunkWatchers.get(chunk);

    if (watcher !== undefined) {
      chunk._removeDirtyListener(watcher);
      this._chunkWatchers.delete(chunk);
    }
  }

  private _unwatchAll(): void {
    for (const chunk of [...this._chunkWatchers.keys()]) {
      this._unwatch(chunk);
    }
  }

  /** The child index `node` takes in draw order: after every node that draws before it. */
  private _drawIndex(node: TileChunkNode): number {
    const nodes = this._chunkNodes;
    let low = 0;
    let high = nodes.length;

    while (low < high) {
      const middle = (low + high) >>> 1;
      const other = nodes[middle];

      if (other !== undefined && drawOrder(other, node) < 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  }

  private _createChunkNode(chunk: ReadonlyTileChunk, diagonal?: number): TileChunkNode {
    const layer = this._layer;
    const node = new TileChunkNode(
      chunk,
      layer.tilesets,
      layer.tileWidth,
      layer.tileHeight,
      layer.chunkWidth,
      layer.chunkHeight,
      layer.projection,
      diagonal,
      this._reach,
    );

    node.cullable = this._cullChunks;
    // Unconditional: a chunk built after the layer was set to `None` has to
    // inherit that too, not just a non-default mode.
    node.pixelSnapMode = this._pixelSnapMode;

    return node;
  }

  /**
   * Compute and apply this layer's live tint (opacity as alpha, `tintColor`
   * as RGB multiply) to a single chunk node. Used both by {@link _syncTint}'s
   * bulk pass and by the structural-listener handler for a freshly-added
   * node - a node added between two "nothing changed" full syncs must still
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
