import type { Rectangle } from '@codexo/exojs';
import { Drawable } from '@codexo/exojs/renderer-sdk';

import type { ChunkPage } from './chunkGeometry';
import { buildChunkPages } from './chunkGeometry';
import type { ReadonlyTileChunk } from './TileChunk';
import { TileChunk } from './TileChunk';
import type { TileSet } from './TileSet';

/**
 * A single renderable tile chunk. One `TileChunkNode` is a {@link Drawable}
 * that owns the batched quad geometry for exactly one {@link ReadonlyTileChunk}
 * of one {@link import('./TileLayer').TileLayer}, positioned at the chunk's
 * pixel origin within the owning {@link TileLayerNode}.
 *
 * Geometry is built lazily and cached against the source chunk's `revision`:
 * the renderer reads {@link TileChunkNode.pages} on each visible frame, but a
 * rebuild only happens when the underlying chunk actually changed. Off-screen
 * chunks are culled by their accurate {@link getLocalBounds} before `render`
 * is ever called, so a camera pan rebuilds nothing.
 *
 * The node references — but never owns — the runtime chunk, tilesets, and
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
  private readonly _pixelWidth: number;
  private readonly _pixelHeight: number;

  private _pages: ChunkPage[] = [];
  private _builtRevision = -1;

  /**
   * Bound once so `TileChunk._addDirtyListener`/`_removeDirtyListener` add and
   * remove the SAME function reference. Pushes the chunk's revision bump onto
   * this node's own content revision (see `TileChunk._dirtyListeners`) so a
   * `RetainedContainer` ancestor — which skips walking a content-clean
   * subtree entirely — observes the mutation and re-collects instead of
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
  ) {
    super();

    this._chunk = chunk;
    this._tilesets = tilesets;
    this._tileWidth = tileWidth;
    this._tileHeight = tileHeight;
    this._pixelWidth = chunk.width * tileWidth;
    this._pixelHeight = chunk.height * tileHeight;

    this.setPosition(
      chunk.cx * chunkWidthTiles * tileWidth,
      chunk.cy * chunkHeightTiles * tileHeight,
    );

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
      this._pages = buildChunkPages(this._chunk, this._tilesets, this._tileWidth, this._tileHeight);
      this._builtRevision = this._chunk.revision;
    }

    return this._pages;
  }

  /** `true` when the chunk has no drawable tiles (no geometry, no draw calls). */
  public get isEmpty(): boolean {
    return this.pages.length === 0;
  }

  public override getLocalBounds(): Rectangle {
    const bounds = super.getLocalBounds();

    bounds.set(0, 0, this._pixelWidth, this._pixelHeight);

    return bounds;
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
