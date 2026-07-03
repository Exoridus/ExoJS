import type { TileMapObject, TileProperties, TilePropertyValue, TileSet } from '@codexo/exojs-tilemap';
import { ObjectLayer, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TilePropertyKind } from '@codexo/exojs-tilemap';

import type {
  LdtkData,
  LdtkEntityInstance,
  LdtkFieldInstance,
  LdtkIntGridValueDef,
  LdtkLayerInstance,
  LdtkLevel,
  LdtkTileData,
} from './LdtkData';
import { LDTK_FLIP_X, LDTK_FLIP_Y } from './LdtkData';
import { getLdtkLevelEntries } from './ldtkLevelEntries';
import { LdtkMap } from './LdtkMap';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Options for {@link ldtkToTileMap}.
 */
export interface LdtkToTileMapOptions {
  /**
   * Source URL of the loaded `.ldtk` file, used as {@link LdtkMap.source}.
   * Defaults to an empty string when omitted (e.g. programmatic / test usage).
   */
  readonly source?: string;
  /**
   * Pre-loaded runtime {@link TileSet}s keyed by LDtk tileset UID.
   *
   * When provided, tile layers are populated with tile data from
   * `gridTiles` / `autoLayerTiles`. Without this map, tile layers are created
   * with the correct dimensions but no tiles are placed — only entity and
   * object layers carry data.
   *
   * Populate via {@link import('./loadLdtkMap').loadLdtkMap} for asset-loading
   * flows, or pass a hand-crafted map for testing.
   */
  readonly tilesets?: ReadonlyMap<number, TileSet>;
}

/**
 * Convert a raw {@link LdtkData} document into an {@link LdtkMap} containing
 * one runtime {@link TileMap} per LDtk level.
 *
 * Tile layers (`Tiles` / `AutoLayer`) become renderable `TileLayer`s. IntGrid
 * layers become dimension-correct `TileLayer`s — tile data is placed only when
 * the layer carries `autoLayerTiles`. Entity layers become data-only
 * `ObjectLayer`s with entity position, size, and scalar field properties.
 *
 * Pass `options.tilesets` to populate tile data; omit it for structure-only
 * conversion (useful in unit tests that do not need textures).
 *
 * Transparently handles both LDtk root shapes via {@link getLdtkLevelEntries}:
 * single-world (`data.levels`) and multi-world (`data.worlds[].levels`) — in
 * the latter case every converted level's `TileMap.properties` is additionally
 * tagged with its owning world's iid under the reserved `ldtkWorldIid` key.
 */
export function ldtkToTileMap(data: LdtkData, options?: LdtkToTileMapOptions): LdtkMap {
  const source = options?.source ?? '';
  const tilesets = options?.tilesets ?? new Map<number, TileSet>();

  const levels = getLdtkLevelEntries(data).map((entry, levelIndex) =>
    convertLevel(entry.level, entry.worldIid, levelIndex, data, tilesets),
  );

  return new LdtkMap(source, data, levels);
}

// ── Level conversion ──────────────────────────────────────────────────────────

