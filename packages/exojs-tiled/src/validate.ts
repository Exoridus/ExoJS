// Runtime validation for Tiled JSON (TMJ/TSJ) data. Every exported function
// takes `unknown` (the result of `JSON.parse`) and either returns a typed,
// validated `Tiled*Data` value or throws a {@link TiledFormatError}.
//
// There is no fall-through: an unrecognised shape, an unsupported encoding,
// or an out-of-range value is always a thrown error carrying the source URL
// and a JSON-path-like field path, never a silently-substituted default.

import type {
  TiledAnimationFrameData,
  TiledChunkData,
  TiledClassPropertyValueData,
  TiledGroupLayerData,
  TiledImageLayerData,
  TiledLayerData,
  TiledLayerDataBase,
  TiledMapData,
  TiledObjectData,
  TiledObjectLayerData,
  TiledOrientation,
  TiledPointData,
  TiledPropertyData,
  TiledPropertyType,
  TiledRenderOrder,
  TiledTextData,
  TiledTileData,
  TiledTileLayerData,
  TiledTilesetData,
  TiledTilesetRefData,
} from './data';

/**
 * Thrown when a Tiled JSON document does not match the expected shape.
 * `source` is the URL of the file being parsed; `path` is a JSON-path-like
 * pointer (e.g. `layers[2].objects[0].properties[1].value`) to the offending
 * value, or `''` for the document root.
 */
export class TiledFormatError extends Error {
  public readonly source: string;
  public readonly path: string;

  public constructor(source: string, path: string, message: string) {
    super(`Invalid Tiled data in "${source}" at ${path === '' ? '<root>' : path}: ${message}`);
    this.name = 'TiledFormatError';
    this.source = source;
    this.path = path;
  }
}

// ── Primitive helpers ───────────────────────────────────────────────────────

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function joinPath(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path === '' ? key : `${path}.${key}`;
}

function expectObject(value: unknown, source: string, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TiledFormatError(source, path, `expected an object, got ${describeValue(value)}`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, source: string, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TiledFormatError(source, path, `expected an array, got ${describeValue(value)}`);
  }
  return value;
}

function expectString(value: unknown, source: string, path: string): string {
  if (typeof value !== 'string') {
    throw new TiledFormatError(source, path, `expected a string, got ${describeValue(value)}`);
  }
  return value;
}

function expectNumber(value: unknown, source: string, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TiledFormatError(source, path, `expected a finite number, got ${describeValue(value)}`);
  }
  return value;
}

function expectInteger(value: unknown, source: string, path: string): number {
  const n = expectNumber(value, source, path);
  if (!Number.isInteger(n)) {
    throw new TiledFormatError(source, path, `expected an integer, got ${n}`);
  }
  return n;
}

function expectNonNegativeInteger(value: unknown, source: string, path: string): number {
  const n = expectInteger(value, source, path);
  if (n < 0) {
    throw new TiledFormatError(source, path, `expected a non-negative integer, got ${n}`);
  }
  return n;
}

function expectPositiveInteger(value: unknown, source: string, path: string): number {
  const n = expectInteger(value, source, path);
  if (n <= 0) {
    throw new TiledFormatError(source, path, `expected a positive integer, got ${n}`);
  }
  return n;
}

