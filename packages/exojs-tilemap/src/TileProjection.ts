import type { TileMapObject } from './ObjectLayer';
import { projectObject } from './projectObject';
import { validatePositiveInteger } from './types';

/**
 * How cells are laid out.
 *
 * - `orthogonal`: rectangles in rows and columns.
 * - `isometric`: diamonds along two diagonal axes.
 * - `staggered`: diamonds in rows and columns, every other row (or column)
 *   shifted by half a cell.
 * - `hexagonal`: hexagons laid out like `staggered`, with straight sides of
 *   {@link TileProjectionOptions.hexSideLength} along the stagger axis.
 */
export type TileOrientation = 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';

/** Immutable grid geometry shared by a map and its independently usable layers. */
export interface TileProjectionOptions {
  /** Orthogonal is the default. */
  readonly orientation?: TileOrientation;
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** Display position of grid vertex (0, 0). Defaults to zero. */
  readonly originX?: number;
  readonly originY?: number;
  /** Staggered and hexagonal grids: the axis whose every other row (`'y'`) or column (`'x'`) is shifted. Defaults to `'y'`. */
  readonly staggerAxis?: 'x' | 'y';
  /** Staggered and hexagonal grids: whether the odd or the even rows (or columns) are shifted. Defaults to `'odd'`. */
  readonly staggerIndex?: 'odd' | 'even';
  /** Hexagonal grids: length in pixels of the straight sides along the stagger axis. Defaults to 0. */
  readonly hexSideLength?: number;
}

/**
 * Converts between grid vertices, display pixels and unprojected logical pixels.
 * Isometric logical cells are squares of side `tileHeight`; orthogonal logical
 * coordinates are display coordinates before the origin translation.
 *
 * Staggered and hexagonal grids follow Tiled's layout. Their logical space is
 * display space before the origin translation, as for orthogonal grids, but
 * their cells are not rectangles in it: code that treats logical cells as
 * squares (tile collision, grid navigation) rejects these grids.
 */
export class TileProjection {
  public readonly orientation: TileOrientation;
  public readonly tileWidth: number;
  public readonly tileHeight: number;
  public readonly originX: number;
  public readonly originY: number;
  /** Staggered and hexagonal grids: the shifted axis. `'y'` for the other orientations, where it has no effect. */
  public readonly staggerAxis: 'x' | 'y';
  /** Staggered and hexagonal grids: which rows or columns are shifted. `'odd'` for the other orientations, where it has no effect. */
  public readonly staggerIndex: 'odd' | 'even';
  /** Hexagonal grids: length of the straight sides along the stagger axis. `0` for every other orientation. */
  public readonly hexSideLength: number;

  private readonly _stagger: StaggerGeometry | null;

  public constructor(options: TileProjectionOptions) {
    validatePositiveInteger(options.tileWidth, 'projection.tileWidth');
    validatePositiveInteger(options.tileHeight, 'projection.tileHeight');
    this.orientation = options.orientation ?? 'orthogonal';
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    this.staggerAxis = options.staggerAxis ?? 'y';
    this.staggerIndex = options.staggerIndex ?? 'odd';
    this.hexSideLength = this.orientation === 'hexagonal' ? (options.hexSideLength ?? 0) : 0;

    if (!Number.isFinite(this.originX) || !Number.isFinite(this.originY)) {
      throw new Error('TileProjection origin must be finite.');
    }

    if (!Number.isInteger(this.hexSideLength) || this.hexSideLength < 0) {
      throw new Error(`TileProjection hexSideLength must be a non-negative integer (got ${this.hexSideLength}).`);
    }

    this._stagger = this.orientation === 'staggered' || this.orientation === 'hexagonal' ? new StaggerGeometry(this) : null;
  }

  /** `true` for staggered and hexagonal grids, whose rows (or columns) are offset by half a cell. */
  public get staggered(): boolean {
    return this._stagger !== null;
  }

  /** Width of a cell in the unprojected simulation space. */
  public get logicalTileWidth(): number {
    return this.orientation === 'isometric' ? this.tileHeight : this.tileWidth;
  }

  public get logicalTileHeight(): number {
    return this.tileHeight;
  }

