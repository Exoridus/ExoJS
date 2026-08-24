// Runtime validation for LDtk JSON (`.ldtk` / `.ldtkl`) documents. Both entry
// points take `unknown` (the result of `JSON.parse`) and either return the same
// value typed as `LdtkData` / `LdtkLevel`, or throw an {@link LdtkFormatError}
// carrying the source URL and a JSON-path-like pointer to the offending value.
//
// Deliberately leaner than the Tiled adapter's `validate.ts`: it checks the
// fields declared as required by this package's `LdtkData` model plus the
// optional ones the adapter actually reads, and nothing else. Field-instance
// `__value`s are checked against the shape their `__type` declares, because the
// conversion pass casts rather than probes; a `__type` this package does not
// model is left alone so a future LDtk field type still loads.
//
// Unlike the Tiled validator, this one asserts in place and hands the caller
// back the very object it was given rather than rebuilding a normalised copy.
// That keeps `LdtkMap.data` byte-for-byte what LDtk wrote, matching the
// "unknown fields are not stripped at parse time" contract documented on
// `LdtkData`.

import type { LdtkData, LdtkLayerType, LdtkLevel, LdtkWorldLayout } from './LdtkData';

/**
 * Thrown when an LDtk JSON document does not match the expected shape.
 * `source` is the URL of the file being parsed; `path` is a JSON-path-like
 * pointer (e.g. `levels[0].layerInstances[1].gridTiles[0].px`) to the
 * offending value, or `''` for the document root.
 */
export class LdtkFormatError extends Error {
  public readonly source: string;
  public readonly path: string;

  public constructor(source: string, path: string, message: string) {
    super(`Invalid LDtk data in "${source}" at ${path === '' ? '<root>' : path}: ${message}`);
    this.name = 'LdtkFormatError';
    this.source = source;
    this.path = path;
  }
}

// ── Primitive helpers ────────────────────────────────────────────────────────

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function joinPath(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path === '' ? key : `${path}.${key}`;
}

function expectObject(value: unknown, source: string, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LdtkFormatError(source, path, `expected an object, got ${describeValue(value)}`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, source: string, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new LdtkFormatError(source, path, `expected an array, got ${describeValue(value)}`);
  }
  return value as readonly unknown[];
}

function expectString(value: unknown, source: string, path: string): string {
  if (typeof value !== 'string') {
    throw new LdtkFormatError(source, path, `expected a string, got ${describeValue(value)}`);
  }
  return value;
}

function expectNumber(value: unknown, source: string, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LdtkFormatError(source, path, `expected a finite number, got ${describeValue(value)}`);
  }
  return value;
}

function expectInteger(value: unknown, source: string, path: string): number {
  const n = expectNumber(value, source, path);
  if (!Number.isInteger(n)) {
    throw new LdtkFormatError(source, path, `expected an integer, got ${n}`);
  }
  return n;
}

function expectNonNegativeInteger(value: unknown, source: string, path: string): number {
  const n = expectInteger(value, source, path);
  if (n < 0) {
    throw new LdtkFormatError(source, path, `expected a non-negative integer, got ${n}`);
  }
  return n;
}

function expectPositiveInteger(value: unknown, source: string, path: string): number {
  const n = expectInteger(value, source, path);
  if (n <= 0) {
    throw new LdtkFormatError(source, path, `expected a positive integer, got ${n}`);
  }
  return n;
}

function expectBoolean(value: unknown, source: string, path: string): void {
  if (typeof value !== 'boolean') {
    throw new LdtkFormatError(source, path, `expected a boolean, got ${describeValue(value)}`);
  }
}

/** `[x, y]` pixel/grid pairs (`px`, `src`, `__pivot`) are always two finite numbers. */
function expectNumberPair(value: unknown, source: string, path: string): void {
  const pair = expectArray(value, source, path);
  if (pair.length !== 2) {
    throw new LdtkFormatError(source, path, `expected a pair of numbers, got ${pair.length} entries`);
  }
  expectNumber(pair[0], source, joinPath(path, 0));
  expectNumber(pair[1], source, joinPath(path, 1));
}

