import { logger, type PointLike } from '@codexo/exojs';
import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CircleShape,
  type ColliderOptions,
  toConvexPolygonShapes,
} from '@codexo/exojs-physics';
import {
  ObjectKind,
  type TileCollisionGeometry,
  type TileCollisionRect,
  type TileCollisionShape,
  type TileMapObject,
} from '@codexo/exojs-tilemap';

import { materialKey, type ResolvedMaterial,resolveMaterial } from './material';
import { traceCellOutlines } from './outline';
import type { TileColliderMaterialResolver, TileRegionMode } from './types';

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Shortest capsule spine `CapsuleShape` accepts; below it, the shape is a circle. */
const MINIMUM_SPINE = 1e-3;

const LOG_SOURCE = 'tilemap-physics';

/** Placement of one piece of geometry in the owning body's local space. */
export interface ColliderPlacement {
  readonly x: number;
  readonly y: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly layerOffsetX: number;
  readonly layerOffsetY: number;
}

/** Everything a build needs beyond the geometry itself. */
export interface ColliderBuildOptions extends ColliderPlacement {
  readonly regionMode: TileRegionMode;
  readonly defaults: ResolvedMaterial;
  readonly material: TileColliderMaterialResolver | undefined;
}

const applyMaterial = (material: ResolvedMaterial): Omit<ColliderOptions, 'shape'> => ({
  friction: material.friction,
  restitution: material.restitution,
  density: material.density,
  isSensor: material.isSensor,
  filter: material.filter,
});

/** Centre of an axis-aligned box rotated about its own top-left origin. */
const rotatedCentre = (
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
): PointLike => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: x + (cos * (width / 2) - sin * (height / 2)),
    y: y + (sin * (width / 2) + cos * (height / 2)),
  };
};

/**
 * The tightest conservative cover of an ellipse the shape set offers: a capsule
 * whose radius is the minor semi-axis and whose spine runs the difference of the
 * semi-axes along the major axis. Every ellipse point is within the minor
 * semi-axis of that spine, and the capsule is itself inside the circumscribed
 * circle, so it covers the ellipse and is never worse than the circle. A round
 * ellipse degenerates to that circle.
 */
const ellipseShape = (width: number, height: number): BoxShape | CapsuleShape | CircleShape | null => {
  const semiMajor = Math.max(width, height) / 2;
  const semiMinor = Math.min(width, height) / 2;

  if (semiMinor <= 0) {
    return null;
  }

  const spine = 2 * (semiMajor - semiMinor);

  if (spine < MINIMUM_SPINE) {
    return new CircleShape(semiMinor);
  }

  return width >= height
    ? new CapsuleShape(-spine / 2, 0, spine / 2, 0, semiMinor)
    : new CapsuleShape(0, -spine / 2, 0, spine / 2, semiMinor);
};

/** `true` when a polyline's endpoints coincide, i.e. the author drew a loop. */
const isClosedRun = (points: readonly PointLike[]): boolean => {
  const first = points.at(0);
  const last = points.at(-1);

  return points.length > 2 && first !== undefined && first.x === last?.x && first.y === last.y;
};

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The fields an object-layer object and a per-tile collision shape share -
 * enough to pick a shape. Both are structurally assignable to it.
 */
export interface CollisionGeometry {
  readonly kind: ObjectKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly points?: readonly PointLike[];
}

/**
 * Map one piece of collision geometry to the colliders that represent it, in
 * the owning body's local space.
 *
 * A concave polygon becomes several convex colliders on the same body; a
 * polygon the decomposition rejects is skipped with a warning rather than
 * failing the whole build, because level geometry is content, not code.
 */
export const collidersForGeometry = (
  geometry: CollisionGeometry,
  material: ResolvedMaterial,
  originX: number,
  originY: number,
  label: string,
): ColliderOptions[] => {
  const rotation = geometry.rotation * DEGREES_TO_RADIANS;
  const settings = applyMaterial(material);

  switch (geometry.kind) {
    case ObjectKind.Rectangle: {
      if (geometry.width <= 0 || geometry.height <= 0) {
        return [];
      }

      const centre = rotatedCentre(geometry.x, geometry.y, geometry.width, geometry.height, rotation);

      return [
        {
          shape: new BoxShape(geometry.width, geometry.height),
          offset: { x: centre.x - originX, y: centre.y - originY },
          rotation,
          ...settings,
        },
      ];
    }

    case ObjectKind.Ellipse: {
      const shape = ellipseShape(geometry.width, geometry.height);

      if (shape === null) {
        return [];
      }

      const centre = rotatedCentre(geometry.x, geometry.y, geometry.width, geometry.height, rotation);

      return [{ shape, offset: { x: centre.x - originX, y: centre.y - originY }, rotation, ...settings }];
    }

    case ObjectKind.Polygon: {
      const points = geometry.points ?? [];

      if (points.length < 3) {
        return [];
      }

      const offset = { x: geometry.x - originX, y: geometry.y - originY };

      try {
        return toConvexPolygonShapes(points).map(shape => ({ shape, offset, rotation, ...settings }));
      } catch (error) {
        logger.warn(`Skipped polygon "${label}": ${describe(error)}`, { source: LOG_SOURCE });

        return [];
      }
    }

    case ObjectKind.Polyline: {
      const points = geometry.points ?? [];
      const closed = isClosedRun(points);
      const run = closed ? points.slice(0, -1) : points;

      if (run.length < 2) {
        return [];
      }

      const offset = { x: geometry.x - originX, y: geometry.y - originY };

      try {
        return [{ shape: new ChainShape(run, { closed }), offset, rotation, ...settings }];
      } catch (error) {
        logger.warn(`Skipped polyline "${label}": ${describe(error)}`, { source: LOG_SOURCE });

        return [];
      }
    }

    case ObjectKind.Point:
    case ObjectKind.Tile:
    case ObjectKind.Text:
    default:
      // Points carry no area and no boundary; tile and text objects never reach
      // here - the geometry extraction excludes them.
      return [];
  }
};

