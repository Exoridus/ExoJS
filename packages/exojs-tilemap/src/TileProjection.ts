import type { TileMapObject } from './ObjectLayer';
import { projectObject } from './projectObject';
import { validatePositiveInteger } from './types';

/** Immutable grid geometry shared by a map and its independently usable layers. */
export interface TileProjectionOptions {
  /** Orthogonal is the default. Isometric cells are diamonds with the given pixel dimensions. */
  readonly orientation?: 'orthogonal' | 'isometric';
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** Display position of grid vertex (0, 0). Defaults to zero. */
  readonly originX?: number;
  readonly originY?: number;
}

/**
 * Converts between grid vertices, display pixels and unprojected logical pixels.
 * Isometric logical cells are squares of side `tileHeight`; orthogonal logical
 * coordinates are display coordinates before the origin translation.
 */
export class TileProjection {
  public readonly orientation: 'orthogonal' | 'isometric';
  public readonly tileWidth: number;
  public readonly tileHeight: number;
  public readonly originX: number;
  public readonly originY: number;

  public constructor(options: TileProjectionOptions) {
    validatePositiveInteger(options.tileWidth, 'projection.tileWidth');
    validatePositiveInteger(options.tileHeight, 'projection.tileHeight');
    this.orientation = options.orientation ?? 'orthogonal';
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.originX = options.originX ?? 0;
    this.originY = options.originY ?? 0;
    if (!Number.isFinite(this.originX) || !Number.isFinite(this.originY)) {
      throw new Error('TileProjection origin must be finite.');
    }
  }

  /** Width of a cell in the unprojected simulation space. */
  public get logicalTileWidth(): number {
    return this.orientation === 'isometric' ? this.tileHeight : this.tileWidth;
  }

  public get logicalTileHeight(): number {
    return this.tileHeight;
  }

  /** Maps a grid vertex, including fractional coordinates, to display pixels. */
  public tileToPixel(tx: number, ty: number): { x: number; y: number } {
    return this.orientation === 'isometric'
      ? { x: this.originX + ((tx - ty) * this.tileWidth) / 2, y: this.originY + ((tx + ty) * this.tileHeight) / 2 }
      : { x: this.originX + tx * this.tileWidth, y: this.originY + ty * this.tileHeight };
  }

  /** Picks the half-open cell containing a display point; negative cells are valid. */
  public pixelToTile(x: number, y: number): { tx: number; ty: number } {
    const logical = this.pixelToLogical(x, y);
    return { tx: Math.floor(logical.x / this.logicalTileWidth), ty: Math.floor(logical.y / this.logicalTileHeight) };
  }

  /** Projects a logical position; layer offsets and scene transforms are separate. */
  public logicalToPixel(x: number, y: number): { x: number; y: number } {
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

  /** Display AABB of a cell region, excluding artwork overhang and layer offsets. */
  public getBounds(tx: number, ty: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
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
    if (this.orientation === 'orthogonal') {
      return object.kind === 'tile'
        ? projectObject(object, 1, 0, 0, 1, this.originX, this.originY)
        : { ...object, x: object.x + this.originX, y: object.y + this.originY };
    }
    const ratio = this.tileWidth / (2 * this.tileHeight);
    return projectObject(object, ratio, 0.5, -ratio, 0.5, this.originX, this.originY);
  }

  /** Inverts object geometry into logical space; affine ellipses remain exact. */
  public unprojectObject(object: TileMapObject): TileMapObject {
    if (this.orientation === 'orthogonal') {
      return object.kind === 'tile'
        ? projectObject(object, 1, 0, 0, 1, -this.originX, -this.originY)
        : { ...object, x: object.x - this.originX, y: object.y - this.originY };
    }
    const ratio = this.tileHeight / this.tileWidth;
    return projectObject(object, ratio, -ratio, 1, 1, -this.originY - this.originX * ratio, -this.originY + this.originX * ratio);
  }
}
