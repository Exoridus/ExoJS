import type { ReadonlyRectangle } from '@codexo/exojs';

import type { Light } from '../lights/Light';
import { LineLight } from '../lights/LineLight';
import { lightFalloff, lightHalfLength } from '../lights/reach';
import { SpotLight } from '../lights/SpotLight';

/** Floats per texel of every table, which are all RGBA32F. */
const CHANNELS = 4;

/** Texels one occluder segment takes: `(ax, ay, bx, by)`. */
const SEGMENT_TEXELS = 1;

/**
 * Texels one emitter takes.
 *
 * `(cx, cy, radius, halfLength)`, `(axisX, axisY, cosOuter, cosInner)`,
 * `(densityR, densityG, densityB, directional)`.
 */
const EMITTER_TEXELS = 3;

/** Width of the segment, emitter and index tables, in texels. */
const TABLE_WIDTH = 256;

/** Smallest world extent a grid cell may have, so a degenerate view cannot divide by zero. */
const MIN_CELL = 1e-3;

/**
 * Upper bound on a table's texel count, from the smallest guaranteed WebGL2 and
 * WebGPU 2D texture dimension. A build that would exceed it reports rather than
 * silently dropping geometry, which would show as light through a wall.
 */
const MAX_TABLE_TEXELS = TABLE_WIDTH * 2048;

/** Thrown when a scene holds more geometry than the transport tables can address. */
export class TransportCapacityError extends Error {
  public constructor(what: string, needed: number, limit: number) {
    super(`Transport geometry exceeds its table: ${what} needs ${needed} texels, limit is ${limit}.`);
    this.name = 'TransportCapacityError';
  }
}

/** The world radius of a light's emitting shape, which is its disc or capsule radius. */
export const sourceRadius = (light: Light): number => Math.max(3, lightFalloff(light) * Math.min(1, Math.max(0, light.softness)) * 0.05);

/**
 * Emission per unit of path length through a source's shape, per colour
 * channel, in the calibration described on {@link TransportGeometry}.
 */
export const sourceDensity = (light: Light, radius: number, halfLength: number): number => {
  const area = Math.PI * radius * radius + 4 * radius * halfLength;

  return area <= 0 ? 0 : (light.intensity * lightFalloff(light) * Math.PI) / (4 * area);
};

/** How the transport tables are laid out for a frame, as the shaders read them. */
export interface TransportTables {
  /** Segment endpoints, four floats per texel, `TABLE_WIDTH` texels per row. */
  readonly segments: Float32Array;
  /** Occluder segments described by {@link segments}. */
  readonly segmentCount: number;
  /** Emitters, three texels each, in the layout {@link TransportGeometry} documents. */
  readonly emitters: Float32Array;
  /** Emitters described by {@link emitters}. */
  readonly emitterCount: number;
  /** Per cell `(segmentOffset, segmentCount, emitterOffset, emitterCount)`, row-major over the grid. */
  readonly cells: Float32Array;
  /** Primitive ids the cell ranges point into, one per texel in the red channel. */
  readonly indices: Float32Array;
  /** Texels of {@link indices} that hold an id. */
  readonly indexCount: number;
  /** World position of the grid's lower-left corner. */
  readonly originX: number;
  readonly originY: number;
  /** World extent of one grid cell. */
  readonly cellSize: number;
  /** Cells across and up the grid. */
  readonly gridWidth: number;
  readonly gridHeight: number;
  /** Rows each table occupies, which is what the upload needs. */
  readonly segmentRows: number;
  readonly emitterRows: number;
  readonly indexRows: number;
}

/**
 * This frame's occluder segments and virtual emitters, plus a uniform grid that
 * narrows a ray's candidates to the cells it crosses.
 *
 * The grid only decides which primitives a ray tests. It never decides whether
 * one is hit: a cell size that changes the candidate lists must not change any
 * traced value, which is what makes the size a cost knob rather than a quality
 * one. Primitives are therefore entered into every cell their bounding box
 * touches, and a ray walks the cells in order so a primitive listed in several
 * of them is integrated over each cell's own half-open parameter interval and
 * counted once.
 *
 * Virtual emitters are additive emission distributions, not occluders: a point
 * or spot light emits uniformly from a disc of {@link sourceRadius}, a line
 * light from a capsule of that radius, and a ray collects the density
 * {@link sourceDensity} gives over the length it actually travels inside that
 * shape. Only registered occluders block. The calibration is chosen so the mean
 * over a probe's directions is about `intensity * reach / (8 * distance)` in the
 * far field, which puts the radiance scale alongside the lightmap falloff; it is
 * a chosen 2D calibration rather than photometry.
 *
 * Buffers grow to the largest frame seen and are reused afterwards.
 * @internal
 */
