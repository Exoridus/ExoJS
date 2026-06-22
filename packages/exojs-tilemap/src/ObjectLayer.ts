import type { ResolvedTile, TileProperties, TilePropertyValue } from './types';

/**
 * Geometry kinds for a {@link TileMapObject}, as an `as const` value object.
 *
 * Modelled as a frozen string map (not a TS `enum`) so the values stay
 * wire-compatible with the Tiled string serialisation, survive
 * `verbatimModuleSyntax` (no emitted runtime helper), and follow the package
 * convention for enum-like constants. Use the members for ergonomic, typo-safe
 * call sites: `layer.byKind(ObjectKind.Polygon)`.
 * @stable
 */
export const ObjectKind = {
  Rectangle: 'rectangle',
  Ellipse: 'ellipse',
  Polygon: 'polygon',
  Polyline: 'polyline',
  Point: 'point',
  Tile: 'tile',
} as const;

/** Geometry discriminant for a {@link TileMapObject}. */
export type ObjectKind = (typeof ObjectKind)[keyof typeof ObjectKind];

/**
 * Geometry discriminant for a {@link TileMapObject}.
 * Structural alias of {@link ObjectKind}; retained so existing code keeps
 * compiling. New code may prefer {@link ObjectKind}.
 */
export type TileMapObjectKind = ObjectKind;

/** A point in object-layer space (pixels, relative to the object). */
export interface ObjectPoint {
  readonly x: number;
  readonly y: number;
}

/** Fields shared by every {@link TileMapObject} kind. */
interface TileMapObjectBase<P extends TileProperties = TileProperties> {
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
  readonly properties: P;
}

/** An axis-aligned rectangle object spanning `[x, y, width, height]`. */
export interface RectangleObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Rectangle;
}

/** An ellipse inscribed in `[x, y, width, height]`. */
export interface EllipseObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Ellipse;
}

/** A single point at `(x, y)`. */
export interface PointObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Point;
}

/** A closed polygon; `points` are relative to the object origin. */
export interface PolygonObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Polygon;
  readonly points: readonly ObjectPoint[];
}

/** An open polyline; `points` are relative to the object origin. */
export interface PolylineObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Polyline;
  readonly points: readonly ObjectPoint[];
}

/** A tile (GID) object carrying a resolved tile reference. */
export interface TileObject<P extends TileProperties = TileProperties> extends TileMapObjectBase<P> {
  readonly kind: typeof ObjectKind.Tile;
  readonly tile: ResolvedTile;
}

/**
 * A format-independent map object. The geometry kind is the discriminant;
 * narrow on `kind` to read shape-specific fields. Text objects and templates
 * are intentionally not represented (data-only release).
 *
 * The optional property-shape parameter `P` lets typed accessors
 * (see {@link ObjectLayer.byType}) narrow `properties` to a developer-declared
 * schema. It defaults to the generic {@link TileProperties} bag, so the plain
 * `TileMapObject` form is unchanged.
 * @advanced
 */
export type TileMapObject<P extends TileProperties = TileProperties> =
  | RectangleObject<P>
  | EllipseObject<P>
  | PointObject<P>
  | PolygonObject<P>
  | PolylineObject<P>
  | TileObject<P>;

/**
 * A developer-declared mapping from object `type`/class strings to the property
 * shape an object of that type is expected to carry. Supplied as the type
 * parameter to {@link ObjectLayer} to unlock the typed accessors
 * ({@link ObjectLayer.byType}, {@link ObjectLayer.where}).
 *
 * @remarks
 * A schema is a **developer promise, not a runtime guarantee.** Tiled data is
 * untyped at runtime and ExoJS performs no validation against the schema —
 * the property objects are returned exactly as parsed. The schema only refines
 * the static type of `properties` for ergonomic, typo-safe field access. If the
 * source data does not match the declared shape, reads still succeed but the
 * static type is a fiction. Validate at the boundary if you need certainty.
 *
 * @example
 * ```ts
 * const EntityType = { Spawn: 'spawn', Pickup: 'pickup' } as const;
 * interface LevelObjects {
 *   [EntityType.Spawn]:  { team: 'red' | 'blue' };
 *   [EntityType.Pickup]: { item: 'coin' | 'gem'; amount: number };
 * }
 * const entities = map.getObjectLayer<LevelObjects>('Entities');
 * entities.byType(EntityType.Spawn)[0].properties.team; // 'red' | 'blue'
 * ```
 * @stable
 */
export type ObjectSchema = Record<string, TileProperties>;

/**
 * A {@link TileMapObject} whose `properties` are narrowed to the schema shape
 * declared for the object `type` `T` in schema `S`.
 * @advanced
 */
export type TypedObject<S extends ObjectSchema, T extends keyof S & string> = TileMapObject<S[T]>;

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
 * colliders, placing entities).
 *
 * Query with {@link query} (untyped, fully back-compatible) or, when an
 * {@link ObjectSchema} type argument `S` is supplied, with the typed accessors
 * {@link byType}, {@link byKind}, and {@link where} — these narrow `properties`
 * to the developer-declared shape. The schema is **opt-in**: the default type
 * parameter reproduces the original untyped behaviour, so
 * `new ObjectLayer(options)` and `map.getObjectLayer('x')` are unchanged.
 *
 * @remarks
 * A schema is a developer promise, not a runtime guarantee — Tiled data is
 * untyped at runtime and ExoJS performs no validation. See {@link ObjectSchema}.
 *
 * @typeParam S - Optional {@link ObjectSchema} mapping object `type` strings to
 * their property shapes. Defaults to a generic schema (every type maps to the
 * loose {@link TileProperties} bag).
 *
 * @advanced
 */
export class ObjectLayer<S extends ObjectSchema = ObjectSchema> {
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

  /**
   * Objects whose `type` equals `type`, with `properties` narrowed to the
   * schema shape `S[T]`. Returns a fresh array (insertion order).
   *
   * The narrowing is a static convenience only — no runtime validation is
   * performed (see {@link ObjectSchema}). On an unschematised layer this
   * behaves like `query({ type })` with `TileProperties` properties.
   */
  public byType<T extends keyof S & string>(type: T): Array<TypedObject<S, T>> {
    return this.objects.filter(object => object.type === type) as unknown as Array<TypedObject<S, T>>;
  }

  /**
   * Objects of the given geometry {@link ObjectKind}, narrowed to that
   * geometry's member type (e.g. `byKind(ObjectKind.Polygon)` yields
   * {@link PolygonObject}s with their `points`). Returns a fresh array.
   */
  public byKind<K extends ObjectKind>(kind: K): Array<Extract<TileMapObject, { kind: K }>> {
    return this.objects.filter(object => object.kind === kind) as Array<Extract<TileMapObject, { kind: K }>>;
  }

  /**
   * Objects of `type` (typed as in {@link byType}) that also satisfy
   * `predicate`. A convenience combination of {@link byType} and `Array.filter`
   * that keeps the narrowed `properties` type inside the predicate. Returns a
   * fresh array.
   */
  public where<T extends keyof S & string>(
    type: T,
    predicate: (object: TypedObject<S, T>) => boolean,
  ): Array<TypedObject<S, T>> {
    return this.byType(type).filter(object => predicate(object));
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