  /**
   * Maps a grid vertex, including fractional coordinates, to display pixels.
   * On staggered and hexagonal grids an integer cell maps to the top-left of
   * its bounding box, and fractions move linearly by one row or column step.
   */
  public tileToPixel(tx: number, ty: number): { x: number; y: number } {
    if (this._stagger !== null) {
      return this._stagger.cellOrigin(tx, ty);
    }

    return this.orientation === 'isometric'
      ? { x: this.originX + ((tx - ty) * this.tileWidth) / 2, y: this.originY + ((tx + ty) * this.tileHeight) / 2 }
      : { x: this.originX + tx * this.tileWidth, y: this.originY + ty * this.tileHeight };
  }

  /**
   * Picks the cell containing a display point; negative cells are valid.
   * Cells are half-open on rectangular grids; on staggered and hexagonal grids
   * a point on a shared edge goes to the cell Tiled picks there.
   */
  public pixelToTile(x: number, y: number): { tx: number; ty: number } {
    if (this._stagger !== null) {
      return this._stagger.pick(x - this.originX, y - this.originY);
    }

    const logical = this.pixelToLogical(x, y);

    return { tx: Math.floor(logical.x / this.logicalTileWidth), ty: Math.floor(logical.y / this.logicalTileHeight) };
  }

  /** Projects a logical position; layer offsets and scene transforms are separate. */
  public logicalToPixel(x: number, y: number): { x: number; y: number } {
    if (this._stagger !== null) {
      return { x: x + this.originX, y: y + this.originY };
    }

    return this.tileToPixel(x / this.logicalTileWidth, y / this.logicalTileHeight);
  }

  /** Inverts display projection without quantizing to a cell. */
  public pixelToLogical(x: number, y: number): { x: number; y: number } {
    const dx = x - this.originX;
    const dy = y - this.originY;

    return this.orientation === 'isometric'
      ? { x: dy + (dx * this.tileHeight) / this.tileWidth, y: dy - (dx * this.tileHeight) / this.tileWidth }
      : { x: dx, y: dy };
  }

  /**
   * Width of the box a cell's artwork is aligned in. Staggered and hexagonal
   * grids round it down to even pixels as Tiled does; other grids use
   * {@link tileWidth}.
   * @internal
   */
  public get _cellWidth(): number {
    return this._stagger === null ? this.tileWidth : this.tileWidth & ~1;
  }

  /** Height counterpart of {@link _cellWidth}. @internal */
  public get _cellHeight(): number {
    return this._stagger === null ? this.tileHeight : this.tileHeight & ~1;
  }

  /**
   * Draw-order band of a cell on a staggered or hexagonal grid: cells draw
   * band by band, so artwork overhanging a neighbour stacks as in Tiled. Rows
   * are bands when rows are staggered; when columns are, each row splits into
   * its unshifted columns followed by its shifted ones.
   * @internal
   */
  public _band(tx: number, ty: number): number {
    return this._stagger === null ? ty : this._stagger.band(tx, ty);
  }

  /** Display AABB of a cell region, excluding artwork overhang and layer offsets. */
  public getBounds(tx: number, ty: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
    if (this._stagger !== null) {
      return this._stagger.bounds(tx, ty, width, height);
    }

    const top = this.tileToPixel(tx, ty);

    if (this.orientation === 'orthogonal') {
      return { ...top, width: width * this.tileWidth, height: height * this.tileHeight };
    }

    return {
      x: top.x - (height * this.tileWidth) / 2,
      y: top.y,
      width: ((width + height) * this.tileWidth) / 2,
      height: ((width + height) * this.tileHeight) / 2,
    };
  }

  /** Projects logical object geometry; image and text dimensions stay in display pixels. */
  public projectObject(object: TileMapObject): TileMapObject {
    if (this.orientation !== 'isometric') {
      return object.kind === 'tile'
        ? projectObject(object, 1, 0, 0, 1, this.originX, this.originY)
        : { ...object, x: object.x + this.originX, y: object.y + this.originY };
    }

    const ratio = this.tileWidth / (2 * this.tileHeight);

    return projectObject(object, ratio, 0.5, -ratio, 0.5, this.originX, this.originY);
  }

  /** Inverts object geometry into logical space; affine ellipses remain exact. */
  public unprojectObject(object: TileMapObject): TileMapObject {
    if (this.orientation !== 'isometric') {
      return object.kind === 'tile'
        ? projectObject(object, 1, 0, 0, 1, -this.originX, -this.originY)
        : { ...object, x: object.x - this.originX, y: object.y - this.originY };
    }

    const ratio = this.tileHeight / this.tileWidth;

    return projectObject(object, ratio, -ratio, 1, 1, -this.originY - this.originX * ratio, -this.originY + this.originX * ratio);
  }
}

