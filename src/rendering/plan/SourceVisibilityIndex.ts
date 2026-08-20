import { intersectionRectRect } from '#math/collision-primitives';
import type { ReadonlyRectangle } from '#math/Rectangle';
import type { RectangleLike } from '#math/RectangleLike';

import type { PackedSourceItems } from './PackedSourceItems';

/**
 * @internal
 *
 * One bit per item of a scope: whether the current cull rect admits it.
 *
 * The delta between two of these is the whole point. Membership as a bitset
 * makes "what entered", "what left" and "what stayed" three word-wise loops over
 * `count / 32` words, so a camera step that keeps 250,000 items and swaps 4,000
 * of them never visits the 250,000.
 */
export class MembershipBits {
  private _words = new Uint32Array(0);
  private _count = 0;

  public get words(): Uint32Array {
    return this._words;
  }

  /** Words actually in use - the array may be larger after a shrinking reset. */
  public get wordCount(): number {
    return (this._count + 31) >>> 5;
  }

  public get byteLength(): number {
    return this.wordCount * Uint32Array.BYTES_PER_ELEMENT;
  }

  /** Size the set for `count` items, dropping any previous contents. */
  public reset(count: number): void {
    const words = (count + 31) >>> 5;

    if (this._words.length < words) {
      this._words = new Uint32Array(words);
    } else {
      this._words.fill(0, 0, words);
    }

    this._count = count;
  }

  /** Zero every bit without resizing. */
  public clear(): void {
    this._words.fill(0, 0, this.wordCount);
  }

  public set(index: number): void {
    this._words[index >>> 5]! |= 1 << (index & 31);
  }

  public has(index: number): boolean {
    return (this._words[index >>> 5]! & (1 << (index & 31))) !== 0;
  }

  /** Population count - the number of admitted items. */
  public count(): number {
    const words = this._words;
    const end = this.wordCount;
    let total = 0;

    for (let i = 0; i < end; i++) {
      let value = words[i]!;

      value -= (value >>> 1) & 0x55555555;
      value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
      value = (value + (value >>> 4)) & 0x0f0f0f0f;
      total += Math.imul(value, 0x01010101) >>> 24;
    }

    return total;
  }
}

/**
 * Per-scope classification of the items a spatial query has to answer for.
 *
 * The split exists because `SceneNode._inCullRect` has three genuinely different
 * inputs and only one of them is indexable:
 *
 * - `cullable === false` - the answer is "always", so the item must never cost a
 *   cell walk. It also has no meaningful extent to file under.
 * - a custom `cullArea` - a MUTABLE `Rectangle` whose in-place mutation stamps
 *   no revision (only replacing the reference does). An index that copied it
 *   would go stale unnoticed, so these are re-tested live against the node's
 *   current rect. This is the cut-2 answer the spec left open, and it is the
 *   small one: no new observable contract, no rectangle API rework, and the
 *   existing in-place-mutation test keeps passing because nothing about that
 *   path changed.
 * - a plain bounds item - indexable, and the overwhelming majority.
 * @internal
 */
const enum ItemClass {
  Indexed,
  AlwaysVisible,
  LiveCull,
}

/** Cell edge as a multiple of the mean item extent (see {@link SourceVisibilityIndex}). */
const cellSizeItemFactor = 4;
/** Items wider/taller than this many cells are pulled out of the grid entirely. */
const oversizedCellFactor = 4;
/** Upper bound on grid cells, so a huge world with tiny items cannot allocate an unbounded table. */
const maxCells = 1 << 20;

/**
 * @internal
 *
 * Uniform grid over one scope's indexable items.
 *
 * Each item is filed under exactly ONE cell - the cell containing its minimum
 * corner - rather than under every cell it overlaps. A multi-cell filing turns
 * a scene of 8px sprites on 32px cells into four entries per item and makes the
 * query hand the same candidate back several times; single-cell filing keeps the
 * table at exactly one `int32` per item and the query duplicate-free. The price
 * is that an item may reach beyond its cell, which the index pays for by
 * remembering the largest such overhang and widening every query by it.
 *
 * Complexity, stated as what it is: **expected O(overlapped cells + candidates),
 * worst case O(N)**. A scene whose items all land in one cell degenerates to the
 * flat scan, and no cell size prevents that. What the grid does buy is the case
 * the cut exists for - a world laid out across an area several times the
 * viewport - where the overwhelming majority of items are never looked at.
 *
 * The cell edge is derived from the MEAN item extent rather than from the world
 * size, because the query cost is driven by items per cell, not by cells per
 * world. Items far larger than a cell (a full-screen backdrop among sprites)
 * would push the overhang - and therefore every query's widening - out to their
 * own size, so they are removed from the grid and answered live instead.
 */
