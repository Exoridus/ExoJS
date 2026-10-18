import { logger, type PointLike, type Vector } from '@codexo/exojs';

import { type DiagonalPolicy, GridSpace } from '../spaces/GridSpace';
import type { NavigationSpace, PrunedExpansion } from '../types';

/** The part of a tile chunk {@link TileNavigationSpace} reads: whether it changed. */
export interface TileNavigationChunk {
  /** Increments whenever a cell of the chunk changes. */
  readonly revision: number;
}

/**
 * The cell grid geometry of a {@link TileNavigationSource}, in the shape a
 * tilemap projection describes it.
 */
export interface TileNavigationProjection {
  /** Only `'orthogonal'` and `'isometric'` grids are accepted. */
  readonly orientation: string;
  /** Width of one cell in logical (unprojected) space. */
  readonly logicalTileWidth: number;
  /** Height of one cell in logical (unprojected) space. */
  readonly logicalTileHeight: number;
}

/**
 * Tile data a {@link TileNavigationSpace} can navigate: a `TileLayer` from
 * `@codexo/exojs-tilemap` matches it as it is, and so does any other grid
 * that can answer what sits in a cell and when anything changed.
 *
 * Cell coordinates are integers; navigation coordinates are the logical
 * space a cell `(x, y)` covers `[x, x + 1) * logicalTileWidth` of, shifted by
 * {@link logicalOffset} - the same space tilemap physics colliders live in.
 */
export interface TileNavigationSource<Tile> {
  /** Must increment whenever any cell changes, including chunks being loaded or evicted. */
  readonly revision: number;
  /** Cell columns, or `undefined` for an unbounded source. */
  readonly width?: number | undefined;
  /** Cell rows, or `undefined` for an unbounded source. */
  readonly height?: number | undefined;
  /** Cell width; the logical cell size when there is no {@link projection}. */
  readonly tileWidth: number;
  /** Cell height; the logical cell size when there is no {@link projection}. */
  readonly tileHeight: number;
  /** Grid geometry. Without one the source is an orthogonal grid of `tileWidth` by `tileHeight`. */
  readonly projection?: TileNavigationProjection | undefined;
  /** Logical position of cell `(0, 0)`'s corner. Read once, at construction. Defaults to the origin. */
  readonly logicalOffset?: Readonly<PointLike> | undefined;
  /** When `true`, the source can no longer be read. */
  readonly destroyed?: boolean | undefined;
  /** Chunk width in cells. With {@link chunkHeight} and {@link getChunk}, enables per-chunk updates. */
  readonly chunkWidth?: number | undefined;
  readonly chunkHeight?: number | undefined;
  /** The chunk at chunk coordinates, or `undefined` while it is not loaded. */
  getChunk?(cx: number, cy: number): TileNavigationChunk | undefined;
  /** The tile in a cell, or `null` for an empty or unloaded cell. */
  getTileAt(x: number, y: number): Tile | null;
}