function expectBoolean(value: unknown, source: string, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TiledFormatError(source, path, `expected a boolean, got ${describeValue(value)}`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string, source: string, path: string): string | undefined {
  const value = obj[key];
  return value === undefined ? undefined : expectString(value, source, joinPath(path, key));
}

function optionalNumber(obj: Record<string, unknown>, key: string, source: string, path: string): number | undefined {
  const value = obj[key];
  return value === undefined ? undefined : expectNumber(value, source, joinPath(path, key));
}

function optionalInteger(obj: Record<string, unknown>, key: string, source: string, path: string): number | undefined {
  const value = obj[key];
  return value === undefined ? undefined : expectInteger(value, source, joinPath(path, key));
}

function optionalNonNegativeInteger(obj: Record<string, unknown>, key: string, source: string, path: string): number | undefined {
  const value = obj[key];
  return value === undefined ? undefined : expectNonNegativeInteger(value, source, joinPath(path, key));
}

function optionalBoolean(obj: Record<string, unknown>, key: string, source: string, path: string): boolean | undefined {
  const value = obj[key];
  return value === undefined ? undefined : expectBoolean(value, source, joinPath(path, key));
}

function mapArray<T>(value: unknown, source: string, path: string, fn: (item: unknown, itemPath: string) => T): readonly T[] {
  const arr = expectArray(value, source, path);
  return arr.map((item, i) => fn(item, joinPath(path, i)));
}

function optionalMapArray<T>(value: unknown, source: string, path: string, fn: (item: unknown, itemPath: string) => T): readonly T[] | undefined {
  return value === undefined ? undefined : mapArray(value, source, path, fn);
}

// ── Custom properties ───────────────────────────────────────────────────────

const PROPERTY_TYPES: readonly TiledPropertyType[] = ['string', 'int', 'float', 'bool', 'color', 'file', 'object', 'class'];

function validateTiledClassPropertyValue(raw: unknown, source: string, path: string): TiledClassPropertyValueData {
  const obj = expectObject(raw, source, path);
  const result: Record<string, string | number | boolean | TiledClassPropertyValueData> = {};
  for (const [key, value] of Object.entries(obj)) {
    const memberPath = joinPath(path, key);
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = validateTiledClassPropertyValue(value, source, memberPath);
    } else {
      throw new TiledFormatError(source, memberPath, `expected a string, number, boolean, or nested object, got ${describeValue(value)}`);
    }
  }
  return result;
}

/** @internal */
export function validateTiledPropertyData(raw: unknown, source: string, path: string): TiledPropertyData {
  const obj = expectObject(raw, source, path);
  const name = expectString(obj.name, source, joinPath(path, 'name'));
  const typePath = joinPath(path, 'type');
  const typeName = obj.type === undefined ? 'string' : expectString(obj.type, source, typePath);

  if (!PROPERTY_TYPES.includes(typeName as TiledPropertyType)) {
    throw new TiledFormatError(source, typePath, `unknown property type "${typeName}"`);
  }

  const type = typeName as TiledPropertyType;
  const propertytype = optionalString(obj, 'propertytype', source, path);
  const valuePath = joinPath(path, 'value');
  let value: TiledPropertyData['value'];

  switch (type) {
    case 'string':
    case 'color':
    case 'file':
      value = expectString(obj.value, source, valuePath);
      break;
    case 'int':
    case 'float':
    case 'object':
      value = expectNumber(obj.value, source, valuePath);
      break;
    case 'bool':
      value = expectBoolean(obj.value, source, valuePath);
      break;
    case 'class':
      value = validateTiledClassPropertyValue(obj.value, source, valuePath);
      break;
  }

  return { name, type, propertytype, value };
}

function validateTiledPropertiesArray(value: unknown, source: string, path: string): readonly TiledPropertyData[] | undefined {
  return optionalMapArray(value, source, path, (item, itemPath) => validateTiledPropertyData(item, source, itemPath));
}

// ── Points / animation frames ───────────────────────────────────────────────

function validateTiledPointData(raw: unknown, source: string, path: string): TiledPointData {
  const obj = expectObject(raw, source, path);
  return {
    x: expectNumber(obj.x, source, joinPath(path, 'x')),
    y: expectNumber(obj.y, source, joinPath(path, 'y')),
  };
}

function validateTiledPointArray(value: unknown, source: string, path: string): readonly TiledPointData[] {
  return mapArray(value, source, path, (item, itemPath) => validateTiledPointData(item, source, itemPath));
}

/** @internal */
export function validateTiledAnimationFrameData(raw: unknown, source: string, path: string): TiledAnimationFrameData {
  const obj = expectObject(raw, source, path);
  return {
    tileid: expectNonNegativeInteger(obj.tileid, source, joinPath(path, 'tileid')),
    duration: expectNonNegativeInteger(obj.duration, source, joinPath(path, 'duration')),
  };
}

// ── Text objects ─────────────────────────────────────────────────────────────

const HALIGN_VALUES: ReadonlyArray<TiledTextData['halign']> = ['center', 'right', 'justify', 'left'];
const VALIGN_VALUES: ReadonlyArray<TiledTextData['valign']> = ['center', 'bottom', 'top'];