function convertLevel(
  level: LdtkLevel,
  worldIid: string | undefined,
  levelIndex: number,
  data: LdtkData,
  tilesets: ReadonlyMap<number, TileSet>,
): TileMap {
  // Derive map-level tile size from the first non-entity layer, or fall back.
  const gridSize = pickLevelGridSize(level, data.defaultGridSize ?? 16);
  const mapWidth = Math.max(1, Math.ceil(level.pxWid / gridSize));
  const mapHeight = Math.max(1, Math.ceil(level.pxHei / gridSize));

  const runtimeTilesets: TileSet[] = [...tilesets.values()];
  const runtimeLayers: TileLayer[] = [];
  const runtimeObjectLayers: ObjectLayer[] = [];

  // LDtk stores layers top-to-bottom (first = top-most); preserve that order.
  const layerInstances = level.layerInstances ?? [];
  let entityCounter = 0;

  for (const layerInst of layerInstances) {
    // Layer IDs must be unique within a TileMap (= one level).
    // Use layerDefUid directly — it is unique per layer definition in the file.
    const layerId = layerInst.layerDefUid;

    switch (layerInst.__type) {
      case 'Tiles':
      case 'AutoLayer':
        runtimeLayers.push(convertTilesOrAutoLayer(layerInst, layerId, runtimeTilesets, tilesets));
        break;

      case 'IntGrid':
        runtimeLayers.push(convertIntGridLayer(layerInst, layerId, runtimeTilesets, tilesets, data));
        break;

      case 'Entities':
        runtimeObjectLayers.push(convertEntitiesLayer(layerInst, layerId, levelIndex, entityCounter));
        entityCounter += layerInst.entityInstances?.length ?? 0;
        break;
    }
  }

  return new TileMap({
    name: level.identifier,
    width: mapWidth,
    height: mapHeight,
    tileWidth: gridSize,
    tileHeight: gridSize,
    tilesets: runtimeTilesets,
    layers: runtimeLayers,
    objectLayers: runtimeObjectLayers,
    // Convert user-defined level fields first, then apply the reserved keys
    // last so a same-named user field can never clobber them. ldtkWorldIid is
    // only added for multi-world documents (worldIid !== undefined) — a
    // single-world document's properties must stay exactly as they were
    // before multi-world support existed.
    properties: {
      ...convertFieldInstances(level.fieldInstances ?? []),
      ldtkUid: level.uid,
      ldtkIid: level.iid,
      worldX: level.worldX,
      worldY: level.worldY,
      ...(worldIid !== undefined && { ldtkWorldIid: worldIid }),
    },
  });
}

// ── Helpers: per-layer-type level conversion ─────────────────────────────────

/** Convert a `Tiles`/`AutoLayer` LDtk layer instance into a runtime {@link TileLayer}. */
function convertTilesOrAutoLayer(
  layerInst: LdtkLayerInstance,
  layerId: number,
  runtimeTilesets: readonly TileSet[],
  tilesets: ReadonlyMap<number, TileSet>,
): TileLayer {
  const rLayer = makeTileLayer(layerInst, layerId, runtimeTilesets);
  const tiles =
    layerInst.__type === 'Tiles' ? (layerInst.gridTiles ?? []) : (layerInst.autoLayerTiles ?? []);
  const tsUid = layerInst.__tilesetDefUid;
  if (tsUid !== undefined) {
    const rts = tilesets.get(tsUid);
    if (rts) populateTileLayer(rLayer, tiles, rts, layerInst.__gridSize);
  }
  return rLayer;
}

/** Convert an `IntGrid` LDtk layer instance into a runtime {@link TileLayer}. */
function convertIntGridLayer(
  layerInst: LdtkLayerInstance,
  layerId: number,
  runtimeTilesets: readonly TileSet[],
  tilesets: ReadonlyMap<number, TileSet>,
  data: LdtkData,
): TileLayer {
  const intGridProperties = buildIntGridProperties(layerInst, data);
  const rLayer = makeTileLayer(layerInst, layerId, runtimeTilesets, intGridProperties);
  // IntGrid layers may carry auto-tiles when "Auto-layer" rules are
  // configured. Use those for rendering; raw intGridCsv is exposed as
  // data-only layer properties (see buildIntGridProperties).
  const autoTiles = layerInst.autoLayerTiles ?? [];
  const tsUid = layerInst.__tilesetDefUid;
  if (autoTiles.length > 0 && tsUid !== undefined) {
    const rts = tilesets.get(tsUid);
    if (rts) populateTileLayer(rLayer, autoTiles, rts, layerInst.__gridSize);
  }
  return rLayer;
}

/** Convert an `Entities` LDtk layer instance into a runtime {@link ObjectLayer}. */
function convertEntitiesLayer(
  layerInst: LdtkLayerInstance,
  layerId: number,
  levelIndex: number,
  entityCounter: number,
): ObjectLayer {
  const objects = convertEntityLayer(layerInst, layerInst.__gridSize, levelIndex, entityCounter);
  return new ObjectLayer({
    id: layerId,
    name: layerInst.__identifier,
    visible: layerInst.visible,
    opacity: layerInst.opacity ?? 1,
    offsetX: layerInst.pxOffsetX ?? 0,
    offsetY: layerInst.pxOffsetY ?? 0,
    objects,
  });
}

// ── Helpers: TileLayer ────────────────────────────────────────────────────────