/** A rectangle of cells, in absolute cell coordinates. */
export interface TileNavigationWindow {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Construction options for {@link TileNavigationSpace}. */
export interface TileNavigationSpaceOptions<Tile> {
  /**
   * The traversal policy: the cost of entering a cell holding `tile`, `null`
   * for an empty or unloaded cell. `0` - or anything not finite and positive -
   * blocks the cell, `1` is ordinary ground and larger values are terrain
   * routes avoid when a cheaper way exists. Called for every cell at
   * construction and for the cells of every chunk that changed afterwards, so
   * it must depend on nothing but its arguments and data that changes with
   * the source's revision.
   */
  readonly cost: (tile: Tile | null, x: number, y: number) => number;
  /**
   * The cells to navigate. Required for an unbounded source, which has no
   * extent to default to; for a bounded one it defaults to the whole source
   * and must lie inside it. Everything outside the window is blocked.
   */
  readonly window?: TileNavigationWindow | undefined;
  /** Defaults to `'no-corner-cutting'`; see {@link DiagonalPolicy}. */
  readonly diagonals?: DiagonalPolicy | undefined;
}

/**
 * A {@link NavigationSpace} over tile data that keeps itself in step with
 * the data's edits: a cost callback turns each tile into a traversal cost,
 * and the space resamples exactly the chunks whose revision moved.
 *
 * Synchronisation is pull-based and runs whenever {@link revision} or
 * {@link nodeCapacity} is read - which a {@link Pathfinder} does before every
 * search and a {@link NavigationAgentComponent} every fixed step - or when
 * {@link sync} is called. An unchanged source costs a single revision compare;
 * a changed one costs one revision compare per chunk in the window plus the
 * cells of the chunks that changed. A source without chunks falls back to
 * resampling the whole window whenever its revision changes. The space's own
 * revision only advances when a cell's cost actually changed, so an edit that
 * keeps every cell's cost leaves routes valid.
 *
 * Routes, positions and agent coordinates are logical: for an isometric map
 * that is the unprojected grid of `tileHeight`-sized squares, not the screen
 * diamonds, matching the tilemap's physics colliders. Orthogonal maps need
 * square tiles; non-square orthogonal tiles and other orientations are
 * rejected, since the grid's distance metric would misprice them.
 *
 * The space holds no listener on its source and owns nothing but its cost
 * grid, so dropping it is all the cleanup it needs. When its source is
 * destroyed, the next synchronisation turns the space {@link invalidated}:
 * every cell becomes blocked and the revision advances once, so routes in
 * flight go stale and agents navigating it settle on `unreachable` and stop
 * their movement. A warning is logged once; the space never reads the source
 * again.
 *
 * @example
 * ```ts
 * const navigation = new TileNavigationSpace(groundLayer, {
 *   cost: tile => {
 *     if (tile === null) return 0;
 *
 *     const definition = tile.tileset.getTileDefinition(tile.localTileId);
 *
 *     return definition?.collision ? 0 : 1;
 *   },
 * });
 * ```
 */
export class TileNavigationSpace<Tile = unknown> implements NavigationSpace {
  public readonly source: TileNavigationSource<Tile>;

  private readonly _grid: GridSpace;
  private readonly _cost: (tile: Tile | null, x: number, y: number) => number;
  private readonly _chunkWidth: number;
  private readonly _chunkHeight: number;
  private readonly _chunked: boolean;
  private readonly _firstChunkX: number;
  private readonly _firstChunkY: number;
  private readonly _chunkColumns: number;
  private readonly _chunks: Array<TileNavigationChunk | null>;
  private readonly _chunkRevisions: Float64Array;
  private _sourceRevision: number;
  private _invalidated = false;

  /**
   * @throws Error when the source's orientation or tile shape cannot be
   * navigated as a square grid, when an unbounded source has no window, when a
   * window leaves a bounded source, or when the source is destroyed.
   */
  public constructor(source: TileNavigationSource<Tile>, options: TileNavigationSpaceOptions<Tile>) {
    if (source.destroyed === true) {
      throw new Error('TileNavigationSpace: the source is destroyed.');
    }

    const cellSize = logicalCellSize(source);
    const window = resolveWindow(source, options.window);
    const offset = source.logicalOffset ?? { x: 0, y: 0 };
    const cost = options.cost;

    this.source = source;
    this._cost = cost;
    this._sourceRevision = source.revision;
    this._grid = GridSpace.from(window.width, window.height, (x, y) => cost(source.getTileAt(x, y), x, y), {
      originX: window.x,
      originY: window.y,
      cellSize,
      cellOriginX: offset.x,
      cellOriginY: offset.y,
      diagonals: options.diagonals,
    });

    const chunkWidth = source.chunkWidth ?? 0;
    const chunkHeight = source.chunkHeight ?? 0;

    this._chunked = source.getChunk !== undefined && chunkWidth > 0 && chunkHeight > 0;
    this._chunkWidth = this._chunked ? chunkWidth : 1;
    this._chunkHeight = this._chunked ? chunkHeight : 1;
    this._firstChunkX = Math.floor(window.x / this._chunkWidth);
    this._firstChunkY = Math.floor(window.y / this._chunkHeight);
    this._chunkColumns = this._chunked ? Math.floor((window.x + window.width - 1) / chunkWidth) - this._firstChunkX + 1 : 0;

    const chunkRows = this._chunked ? Math.floor((window.y + window.height - 1) / chunkHeight) - this._firstChunkY + 1 : 0;

    this._chunks = Array.from({ length: this._chunkColumns * chunkRows }, () => null);
    this._chunkRevisions = new Float64Array(this._chunks.length).fill(-1);

    for (let index = 0; index < this._chunks.length; index++) {
      const chunk = this._chunkAt(index);

      this._chunks[index] = chunk;
      this._chunkRevisions[index] = chunk?.revision ?? -1;
    }
  }