function optionalNumber(obj: Record<string, unknown>, key: string, source: string, path: string): void {
  if (obj[key] !== undefined) expectNumber(obj[key], source, joinPath(path, key));
}

function optionalNonNegativeInteger(obj: Record<string, unknown>, key: string, source: string, path: string): void {
  if (obj[key] !== undefined) expectNonNegativeInteger(obj[key], source, joinPath(path, key));
}

/**
 * LDtk writes an unset optional as an explicit `null` rather than omitting the
 * key, so a validator that only tolerates `undefined` rejects the files the
 * editor actually produces.
 */
function nullableString(obj: Record<string, unknown>, key: string, source: string, path: string): void {
  if (obj[key] !== undefined && obj[key] !== null) expectString(obj[key], source, joinPath(path, key));
}

/** See {@link nullableString}. */
function nullableInteger(obj: Record<string, unknown>, key: string, source: string, path: string): void {
  if (obj[key] !== undefined && obj[key] !== null) expectInteger(obj[key], source, joinPath(path, key));
}

function optionalBoolean(obj: Record<string, unknown>, key: string, source: string, path: string): void {
  if (obj[key] !== undefined) expectBoolean(obj[key], source, joinPath(path, key));
}

function eachEntry(
  value: unknown,
  source: string,
  path: string,
  visit: (item: unknown, itemPath: string) => void,
): void {
  const array = expectArray(value, source, path);
  for (let i = 0; i < array.length; i++) {
    visit(array[i], joinPath(path, i));
  }
}

// ── Definitions ──────────────────────────────────────────────────────────────

const LAYER_TYPES: readonly LdtkLayerType[] = ['Tiles', 'IntGrid', 'Entities', 'AutoLayer'];
const WORLD_LAYOUTS: readonly LdtkWorldLayout[] = ['Free', 'GridVania', 'LinearHorizontal', 'LinearVertical'];

function validateLayerType(value: unknown, source: string, path: string): void {
  const type = expectString(value, source, path);
  if (!LAYER_TYPES.includes(type as LdtkLayerType)) {
    throw new LdtkFormatError(source, path, `unknown layer type "${type}" (expected one of ${LAYER_TYPES.join(', ')})`);
  }
}

function validateTilesetDef(raw: unknown, source: string, path: string): void {
  const def = expectObject(raw, source, path);

  expectInteger(def.uid, source, joinPath(path, 'uid'));
  expectString(def.identifier, source, joinPath(path, 'identifier'));

  // `relPath` is null for an embedded ("embed atlas") tileset, which the loader
  // skips - anything other than a string or null is malformed.
  const relPathPath = joinPath(path, 'relPath');
  if (def.relPath !== null) expectString(def.relPath, source, relPathPath);

  // A zero or negative grid size would make the loader's column arithmetic
  // divide by zero and yield a non-finite tile count.
  expectPositiveInteger(def.tileGridSize, source, joinPath(path, 'tileGridSize'));
  expectNonNegativeInteger(def.pxWid, source, joinPath(path, 'pxWid'));
  expectNonNegativeInteger(def.pxHei, source, joinPath(path, 'pxHei'));
  optionalNonNegativeInteger(def, 'spacing', source, path);
  optionalNonNegativeInteger(def, 'padding', source, path);
}

function validateIntGridValueDef(raw: unknown, source: string, path: string): void {
  const value = expectObject(raw, source, path);

  expectNumber(value.value, source, joinPath(path, 'value'));
  const identifierPath = joinPath(path, 'identifier');
  if (value.identifier !== null) expectString(value.identifier, source, identifierPath);
  expectString(value.color, source, joinPath(path, 'color'));
}