function makeTileLayer(
  layerInst: LdtkLayerInstance,
  layerId: number,
  tilesets: readonly TileSet[],
  properties?: TileProperties,
): TileLayer {
  return new TileLayer({
    id: layerId,
    name: layerInst.__identifier,
    width: layerInst.__cWid,
    height: layerInst.__cHei,
    tilesets,
    tileWidth: layerInst.__gridSize,
    tileHeight: layerInst.__gridSize,
    visible: layerInst.visible,
    opacity: layerInst.opacity ?? 1,
    offsetX: layerInst.pxOffsetX ?? 0,
    offsetY: layerInst.pxOffsetY ?? 0,
    ...(properties && { properties }),
  });
}

function populateTileLayer(
  layer: TileLayer,
  tiles: readonly LdtkTileData[],
  tileset: TileSet,
  gridSize: number,
): void {
  for (const tile of tiles) {
    const tx = Math.floor(tile.px[0] / gridSize);
    const ty = Math.floor(tile.px[1] / gridSize);
    if (!layer.inBounds(tx, ty)) continue;

    const localTileId = tile.t;
    if (localTileId < 0 || localTileId >= tileset.tileCount) continue;

    const f = tile.f;
    layer.setTileAt(tx, ty, {
      tileset,
      localTileId,
      transform: {
        flipX: (f & LDTK_FLIP_X) !== 0,
        flipY: (f & LDTK_FLIP_Y) !== 0,
        diagonal: false,
      },
    });
  }
}

// ── Helpers: IntGrid ──────────────────────────────────────────────────────────

/**
 * Reserved {@link TileLayer.properties} key holding the JSON-encoded raw
 * IntGrid CSV array (`readonly number[]`) for a `TileLayer` converted from an
 * LDtk `IntGrid` layer instance. Index = `y * layer.width + x`; `0` = empty.
 * Prefer {@link getLdtkIntGridValueAt} over reading this directly.
 */
export const ldtkIntGridCsvProperty = 'ldtkIntGridCsv';

/**
 * Reserved {@link TileLayer.properties} key holding the JSON-encoded
 * {@link LdtkIntGridValueDef} array for a `TileLayer` converted from an LDtk
 * `IntGrid` layer instance — the raw-int → named/coloured mapping declared on
 * the owning layer definition (`data.defs.layers[].intGridValues`).
 * Prefer {@link getLdtkIntGridValueAt} over reading this directly.
 */
export const ldtkIntGridValuesProperty = 'ldtkIntGridValues';

/**
 * Build the reserved IntGrid properties for a `TileLayer` from an LDtk
 * `IntGrid` layer instance, or `undefined` when the layer carries no
 * `intGridCsv` data (nothing to expose).
 *
 * {@link TileLayer.properties} values are scalar-only, so the raw CSV array
 * and the value-definition mapping are JSON-encoded into two reserved string
 * properties rather than stored as nested structures — the same
 * `properties`-bag mechanism the Tiled adapter already uses for per-layer
 * metadata, just serialized to fit its scalar-only value type.
 */
function buildIntGridProperties(
  layerInst: LdtkLayerInstance,
  data: LdtkData,
): TileProperties | undefined {
  const csv = layerInst.intGridCsv;
  if (!csv || csv.length === 0) return undefined;

  const layerDef = data.defs.layers.find(def => def.uid === layerInst.layerDefUid);
  const values = layerDef?.intGridValues ?? [];

  return Object.freeze({
    [ldtkIntGridCsvProperty]: JSON.stringify(csv),
    [ldtkIntGridValuesProperty]: JSON.stringify(values),
  });
}

/** Parsed, cached form of a `TileLayer`'s {@link ldtkIntGridCsvProperty} / {@link ldtkIntGridValuesProperty}. */
interface ParsedIntGridData {
  readonly csv: readonly number[];
  readonly values: readonly LdtkIntGridValueDef[];
}

/**
 * Per-`TileLayer` cache of parsed IntGrid CSV/value-defs data, populated
 * lazily on first {@link getLdtkIntGridValueAt} lookup for a given layer.
 *
 * Keyed by the `TileLayer` instance itself (`WeakMap`), so an entry is
 * naturally garbage-collected once the layer it was derived from is no
 * longer referenced — no manual invalidation needed since
 * {@link TileLayer.properties} is frozen and copied at construction time and
 * can never change afterwards.
 */
