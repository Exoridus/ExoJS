import type { ObjectPoint, TileMapObject } from './ObjectLayer';
import { ObjectKind } from './ObjectLayer';
import type { TileLayer } from './TileLayer';
import type { TileSet } from './TileSet';
import type { TileTransform } from './types';

/**
 * The geometry kinds a {@link TileCollisionShape} can carry. Tile (GID) and
 * text objects describe no collision area and are never emitted, so they are
 * excluded from the union.
 * @advanced
 */
export type TileCollisionShapeKind =
  | typeof ObjectKind.Rectangle
  | typeof ObjectKind.Ellipse
  | typeof ObjectKind.Polygon
  | typeof ObjectKind.Polyline
  | typeof ObjectKind.Point;

/**
 * A half-open tile-coordinate rectangle covering
 * `[x, x + width)` × `[y, y + height)`.
 *
 * Used to scope {@link buildTileCollisionGeometry} to part of a layer — a
 * streamed chunk, the tiles around the player, a hand-picked room — instead of
 * always rebuilding the whole map.
 * @advanced
 */
export interface TileRegion {
  /** Leftmost tile column (inclusive). */
  readonly x: number;
  /** Topmost tile row (inclusive). */
  readonly y: number;
  /** Width in tiles. */
  readonly width: number;
  /** Height in tiles. */
  readonly height: number;
}

/**
 * An axis-aligned collision rectangle in tile-layer pixel space (+Y down),
 * covering one or more whole tile cells.
 *
 * Rectangles are synthesized geometry, not source objects: a merged run has no
 * single originating object, so it carries no object `id`/`name`/`properties` —
 * only the `type` string shared by every shape merged into it. Anything that
 * does not exactly cover whole cells stays a {@link TileCollisionShape}, which
 * does keep its source object.
 * @advanced
 */
export interface TileCollisionRect {
  /** Left edge in layer pixel space. */
  readonly x: number;
  /** Top edge in layer pixel space. */
  readonly y: number;
  /** Width in pixels (a whole number of tile cells). */
  readonly width: number;
  /** Height in pixels (a whole number of tile cells). */
  readonly height: number;
  /** Class/type string shared by every source shape merged into this rectangle. */
  readonly type: string;
}

/**
 * A per-tile collision shape placed in tile-layer pixel space (+Y down).
 *
 * Emitted for every collision shape that does not exactly cover a whole tile
 * cell: partial boxes, ellipses, polygons, polylines, points, and rotated
 * geometry. Shapes are never merged with one another.
 * @advanced
 */
export interface TileCollisionShape {
  /** Geometry discriminant. */
  readonly kind: TileCollisionShapeKind;
  /** X of the shape origin in layer pixel space. */
  readonly x: number;
  /** Y of the shape origin in layer pixel space. */
  readonly y: number;
  /** Bounding width in px (`0` for polygons, polylines and points). */
  readonly width: number;
  /** Bounding height in px (`0` for polygons, polylines and points). */
  readonly height: number;
  /**
   * Rotation in degrees, clockwise, about `(x, y)`, normalised to `[0, 360)`.
   * Always `0` for polygons and polylines — their rotation is baked into
   * {@link points}.
   */
  readonly rotation: number;
  /** Polygon/polyline vertices relative to `(x, y)`; absent for other kinds. */
  readonly points?: readonly ObjectPoint[];
  /** Tile column the shape came from. */
  readonly tx: number;
  /** Tile row the shape came from. */
  readonly ty: number;
  /** The tile-local source object, for `name`/`type`/`properties` lookups. */
  readonly source: TileMapObject;
}

/**
 * Collision geometry extracted from a tile layer: whole-cell boxes merged into
 * as few {@link TileCollisionRect}s as a greedy pass can manage, plus every
 * other shape passed through individually.
 * @advanced
 */
export interface TileCollisionGeometry {
  /** Merged whole-cell rectangles, in row-major order. */
  readonly rects: readonly TileCollisionRect[];
  /** Non-whole-cell shapes, in the order their tiles were walked. */
  readonly shapes: readonly TileCollisionShape[];
}