function validateLayerDef(raw: unknown, source: string, path: string): void {
  const def = expectObject(raw, source, path);

  expectInteger(def.uid, source, joinPath(path, 'uid'));
  expectString(def.identifier, source, joinPath(path, 'identifier'));
  validateLayerType(def.type, source, joinPath(path, 'type'));
  expectNonNegativeInteger(def.gridSize, source, joinPath(path, 'gridSize'));
  optionalNumber(def, 'pxOffsetX', source, path);
  optionalNumber(def, 'pxOffsetY', source, path);
  optionalNumber(def, 'parallaxFactorX', source, path);
  optionalNumber(def, 'parallaxFactorY', source, path);
  optionalBoolean(def, 'parallaxScaling', source, path);

  if (def.intGridValues !== undefined) {
    eachEntry(def.intGridValues, source, joinPath(path, 'intGridValues'), (item, itemPath) =>
      validateIntGridValueDef(item, source, itemPath),
    );
  }
}

function validateDefs(raw: unknown, source: string, path: string): void {
  const defs = expectObject(raw, source, path);

  eachEntry(defs.tilesets, source, joinPath(path, 'tilesets'), (item, itemPath) =>
    validateTilesetDef(item, source, itemPath),
  );
  eachEntry(defs.layers, source, joinPath(path, 'layers'), (item, itemPath) =>
    validateLayerDef(item, source, itemPath),
  );
}

// ── Instances ────────────────────────────────────────────────────────────────

/**
 * Validate one field-instance `__value` against the shape its `__type` declares.
 *
 * `null` is LDtk's "not set" and always passes - the conversion drops the
 * property. Everything else is checked here because the conversion pass casts
 * rather than probes: a `Point` whose value is not `{cx, cy}` used to reach the
 * runtime as a point with `undefined` coordinates, indistinguishable from a
 * genuine one until something read it.
 *
 * A `__type` this package does not model (a future LDtk field type, or an
 * `Array<T>` element type of one) is left unchecked: forward compatibility
 * matters more than rejecting a value the conversion already skips.
 */
function validateFieldValue(typeName: string, value: unknown, source: string, path: string): void {
  if (value === null || value === undefined) return;

  switch (typeName) {
    case 'Int':
      expectInteger(value, source, path);
      return;

    case 'Float':
      expectNumber(value, source, path);
      return;

    case 'Bool':
      expectBoolean(value, source, path);
      return;

    case 'String':
    case 'Multilines':
    case 'Color':
    case 'FilePath':
    case 'Enum':
      expectString(value, source, path);
      return;

    case 'Point': {
      const point = expectObject(value, source, path);

      expectNumber(point.cx, source, joinPath(path, 'cx'));
      expectNumber(point.cy, source, joinPath(path, 'cy'));

      return;
    }

    case 'EntityRef': {
      const ref = expectObject(value, source, path);

      for (const key of ['entityIid', 'layerIid', 'levelIid', 'worldIid'] as const) {
        expectString(ref[key], source, joinPath(path, key));
      }

      return;
    }

    case 'Tile': {
      const tile = expectObject(value, source, path);

      expectInteger(tile.tilesetUid, source, joinPath(path, 'tilesetUid'));

      for (const key of ['x', 'y', 'w', 'h'] as const) {
        expectNumber(tile[key], source, joinPath(path, key));
      }

      return;
    }

    default:
      if (typeName.startsWith('Array<') && typeName.endsWith('>')) {
        const elementType = typeName.slice('Array<'.length, -1);

        eachEntry(value, source, path, (item, itemPath) => validateFieldValue(elementType, item, source, itemPath));
      }
  }
}

/**
 * A field instance is validated down to its identifier, declared type and the
 * shape of `__value` that type implies - see {@link validateFieldValue}.
 */