const intGridCache = new WeakMap<TileLayer, ParsedIntGridData>();

/**
 * Parse (or retrieve from {@link intGridCache}) the IntGrid CSV/value-defs
 * data attached to `layer`, or `undefined` when `layer` carries no such data
 * (not converted from an IntGrid layer instance).
 */
function getParsedIntGridData(layer: TileLayer): ParsedIntGridData | undefined {
  const cached = intGridCache.get(layer);
  if (cached) return cached;

  const csvRaw = layer.properties[ldtkIntGridCsvProperty];
  const valuesRaw = layer.properties[ldtkIntGridValuesProperty];
  if (typeof csvRaw !== 'string' || typeof valuesRaw !== 'string') return undefined;

  const parsed: ParsedIntGridData = {
    csv: JSON.parse(csvRaw) as readonly number[],
    values: JSON.parse(valuesRaw) as readonly LdtkIntGridValueDef[],
  };
  intGridCache.set(layer, parsed);
  return parsed;
}

/**
 * Look up the named/coloured {@link LdtkIntGridValueDef} at a tile coordinate
 * on a `TileLayer` converted from an LDtk `IntGrid` layer instance.
 *
 * Returns `undefined` when the coordinate is out of bounds, the cell's raw
 * value is `0` (empty), the raw value has no matching definition, or `layer`
 * was not converted from an IntGrid layer instance (no IntGrid data attached
 * via {@link ldtkIntGridCsvProperty} / {@link ldtkIntGridValuesProperty}).
 *
 * The underlying JSON-encoded CSV/value-defs properties are parsed once per
 * layer and cached (see {@link getParsedIntGridData}) — safe to call from a
 * hot path (e.g. per-cell or per-frame collision/classification checks).
 */
export function getLdtkIntGridValueAt(
  layer: TileLayer,
  x: number,
  y: number,
): LdtkIntGridValueDef | undefined {
  if (!layer.inBounds(x, y)) return undefined;

  const parsed = getParsedIntGridData(layer);
  if (!parsed) return undefined;

  const raw = parsed.csv[y * layer.width + x];
  if (raw === undefined || raw === 0) return undefined;

  return parsed.values.find(v => v.value === raw);
}

// ── Helpers: ObjectLayer ──────────────────────────────────────────────────────

function convertEntityLayer(
  layerInst: LdtkLayerInstance,
  _gridSize: number,
  levelIndex: number,
  baseCounter: number,
): TileMapObject[] {
  const instances = layerInst.entityInstances ?? [];
  const objects: TileMapObject[] = [];

  for (let i = 0; i < instances.length; i++) {
    const entity = instances[i];
    if (entity === undefined) continue;
    // Build a deterministic numeric id: (levelIndex * 1_000_000) + counter.
    const id = levelIndex * 1_000_000 + baseCounter + i;
    objects.push(convertEntity(entity, id));
  }

  return objects;
}

function convertEntity(entity: LdtkEntityInstance, id: number): TileMapObject {
  // entity.px is the pivot-adjusted anchor, not the bounding box's top-left
  // corner — undo the pivot offset to recover the corner TileMapObject expects.
  const x = entity.px[0] - entity.width * entity.__pivot[0];
  const y = entity.px[1] - entity.height * entity.__pivot[1];
  return {
    kind: 'rectangle',
    id,
    name: entity.__identifier,
    type: entity.__identifier,
    x,
    y,
    width: entity.width,
    height: entity.height,
    rotation: 0,
    visible: true,
    properties: convertFieldInstances(entity.fieldInstances),
  };
}

/**
 * Project LDtk field instances to a flat {@link TileProperties} bag.
 * Every LDtk field type maps to a canonical {@link TilePropertyValue}
 * (scalars pass through; `Point`/`EntityRef`/`Tile` become their tagged
 * structured variants; `Array<T>` fields recursively convert each element).
 * A field whose raw `__value` is `null` (LDtk's "not set" convention) is
 * omitted from the bag entirely, matching the property-absent case rather
 * than a present-but-null value.
 */