/**
 * Options for {@link buildTileCollisionGeometry}.
 * @advanced
 */
export interface TileCollisionOptions {
  /**
   * Tile-coordinate region to walk. Defaults to the bounding box of the
   * layer's currently loaded chunks, so an unbounded (streamed) layer works
   * without the caller computing anything.
   */
  readonly region?: TileRegion;
  /**
   * Merge adjacent whole-cell boxes that share a `type` into larger
   * rectangles. Default `true`. With `false`, every whole-cell box becomes its
   * own single-cell rectangle.
   */
  readonly merge?: boolean;
  /**
   * Drop source shapes before any geometry is built (e.g. by a custom
   * property). Return `true` to keep a shape. Default keeps all of them.
   */
  readonly accept?: (object: TileMapObject, tx: number, ty: number) => boolean;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Normalise degrees into `[0, 360)`. */
function normaliseDegrees(degrees: number): number {
  const wrapped = degrees % 360;

  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Cosine of an angle in degrees, exact on the quadrant multiples.
 * `Math.cos(Math.PI / 2)` is `6.1e-17`, not `0`; tile transforms produce those
 * quadrant angles constantly, and the whole-cell test below compares
 * coordinates exactly, so the noise has to stay out of the arithmetic.
 */
function cosDegrees(degrees: number): number {
  const angle = normaliseDegrees(degrees);

  if (angle === 0) return 1;
  if (angle === 90 || angle === 270) return 0;
  if (angle === 180) return -1;

  return Math.cos(angle * DEGREES_TO_RADIANS);
}

/** Sine of an angle in degrees, exact on the quadrant multiples. */
function sinDegrees(degrees: number): number {
  const angle = normaliseDegrees(degrees);

  if (angle === 0 || angle === 180) return 0;
  if (angle === 90) return 1;
  if (angle === 270) return -1;

  return Math.sin(angle * DEGREES_TO_RADIANS);
}

/** `true` when the transform mirrors (an odd number of reflections). */
function isMirrored(transform: TileTransform): boolean {
  const flags = (transform.flipX ? 1 : 0) + (transform.flipY ? 1 : 0) + (transform.diagonal ? 1 : 0);

  return flags % 2 === 1;
}

/**
 * Rotation in degrees contributed by a non-mirroring transform. Only the four
 * even-parity transforms are rotations: identity, `flipX+flipY` (180°),
 * `diagonal+flipX` (90°) and `diagonal+flipY` (270°).
 */
function transformRotation(transform: TileTransform): number {
  if (transform.diagonal) {
    return transform.flipX ? 90 : 270;
  }

  return transform.flipX ? 180 : 0;
}

/**
 * Map a point from tile-local pixel space into the transformed tile-local
 * space of a placed tile. The diagonal flip (a transpose of the axes, which
 * also swaps the box dimensions) is applied first, then the axis mirrors —
 * the same order the renderer's orientation code implies.
 */
function mapLocalPoint(
  px: number,
  py: number,
  boxWidth: number,
  boxHeight: number,
  transform: TileTransform,
): ObjectPoint {
  let x = px;
  let y = py;
  let width = boxWidth;
  let height = boxHeight;

  if (transform.diagonal) {
    const swapped = x;

    x = y;
    y = swapped;
    width = boxHeight;
    height = boxWidth;
  }

  if (transform.flipX) x = width - x;
  if (transform.flipY) y = height - y;

  return { x, y };
}

/**
 * Layer-space position of a placed tile's top-left image corner. Mirrors the
 * renderer's placement (see `chunkGeometry`): the tileset's draw offset shifts
 * every tile, and a tile taller than the layer's cell is bottom-aligned within
 * it, so collision geometry lands exactly where the tile is drawn.
 */
function tileAnchor(layer: TileLayer, tileset: TileSet, tx: number, ty: number): ObjectPoint {
  return {
    x: tx * layer.tileWidth + layer.offsetX + tileset.offsetX,
    y: ty * layer.tileHeight + layer.offsetY + layer.tileHeight - tileset.tileHeight + tileset.offsetY,
  };
}

/** A shape in layer pixel space, before it is classified as cell or shape. */
interface PlacedShape {
  readonly kind: TileCollisionShapeKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly points?: readonly ObjectPoint[];
}

/**
 * Place one tile-local collision object into layer pixel space, applying the
 * tile's flip/rotation transform, the tileset draw offset and the layer offset.
 * Returns `null` for kinds that carry no collision geometry.
 */
function placeShape(
  object: TileMapObject,
  layer: TileLayer,
  tileset: TileSet,
  transform: TileTransform,
  tx: number,
  ty: number,
): PlacedShape | null {
  if (object.kind === ObjectKind.Tile || object.kind === ObjectKind.Text) {
    return null;
  }

  const anchor = tileAnchor(layer, tileset, tx, ty);
  const boxWidth = tileset.tileWidth;
  const boxHeight = tileset.tileHeight;
  const mirrored = isMirrored(transform);
  const sourceCos = cosDegrees(object.rotation);
  const sourceSin = sinDegrees(object.rotation);

  if (object.kind === ObjectKind.Polygon || object.kind === ObjectKind.Polyline) {
    // Rotation is baked into the vertices: the source rotation pivots about the
    // object origin, and the tile transform may mirror the whole tile, so an
    // origin-plus-angle form would need a second angle convention. Absolute
    // vertices are exact under both.
    const origin = mapLocalPoint(object.x, object.y, boxWidth, boxHeight, transform);
    const originX = anchor.x + origin.x;
    const originY = anchor.y + origin.y;
    const points = object.points.map(point => {
      const localX = object.x + (sourceCos * point.x - sourceSin * point.y);
      const localY = object.y + (sourceSin * point.x + sourceCos * point.y);
      const mapped = mapLocalPoint(localX, localY, boxWidth, boxHeight, transform);

      return { x: anchor.x + mapped.x - originX, y: anchor.y + mapped.y - originY };
    });

    return {
      kind: object.kind,
      x: originX,
      y: originY,
      width: 0,
      height: 0,
      rotation: 0,
      // A mirror reverses the winding order; reversing the vertices restores
      // the source orientation, which convex-hull/polygon consumers rely on.
      points: mirrored ? points.reverse() : points,
    };
  }

  if (object.kind === ObjectKind.Point) {
    const mapped = mapLocalPoint(object.x, object.y, boxWidth, boxHeight, transform);

    return {
      kind: ObjectKind.Point,
      x: anchor.x + mapped.x,
      y: anchor.y + mapped.y,
      width: 0,
      height: 0,
      rotation: 0,
    };
  }

  // Rectangles and ellipses are symmetric about their centre, so placing the
  // centre and re-deriving the origin handles every transform uniformly.
  const halfWidth = object.width / 2;
  const halfHeight = object.height / 2;
  const centreLocalX = object.x + (sourceCos * halfWidth - sourceSin * halfHeight);
  const centreLocalY = object.y + (sourceSin * halfWidth + sourceCos * halfHeight);
  const centre = mapLocalPoint(centreLocalX, centreLocalY, boxWidth, boxHeight, transform);
  const centreX = anchor.x + centre.x;
  const centreY = anchor.y + centre.y;

  // Conjugating a rotation by a mirror negates it; a non-mirroring transform is
  // itself a rotation and simply adds. Only a mirror can swap the local axes,
  // and then only when the diagonal flip is part of it.
  const rotation = normaliseDegrees(mirrored ? -object.rotation : object.rotation + transformRotation(transform));
  const swapAxes = mirrored && transform.diagonal;
  const width = swapAxes ? object.height : object.width;
  const height = swapAxes ? object.width : object.height;

  if (rotation % 90 === 0) {
    // Quadrant-aligned geometry is axis-aligned; re-express it without a
    // rotation so whole-cell boxes on rotated tiles stay mergeable.
    const axisWidth = rotation % 180 === 0 ? width : height;
    const axisHeight = rotation % 180 === 0 ? height : width;

    return {
      kind: object.kind,
      x: centreX - axisWidth / 2,
      y: centreY - axisHeight / 2,
      width: axisWidth,
      height: axisHeight,
      rotation: 0,
    };
  }

  const cos = cosDegrees(rotation);
  const sin = sinDegrees(rotation);

  return {
    kind: object.kind,
    x: centreX - (cos * (width / 2) - sin * (height / 2)),
    y: centreY - (sin * (width / 2) + cos * (height / 2)),
    width,
    height,
    rotation,
  };
}

/** The tile-coordinate bounding box of the layer's loaded chunks, or `null`. */
function loadedTileRegion(layer: TileLayer): TileRegion | null {
  let minTx = Number.POSITIVE_INFINITY;
  let minTy = Number.POSITIVE_INFINITY;
  let maxTx = Number.NEGATIVE_INFINITY;
  let maxTy = Number.NEGATIVE_INFINITY;

  for (const chunk of layer.loadedChunks()) {
    const startTx = chunk.cx * layer.chunkWidth;
    const startTy = chunk.cy * layer.chunkHeight;

    minTx = Math.min(minTx, startTx);
    minTy = Math.min(minTy, startTy);
    maxTx = Math.max(maxTx, startTx + chunk.width - 1);
    maxTy = Math.max(maxTy, startTy + chunk.height - 1);
  }

  if (!Number.isFinite(minTx) || !Number.isFinite(minTy)) {
    return null;
  }

  return { x: minTx, y: minTy, width: maxTx - minTx + 1, height: maxTy - minTy + 1 };
}

/** Key of a claimed cell in the occupancy grid. */
function cellKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

/**
 * `true` when a placed shape is an axis-aligned rectangle covering exactly the
 * tile cell at `(cellX, cellY)` — the only geometry the merging pass handles.
 */
function coversWholeCell(placed: PlacedShape, layer: TileLayer, cellX: number, cellY: number): boolean {
  return (
    placed.kind === ObjectKind.Rectangle &&
    placed.rotation === 0 &&
    placed.x === cellX &&
    placed.y === cellY &&
    placed.width === layer.tileWidth &&
    placed.height === layer.tileHeight
  );
}

/** One single-cell rectangle per claimed cell, for `merge: false`. */
function unmergedCells(cells: ReadonlyMap<string, string>, layer: TileLayer): TileCollisionRect[] {
  const rects: TileCollisionRect[] = [];

  for (const [key, type] of cells) {
    const [tx, ty] = key.split(',').map(Number) as [number, number];

    rects.push({
      x: tx * layer.tileWidth + layer.offsetX,
      y: ty * layer.tileHeight + layer.offsetY,
      width: layer.tileWidth,
      height: layer.tileHeight,
      type,
    });
  }

  return rects;
}

/**
 * Greedy rectangle merging over the claimed cells: walk row-major, grow each
 * unconsumed cell as far right as the type key allows, then as far down as a
 * full row of that width allows, and consume the block. Deliberately the plain
 * textbook pass — it is linear in the number of cells and always produces a
 * valid, non-overlapping cover, which matters more here than minimality.
 */
function mergeCells(
  cells: ReadonlyMap<string, string>,
  region: TileRegion,
  layer: TileLayer,
): TileCollisionRect[] {
  const consumed = new Set<string>();
  const rects: TileCollisionRect[] = [];
  const endTx = region.x + region.width;
  const endTy = region.y + region.height;

  for (let ty = region.y; ty < endTy; ty++) {
    for (let tx = region.x; tx < endTx; tx++) {
      const key = cells.get(cellKey(tx, ty));

      if (key === undefined || consumed.has(cellKey(tx, ty))) {
        continue;
      }

      let width = 1;

      while (
        tx + width < endTx &&
        cells.get(cellKey(tx + width, ty)) === key &&
        !consumed.has(cellKey(tx + width, ty))
      ) {
        width++;
      }

      let height = 1;

      growDown: while (ty + height < endTy) {
        for (let column = 0; column < width; column++) {
          const candidate = cellKey(tx + column, ty + height);

          if (cells.get(candidate) !== key || consumed.has(candidate)) {
            break growDown;
          }
        }

        height++;
      }

      for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
          consumed.add(cellKey(tx + column, ty + row));
        }
      }

      rects.push({
        x: tx * layer.tileWidth + layer.offsetX,
        y: ty * layer.tileHeight + layer.offsetY,
        width: width * layer.tileWidth,
        height: height * layer.tileHeight,
        type: key,
      });
    }
  }