export class TransportGeometry {
  private _segments = new Float32Array(64 * SEGMENT_TEXELS * CHANNELS);
  private _emitters = new Float32Array(16 * EMITTER_TEXELS * CHANNELS);
  private _cells = new Float32Array(CHANNELS);
  private _indices = new Float32Array(256 * CHANNELS);
  private _segmentCount = 0;
  private _emitterCount = 0;
  private _indexCount = 0;
  private _originX = 0;
  private _originY = 0;
  private _cellSize = MIN_CELL;
  private _gridWidth = 1;
  private _gridHeight = 1;
  /** Per cell, how many segments and emitters it holds, filled before the ids are placed. */
  private _segmentTally = new Int32Array(1);
  private _emitterTally = new Int32Array(1);
  /** Where each cell's ids begin, and how many of each kind have been written so far. */
  private _segmentCursor = new Int32Array(1);
  private _emitterCursor = new Int32Array(1);

  /**
   * Rebuild from this frame's occluder segments and lights.
   *
   * `segments` holds `(x1, y1, x2, y2)` quadruples as {@link OccluderField}
   * collects them, `bounds` is the region the fields cover, and `cellSize` is
   * the world extent of one grid cell.
   *
   * @throws TransportCapacityError when the scene needs more table texels than
   * a guaranteed texture dimension can address.
   */
  public build(segments: Float32Array, segmentCount: number, lights: readonly Light[], bounds: ReadonlyRectangle, cellSize: number): void {
    this._layOutGrid(bounds, cellSize);
    this._writeSegments(segments, segmentCount);
    this._writeEmitters(lights);
    this._buildIndex();
  }

  /** What the last {@link build} produced. */
  public get tables(): TransportTables {
    return {
      segments: this._segments,
      segmentCount: this._segmentCount,
      emitters: this._emitters,
      emitterCount: this._emitterCount,
      cells: this._cells,
      indices: this._indices,
      indexCount: this._indexCount,
      originX: this._originX,
      originY: this._originY,
      cellSize: this._cellSize,
      gridWidth: this._gridWidth,
      gridHeight: this._gridHeight,
      segmentRows: rowsFor(this._segmentCount * SEGMENT_TEXELS),
      emitterRows: rowsFor(this._emitterCount * EMITTER_TEXELS),
      indexRows: rowsFor(this._indexCount),
    };
  }

  private _layOutGrid(bounds: ReadonlyRectangle, cellSize: number): void {
    this._cellSize = Math.max(cellSize, MIN_CELL);
    this._originX = bounds.x;
    this._originY = bounds.y;
    this._gridWidth = Math.max(1, Math.ceil(Math.max(0, bounds.width) / this._cellSize));
    this._gridHeight = Math.max(1, Math.ceil(Math.max(0, bounds.height) / this._cellSize));

    const cells = this._gridWidth * this._gridHeight;

    if (this._segmentTally.length < cells) {
      this._segmentTally = new Int32Array(cells);
      this._emitterTally = new Int32Array(cells);
      this._segmentCursor = new Int32Array(cells);
      this._emitterCursor = new Int32Array(cells);
      this._cells = new Float32Array(cells * CHANNELS);
    } else {
      this._segmentTally.fill(0, 0, cells);
      this._emitterTally.fill(0, 0, cells);
    }
  }