export class SourceVisibilityIndex {
  private _cellSize = 0;
  private _originX = 0;
  private _originY = 0;
  private _columns = 0;
  private _rows = 0;
  private _overhangCellsX = 0;
  private _overhangCellsY = 0;

  /** CSR: `_cellStart[c] .. _cellStart[c + 1]` indexes into {@link _cellItems}. */
  private _cellStart = new Int32Array(0);
  private _cellItems = new Int32Array(0);

  /** Items that opt out of culling: admitted unconditionally, never walked. */
  private _alwaysVisible = new Int32Array(0);
  /** Items answered by a live `_inCullRect` call (custom `cullArea`, or oversized). */
  private _liveCull = new Int32Array(0);

  private _built = false;

  /** Reused rect handed to the cull test, so a query allocates nothing. */
  private readonly _scratch: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
  /**
   * The query rect as a PLAIN object.
   *
   * A `Rectangle` routes `x`/`y`/`width`/`height` through its observable vector
   * and size, so reading the four of them once per candidate was measured as
   * 4.5% of a million-item camera step. Copied once per query instead, and the
   * per-candidate test then reads two plain objects.
   */
  private readonly _queryRect: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };

  public get isBuilt(): boolean {
    return this._built;
  }

  /** Items answered live per query - the honest part of the query's cost. */
  public get liveCullCount(): number {
    return this._liveCull.length;
  }

  public get alwaysVisibleCount(): number {
    return this._alwaysVisible.length;
  }

  public get cellCount(): number {
    return this._columns * this._rows;
  }

  /** CPU bytes this index holds, for the memory report. */
  public get byteLength(): number {
    return this._cellStart.byteLength + this._cellItems.byteLength + this._alwaysVisible.byteLength + this._liveCull.byteLength;
  }

  /**
   * File `items` into a fresh grid.
   *
   * Two passes: one to classify and size, one to fill the CSR table. Cold work -
   * it happens once per source build, not once per camera step.
   */
  public build(items: PackedSourceItems): void {
    this.release();

    const count = items.count;

    if (count === 0) {
      this._built = true;

      return;
    }

    const minX = items.minX;
    const minY = items.minY;
    const maxX = items.maxX;
    const maxY = items.maxY;
    const drawables = items.drawables;
    const itemClass = new Uint8Array(count);

    let worldMinX = Number.POSITIVE_INFINITY;
    let worldMinY = Number.POSITIVE_INFINITY;
    let worldMaxX = Number.NEGATIVE_INFINITY;
    let worldMaxY = Number.NEGATIVE_INFINITY;
    let extentSum = 0;
    let indexable = 0;
    let alwaysVisible = 0;
    let liveCull = 0;

    for (let i = 0; i < count; i++) {
      const drawable = drawables[i]!;

      if (!drawable.cullable) {
        itemClass[i] = ItemClass.AlwaysVisible;
        alwaysVisible++;

        continue;
      }

      if (drawable.cullArea !== null) {
        itemClass[i] = ItemClass.LiveCull;
        liveCull++;

        continue;
      }

      const left = minX[i]!;
      const top = minY[i]!;
      const right = maxX[i]!;
      const bottom = maxY[i]!;

      if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
        // A non-finite extent has no cell. Live, rather than a NaN index.
        itemClass[i] = ItemClass.LiveCull;
        liveCull++;

        continue;
      }

      itemClass[i] = ItemClass.Indexed;
      indexable++;
      extentSum += right - left + (bottom - top);

      if (left < worldMinX) worldMinX = left;
      if (top < worldMinY) worldMinY = top;
      if (right > worldMaxX) worldMaxX = right;
      if (bottom > worldMaxY) worldMaxY = bottom;
    }

    this._alwaysVisible = new Int32Array(alwaysVisible);
    this._liveCull = new Int32Array(liveCull + indexable);

    if (indexable === 0) {
      this._fillSideLists(itemClass, count, liveCull);
      this._built = true;

      return;
    }

    // Mean of (width + height) over the indexed items; halved back into a single
    // edge, then scaled so a cell holds a handful of items rather than one.
    const meanExtent = extentSum / (2 * indexable);
    const worldWidth = Math.max(worldMaxX - worldMinX, Number.MIN_VALUE);
    const worldHeight = Math.max(worldMaxY - worldMinY, Number.MIN_VALUE);

    let cellSize = Math.max(meanExtent * cellSizeItemFactor, Math.max(worldWidth, worldHeight) / 4096, Number.MIN_VALUE);

    // Cap the table. A degenerate mean (all-zero extents) would otherwise ask
    // for a cell per floating-point step.
    while ((Math.floor(worldWidth / cellSize) + 1) * (Math.floor(worldHeight / cellSize) + 1) > maxCells) {
      cellSize *= 2;
    }

    const columns = Math.floor(worldWidth / cellSize) + 1;
    const rows = Math.floor(worldHeight / cellSize) + 1;
    const cells = columns * rows;
    const overhangLimit = cellSize * oversizedCellFactor;
    const cellOf = new Int32Array(count).fill(-1);
    const counts = new Int32Array(cells + 1);
    let filed = 0;
    let oversized = 0;

    for (let i = 0; i < count; i++) {
      if (itemClass[i] !== ItemClass.Indexed) {
        continue;
      }

      if (maxX[i]! - minX[i]! > overhangLimit || maxY[i]! - minY[i]! > overhangLimit) {
        // Too big to file without widening every query to its own size.
        itemClass[i] = ItemClass.LiveCull;
        oversized++;

        continue;
      }

      const column = Math.min(columns - 1, Math.max(0, Math.floor((minX[i]! - worldMinX) / cellSize)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor((minY[i]! - worldMinY) / cellSize)));
      const cell = row * columns + column;

      cellOf[i] = cell;
      counts[cell + 1] = counts[cell + 1]! + 1;
      filed++;

      const overhangX = maxX[i]! - (worldMinX + (column + 1) * cellSize);
      const overhangY = maxY[i]! - (worldMinY + (row + 1) * cellSize);

      if (overhangX > 0) {
        const overhangCells = Math.ceil(overhangX / cellSize);

        if (overhangCells > this._overhangCellsX) this._overhangCellsX = overhangCells;
      }

      if (overhangY > 0) {
        const overhangCells = Math.ceil(overhangY / cellSize);

        if (overhangCells > this._overhangCellsY) this._overhangCellsY = overhangCells;
      }
    }

    for (let c = 0; c < cells; c++) {
      counts[c + 1]! += counts[c]!;
    }

    const cellItems = new Int32Array(filed);
    const cursor = counts.slice(0, cells);

    for (let i = 0; i < count; i++) {
      const cell = cellOf[i]!;

      if (cell >= 0) {
        cellItems[cursor[cell]!++] = i;
      }
    }

    this._cellSize = cellSize;
    this._originX = worldMinX;
    this._originY = worldMinY;
    this._columns = columns;
    this._rows = rows;
    this._cellStart = counts;
    this._cellItems = cellItems;
    this._fillSideLists(itemClass, count, liveCull + oversized);
    this._built = true;
  }

  /**
   * Set a bit in `bits` for every item `rect` admits.
   *
   * `bits` is expected to arrive cleared. Three sources feed it: the always-
   * visible list verbatim, the live list through the node's own `_inCullRect`,
   * and the grid cells the rect overlaps.
   *
   * The grid walk has a fast path worth naming: a cell whose own box, WIDENED by
   * the recorded overhang, lies entirely inside `rect` cannot hold an item that
   * misses it - every item filed there starts inside the cell and reaches at
   * most to the overhang. Those items are admitted without a test, which is what
   * keeps the interior of a large visible area free of per-item arithmetic.
   */
  public query(items: PackedSourceItems, rect: ReadonlyRectangle, bits: MembershipBits, stats: VisibilityQueryStats): void {
    const drawables = items.drawables;
    const alwaysVisible = this._alwaysVisible;

    for (let i = 0; i < alwaysVisible.length; i++) {
      bits.set(alwaysVisible[i]!);
    }

    stats.candidates += alwaysVisible.length;

    const liveCull = this._liveCull;
    const scratch = this._scratch;
    const minX = items.minX;
    const minY = items.minY;
    const maxX = items.maxX;
    const maxY = items.maxY;

    for (let k = 0; k < liveCull.length; k++) {
      const i = liveCull[k]!;

      scratch.x = minX[i]!;
      scratch.y = minY[i]!;
      scratch.width = maxX[i]! - scratch.x;
      scratch.height = maxY[i]! - scratch.y;

      if (drawables[i]!._inCullRectUsingBounds(rect, scratch)) {
        bits.set(i);
      }
    }

    stats.candidates += liveCull.length;

    const columns = this._columns;
    const rows = this._rows;

    if (columns === 0 || rows === 0) {
      return;
    }

    const cellSize = this._cellSize;
    const originX = this._originX;
    const originY = this._originY;
    const queryRect = this._queryRect;
    const left = rect.x;
    const top = rect.y;
    const width = rect.width;
    const height = rect.height;
    const right = left + width;
    const bottom = top + height;

    queryRect.x = left;
    queryRect.y = top;
    queryRect.width = width;
    queryRect.height = height;

    const firstColumn = Math.max(0, Math.floor((left - originX) / cellSize) - this._overhangCellsX);
    const lastColumn = Math.min(columns - 1, Math.floor((right - originX) / cellSize));
    const firstRow = Math.max(0, Math.floor((top - originY) / cellSize) - this._overhangCellsY);
    const lastRow = Math.min(rows - 1, Math.floor((bottom - originY) / cellSize));

    if (firstColumn > lastColumn || firstRow > lastRow) {
      return;
    }

    const cellStart = this._cellStart;
    const cellItems = this._cellItems;
    const words = bits.words;
    const overhangX = this._overhangCellsX * cellSize;
    const overhangY = this._overhangCellsY * cellSize;

    for (let row = firstRow; row <= lastRow; row++) {
      const cellTop = originY + row * cellSize;
      const rowInterior = cellTop >= top && cellTop + cellSize + overhangY <= bottom;
      const rowBase = row * columns;

      for (let column = firstColumn; column <= lastColumn; column++) {
        const cell = rowBase + column;
        const from = cellStart[cell]!;
        const to = cellStart[cell + 1]!;

        if (from === to) {
          continue;
        }

        stats.cells++;
        stats.candidates += to - from;

        const cellLeft = originX + column * cellSize;

        if (rowInterior && cellLeft >= left && cellLeft + cellSize + overhangX <= right) {
          // Admitting a whole cell is the query's inner loop at scale - nine
          // candidates in ten reach it on a viewport-sized rect - so the set is
          // written through its word array directly. `bits.set` is the same two
          // operations behind a call, and at a third of a million admissions a
          // frame the call is a measurable share of the query.
          for (let k = from; k < to; k++) {
            const i = cellItems[k]!;

            words[i >>> 5] = words[i >>> 5]! | (1 << (i & 31));
          }

          continue;
        }

        for (let k = from; k < to; k++) {
          const i = cellItems[k]!;

          scratch.x = minX[i]!;
          scratch.y = minY[i]!;
          scratch.width = maxX[i]! - scratch.x;
          scratch.height = maxY[i]! - scratch.y;

          // The same primitive `_inCullRectUsingBounds` ends in - these items
          // were classified as cullable-with-plain-bounds at build time, and
          // both classifiers stamp the structure revision the source is keyed
          // on, so the classification cannot have gone stale here.
          if (intersectionRectRect(queryRect, scratch)) {
            words[i >>> 5] = words[i >>> 5]! | (1 << (i & 31));
          }
        }
      }
    }
  }

  /** Drop the tables (source invalidation / root destroy). */
  public release(): void {
    this._built = false;
    this._cellSize = 0;
    this._columns = 0;
    this._rows = 0;
    this._overhangCellsX = 0;
    this._overhangCellsY = 0;
    this._cellStart = new Int32Array(0);
    this._cellItems = new Int32Array(0);
    this._alwaysVisible = new Int32Array(0);
    this._liveCull = new Int32Array(0);
  }

  private _fillSideLists(itemClass: Uint8Array, count: number, liveCullCount: number): void {
    if (this._liveCull.length !== liveCullCount) {
      this._liveCull = new Int32Array(liveCullCount);
    }

    let alwaysAt = 0;
    let liveAt = 0;

    for (let i = 0; i < count; i++) {
      if (itemClass[i] === ItemClass.AlwaysVisible) {
        this._alwaysVisible[alwaysAt++] = i;
      } else if (itemClass[i] === ItemClass.LiveCull) {
        this._liveCull[liveAt++] = i;
      }
    }
  }
}

/** Per-frame query accounting, pinned by the structural counter gates. @internal */
export interface VisibilityQueryStats {
  /** Grid cells actually walked. */
  cells: number;
  /** Items the query looked at, whether or not they were admitted. */
  candidates: number;
}