/** Tile column/row of a merged rectangle's top-left cell. */
const rectCell = (rect: TileCollisionRect, options: ColliderPlacement): { tx: number; ty: number } => ({
  tx: Math.round((rect.x - options.layerOffsetX) / options.tileWidth),
  ty: Math.round((rect.y - options.layerOffsetY) / options.tileHeight),
});

const boxForRect = (
  rect: TileCollisionRect,
  material: ResolvedMaterial,
  originX: number,
  originY: number,
): ColliderOptions => ({
  shape: new BoxShape(rect.width, rect.height),
  offset: { x: rect.x + rect.width / 2 - originX, y: rect.y + rect.height / 2 - originY },
  ...applyMaterial(material),
});

/** A merged rectangle together with the material its colliders resolve to. */
interface ResolvedRect {
  readonly rect: TileCollisionRect;
  readonly material: ResolvedMaterial;
}

/**
 * Chains for every merged rectangle, grouped by resolved collider semantics:
 * cells whose colliders would be indistinguishable are traced into one
 * boundary, and cells that resolve differently keep their own.
 */
const chainsForRects = (
  regions: readonly ResolvedRect[],
  options: ColliderBuildOptions,
  originX: number,
  originY: number,
): ColliderOptions[] => {
  const groups = new Map<string, { material: ResolvedMaterial; cells: number[] }>();

  for (const { rect, material } of regions) {
    const groupKey = materialKey(material);
    let group = groups.get(groupKey);

    if (group === undefined) {
      group = { material, cells: [] };
      groups.set(groupKey, group);
    }

    const { tx, ty } = rectCell(rect, options);
    const columns = Math.round(rect.width / options.tileWidth);
    const rows = Math.round(rect.height / options.tileHeight);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        group.cells.push(tx + column, ty + row);
      }
    }
  }

  const colliders: ColliderOptions[] = [];

  for (const group of groups.values()) {
    const settings = applyMaterial(group.material);

    for (const loop of traceCellOutlines(group.cells)) {
      const vertices = loop.map(vertex => ({
        x: vertex.x * options.tileWidth + options.layerOffsetX - originX,
        y: vertex.y * options.tileHeight + options.layerOffsetY - originY,
      }));

      colliders.push({ shape: new ChainShape(vertices, { closed: true }), ...settings });
    }
  }

  return colliders;
};

const shapeLabel = (shape: TileCollisionShape): string =>
  shape.source.name || `tile ${shape.tx},${shape.ty}`;

const objectLabel = (object: TileMapObject): string => object.name || String(object.id);

export { objectLabel };

/**
 * Turn extracted tile-collision geometry into the colliders of a single body
 * placed at `(options.x, options.y)` in layer pixel space.
 *
 * Order is contractual: merged regions first in the order the extraction emits
 * them, then per-tile shapes in tile walk order.
 */
export const buildTileColliders = (
  geometry: TileCollisionGeometry,
  options: ColliderBuildOptions,
): ColliderOptions[] => {
  const originX = options.x;
  const originY = options.y;
  const regions: ResolvedRect[] = geometry.rects.map(rect => {
    const { tx, ty } = rectCell(rect, options);

    return {
      rect,
      material: resolveMaterial(options.defaults, options.material, { type: rect.type, object: null, tx, ty }),
    };
  });

  const colliders: ColliderOptions[] =
    options.regionMode === 'outline'
      ? chainsForRects(regions, options, originX, originY)
      : regions.map(({ rect, material }) => boxForRect(rect, material, originX, originY));

  for (const shape of geometry.shapes) {
    const material = resolveMaterial(options.defaults, options.material, {
      type: shape.source.type,
      object: shape.source,
      tx: shape.tx,
      ty: shape.ty,
    });

    colliders.push(...collidersForGeometry(shape, material, originX, originY, shapeLabel(shape)));
  }

  return colliders;
};
