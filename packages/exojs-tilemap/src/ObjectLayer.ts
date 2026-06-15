import type { ResolvedTile, TileProperties, TilePropertyValue } from './types';

/** Geometry discriminant for a {@link TileMapObject}. */
export type TileMapObjectKind = 'rectangle' | 'ellipse' | 'polygon' | 'polyline' | 'point' | 'tile';

/** A point in object-layer space (pixels, relative to the object). */
export interface ObjectPoint {
  readonly x: number;
  readonly y: number;
}

/** Fields shared by every {@link TileMapObject} kind. */
interface TileMapObjectBase {
  /** Source-unique object id. */
  readonly id: number;
  /** Object name (may be empty; not unique). */
  readonly name: string;
  /** Object class/type string (Tiled `type`/`class`; may be empty). */
  readonly type: string;
  /** X of the object origin in object-layer pixel space. */
  readonly x: number;
  /** Y of the object origin in object-layer pixel space. */
  readonly y: number;
  /** Bounding width in px (0 for points). */
  readonly width: number;
  /** Bounding height in px (0 for points). */
  readonly height: number;
  /** Rotation in degrees, clockwise, about the object origin. */
  readonly rotation: number;
  /** Whether the object is marked visible. */
  readonly visible: boolean;
  /** Immutable custom properties. */
  readonly properties: TileProperties;
}

/** An axis-aligned rectangle object spanning `[x, y, width, height]`. */
export interface RectangleObject extends TileMapObjectBase {
  readonly kind: 'rectangle';
}

/** An ellipse inscribed in `[x, y, width, height]`. */
export interface EllipseObject extends TileMapObjectBase {
  readonly kind: 'ellipse';
}

/** A single point at `(x, y)`. */
export interface PointObject extends TileMapObjectBase {
  readonly kind: 'point';
}

/** A closed polygon; `points` are relative to the object origin. */
export interface PolygonObject extends TileMapObjectBase {
  readonly kind: 'polygon';
  readonly points: readonly ObjectPoint[];
}

/** An open polyline; `points` are relative to the object origin. */
export interface PolylineObject extends TileMapObjectBase {
  readonly kind: 'polyline';
  readonly points: readonly ObjectPoint[];
}

/** A tile (GID) object carrying a resolved tile reference. */
export interface TileObject extends TileMapObjectBase {
  readonly kind: 'tile';
  readonly tile: ResolvedTile;
}

/**
 * A format-independent map object. The geometry kind is the discriminant;
 * narrow on `kind` to read shape-specific fields. Text objects and templates
 * are intentionally not represented (data-only release).
 * @advanced
 */
export type TileMapObject = RectangleObject | EllipseObject | PointObject | PolygonObject | PolylineObject | TileObject;

/** Filter for {@link ObjectLayer.query}. Unspecified fields match everything. */
export interface ObjectQuery {
  /** Match objects whose `name` equals this. */
  readonly name?: string;
  /** Match objects whose `type`/class equals this. */
  readonly type?: string;
  /** Match objects of this geometry kind. */
  readonly kind?: TileMapObjectKind;
  /** Match objects that carry this property key. */
  readonly property?: string;
  /** When combined with `property`, also require the property value to equal this. */
  readonly value?: TilePropertyValue;
}

/** Construction options for an {@link ObjectLayer}. */
export interface ObjectLayerOptions {
  /** Layer id (unique within the map). */
  readonly id: number;
  /** Layer name. */
  readonly name?: string;
  /** Layer class string. */
  readonly class?: string;
  /** Whether the layer is visible. Default `true`. */
  readonly visible?: boolean;
  /** Layer opacity in `[0, 1]`. Default `1`. */
  readonly opacity?: number;
  /** Layer pixel offset X. Default `0`. */
  readonly offsetX?: number;
  /** Layer pixel offset Y. Default `0`. */
  readonly offsetY?: number;
  /** The objects in this layer. */
  readonly objects?: readonly TileMapObject[];
  /** Layer-level properties (copied and frozen). */
  readonly properties?: TileProperties;
}

/**
 * A data-only layer of {@link TileMapObject}s — spawn points, trigger zones,
 * collision regions, markers. Object layers are not rendered by the tile
 * renderer; they are parsed and exposed for gameplay use (e.g. building physics
 * colliders, placing entities). Query with {@link query}.
 *
 * @advanced
 */
export class ObjectLayer {
  /** Layer-kind discriminant (distinguishes object layers from tile layers). */
  public readonly kind = 'object' as const;

  /** Layer id (unique within the map). */
  public readonly id: number;
  /** Layer name. */
  public readonly name: string;
  /** Layer class string. */
  public readonly class: string;
  /** Whether the layer is visible. */
  public readonly visible: boolean;
  /** Layer opacity in `[0, 1]`. */
  public readonly opacity: number;
  /** Layer pixel offset X. */
  public readonly offsetX: number;
  /** Layer pixel offset Y. */
  public readonly offsetY: number;
  /** Immutable layer-level properties. */
  public readonly properties: TileProperties;
  /** The objects in this layer (insertion order). */
  public readonly objects: readonly TileMapObject[];

  public constructor(options: ObjectLayerOptions) {
    this.id = options.id;
    this.name = options.name ?? '';
    this.class = options.class ?? '';
    this.visible = options.visible ?? true;
    this.opacity = options.opacity ?? 1;
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;
    this.properties = options.properties ? Object.freeze({ ...options.properties }) : Object.freeze({});
    this.objects = options.objects ? Object.freeze([...options.objects]) : Object.freeze([]);
  }

  /** Objects matching every specified criterion of `filter`. Returns a fresh array. */
  public query(filter: ObjectQuery = {}): TileMapObject[] {
    return this.objects.filter(object => {
      if (filter.name !== undefined && object.name !== filter.name) {
        return false;
      }

      if (filter.type !== undefined && object.type !== filter.type) {
        return false;
      }

      if (filter.kind !== undefined && object.kind !== filter.kind) {
        return false;
      }

      if (filter.property !== undefined) {
        if (!(filter.property in object.properties)) {
          return false;
        }

        if (filter.value !== undefined && object.properties[filter.property] !== filter.value) {
          return false;
        }
      }

      return true;
    });
  }

  /** First object with the given id, or undefined. */
  public getObjectById(id: number): TileMapObject | undefined {
    return this.objects.find(object => object.id === id);
  }

  /** First object with the given name, or undefined. */
  public getObjectByName(name: string): TileMapObject | undefined {
    return this.objects.find(object => object.name === name);
  }
}