function validateTiledTextData(raw: unknown, source: string, path: string): TiledTextData {
  const obj = expectObject(raw, source, path);
  const text = expectString(obj.text, source, joinPath(path, 'text'));

  let halign: TiledTextData['halign'];
  if (obj.halign !== undefined) {
    const value = expectString(obj.halign, source, joinPath(path, 'halign'));
    if (!HALIGN_VALUES.includes(value as TiledTextData['halign'])) {
      throw new TiledFormatError(source, joinPath(path, 'halign'), `unknown horizontal alignment "${value}"`);
    }
    halign = value as TiledTextData['halign'];
  }

  let valign: TiledTextData['valign'];
  if (obj.valign !== undefined) {
    const value = expectString(obj.valign, source, joinPath(path, 'valign'));
    if (!VALIGN_VALUES.includes(value as TiledTextData['valign'])) {
      throw new TiledFormatError(source, joinPath(path, 'valign'), `unknown vertical alignment "${value}"`);
    }
    valign = value as TiledTextData['valign'];
  }

  return {
    text,
    bold: optionalBoolean(obj, 'bold', source, path),
    color: optionalString(obj, 'color', source, path),
    fontfamily: optionalString(obj, 'fontfamily', source, path),
    halign,
    italic: optionalBoolean(obj, 'italic', source, path),
    kerning: optionalBoolean(obj, 'kerning', source, path),
    pixelsize: optionalNonNegativeInteger(obj, 'pixelsize', source, path),
    strikeout: optionalBoolean(obj, 'strikeout', source, path),
    underline: optionalBoolean(obj, 'underline', source, path),
    valign,
    wrap: optionalBoolean(obj, 'wrap', source, path),
  };
}

// ── Objects ──────────────────────────────────────────────────────────────────

/** @internal */
export function validateTiledObjectData(raw: unknown, source: string, path: string): TiledObjectData {
  const obj = expectObject(raw, source, path);

  return {
    id: expectNonNegativeInteger(obj.id, source, joinPath(path, 'id')),
    name: expectString(obj.name, source, joinPath(path, 'name')),
    type: expectString(obj.type, source, joinPath(path, 'type')),
    x: expectNumber(obj.x, source, joinPath(path, 'x')),
    y: expectNumber(obj.y, source, joinPath(path, 'y')),
    width: expectNumber(obj.width, source, joinPath(path, 'width')),
    height: expectNumber(obj.height, source, joinPath(path, 'height')),
    rotation: expectNumber(obj.rotation, source, joinPath(path, 'rotation')),
    visible: expectBoolean(obj.visible, source, joinPath(path, 'visible')),
    gid: optionalNonNegativeInteger(obj, 'gid', source, path),
    point: optionalBoolean(obj, 'point', source, path),
    ellipse: optionalBoolean(obj, 'ellipse', source, path),
    polygon: obj.polygon === undefined ? undefined : validateTiledPointArray(obj.polygon, source, joinPath(path, 'polygon')),
    polyline: obj.polyline === undefined ? undefined : validateTiledPointArray(obj.polyline, source, joinPath(path, 'polyline')),
    text: obj.text === undefined ? undefined : validateTiledTextData(obj.text, source, joinPath(path, 'text')),
    template: optionalString(obj, 'template', source, path),
    properties: validateTiledPropertiesArray(obj.properties, source, joinPath(path, 'properties')),
  };
}

// ── Layers ───────────────────────────────────────────────────────────────────

const LAYER_TYPES = ['tilelayer', 'objectgroup', 'imagelayer', 'group'] as const;
const SUPPORTED_TILE_LAYER_ENCODINGS = new Set<string>(['csv']);
const DRAW_ORDERS: ReadonlyArray<NonNullable<TiledObjectLayerData['draworder']>> = ['topdown', 'index'];

function validateTiledLayerBase(obj: Record<string, unknown>, source: string, path: string): TiledLayerDataBase {
  return {
    id: expectNonNegativeInteger(obj.id, source, joinPath(path, 'id')),
    name: expectString(obj.name, source, joinPath(path, 'name')),
    class: optionalString(obj, 'class', source, path),
    visible: expectBoolean(obj.visible, source, joinPath(path, 'visible')),
    opacity: expectNumber(obj.opacity, source, joinPath(path, 'opacity')),
    x: expectNumber(obj.x, source, joinPath(path, 'x')),
    y: expectNumber(obj.y, source, joinPath(path, 'y')),
    offsetx: optionalNumber(obj, 'offsetx', source, path),
    offsety: optionalNumber(obj, 'offsety', source, path),
    parallaxx: optionalNumber(obj, 'parallaxx', source, path),
    parallaxy: optionalNumber(obj, 'parallaxy', source, path),
    tintcolor: optionalString(obj, 'tintcolor', source, path),
    properties: validateTiledPropertiesArray(obj.properties, source, joinPath(path, 'properties')),
  };
}