  private _writeSegments(segments: Float32Array, count: number): void {
    const needed = count * SEGMENT_TEXELS;

    if (needed > MAX_TABLE_TEXELS) {
      throw new TransportCapacityError('occluder segments', needed, MAX_TABLE_TEXELS);
    }

    this._segments = fit(this._segments, needed * CHANNELS);
    this._segmentCount = count;

    for (let index = 0; index < count; index++) {
      const source = index * 4;
      const target = index * SEGMENT_TEXELS * CHANNELS;

      this._segments[target] = segments[source]!;
      this._segments[target + 1] = segments[source + 1]!;
      this._segments[target + 2] = segments[source + 2]!;
      this._segments[target + 3] = segments[source + 3]!;
    }
  }

  private _writeEmitters(lights: readonly Light[]): void {
    const placed: Light[] = [];

    for (const light of lights) {
      if (light.enabled && lightFalloff(light) > 0) {
        placed.push(light);
      }
    }

    const needed = placed.length * EMITTER_TEXELS;

    if (needed > MAX_TABLE_TEXELS) {
      throw new TransportCapacityError('emitters', needed, MAX_TABLE_TEXELS);
    }

    this._emitters = fit(this._emitters, needed * CHANNELS);
    this._emitterCount = placed.length;

    const position = { x: 0, y: 0 };
    const direction = { x: 0, y: 0 };

    for (let index = 0; index < placed.length; index++) {
      const light = placed[index]!;
      const radius = sourceRadius(light);
      const halfLength = lightHalfLength(light);
      const density = sourceDensity(light, radius, halfLength);
      const target = index * EMITTER_TEXELS * CHANNELS;

      light.getWorldPosition(position);

      // A capsule needs its axis whatever the light does with direction; a spot
      // needs it as the direction light leaves along. Both are stored
      // normalized, never as an angle: two spots facing nearly opposite ways
      // average to a lobe pointing at neither of them.
      if (light instanceof SpotLight || light instanceof LineLight) {
        light.getWorldDirection(direction);
      } else {
        direction.x = 1;
        direction.y = 0;
      }

      const length = Math.hypot(direction.x, direction.y);
      const axisX = length > 0 ? direction.x / length : 1;
      const axisY = length > 0 ? direction.y / length : 0;
      const outer = light instanceof SpotLight ? (Math.max(0, Math.min(90, light.angle)) * Math.PI) / 180 : 0;
      const inner = light instanceof SpotLight ? outer * (1 - Math.min(1, Math.max(0, light.coneSoftness))) : 0;

      this._emitters[target] = position.x;
      this._emitters[target + 1] = position.y;
      this._emitters[target + 2] = radius;
      this._emitters[target + 3] = halfLength;
      this._emitters[target + 4] = axisX;
      this._emitters[target + 5] = axisY;
      this._emitters[target + 6] = Math.cos(outer);
      this._emitters[target + 7] = Math.cos(inner);
      this._emitters[target + 8] = (light.color.r / 255) * density;
      this._emitters[target + 9] = (light.color.g / 255) * density;
      this._emitters[target + 10] = (light.color.b / 255) * density;
      this._emitters[target + 11] = light instanceof SpotLight ? 1 : 0;
    }
  }

  /**
   * Count each cell's primitives, lay the ranges out end to end, then place the
   * ids. Counting first is what keeps one contiguous list per cell without a
   * per-cell array, and it is why every primitive is visited twice.
   */
  private _buildIndex(): void {
    const cells = this._gridWidth * this._gridHeight;

    this._forEachSegmentCell(cell => {
      this._segmentTally[cell]!++;
    });
    this._forEachEmitterCell(cell => {
      this._emitterTally[cell]!++;
    });

    let offset = 0;

    for (let cell = 0; cell < cells; cell++) {
      const segments = this._segmentTally[cell]!;
      const emitters = this._emitterTally[cell]!;
      const target = cell * CHANNELS;

      this._cells[target] = offset;
      this._cells[target + 1] = segments;
      this._segmentCursor[cell] = offset;
      offset += segments;

      this._cells[target + 2] = offset;
      this._cells[target + 3] = emitters;
      this._emitterCursor[cell] = offset;
      offset += emitters;
    }

    if (offset > MAX_TABLE_TEXELS) {
      throw new TransportCapacityError('cell index', offset, MAX_TABLE_TEXELS);
    }

    this._indexCount = offset;
    this._indices = fit(this._indices, Math.max(offset, 1) * CHANNELS);

    this._forEachSegmentCell((cell, id) => {
      this._indices[this._segmentCursor[cell]!++ * CHANNELS] = id;
    });
    this._forEachEmitterCell((cell, id) => {
      this._indices[this._emitterCursor[cell]!++ * CHANNELS] = id;
    });
  }