  return rects;
}

/**
 * Extract collision geometry from a tile layer's per-tile
 * {@link import('./types').TileDefinition.collision} shapes.
 *
 * Every placed tile in `region` is resolved back to its tileset definition, and
 * each collision shape is transformed from tile-local pixel space into layer
 * pixel space (+Y down) — applying the tile's flip/rotation transform, the
 * tileset draw offset, and the layer's pixel offset, so the geometry lands
 * exactly where the tile is drawn.
 *
 * Shapes that end up covering exactly one whole tile cell are collected into an
 * occupancy grid and merged into as few {@link TileCollisionRect}s as a greedy
 * pass manages — a 200×200 solid region becomes one rectangle instead of 40 000.
 * Cells only merge with neighbours whose source object carries the same `type`
 * string, so a `water` run never fuses into an adjacent `solid` run. Everything
 * else (partial boxes, ellipses, polygons, polylines, points, rotated geometry)
 * passes through individually as a {@link TileCollisionShape}.
 *
 * This package has no physics dependency and builds no bodies: the result is
 * plain geometry. Turning it into colliders is a short loop in application code.
 *
 * @param layer - The layer to walk.
 * @param options - Region scoping, merge toggle, and a source-shape filter.
 * @returns Merged rectangles plus pass-through shapes; both empty when the
 *          region holds no tile carrying collision data.
 *
 * @example
 * ```ts
 * const { rects, shapes } = buildTileCollisionGeometry(layer);
 *
 * for (const rect of rects) {
 *   world.add(makeStaticBox(rect.x, rect.y, rect.width, rect.height));
 * }
 * ```
 * @advanced
 */