function validateTiledGidArray(value: unknown, source: string, path: string): readonly number[] {
  return mapArray(value, source, path, (item, itemPath) => expectNonNegativeInteger(item, source, itemPath));
}

function validateTiledChunkData(raw: unknown, source: string, path: string): TiledChunkData {
  const obj = expectObject(raw, source, path);
  return {
    x: expectInteger(obj.x, source, joinPath(path, 'x')),
    y: expectInteger(obj.y, source, joinPath(path, 'y')),
    width: expectPositiveInteger(obj.width, source, joinPath(path, 'width')),
    height: expectPositiveInteger(obj.height, source, joinPath(path, 'height')),
    data: validateTiledGidArray(obj.data, source, joinPath(path, 'data')),
  };
}

function validateTiledTileLayerData(obj: Record<string, unknown>, base: TiledLayerDataBase, source: string, path: string): TiledTileLayerData {
  if (obj.compression !== undefined) {
    throw new TiledFormatError(source, joinPath(path, 'compression'), `compressed tile layer data is not supported (compression: ${JSON.stringify(obj.compression)})`);
  }

  const encoding = obj.encoding;
  if (encoding !== undefined && !(typeof encoding === 'string' && SUPPORTED_TILE_LAYER_ENCODINGS.has(encoding))) {
    throw new TiledFormatError(source, joinPath(path, 'encoding'), `unsupported tile layer encoding ${JSON.stringify(encoding)} (only plain CSV/array data is supported)`);
  }

  const width = expectNonNegativeInteger(obj.width, source, joinPath(path, 'width'));
  const height = expectNonNegativeInteger(obj.height, source, joinPath(path, 'height'));

  const hasData = obj.data !== undefined;
  const hasChunks = obj.chunks !== undefined;

  if (hasData === hasChunks) {
    throw new TiledFormatError(source, path, hasData ? 'tile layer has both "data" and "chunks"' : 'tile layer has neither "data" nor "chunks"');
  }

  return {
    ...base,
    type: 'tilelayer',
    width,
    height,
    data: hasData ? validateTiledGidArray(obj.data, source, joinPath(path, 'data')) : undefined,
    chunks: hasChunks ? mapArray(obj.chunks, source, joinPath(path, 'chunks'), (item, itemPath) => validateTiledChunkData(item, source, itemPath)) : undefined,
  };
}

function validateTiledObjectLayerData(obj: Record<string, unknown>, base: TiledLayerDataBase, source: string, path: string): TiledObjectLayerData {
  let draworder: TiledObjectLayerData['draworder'];
  if (obj.draworder !== undefined) {
    const value = expectString(obj.draworder, source, joinPath(path, 'draworder'));
    if (!DRAW_ORDERS.includes(value as NonNullable<TiledObjectLayerData['draworder']>)) {
      throw new TiledFormatError(source, joinPath(path, 'draworder'), `unknown draw order "${value}"`);
    }
    draworder = value as TiledObjectLayerData['draworder'];
  }

  return {
    ...base,
    type: 'objectgroup',
    draworder,
    objects: mapArray(obj.objects, source, joinPath(path, 'objects'), (item, itemPath) => validateTiledObjectData(item, source, itemPath)),
  };
}

function validateTiledImageLayerData(obj: Record<string, unknown>, base: TiledLayerDataBase, source: string, path: string): TiledImageLayerData {
  return {
    ...base,
    type: 'imagelayer',
    image: obj.image === undefined ? '' : expectString(obj.image, source, joinPath(path, 'image')),
    repeatx: optionalBoolean(obj, 'repeatx', source, path),
    repeaty: optionalBoolean(obj, 'repeaty', source, path),
  };
}

function validateTiledGroupLayerData(obj: Record<string, unknown>, base: TiledLayerDataBase, source: string, path: string): TiledGroupLayerData {
  return {
    ...base,
    type: 'group',
    layers: mapArray(obj.layers, source, joinPath(path, 'layers'), (item, itemPath) => validateTiledLayerData(item, source, itemPath)),
  };
}