function convertFieldInstances(fields: readonly LdtkFieldInstance[]): TileProperties {
  if (fields.length === 0) return Object.freeze({});
  const out: Record<string, TilePropertyValue> = {};
  for (const field of fields) {
    const value = convertField(field);
    if (value !== undefined) {
      out[field.__identifier] = value;
    }
  }
  return Object.freeze(out);
}

/**
 * Type guard narrowing to the `Array<T>` member of {@link LdtkFieldInstance}.
 * `String.prototype.startsWith` alone does not narrow a template-literal
 * union member for the compiler; a predicate on `field` itself does.
 */
function isLdtkArrayField(
  field: LdtkFieldInstance,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- LDtk uses __ prefix for runtime fields
): field is Extract<LdtkFieldInstance, { readonly __type: `Array<${string}>` }> {
  return field.__type.startsWith('Array<');
}

/** Convert one {@link LdtkFieldInstance} to its canonical {@link TilePropertyValue}, or `undefined` for a `null` (unset) field. */
function convertField(field: LdtkFieldInstance): TilePropertyValue | undefined {
  switch (field.__type) {
    case 'Int':
    case 'Float':
    case 'Bool':
    case 'String':
    case 'Multilines':
    case 'Color':
    case 'FilePath':
    case 'Enum':
    case 'Point':
    case 'EntityRef':
    case 'Tile':
      return mapLdtkFieldValue(field.__type, field.__value);

    default:
      break;
  }

  if (isLdtkArrayField(field)) {
    if (field.__value === null) return undefined;
    const elementType = field.__type.slice('Array<'.length, -1);
    const elements: TilePropertyValue[] = [];
    for (const raw of field.__value) {
      const converted = mapLdtkFieldValue(elementType, raw);
      if (converted !== undefined) elements.push(converted);
    }
    return Object.freeze(elements);
  }

  // Exhaustiveness check: if LDtk ever adds a new field type, `field` will
  // fail to narrow to `never` here and tsc will error.
  const _exhaustive: never = field;
  void _exhaustive;
  throw new Error(`convertFieldInstances: unrecognised LDtk field type "${(field as LdtkFieldInstance).__type}".`);
}

/**
 * Map a single raw LDtk field value (or array element) to its canonical
 * {@link TilePropertyValue}, given the LDtk type name it was declared with.
 * Shared by {@link convertField} (top-level fields) and array-element
 * conversion (`typeName` is the `T` extracted from an `Array<T>` field).
 * Returns `undefined` for a `null` value or an unrecognised `typeName`.
 */
function mapLdtkFieldValue(typeName: string, value: unknown): TilePropertyValue | undefined {
  if (value === null || value === undefined) return undefined;

  switch (typeName) {
    case 'Int':
    case 'Float':
    case 'Bool':
    case 'String':
    case 'Multilines':
    case 'Color':
    case 'FilePath':
    case 'Enum':
      return value as string | number | boolean;

    case 'Point': {
      const v = value as { cx: number; cy: number };
      return { kind: TilePropertyKind.Point, cx: v.cx, cy: v.cy };
    }

    case 'EntityRef': {
      const v = value as { entityIid: string; layerIid: string; levelIid: string; worldIid: string };
      return {
        kind: TilePropertyKind.ObjectRef,
        id: v.entityIid,
        layerIid: v.layerIid,
        levelIid: v.levelIid,
        worldIid: v.worldIid,
      };
    }

    case 'Tile': {
      const v = value as { tilesetUid: number; x: number; y: number; w: number; h: number };
      return { kind: TilePropertyKind.TileRef, tilesetUid: v.tilesetUid, x: v.x, y: v.y, w: v.w, h: v.h };
    }

    default:
      // Unknown/unsupported array element type (e.g. a future LDtk type
      // inside Array<T>) — skip rather than throw, since this path is not
      // compiler-exhaustive (element types are plain runtime strings).
      return undefined;
  }
}

// ── Helpers: grid size ────────────────────────────────────────────────────────

function pickLevelGridSize(level: LdtkLevel, fallback: number): number {
  const instances = level.layerInstances ?? [];
  for (const layer of instances) {
    if (layer.__type !== 'Entities' && layer.__gridSize > 0) {
      return layer.__gridSize;
    }
  }
  return fallback;
}

// Re-export identity transform constant for convenience (tree-shake friendly).
export { TILE_TRANSFORM_IDENTITY };