export function buildTileCollisionGeometry(
  layer: TileLayer,
  options: TileCollisionOptions = {},
): TileCollisionGeometry {
  const region = options.region ?? loadedTileRegion(layer);

  if (region === null || region.width <= 0 || region.height <= 0) {
    return { rects: [], shapes: [] };
  }

  const accept = options.accept;
  const cells = new Map<string, string>();
  const shapes: TileCollisionShape[] = [];

  for (const { tx, ty, tile } of layer.tilesInRect(region.x, region.y, region.width, region.height)) {
    const definition = tile.tileset.getTileDefinition(tile.localTileId);

    if (definition?.collision === undefined) {
      continue;
    }

    const cellX = tx * layer.tileWidth + layer.offsetX;
    const cellY = ty * layer.tileHeight + layer.offsetY;

    for (const object of definition.collision) {
      if (accept !== undefined && !accept(object, tx, ty)) {
        continue;
      }

      const placed = placeShape(object, layer, tile.tileset, tile.transform, tx, ty);

      if (placed === null) {
        continue;
      }

      const key = cellKey(tx, ty);

      // A second whole-cell box on the same tile cannot claim the cell twice;
      // it falls through to the shape list so no geometry is silently dropped.
      if (coversWholeCell(placed, layer, cellX, cellY) && !cells.has(key)) {
        cells.set(key, object.type);
        continue;
      }

      shapes.push({
        kind: placed.kind,
        x: placed.x,
        y: placed.y,
        width: placed.width,
        height: placed.height,
        rotation: placed.rotation,
        ...(placed.points !== undefined && { points: placed.points }),
        tx,
        ty,
        source: object,
      });
    }
  }

  if (cells.size === 0) {
    return { rects: [], shapes };
  }

  const rects = options.merge === false ? unmergedCells(cells, layer) : mergeCells(cells, region, layer);

  return { rects, shapes };
}
