import { DataTexture, type ReadonlyRectangle, TextureFormat } from '@codexo/exojs';

import type { Light } from '../lights/Light';
import { TransportGeometry, transportTableWidth } from './transportGeometry';

const create = (width: number, height: number): DataTexture<TextureFormat.Rgba32F> =>
  new DataTexture({ width: Math.max(1, width), height: Math.max(1, height), format: TextureFormat.Rgba32F });

/**
 * This frame's transport tables, on the GPU.
 *
 * The geometry is rebuilt and re-uploaded whole every frame: the segments come
 * from occluder sources that may have moved, and a partial upload would have
 * to establish that they did not.
 *
 * A data texture's buffer is fixed at construction, so a table that outgrows
 * its texture gets a new one, doubling so that a scene settles after a few
 * frames rather than reallocating on every wall it adds. Identity therefore
 * changes on growth, and anything holding a binding to these must take them
 * from the accessors again after {@link build} rather than once.
 * @internal
 */
export class TransportTextures {
  private readonly _geometry = new TransportGeometry();
  private _segments = create(transportTableWidth, 1);
  private _emitters = create(transportTableWidth, 1);
  private _cells = create(1, 1);
  private _indices = create(transportTableWidth, 1);
  private _revision = 0;

  /** Occluder segments, `(ax, ay, bx, by)` per texel. */
  public get segments(): DataTexture<TextureFormat.Rgba32F> {
    return this._segments;
  }

  /** Emitters, three texels each. */
  public get emitters(): DataTexture<TextureFormat.Rgba32F> {
    return this._emitters;
  }

  /** Per grid cell, where its ids begin and how many there are. */
  public get cells(): DataTexture<TextureFormat.Rgba32F> {
    return this._cells;
  }

  /** The ids those ranges point into, in the red channel. */
  public get indices(): DataTexture<TextureFormat.Rgba32F> {
    return this._indices;
  }

  /** Bumped whenever a table was replaced, which is what a held binding watches. */
  public get revision(): number {
    return this._revision;
  }

  /** The grid the walk is told about: where it starts, how large a cell is, and how many there are. */
  public get grid(): { readonly originX: number; readonly originY: number; readonly cellSize: number; readonly width: number; readonly height: number } {
    const built = this._geometry.tables;

    return { originX: built.originX, originY: built.originY, cellSize: built.cellSize, width: built.gridWidth, height: built.gridHeight };
  }

  /** Occluder segments and emitters written for this frame. */
  public get counts(): { readonly segments: number; readonly emitters: number } {
    const built = this._geometry.tables;

    return { segments: built.segmentCount, emitters: built.emitterCount };
  }

  /**
   * Rebuild the tables for this frame and upload them.
   *
   * Reports through {@link TransportCapacityError} where the scene holds more
   * geometry than the tables can address, rather than dropping any of it: a
   * dropped wall is light through a wall.
   */
  public build(segments: Float32Array, segmentCount: number, lights: readonly Light[], bounds: ReadonlyRectangle, cellSize: number): void {
    this._geometry.build(segments, segmentCount, lights, bounds, cellSize);

    const built = this._geometry.tables;

    this._segments = this._fit(this._segments, transportTableWidth, built.segmentRows, built.segments);
    this._emitters = this._fit(this._emitters, transportTableWidth, built.emitterRows, built.emitters);
    // Exactly the grid, which is not a capacity: a cell of it must be at the
    // index the walk computes, so this one is replaced whenever it changes.
    this._cells = this._fit(this._cells, built.gridWidth, built.gridHeight, built.cells, true);
    this._indices = this._fit(this._indices, transportTableWidth, built.indexRows, built.indices);
  }

  public destroy(): void {
    for (const texture of [this._segments, this._emitters, this._cells, this._indices]) {
      texture.destroy();
    }
  }

  private _fit(
    texture: DataTexture<TextureFormat.Rgba32F>,
    width: number,
    rows: number,
    source: Float32Array,
    exact = false,
  ): DataTexture<TextureFormat.Rgba32F> {
    const height = Math.max(1, rows);
    const grown = exact ? texture.width !== width || texture.height !== height : texture.width !== width || texture.height < height;
    let held = texture;

    if (grown) {
      texture.destroy();
      held = create(width, exact ? height : Math.max(height, texture.height * 2));
      this._revision++;
    }

    held.buffer.set(source.subarray(0, Math.min(source.length, held.buffer.length)));
    held.commit();

    return held;
  }
}
