import type { TileMapObject, TileProperties, TilePropertyValue, TileSet } from '@codexo/exojs-tilemap';
import { ObjectLayer, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap } from '@codexo/exojs-tilemap';

import type {
  LdtkData,
  LdtkEntityInstance,
  LdtkFieldInstance,
  LdtkIntGridValueDef,
  LdtkLayerInstance,
  LdtkLevel,
  LdtkTileData,
} from './LdtkData';
import { ldtkFlipX, ldtkFlipY } from './LdtkData';
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
 */
export function ldtkToTileMap(data: LdtkData, options?: LdtkToTileMapOptions): LdtkMap {
  const source = options?.source ?? '';
  const tilesets = options?.tilesets ?? new Map<number, TileSet>();

  const levels = data.levels.map((level, levelIndex) =>
    convertLevel(level, levelIndex, data, tilesets),
  );

  return new LdtkMap(source, data, levels);
}

// ── Level conversion ──────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
function convertLevel(
  level: LdtkLevel,
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
    const layerGridSize = layerInst.__gridSize;
    // Layer IDs must be unique within a TileMap (= one level).
    // Use layerDefUid directly — it is unique per layer definition in the file.
    const layerId = layerInst.layerDefUid;

    switch (layerInst.__type) {
      case 'Tiles':
      case 'AutoLayer': {
        const rLayer = makeTileLayer(layerInst, layerId, runtimeTilesets);
        const tiles =
          layerInst.__type === 'Tiles'
            ? (layerInst.gridTiles ?? [])
            : (layerInst.autoLayerTiles ?? []);
        const tsUid = layerInst.__tilesetDefUid;
        if (tsUid !== undefined) {
          const rts = tilesets.get(tsUid);
          if (rts) populateTileLayer(rLayer, tiles, rts, layerGridSize);
        }
        runtimeLayers.push(rLayer);
        break;
      }

      case 'IntGrid': {
        const intGridProperties = buildIntGridProperties(layerInst, data);
        const rLayer = makeTileLayer(layerInst, layerId, runtimeTilesets, intGridProperties);
        // IntGrid layers may carry auto-tiles when "Auto-layer" rules are
        // configured. Use those for rendering; raw intGridCsv is exposed as
        // data-only layer properties (see buildIntGridProperties).
        const autoTiles = layerInst.autoLayerTiles ?? [];
        const tsUid = layerInst.__tilesetDefUid;
        if (autoTiles.length > 0 && tsUid !== undefined) {
          const rts = tilesets.get(tsUid);
          if (rts) populateTileLayer(rLayer, autoTiles, rts, layerGridSize);
        }
        runtimeLayers.push(rLayer);
        break;
      }

      case 'Entities': {
        const objects = convertEntityLayer(
          layerInst,
          layerGridSize,
          levelIndex,
          entityCounter,
        );
        entityCounter += layerInst.entityInstances?.length ?? 0;
        runtimeObjectLayers.push(
          new ObjectLayer({
            id: layerId,
            name: layerInst.__identifier,
            visible: layerInst.visible,
            opacity: layerInst.opacity ?? 1,
            offsetX: layerInst.pxOffsetX ?? 0,
            offsetY: layerInst.pxOffsetY ?? 0,
            objects,
          }),
        );
        break;
      }
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
    // last so a same-named user field can never clobber them.
    properties: {
      ...convertFieldInstances(level.fieldInstances ?? []),
      ldtkUid: level.uid,
      ldtkIid: level.iid,
      worldX: level.worldX,
      worldY: level.worldY,
    },
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
        flipX: (f & ldtkFlipX) !== 0,
        flipY: (f & ldtkFlipY) !== 0,
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

/**
 * Look up the named/coloured {@link LdtkIntGridValueDef} at a tile coordinate
 * on a `TileLayer` converted from an LDtk `IntGrid` layer instance.
 *
 * Returns `undefined` when the coordinate is out of bounds, the cell's raw
 * value is `0` (empty), the raw value has no matching definition, or `layer`
 * was not converted from an IntGrid layer instance (no IntGrid data attached
 * via {@link ldtkIntGridCsvProperty} / {@link ldtkIntGridValuesProperty}).
 */
export function getLdtkIntGridValueAt(
  layer: TileLayer,
  x: number,
  y: number,
): LdtkIntGridValueDef | undefined {
  if (!layer.inBounds(x, y)) return undefined;

  const csvRaw = layer.properties[ldtkIntGridCsvProperty];
  const valuesRaw = layer.properties[ldtkIntGridValuesProperty];
  if (typeof csvRaw !== 'string' || typeof valuesRaw !== 'string') return undefined;

  const csv = JSON.parse(csvRaw) as readonly number[];
  const raw = csv[y * layer.width + x];
  if (raw === undefined || raw === 0) return undefined;

  const values = JSON.parse(valuesRaw) as readonly LdtkIntGridValueDef[];
  return values.find(v => v.value === raw);
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
 * Only scalar values (string, number, boolean) are forwarded; complex types
 * (arrays, colours, enums-as-objects) are silently skipped.
 */
function convertFieldInstances(fields: readonly LdtkFieldInstance[]): TileProperties {
  if (fields.length === 0) return Object.freeze({});
  const out: Record<string, TilePropertyValue> = {};
  for (const field of fields) {
    const v = field.__value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[field.__identifier] = v;
    }
  }
  return Object.freeze(out);
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