  /** Absolute cell x of the window's left column. */
  public get originX(): number {
    return this._grid.originX;
  }

  /** Absolute cell y of the window's top row. */
  public get originY(): number {
    return this._grid.originY;
  }

  /** Window width in cells. */
  public get width(): number {
    return this._grid.width;
  }

  /** Window height in cells. */
  public get height(): number {
    return this._grid.height;
  }

  /** Logical size of one cell. */
  public get cellSize(): number {
    return this._grid.cellSize;
  }

  public get nodeCapacity(): number {
    this.sync();

    return this._grid.nodeCapacity;
  }

  public get maxDegree(): number {
    return this._grid.maxDegree;
  }

  /** Synchronises with the source, then reports the cost grid's revision. */
  public get revision(): number {
    this.sync();

    return this._grid.revision;
  }

  /**
   * `true` once the source was found destroyed. An invalidated space blocks
   * every cell and no longer synchronises; replace it with a space over a
   * live source.
   */
  public get invalidated(): boolean {
    return this._invalidated;
  }

  /**
   * Brings the costs up to date with the source and returns whether any
   * cell's cost changed. Called implicitly by {@link revision} and
   * {@link nodeCapacity}.
   */
  public sync(): boolean {
    const source = this.source;

    if (this._invalidated) {
      return false;
    }

    if (source.destroyed === true) {
      this._invalidate();

      return true;
    }

    if (source.revision === this._sourceRevision) {
      return false;
    }

    const before = this._grid.revision;

    this._sourceRevision = source.revision;

    if (!this._chunked) {
      this._resample(this._grid.originX, this._grid.originY, this._grid.width, this._grid.height);

      return this._grid.revision !== before;
    }

    for (let index = 0; index < this._chunks.length; index++) {
      const chunk = this._chunkAt(index);
      const revision = chunk?.revision ?? -1;

      if (chunk === this._chunks[index] && revision === this._chunkRevisions[index]) {
        continue;
      }

      this._chunks[index] = chunk;
      this._chunkRevisions[index] = revision;

      const cx = this._firstChunkX + (index % this._chunkColumns);
      const cy = this._firstChunkY + Math.floor(index / this._chunkColumns);

      this._resample(cx * this._chunkWidth, cy * this._chunkHeight, this._chunkWidth, this._chunkHeight);
    }

    return this._grid.revision !== before;
  }

  /** The node at absolute cell coordinates, or `-1` outside the window. */
  public nodeAt(x: number, y: number): number {
    return this._grid.nodeAt(x, y);
  }

  /** Absolute cell x of a node. */
  public nodeX(node: number): number {
    return this._grid.nodeX(node);
  }

  /** Absolute cell y of a node. */
  public nodeY(node: number): number {
    return this._grid.nodeY(node);
  }

  /** Current cost of a cell as of the last synchronisation; `0` when blocked or outside the window. */
  public costAt(x: number, y: number): number {
    return this._grid.costAt(x, y);
  }

  public isWalkable(x: number, y: number): boolean {
    return this._grid.isWalkable(x, y);
  }

  public neighbors(node: number, agentSize: number, outNodes: Int32Array, outCosts: Float64Array): number {
    return this._grid.neighbors(node, agentSize, outNodes, outCosts);
  }

  public heuristic(node: number, goal: number): number {
    return this._grid.heuristic(node, goal);
  }