type Pair = readonly [number, number];

/** Cell offsets from the reference cell for each of the four candidate centres. */
const HEX_OFFSETS_STAGGER_X: readonly Pair[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, 0],
];
const HEX_OFFSETS_STAGGER_Y: readonly Pair[] = [
  [0, 0],
  [-1, 1],
  [0, 1],
  [0, 2],
];

/** The first two and last two coordinates of a span, deduplicated. */
const edgeCells = (start: number, length: number): number[] => {
  const cells = new Set<number>();

  for (const offset of [0, 1, length - 2, length - 1]) {
    if (offset >= 0 && offset < length) {
      cells.add(start + offset);
    }
  }

  return [...cells];
};

/**
 * Tiled's staggered and hexagonal layout. A staggered grid is the hexagonal
 * one with no straight sides, so both share this geometry. Like Tiled, the
 * cell size is rounded down to even pixels so every half-cell step is whole.
 */
class StaggerGeometry {
  private readonly _originX: number;
  private readonly _originY: number;
  private readonly _staggerX: boolean;
  private readonly _staggerEven: boolean;
  private readonly _hexagonal: boolean;
  private readonly _tileWidth: number;
  private readonly _tileHeight: number;
  private readonly _sideLengthX: number;
  private readonly _sideLengthY: number;
  private readonly _sideOffsetX: number;
  private readonly _sideOffsetY: number;
  private readonly _columnWidth: number;
  private readonly _rowHeight: number;

  public constructor(projection: TileProjection) {
    this._originX = projection.originX;
    this._originY = projection.originY;
    this._staggerX = projection.staggerAxis === 'x';
    this._staggerEven = projection.staggerIndex === 'even';
    this._hexagonal = projection.orientation === 'hexagonal';
    this._tileWidth = projection.tileWidth & ~1;
    this._tileHeight = projection.tileHeight & ~1;
    this._sideLengthX = this._staggerX ? projection.hexSideLength : 0;
    this._sideLengthY = this._staggerX ? 0 : projection.hexSideLength;
    this._sideOffsetX = (this._tileWidth - this._sideLengthX) / 2;
    this._sideOffsetY = (this._tileHeight - this._sideLengthY) / 2;
    this._columnWidth = this._sideOffsetX + this._sideLengthX;
    this._rowHeight = this._sideOffsetY + this._sideLengthY;
  }

  public cellOrigin(tx: number, ty: number): { x: number; y: number } {
    if (this._staggerX) {
      const y = ty * (this._tileHeight + this._sideLengthY) + (this._shifted(tx) ? this._rowHeight : 0);

      return { x: this._originX + tx * this._columnWidth, y: this._originY + y };
    }

    const x = tx * (this._tileWidth + this._sideLengthX) + (this._shifted(ty) ? this._columnWidth : 0);

    return { x: this._originX + x, y: this._originY + ty * this._rowHeight };
  }

  public band(tx: number, ty: number): number {
    return this._staggerX ? ty * 2 + (this._shifted(tx) ? 1 : 0) : ty;
  }