function validateFieldInstance(raw: unknown, source: string, path: string): void {
  const field = expectObject(raw, source, path);

  expectString(field.__identifier, source, joinPath(path, '__identifier'));

  const typeName = expectString(field.__type, source, joinPath(path, '__type'));

  validateFieldValue(typeName, field.__value, source, joinPath(path, '__value'));
}

function validateFieldInstances(value: unknown, source: string, path: string): void {
  eachEntry(value, source, path, (item, itemPath) => validateFieldInstance(item, source, itemPath));
}

function validateTile(raw: unknown, source: string, path: string): void {
  const tile = expectObject(raw, source, path);

  expectNumberPair(tile.px, source, joinPath(path, 'px'));
  expectNumberPair(tile.src, source, joinPath(path, 'src'));
  expectNumber(tile.f, source, joinPath(path, 'f'));
  expectNumber(tile.t, source, joinPath(path, 't'));
}

function validateTiles(value: unknown, source: string, path: string): void {
  eachEntry(value, source, path, (item, itemPath) => validateTile(item, source, itemPath));
}

function validateEntityInstance(raw: unknown, source: string, path: string): void {
  const entity = expectObject(raw, source, path);

  expectString(entity.__identifier, source, joinPath(path, '__identifier'));
  expectString(entity.__type, source, joinPath(path, '__type'));
  expectNumberPair(entity.px, source, joinPath(path, 'px'));
  expectNumber(entity.width, source, joinPath(path, 'width'));
  expectNumber(entity.height, source, joinPath(path, 'height'));
  expectNumberPair(entity.__pivot, source, joinPath(path, '__pivot'));
  expectString(entity.iid, source, joinPath(path, 'iid'));
  expectInteger(entity.defUid, source, joinPath(path, 'defUid'));
  validateFieldInstances(entity.fieldInstances, source, joinPath(path, 'fieldInstances'));
}

function validateLayerInstance(raw: unknown, source: string, path: string): void {
  const layer = expectObject(raw, source, path);

  expectString(layer.__identifier, source, joinPath(path, '__identifier'));
  validateLayerType(layer.__type, source, joinPath(path, '__type'));
  expectNonNegativeInteger(layer.__cWid, source, joinPath(path, '__cWid'));
  expectNonNegativeInteger(layer.__cHei, source, joinPath(path, '__cHei'));
  expectNonNegativeInteger(layer.__gridSize, source, joinPath(path, '__gridSize'));
  expectInteger(layer.layerDefUid, source, joinPath(path, 'layerDefUid'));
  expectInteger(layer.levelId, source, joinPath(path, 'levelId'));
  expectBoolean(layer.visible, source, joinPath(path, 'visible'));
  expectString(layer.iid, source, joinPath(path, 'iid'));

  nullableInteger(layer, '__tilesetDefUid', source, path);
  if (layer.gridTiles !== undefined) {
    validateTiles(layer.gridTiles, source, joinPath(path, 'gridTiles'));
  }
  if (layer.autoLayerTiles !== undefined) {
    validateTiles(layer.autoLayerTiles, source, joinPath(path, 'autoLayerTiles'));
  }
  if (layer.entityInstances !== undefined) {
    eachEntry(layer.entityInstances, source, joinPath(path, 'entityInstances'), (item, itemPath) =>
      validateEntityInstance(item, source, itemPath),
    );
  }
  if (layer.intGridCsv !== undefined) {
    eachEntry(layer.intGridCsv, source, joinPath(path, 'intGridCsv'), (item, itemPath) =>
      expectNumber(item, source, itemPath),
    );
  }
  optionalNumber(layer, 'pxOffsetX', source, path);
  optionalNumber(layer, 'pxOffsetY', source, path);
  optionalNumber(layer, 'opacity', source, path);
}