/** @internal */
export function validateTiledLayerData(raw: unknown, source: string, path: string): TiledLayerData {
  const obj = expectObject(raw, source, path);
  const type = expectString(obj.type, source, joinPath(path, 'type'));
  const base = validateTiledLayerBase(obj, source, path);

  switch (type) {
    case 'tilelayer':
      return validateTiledTileLayerData(obj, base, source, path);
    case 'objectgroup':
      return validateTiledObjectLayerData(obj, base, source, path);
    case 'imagelayer':
      return validateTiledImageLayerData(obj, base, source, path);
    case 'group':
      return validateTiledGroupLayerData(obj, base, source, path);
    default: {
      const known: readonly string[] = LAYER_TYPES;
      throw new TiledFormatError(source, joinPath(path, 'type'), `unknown layer type "${type}" (expected one of ${known.join(', ')})`);
    }
  }
}

/**
 * Walks a layer tree and ensures every tile layer's `data`/`chunks` choice
 * matches the map's `infinite` flag. Tiled itself is consistent across an
 * entire map; a mismatch indicates a hand-edited or corrupt file.
 * @internal
 */
export function checkTiledLayerInfiniteConsistency(layers: readonly TiledLayerData[], infinite: boolean, source: string, path: string): void {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerPath = joinPath(path, i);

    if (layer.type === 'tilelayer') {
      const hasChunks = layer.chunks !== undefined;
      if (hasChunks !== infinite) {
        throw new TiledFormatError(
          source,
          layerPath,
          infinite ? 'tile layer is missing "chunks" on an infinite map' : 'tile layer has "chunks" on a finite map (expected "data")',
        );
      }
    } else if (layer.type === 'group') {
      checkTiledLayerInfiniteConsistency(layer.layers, infinite, source, joinPath(layerPath, 'layers'));
    }
  }
}

// ── Tile definitions ─────────────────────────────────────────────────────────

/** @internal */
export function validateTiledTileData(raw: unknown, source: string, path: string): TiledTileData {
  const obj = expectObject(raw, source, path);

  let objectgroup: TiledObjectLayerData | undefined;
  if (obj.objectgroup !== undefined) {
    const objectgroupPath = joinPath(path, 'objectgroup');
    const layer = validateTiledLayerData(obj.objectgroup, source, objectgroupPath);
    if (layer.type !== 'objectgroup') {
      throw new TiledFormatError(source, objectgroupPath, `expected an "objectgroup" layer, got "${layer.type}"`);
    }
    objectgroup = layer;
  }

  return {
    id: expectNonNegativeInteger(obj.id, source, joinPath(path, 'id')),
    type: optionalString(obj, 'type', source, path),
    properties: validateTiledPropertiesArray(obj.properties, source, joinPath(path, 'properties')),
    animation: optionalMapArray(obj.animation, source, joinPath(path, 'animation'), (item, itemPath) => validateTiledAnimationFrameData(item, source, itemPath)),
    objectgroup,
    image: optionalString(obj, 'image', source, path),
    imagewidth: optionalNonNegativeInteger(obj, 'imagewidth', source, path),
    imageheight: optionalNonNegativeInteger(obj, 'imageheight', source, path),
  };
}

// ── Tilesets ─────────────────────────────────────────────────────────────────

function validateTiledVersion(value: unknown, source: string, path: string): string | number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TiledFormatError(source, path, `expected a string or number, got ${describeValue(value)}`);
  }
  return value;
}

/** @internal */
export function validateTiledTilesetData(obj: Record<string, unknown>, source: string, path: string): TiledTilesetData {
  return {
    name: expectString(obj.name, source, joinPath(path, 'name')),
    class: optionalString(obj, 'class', source, path),
    tilewidth: expectPositiveInteger(obj.tilewidth, source, joinPath(path, 'tilewidth')),
    tileheight: expectPositiveInteger(obj.tileheight, source, joinPath(path, 'tileheight')),
    tilecount: expectNonNegativeInteger(obj.tilecount, source, joinPath(path, 'tilecount')),
    columns: expectNonNegativeInteger(obj.columns, source, joinPath(path, 'columns')),
    spacing: optionalNonNegativeInteger(obj, 'spacing', source, path),
    margin: optionalNonNegativeInteger(obj, 'margin', source, path),
    image: optionalString(obj, 'image', source, path),
    imagewidth: optionalNonNegativeInteger(obj, 'imagewidth', source, path),
    imageheight: optionalNonNegativeInteger(obj, 'imageheight', source, path),
    tileoffset: obj.tileoffset === undefined ? undefined : validateTiledPointData(obj.tileoffset, source, joinPath(path, 'tileoffset')),
    objectalignment: optionalString(obj, 'objectalignment', source, path),
    tiles: optionalMapArray(obj.tiles, source, joinPath(path, 'tiles'), (item, itemPath) => validateTiledTileData(item, source, itemPath)),
    properties: validateTiledPropertiesArray(obj.properties, source, joinPath(path, 'properties')),
    tiledversion: optionalString(obj, 'tiledversion', source, path),
    version: obj.version === undefined ? undefined : validateTiledVersion(obj.version, source, joinPath(path, 'version')),
  };
}