  public nodeToPoint(node: number, out: Vector): void {
    this._grid.nodeToPoint(node, out);
  }

  public pointToNode(x: number, y: number): number {
    return this._grid.pointToNode(x, y);
  }

  public nearestNode(x: number, y: number): number {
    return this._grid.nearestNode(x, y);
  }

  public smoothPath(nodes: readonly number[], agentSize: number): number[] {
    return this._grid.smoothPath(nodes, agentSize);
  }

  public pruning(agentSize: number): PrunedExpansion | null {
    return this._grid.pruning(agentSize);
  }

  private _invalidate(): void {
    const grid = this._grid;

    this._invalidated = true;

    for (let y = grid.originY; y < grid.originY + grid.height; y++) {
      for (let x = grid.originX; x < grid.originX + grid.width; x++) {
        grid.setCost(x, y, 0);
      }
    }

    logger.warn(
      'TileNavigationSpace: the source was destroyed, so every cell is now blocked. Replace the navigation space with one over a live source.',
      {
        source: 'TileNavigationSpace',
      },
    );
  }

  private _chunkAt(index: number): TileNavigationChunk | null {
    if (!this._chunked) {
      return null;
    }

    const cx = this._firstChunkX + (index % this._chunkColumns);
    const cy = this._firstChunkY + Math.floor(index / this._chunkColumns);

    return this.source.getChunk!(cx, cy) ?? null;
  }

  /** Re-reads the cells of a rectangle, clipped to the window. */
  private _resample(x: number, y: number, width: number, height: number): void {
    const grid = this._grid;
    const minX = Math.max(x, grid.originX);
    const minY = Math.max(y, grid.originY);
    const maxX = Math.min(x + width, grid.originX + grid.width);
    const maxY = Math.min(y + height, grid.originY + grid.height);
    const source = this.source;

    for (let cellY = minY; cellY < maxY; cellY++) {
      for (let cellX = minX; cellX < maxX; cellX++) {
        grid.setCost(cellX, cellY, this._cost(source.getTileAt(cellX, cellY), cellX, cellY));
      }
    }
  }
}

const logicalCellSize = (source: TileNavigationSource<unknown>): number => {
  const projection = source.projection;
  const orientation = projection?.orientation ?? 'orthogonal';

  if (orientation !== 'orthogonal' && orientation !== 'isometric') {
    throw new Error(
      `TileNavigationSpace: '${orientation}' grids are not supported. Only orthogonal and isometric grids map onto square navigation cells.`,
    );
  }

  const width = projection?.logicalTileWidth ?? source.tileWidth;
  const height = projection?.logicalTileHeight ?? source.tileHeight;

  if (width !== height || !(width > 0)) {
    throw new Error(
      `TileNavigationSpace: logical cells of ${width}x${height} are not square. Grid navigation measures distance in square cells, so a route over these tiles would be mispriced; navigate them with a custom NavigationSpace instead.`,
    );
  }

  return width;
};

const resolveWindow = (source: TileNavigationSource<unknown>, window: TileNavigationWindow | undefined): TileNavigationWindow => {
  const { width, height } = source;
  const bounded = width !== undefined && height !== undefined;

  if (window === undefined) {
    if (!bounded) {
      throw new Error('TileNavigationSpace: an unbounded source needs an explicit window of the cells to navigate.');
    }

    return { x: 0, y: 0, width, height };
  }

  if (!Number.isInteger(window.x) || !Number.isInteger(window.y) || !Number.isInteger(window.width) || !Number.isInteger(window.height)) {
    throw new RangeError('TileNavigationSpace: window coordinates and size must be integers.');
  }

  if (window.width < 1 || window.height < 1) {
    throw new RangeError(`TileNavigationSpace: window must cover at least one cell, received ${window.width}x${window.height}.`);
  }

  if (bounded && (window.x < 0 || window.y < 0 || window.x + window.width > width || window.y + window.height > height)) {
    throw new RangeError(
      `TileNavigationSpace: window ${window.width}x${window.height} at (${window.x}, ${window.y}) leaves the ${width}x${height} source.`,
    );
  }

  return window;
};
