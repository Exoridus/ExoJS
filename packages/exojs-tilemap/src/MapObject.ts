import type { ObjectLayer, TileMapObject } from './ObjectLayer';
import type { TileMap } from './TileMap';
import type { TileProperties } from './types';

/**
 * A format-neutral view of one map object, as handed to a
 * {@link import('./MapObjectSpawner').MapObjectFactory}.
 *
 * The descriptor is what game code writes against: it resolves the two things
 * that differ between authoring formats - stable identity and the dispatch
 * key - and pairs the object with the layer it came from. The parsed object
 * itself stays reachable through {@link object}, and the untouched source
 * record through {@link TileMapObject.source}.
 */
export interface MapObjectDescriptor {
  /**
   * Stable identity for this object.
   *
   * Uniqueness domain is **one {@link TileMap}**: Tiled object ids are unique
   * within a map, and LDtk entity iids are unique globally, so an LDtk-sourced
   * id keeps that stronger guarantee. Combine with the owning level's id if a
   * world-wide key is needed.
   *
   * Derived from {@link TileMapObject.sourceId} when the format supplies one,
   * otherwise from the numeric {@link TileMapObject.id}.
   */
  readonly id: string;
  /**
   * Canonical dispatch key - the object's class/type string, or `null` when the
   * source declares none.
   *
   * LDtk fills it with the entity definition identifier, Tiled with the
   * object's class. A {@link import('./MapObjectSpawner').MapObjectSpawner}
   * uses it to pick a factory unless an `identify` strategy overrides that.
   */
  readonly kind: string | null;
  /** Object name; may be empty and is not unique. */
  readonly name: string;
  /** X of the object origin in object-layer pixel space. */
  readonly x: number;
  /** Y of the object origin in object-layer pixel space. */
  readonly y: number;
  /** Bounding width in px (0 for points). */
  readonly width: number;
  /** Bounding height in px (0 for points). */
  readonly height: number;
  /** Rotation in degrees, clockwise. See {@link TileMapObject} for the pivot. */
  readonly rotation: number;
  /** The object's immutable custom properties. */
  readonly properties: TileProperties;
  /** The object layer this object was authored on, with its placement metadata. */
  readonly layer: ObjectLayer;
  /** The parsed object itself - narrow on `object.kind` to read geometry. */
  readonly object: TileMapObject;
}

/**
 * Build the {@link MapObjectDescriptor} for one object of `layer`.
 *
 * Exposed for code that spawns from a hand-picked object rather than from a
 * whole map; {@link mapObjectDescriptors} covers the common case.
 */
export const mapObjectDescriptor = (object: TileMapObject, layer: ObjectLayer): MapObjectDescriptor => ({
  id: object.sourceId ?? String(object.id),
  kind: object.type === '' ? null : object.type,
  name: object.name,
  x: object.x,
  y: object.y,
  width: object.width,
  height: object.height,
  rotation: object.rotation,
  properties: object.properties,
  layer,
  object,
});

/**
 * Every object of `map`, in a defined order: object-layer order first, then
 * object order within each layer.
 *
 * This is the order a {@link import('./MapObjectSpawner').MapObjectSpawner}
 * spawns in, so the same map always produces the same sequence.
 */
export const mapObjectDescriptors = function* (map: TileMap): Generator<MapObjectDescriptor> {
  for (const layer of map.objectLayers) {
    for (const object of layer.objects) {
      yield mapObjectDescriptor(object, layer);
    }
  }
};