/**
 * Validates one entry of a map's `tilesets` array: either `{ firstgid,
 * source }` (external `.tsj`) or `{ firstgid, ...embedded tileset fields }`.
 * @internal
 */
export function validateTiledTilesetRefData(raw: unknown, source: string, path: string): TiledTilesetRefData {
  const obj = expectObject(raw, source, path);
  const firstgid = expectPositiveInteger(obj.firstgid, source, joinPath(path, 'firstgid'));

  if ('source' in obj) {
    return { firstgid, source: expectString(obj.source, source, joinPath(path, 'source')) };
  }

  return { ...validateTiledTilesetData(obj, source, path), firstgid };
}

// ── Map ──────────────────────────────────────────────────────────────────────

const ORIENTATIONS: readonly TiledOrientation[] = ['orthogonal', 'isometric', 'staggered', 'hexagonal'];
const RENDER_ORDERS: readonly TiledRenderOrder[] = ['right-down', 'right-up', 'left-down', 'left-up'];

/**
 * Validates the root of a `.tmj` file. Throws {@link TiledFormatError} on
 * any structural problem, including unsupported tile-layer encodings and
 * `infinite`/`data`/`chunks` inconsistencies.
 * @internal
 */
export function validateTiledMapData(raw: unknown, source: string): TiledMapData {
  const obj = expectObject(raw, source, '');

  const type = expectString(obj.type, source, 'type');
  if (type !== 'map') {
    throw new TiledFormatError(source, 'type', `expected "map", got "${type}"`);
  }

  const version = validateTiledVersion(obj.version, source, 'version');

  const orientationValue = expectString(obj.orientation, source, 'orientation');
  if (!ORIENTATIONS.includes(orientationValue as TiledOrientation)) {
    throw new TiledFormatError(source, 'orientation', `unknown orientation "${orientationValue}" (expected one of ${ORIENTATIONS.join(', ')})`);
  }
  const orientation = orientationValue as TiledOrientation;

  let renderorder: TiledRenderOrder | undefined;
  if (obj.renderorder !== undefined) {
    const value = expectString(obj.renderorder, source, 'renderorder');
    if (!RENDER_ORDERS.includes(value as TiledRenderOrder)) {
      throw new TiledFormatError(source, 'renderorder', `unknown render order "${value}" (expected one of ${RENDER_ORDERS.join(', ')})`);
    }
    renderorder = value as TiledRenderOrder;
  }

  const infinite = expectBoolean(obj.infinite, source, 'infinite');
  const layers = mapArray(obj.layers, source, 'layers', (item, itemPath) => validateTiledLayerData(item, source, itemPath));
  checkTiledLayerInfiniteConsistency(layers, infinite, source, 'layers');

  return {
    type: 'map',
    version,
    tiledversion: optionalString(obj, 'tiledversion', source, ''),
    class: optionalString(obj, 'class', source, ''),
    orientation,
    renderorder,
    width: expectNonNegativeInteger(obj.width, source, 'width'),
    height: expectNonNegativeInteger(obj.height, source, 'height'),
    tilewidth: expectPositiveInteger(obj.tilewidth, source, 'tilewidth'),
    tileheight: expectPositiveInteger(obj.tileheight, source, 'tileheight'),
    infinite,
    compressionlevel: optionalInteger(obj, 'compressionlevel', source, ''),
    nextlayerid: optionalNonNegativeInteger(obj, 'nextlayerid', source, ''),
    nextobjectid: optionalNonNegativeInteger(obj, 'nextobjectid', source, ''),
    backgroundcolor: optionalString(obj, 'backgroundcolor', source, ''),
    layers,
    tilesets: mapArray(obj.tilesets, source, 'tilesets', (item, itemPath) => validateTiledTilesetRefData(item, source, itemPath)),
    properties: validateTiledPropertiesArray(obj.properties, source, 'properties'),
  };
}

/**
 * Validates a standalone `.tsj` tileset file's root object.
 * @internal
 */
export function validateTiledTilesetFileData(raw: unknown, source: string): TiledTilesetData {
  return validateTiledTilesetData(expectObject(raw, source, ''), source, '');
}