function validateLevel(raw: unknown, source: string, path: string): void {
  const level = expectObject(raw, source, path);

  expectString(level.identifier, source, joinPath(path, 'identifier'));
  expectInteger(level.uid, source, joinPath(path, 'uid'));
  expectString(level.iid, source, joinPath(path, 'iid'));
  expectNumber(level.worldX, source, joinPath(path, 'worldX'));
  expectNumber(level.worldY, source, joinPath(path, 'worldY'));
  expectNumber(level.pxWid, source, joinPath(path, 'pxWid'));
  expectNumber(level.pxHei, source, joinPath(path, 'pxHei'));
  nullableString(level, 'externalRelPath', source, path);

  // Same explicit-null rule as the fields above: an isolated level can arrive
  // with a null here rather than an empty array.
  if (level.__neighbours !== undefined && level.__neighbours !== null) {
    eachEntry(level.__neighbours, source, joinPath(path, '__neighbours'), (item, itemPath) => {
      const neighbour = expectObject(item, source, itemPath);
      expectString(neighbour.levelIid, source, joinPath(itemPath, 'levelIid'));
      expectString(neighbour.dir, source, joinPath(itemPath, 'dir'));
    });
  }

  if (level.fieldInstances !== undefined) {
    validateFieldInstances(level.fieldInstances, source, joinPath(path, 'fieldInstances'));
  }

  // `null` marks a level whose layers live in a separate `.ldtkl` file; the
  // loader resolves those before conversion.
  const layerInstancesPath = joinPath(path, 'layerInstances');
  if (level.layerInstances !== null) {
    eachEntry(level.layerInstances, source, layerInstancesPath, (item, itemPath) =>
      validateLayerInstance(item, source, itemPath),
    );
  }
}

function validateWorld(raw: unknown, source: string, path: string): void {
  const world = expectObject(raw, source, path);

  expectString(world.identifier, source, joinPath(path, 'identifier'));
  expectString(world.iid, source, joinPath(path, 'iid'));
  expectNumber(world.worldGridWidth, source, joinPath(path, 'worldGridWidth'));
  expectNumber(world.worldGridHeight, source, joinPath(path, 'worldGridHeight'));

  const layoutPath = joinPath(path, 'worldLayout');
  if (world.worldLayout !== null) {
    const layout = expectString(world.worldLayout, source, layoutPath);
    if (!WORLD_LAYOUTS.includes(layout as LdtkWorldLayout)) {
      throw new LdtkFormatError(source, layoutPath, `unknown world layout "${layout}" (expected one of ${WORLD_LAYOUTS.join(', ')} or null)`);
    }
  }

  eachEntry(world.levels, source, joinPath(path, 'levels'), (item, itemPath) =>
    validateLevel(item, source, itemPath),
  );
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * Validate the root of a `.ldtk` file and return it typed as {@link LdtkData}.
 * Throws {@link LdtkFormatError} on any structural problem, naming the source
 * URL and the property path of the offending value.
 * @internal
 */
export function validateLdtkData(raw: unknown, source: string): LdtkData {
  const root = expectObject(raw, source, '');

  expectString(root.jsonVersion, source, 'jsonVersion');
  optionalNumber(root, 'defaultGridSize', source, '');
  validateDefs(root.defs, source, 'defs');

  // Both root shapes carry `levels`: it holds every level in a single-world
  // document and is present-but-empty once `worlds[]` is used.
  eachEntry(root.levels, source, 'levels', (item, itemPath) => validateLevel(item, source, itemPath));

  if (root.worlds !== undefined) {
    eachEntry(root.worlds, source, 'worlds', (item, itemPath) => validateWorld(item, source, itemPath));
  }

  return raw as LdtkData;
}

/**
 * Validate an external `.ldtkl` payload and return it typed as
 * {@link LdtkLevel}. Paths in a thrown {@link LdtkFormatError} are relative to
 * the level object, since that object is the root of the `.ldtkl` file.
 * @internal
 */
export function validateLdtkLevelData(raw: unknown, source: string): LdtkLevel {
  validateLevel(raw, source, '');

  return raw as LdtkLevel;
}
