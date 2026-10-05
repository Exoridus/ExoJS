import type { ReadonlyRectangle } from '@codexo/exojs';
import { Drawable } from '@codexo/exojs/renderer-sdk';

import type { ChunkPage } from './chunkGeometry';
import { buildChunkPages } from './chunkGeometry';
import type { ReadonlyTileChunk } from './TileChunk';
import { TileChunk } from './TileChunk';
import { TileProjection } from './TileProjection';
import type { TileSet } from './TileSet';

/**
 * A single renderable tile chunk. One `TileChunkNode` is a {@link Drawable}
 * that owns the batched quad geometry for exactly one {@link ReadonlyTileChunk}
 * of one {@link import('./TileLayer').TileLayer}. Orthogonal nodes use the
 * chunk's pixel origin; isometric nodes draw one diagonal slice and share
 * the projection origin to keep pixel snapping independent of chunk layout.
 *
 * Geometry is built lazily and cached against the source chunk's `revision`:
 * the renderer reads {@link TileChunkNode.pages} on each visible frame, but a
 * rebuild only happens when the underlying chunk actually changed. Off-screen
 * chunks are culled by their accurate {@link getLocalBounds} before `render`
 * is ever called, so a camera pan rebuilds nothing.
 *
 * The node references - but never owns - the runtime chunk, tilesets, and
 * tileset textures. Destroying it releases only its cached CPU geometry; the
 * `TileMap`/`TileLayer` data and Loader-owned textures are untouched.
 *
 * @internal Package-internal render node; the renderer is registered for this
 * class. Applications use {@link TileMapNode} / {@link TileLayerNode}.
 */
export class TileChunkNode extends Drawable {
  private readonly _chunk: ReadonlyTileChunk;
  private readonly _tilesets: readonly TileSet[];
  private readonly _tileWidth: number;
  private readonly _tileHeight: number;
  private readonly _projection: TileProjection;
  private readonly _geometryX: number;
  private readonly _geometryY: number;
  public readonly diagonal: number | undefined;
  public readonly depth: number;
  public readonly firstColumn: number;

  private _pages: ChunkPage[] = [];
  private _builtRevision = -1;

  /**
   * Bound once so `TileChunk._addDirtyListener`/`_removeDirtyListener` add and
   * remove the SAME function reference. Pushes the chunk's revision bump onto
   * this node's own content revision (see `TileChunk._dirtyListeners`) so a
   * `RetainedContainer` ancestor - which skips walking a content-clean
   * subtree entirely - observes the mutation and re-collects instead of
   * replaying stale cached geometry.
   */
  private readonly _onChunkDirty = (): void => {
    this.invalidateContent();
  };

  /**
   * @param chunk          The readonly chunk this node renders.
   * @param tilesets       The owning layer's tileset array.
   * @param tileWidth      Map/layer tile cell width in pixels.
   * @param tileHeight     Map/layer tile cell height in pixels.
   * @param chunkWidthTiles  The layer's (unclamped) chunk width in tiles, used
   *                         to compute the chunk's pixel origin. Edge chunks
   *                         report a smaller `chunk.width`, but always start at
   *                         `cx * chunkWidthTiles`.
   * @param chunkHeightTiles The layer's (unclamped) chunk height in tiles.
   */
  public constructor(
    chunk: ReadonlyTileChunk,
    tilesets: readonly TileSet[],
    tileWidth: number,
    tileHeight: number,
    chunkWidthTiles: number,
    chunkHeightTiles: number,
    projection = new TileProjection({ tileWidth, tileHeight }),
    diagonal?: number,
  ) {
    super();

    this._chunk = chunk;
    this._tilesets = tilesets;
    this._tileWidth = tileWidth;
    this._tileHeight = tileHeight;
    this._projection = projection;
    this.diagonal = diagonal;
    const tx = chunk.cx * chunkWidthTiles;
    const ty = chunk.cy * chunkHeightTiles;
    this.depth = tx + ty + (diagonal ?? 0);
    this.firstColumn = tx + Math.max(0, (diagonal ?? 0) - chunk.height + 1);
    const position = projection.tileToPixel(tx, ty);
    const iso = projection.orientation === 'isometric';
    this._geometryX = iso ? position.x - projection.originX : 0;
    this._geometryY = iso ? position.y - projection.originY : 0;
    // Shared origin keeps pixel snapping coherent when projected pitches are fractional.
    this.setPosition(iso ? projection.originX : position.x, iso ? projection.originY : position.y);

    // `loadedChunks()` always yields the concrete `TileChunk` behind the
    // readonly view (see TileLayer); the guard is defensive only.
    if (chunk instanceof TileChunk) {
      chunk._addDirtyListener(this._onChunkDirty);
    }
  }

  /** The signed chunk coordinates this node renders. */
  public get chunkX(): number {
    return this._chunk.cx;
  }

  public get chunkY(): number {
    return this._chunk.cy;
  }

  /**
   * The revision-cached per-tileset page geometry. Rebuilt only when the source
   * chunk's `revision` advances; otherwise the same arrays are returned.
   * @internal Read by the per-backend tile chunk renderer.
   */
  public get pages(): readonly ChunkPage[] {
    if (this._builtRevision !== this._chunk.revision) {
      this._pages = buildChunkPages(
        this._chunk,
        this._tilesets,
        this._tileWidth,
        this._tileHeight,
        this._projection,
        this.diagonal,
        this._geometryX,
        this._geometryY,
      );
      this._builtRevision = this._chunk.revision;
    }

    return this._pages;
  }

  /** `true` when the chunk has no drawable tiles (no geometry, no draw calls). */
  public get isEmpty(): boolean {
    return this.pages.length === 0;
  }

  /**
   * Recomputed lazily on read, so it writes `_localBounds` directly rather than
   * going through `setLocalBounds`: an invalidating write inside a getter
   * would re-dirty the node on every read.
   */
  public override getLocalBounds(): ReadonlyRectangle {
    const iso = this._projection.orientation === 'isometric';
    if (!iso) return this._localBounds.set(0, 0, this._chunk.width * this._tileWidth, this._chunk.height * this._tileHeight);
    const d = this.diagonal;
    const minX = d === undefined ? 0 : Math.max(0, d - this._chunk.height + 1);
    const maxX = d === undefined ? this._chunk.width - 1 : Math.min(this._chunk.width - 1, d);
    const minY = d === undefined ? 0 : d - maxX;
    const maxY = d === undefined ? this._chunk.height - 1 : d - minX;
    let left = ((minX - maxY - 1) * this._tileWidth) / 2;
    let top = ((minX + maxY) * this._tileHeight) / 2;
    let right = ((maxX - minY + 1) * this._tileWidth) / 2;
    let bottom = ((maxX + minY) * this._tileHeight) / 2 + this._tileHeight;
    const baseLeft = left;
    const baseTop = top;
    const baseRight = right;
    const baseBottom = bottom;
    for (const tileset of this._tilesets) {
      left = Math.min(left, baseLeft + tileset.offsetX);
      top = Math.min(top, baseTop + this._tileHeight - tileset.tileHeight + tileset.offsetY);
      right = Math.max(right, baseRight + tileset.tileWidth - this._tileWidth + tileset.offsetX);
      bottom = Math.max(bottom, baseBottom + tileset.offsetY);
    }
    return this._localBounds.set(left + this._geometryX, top + this._geometryY, right - left, bottom - top);
  }

  public override destroy(): void {
    if (this._chunk instanceof TileChunk) {
      this._chunk._removeDirtyListener(this._onChunkDirty);
    }

    this._pages = [];
    this._builtRevision = -1;

    super.destroy();
  }
}