  public bounds(tx: number, ty: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
    if (width <= 0 || height <= 0) {
      return { x: this._originX, y: this._originY, width: 0, height: 0 };
    }

    // The shift depends only on parity, so the outermost two columns and rows
    // of the region already reach every extreme.
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const x of edgeCells(tx, width)) {
      for (const y of edgeCells(ty, height)) {
        const origin = this.cellOrigin(x, y);

        left = Math.min(left, origin.x);
        top = Math.min(top, origin.y);
        right = Math.max(right, origin.x + this._tileWidth);
        bottom = Math.max(bottom, origin.y + this._tileHeight);
      }
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  public pick(x: number, y: number): { tx: number; ty: number } {
    return this._hexagonal ? this._pickHexagon(x, y) : this._pickDiamond(x, y);
  }

  /** Whether the row or column holding this coordinate is the shifted one. */
  private _shifted(coordinate: number): boolean {
    return ((Math.floor(coordinate) & 1) === 1) !== this._staggerEven;
  }

  /** Tiled's staggered picking: the cell of a half-shifted diamond lattice. */
  private _pickDiamond(x: number, y: number): { tx: number; ty: number } {
    const halfWidth = this._tileWidth / 2;
    const halfHeight = this._tileHeight / 2;
    let px = x;
    let py = y;

    if (this._staggerX) {
      px -= this._staggerEven ? halfWidth : 0;
    } else {
      py -= this._staggerEven ? halfHeight : 0;
    }

    // The reference box spans a full tile; its centre diamond is one cell and
    // its four corners belong to the four diagonal neighbours.
    const refX = Math.floor(px / this._tileWidth);
    const refY = Math.floor(py / this._tileHeight);
    const relX = px - refX * this._tileWidth;
    const relY = py - refY * this._tileHeight;
    const tx = this._staggerX ? refX * 2 + (this._staggerEven ? 1 : 0) : refX;
    const ty = this._staggerX ? refY : refY * 2 + (this._staggerEven ? 1 : 0);
    const along = (relX * this._tileHeight) / this._tileWidth;

    if (halfHeight - along > relY) {
      return this._diagonalNeighbour(tx, ty, -1, -1);
    }

    if (-halfHeight + along > relY) {
      return this._diagonalNeighbour(tx, ty, 1, -1);
    }

    if (halfHeight + along < relY) {
      return this._diagonalNeighbour(tx, ty, -1, 1);
    }

    if (halfHeight * 3 - along < relY) {
      return this._diagonalNeighbour(tx, ty, 1, 1);
    }

    return { tx, ty };
  }

  /** The diamond touching cell (tx, ty) at its corner in direction (dx, dy). */
  private _diagonalNeighbour(tx: number, ty: number, dx: number, dy: number): { tx: number; ty: number } {
    // Across the stagger axis the neighbour is one step away; along it, a
    // shifted cell's neighbours sit at +0/+1 and an unshifted cell's at -1/+0.
    if (this._staggerX) {
      const base = this._shifted(tx) ? 0 : -1;

      return { tx: tx + dx, ty: ty + base + (dy < 0 ? 0 : 1) };
    }

    const base = this._shifted(ty) ? 0 : -1;

    return { tx: tx + base + (dx < 0 ? 0 : 1), ty: ty + dy };
  }

  /** Tiled's hexagonal picking: the nearest cell centre among four candidates. */
  private _pickHexagon(x: number, y: number): { tx: number; ty: number } {
    let px = x;
    let py = y;

    if (this._staggerX) {
      px -= this._staggerEven ? this._tileWidth : this._sideOffsetX;
    } else {
      py -= this._staggerEven ? this._tileHeight : this._sideOffsetY;
    }

    let refX = Math.floor(px / (this._columnWidth * 2));
    let refY = Math.floor(py / (this._rowHeight * 2));
    const relX = px - refX * this._columnWidth * 2;
    const relY = py - refY * this._rowHeight * 2;

    if (this._staggerX) {
      refX = refX * 2 + (this._staggerEven ? 1 : 0);
    } else {
      refY = refY * 2 + (this._staggerEven ? 1 : 0);
    }

    const centres = this._staggerX ? this._centresStaggerX() : this._centresStaggerY();
    const offsets = this._staggerX ? HEX_OFFSETS_STAGGER_X : HEX_OFFSETS_STAGGER_Y;
    let nearest: Pair = [0, 0];
    let nearestDistance = Infinity;

    for (const [index, [cx, cy]] of centres.entries()) {
      const distance = (cx - relX) ** 2 + (cy - relY) ** 2;
      const offset = offsets[index];

      if (distance < nearestDistance && offset !== undefined) {
        nearestDistance = distance;
        nearest = offset;
      }
    }

    return { tx: refX + nearest[0], ty: refY + nearest[1] };
  }

  /** Centres of the four cells around a reference box, relative to the box. */
  private _centresStaggerX(): readonly Pair[] {
    const left = this._sideLengthX / 2;
    const centreX = left + this._columnWidth;
    const centreY = this._tileHeight / 2;

    return [
      [left, centreY],
      [centreX, centreY - this._rowHeight],
      [centreX, centreY + this._rowHeight],
      [centreX + this._columnWidth, centreY],
    ];
  }

  private _centresStaggerY(): readonly Pair[] {
    const top = this._sideLengthY / 2;
    const centreX = this._tileWidth / 2;
    const centreY = top + this._rowHeight;

    return [
      [centreX, top],
      [centreX - this._columnWidth, centreY],
      [centreX + this._columnWidth, centreY],
      [centreX, centreY + this._rowHeight],
    ];
  }
}