  private _forEachSegmentCell(visit: (cell: number, id: number) => void): void {
    for (let id = 0; id < this._segmentCount; id++) {
      const at = id * SEGMENT_TEXELS * CHANNELS;
      const ax = this._segments[at]!;
      const ay = this._segments[at + 1]!;
      const bx = this._segments[at + 2]!;
      const by = this._segments[at + 3]!;

      this._forEachCellIn(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), id, visit);
    }
  }

  private _forEachEmitterCell(visit: (cell: number, id: number) => void): void {
    for (let id = 0; id < this._emitterCount; id++) {
      const at = id * EMITTER_TEXELS * CHANNELS;
      const centreX = this._emitters[at]!;
      const centreY = this._emitters[at + 1]!;
      const radius = this._emitters[at + 2]!;
      const halfLength = this._emitters[at + 3]!;
      const axisX = this._emitters[at + 4]!;
      const axisY = this._emitters[at + 5]!;
      const spanX = Math.abs(axisX) * halfLength + radius;
      const spanY = Math.abs(axisY) * halfLength + radius;

      this._forEachCellIn(centreX - spanX, centreY - spanY, centreX + spanX, centreY + spanY, id, visit);
    }
  }

  /**
   * Every cell a world-space bounding box touches, clipped to the grid.
   *
   * A box that lies wholly outside contributes nothing: a ray can only ask a
   * cell it crosses, and it never crosses one that does not exist. A box that
   * merely reaches outside keeps the part that does exist, so a wall running
   * off the edge of the field still blocks inside it.
   */
  private _forEachCellIn(minX: number, minY: number, maxX: number, maxY: number, id: number, visit: (cell: number, id: number) => void): void {
    // `ceil - 1` rather than `floor` on the low edge: the two agree except
    // where the edge lands exactly on a cell boundary, and there the box
    // touches the cell on the other side of it too. A wall along a tile edge
    // is the ordinary case, and a ray reaching that boundary from the far side
    // crosses it exactly where the wall stands - in a cell that would
    // otherwise never list it and so never test it. The high edge needs no
    // such treatment: a box ending on a boundary already lands in the cell
    // beyond it by rounding down.
    const firstX = Math.ceil((minX - this._originX) / this._cellSize) - 1;
    const lastX = Math.floor((maxX - this._originX) / this._cellSize);
    const firstY = Math.ceil((minY - this._originY) / this._cellSize) - 1;
    const lastY = Math.floor((maxY - this._originY) / this._cellSize);
    const fromX = Math.max(0, firstX);
    const toX = Math.min(this._gridWidth - 1, lastX);
    const fromY = Math.max(0, firstY);
    const toY = Math.min(this._gridHeight - 1, lastY);

    for (let y = fromY; y <= toY; y++) {
      for (let x = fromX; x <= toX; x++) {
        visit(y * this._gridWidth + x, id);
      }
    }
  }
}

/** Rows of {@link TABLE_WIDTH} texels a table of `texels` entries occupies. */
const rowsFor = (texels: number): number => Math.max(1, Math.ceil(texels / TABLE_WIDTH));

/** `buffer`, or a larger one, holding at least `floats` and a whole number of rows. */
const fit = (buffer: Float32Array<ArrayBuffer>, floats: number): Float32Array<ArrayBuffer> => {
  const rows = Math.max(1, Math.ceil(floats / (TABLE_WIDTH * CHANNELS)));
  const needed = rows * TABLE_WIDTH * CHANNELS;

  if (buffer.length >= needed) {
    buffer.fill(0, 0, Math.min(buffer.length, needed));

    return buffer;
  }

  return new Float32Array(needed);
};

export {
  CHANNELS as transportChannels,
  EMITTER_TEXELS as transportEmitterTexels,
  SEGMENT_TEXELS as transportSegmentTexels,
  TABLE_WIDTH as transportTableWidth,
};
