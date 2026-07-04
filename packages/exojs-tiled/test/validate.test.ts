import { describe, expect, it } from 'vitest';

import {
  checkTiledLayerInfiniteConsistency,
  TiledFormatError,
  validateTiledAnimationFrameData,
  validateTiledLayerData,
  validateTiledMapData,
  validateTiledObjectData,
  validateTiledPropertyData,
  validateTiledTileData,
  validateTiledTilesetFileData,
  validateTiledTilesetRefData,
} from '../src/validate';

const SOURCE = 'level.tmj';

function baseLayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: 'Layer',
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe('TiledFormatError', () => {
  it('formats the message with source and field path', () => {
    const error = new TiledFormatError(SOURCE, 'layers[0].type', 'unknown layer type "foo"');
    expect(error.name).toBe('TiledFormatError');
    expect(error.source).toBe(SOURCE);
    expect(error.path).toBe('layers[0].type');
    expect(error.message).toBe(`Invalid Tiled data in "${SOURCE}" at layers[0].type: unknown layer type "foo"`);
  });

  it('renders the empty path as <root>', () => {
    const error = new TiledFormatError(SOURCE, '', 'expected an object, got string');
    expect(error.message).toBe(`Invalid Tiled data in "${SOURCE}" at <root>: expected an object, got string`);
  });
});

describe('primitive validators — error message shape for each unmet expectation', () => {
  it('describes a null value as "null" (not "object")', () => {
    expect(() => validateTiledMapData(null, SOURCE)).toThrow(/expected an object, got null/);
  });

  it('expectArray throws when given a non-array', () => {
    const base = { id: 1, name: '', type: '', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true };
    expect(() => validateTiledObjectData({ ...base, polygon: 'not-an-array' }, SOURCE, '')).toThrow(/expected an array, got string/);
  });

  it('expectString throws when given a non-string', () => {
    expect(() => validateTiledPropertyData({ name: 42, value: 'x' }, SOURCE, '')).toThrow(/expected a string, got number/);
  });

  it('expectInteger throws when given a non-integer number', () => {
    expect(() => validateTiledAnimationFrameData({ tileid: 1.5, duration: 100 }, SOURCE, '')).toThrow(/expected an integer, got 1.5/);
  });

  it('expectNonNegativeInteger throws when given a negative integer', () => {
    expect(() => validateTiledAnimationFrameData({ tileid: -1, duration: 100 }, SOURCE, '')).toThrow(/expected a non-negative integer, got -1/);
  });
});

describe('validateTiledPropertyData', () => {
  it('parses a string property, defaulting type to "string"', () => {
    expect(validateTiledPropertyData({ name: 'label', value: 'hello' }, SOURCE, '')).toEqual({
      name: 'label',
      type: 'string',
      propertytype: undefined,
      value: 'hello',
    });
  });

  it('parses int, float, bool, color, file, and object properties', () => {
    expect(validateTiledPropertyData({ name: 'hp', type: 'int', value: 10 }, SOURCE, '')).toMatchObject({ type: 'int', value: 10 });
    expect(validateTiledPropertyData({ name: 'speed', type: 'float', value: 1.5 }, SOURCE, '')).toMatchObject({ type: 'float', value: 1.5 });
    expect(validateTiledPropertyData({ name: 'solid', type: 'bool', value: true }, SOURCE, '')).toMatchObject({ type: 'bool', value: true });
    expect(validateTiledPropertyData({ name: 'tint', type: 'color', value: '#ff0000ff' }, SOURCE, '')).toMatchObject({ type: 'color', value: '#ff0000ff' });
    expect(validateTiledPropertyData({ name: 'sound', type: 'file', value: 'sfx/hit.wav' }, SOURCE, '')).toMatchObject({ type: 'file', value: 'sfx/hit.wav' });
    expect(validateTiledPropertyData({ name: 'target', type: 'object', value: 7 }, SOURCE, '')).toMatchObject({ type: 'object', value: 7 });
  });

  it('parses a class property with nested members and propertytype', () => {
    const result = validateTiledPropertyData(
      { name: 'stats', type: 'class', propertytype: 'Stats', value: { hp: 10, regen: { rate: 0.5 } } },
      SOURCE,
      '',
    );
    expect(result).toEqual({
      name: 'stats',
      type: 'class',
      propertytype: 'Stats',
      value: { hp: 10, regen: { rate: 0.5 } },
    });
  });

  it('throws on an unknown property type', () => {
    expect(() => validateTiledPropertyData({ name: 'x', type: 'vector', value: 1 }, SOURCE, 'properties[0]')).toThrow(TiledFormatError);
    expect(() => validateTiledPropertyData({ name: 'x', type: 'vector', value: 1 }, SOURCE, 'properties[0]')).toThrow(/unknown property type "vector"/);
  });

  it('throws when the value does not match the declared type', () => {
    expect(() => validateTiledPropertyData({ name: 'hp', type: 'int', value: 'ten' }, SOURCE, '')).toThrow(TiledFormatError);
    expect(() => validateTiledPropertyData({ name: 'solid', type: 'bool', value: 'yes' }, SOURCE, '')).toThrow(TiledFormatError);
  });

  it('throws when the class value contains an unsupported member type', () => {
    expect(() => validateTiledPropertyData({ name: 'stats', type: 'class', value: { hp: [1, 2] } }, SOURCE, '')).toThrow(TiledFormatError);
  });

  it('throws on a non-object input', () => {
    expect(() => validateTiledPropertyData('nope', SOURCE, 'properties[0]')).toThrow(/expected an object, got string/);
  });
});

describe('validateTiledAnimationFrameData', () => {
  it('parses a valid frame', () => {
    expect(validateTiledAnimationFrameData({ tileid: 3, duration: 100 }, SOURCE, '')).toEqual({ tileid: 3, duration: 100 });
  });

  it('throws when a field is missing', () => {
    expect(() => validateTiledAnimationFrameData({ tileid: 3 }, SOURCE, 'animation[0]')).toThrow(TiledFormatError);
  });
});

describe('validateTiledObjectData', () => {
  const base = { id: 1, name: '', type: '', x: 0, y: 0, width: 16, height: 16, rotation: 0, visible: true };

  it('parses a plain rectangle object', () => {
    const result = validateTiledObjectData(base, SOURCE, '');
    expect(result.point).toBeUndefined();
    expect(result.ellipse).toBeUndefined();
    expect(result.gid).toBeUndefined();
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
  });

  it('parses a point object', () => {
    const result = validateTiledObjectData({ ...base, point: true }, SOURCE, '');
    expect(result.point).toBe(true);
  });

  it('parses an ellipse object', () => {
    const result = validateTiledObjectData({ ...base, ellipse: true }, SOURCE, '');
    expect(result.ellipse).toBe(true);
  });

  it('parses polygon and polyline point arrays', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(validateTiledObjectData({ ...base, polygon: points }, SOURCE, '').polygon).toEqual(points);
    expect(validateTiledObjectData({ ...base, polyline: points }, SOURCE, '').polyline).toEqual(points);
  });

  it('parses a text object with valid alignment values', () => {
    const result = validateTiledObjectData({ ...base, text: { text: 'Hello', halign: 'center', valign: 'top' } }, SOURCE, '');
    expect(result.text).toEqual({
      text: 'Hello',
      bold: undefined,
      color: undefined,
      fontfamily: undefined,
      halign: 'center',
      italic: undefined,
      kerning: undefined,
      pixelsize: undefined,
      strikeout: undefined,
      underline: undefined,
      valign: 'top',
      wrap: undefined,
    });
  });

  it('throws on an unknown text alignment value', () => {
    expect(() => validateTiledObjectData({ ...base, text: { text: 'Hello', halign: 'middle' } }, SOURCE, '')).toThrow(/unknown horizontal alignment "middle"/);
    expect(() => validateTiledObjectData({ ...base, text: { text: 'Hello', valign: 'baseline' } }, SOURCE, '')).toThrow(/unknown vertical alignment "baseline"/);
  });

  it('parses a tile object referencing a gid', () => {
    expect(validateTiledObjectData({ ...base, gid: 5 }, SOURCE, '').gid).toBe(5);
  });

  it('parses a template reference and properties', () => {
    const result = validateTiledObjectData({ ...base, template: 'templates/tree.tx', properties: [{ name: 'hp', type: 'int', value: 3 }] }, SOURCE, '');
    expect(result.template).toBe('templates/tree.tx');
    expect(result.properties).toEqual([{ name: 'hp', type: 'int', propertytype: undefined, value: 3 }]);
  });
});

describe('validateTiledLayerData — tile layers', () => {
  it('parses a finite tile layer with "data"', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 2, height: 2, data: [1, 2, 3, 4] }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'tilelayer', width: 2, height: 2, data: [1, 2, 3, 4], chunks: undefined });
  });

  it('parses an infinite tile layer with "chunks"', () => {
    const chunks = [{ x: 0, y: 0, width: 16, height: 16, data: new Array(256).fill(0) }];
    const result = validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 0, height: 0, chunks }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'tilelayer', data: undefined });
    expect(result.type === 'tilelayer' && result.chunks?.[0]).toEqual(chunks[0]);
  });

  it('throws when both "data" and "chunks" are present', () => {
    expect(() =>
      validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1, data: [1], chunks: [] }), SOURCE, 'layers[0]'),
    ).toThrow(/has both "data" and "chunks"/);
  });

  it('throws when neither "data" nor "chunks" is present', () => {
    expect(() => validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1 }), SOURCE, 'layers[0]')).toThrow(
      /has neither "data" nor "chunks"/,
    );
  });

  it('throws on compressed tile layer data', () => {
    expect(() =>
      validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1, data: [1], compression: 'zlib' }), SOURCE, 'layers[0]'),
    ).toThrow(/compressed tile layer data is not supported/);
  });

  it('throws on an unsupported encoding', () => {
    expect(() =>
      validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1, data: 'AAAA', encoding: 'base64' }), SOURCE, 'layers[0]'),
    ).toThrow(/unsupported tile layer encoding "base64"/);
  });

  it('accepts the "csv" encoding', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1, data: [1], encoding: 'csv' }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'tilelayer', data: [1] });
  });
});

describe('validateTiledLayerData — object layers', () => {
  const object = { id: 1, name: '', type: '', x: 0, y: 0, width: 8, height: 8, rotation: 0, visible: true };

  it('defaults draworder to "topdown"', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'objectgroup', objects: [object] }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'objectgroup', draworder: undefined, objects: [expect.objectContaining({ id: 1 })] });
  });

  it('parses an explicit "index" draworder', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'objectgroup', draworder: 'index', objects: [] }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'objectgroup', draworder: 'index' });
  });

  it('throws on an unknown draworder', () => {
    expect(() => validateTiledLayerData(baseLayer({ type: 'objectgroup', draworder: 'bottomup', objects: [] }), SOURCE, 'layers[0]')).toThrow(
      /unknown draw order "bottomup"/,
    );
  });
});

describe('validateTiledLayerData — image layers', () => {
  it('parses an image layer with repeat flags', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'imagelayer', image: 'bg.png', repeatx: true, repeaty: false }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'imagelayer', image: 'bg.png', repeatx: true, repeaty: false });
  });

  it('defaults a missing image to an empty string', () => {
    const result = validateTiledLayerData(baseLayer({ type: 'imagelayer' }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'imagelayer', image: '' });
  });
});

describe('validateTiledLayerData — group layers', () => {
  it('recursively parses nested layers', () => {
    const child = baseLayer({ id: 2, type: 'tilelayer', width: 1, height: 1, data: [1] });
    const result = validateTiledLayerData(baseLayer({ type: 'group', layers: [child] }), SOURCE, 'layers[0]');
    expect(result).toMatchObject({ type: 'group', layers: [expect.objectContaining({ type: 'tilelayer', id: 2 })] });
  });

  it('throws on an unknown layer type', () => {
    expect(() => validateTiledLayerData(baseLayer({ type: 'wangset' }), SOURCE, 'layers[0]')).toThrow(/unknown layer type "wangset"/);
  });
});

describe('checkTiledLayerInfiniteConsistency', () => {
  function tileLayer(extra: Record<string, unknown>): import('../src/data').TiledLayerData {
    return validateTiledLayerData(baseLayer({ type: 'tilelayer', width: 1, height: 1, ...extra }), SOURCE, 'layers[0]');
  }

  it('accepts a finite tile layer with "data" on a finite map', () => {
    expect(() => checkTiledLayerInfiniteConsistency([tileLayer({ data: [1] })], false, SOURCE, 'layers')).not.toThrow();
  });

  it('throws when a finite map has a tile layer with "chunks"', () => {
    const layer = tileLayer({ chunks: [] });
    expect(() => checkTiledLayerInfiniteConsistency([layer], false, SOURCE, 'layers')).toThrow(/has "chunks" on a finite map/);
  });

  it('accepts an infinite tile layer with "chunks" on an infinite map', () => {
    expect(() => checkTiledLayerInfiniteConsistency([tileLayer({ chunks: [] })], true, SOURCE, 'layers')).not.toThrow();
  });

  it('throws when an infinite map has a tile layer with "data"', () => {
    const layer = tileLayer({ data: [1] });
    expect(() => checkTiledLayerInfiniteConsistency([layer], true, SOURCE, 'layers')).toThrow(/missing "chunks" on an infinite map/);
  });

  it('recurses into group layers', () => {
    const inconsistentChild = tileLayer({ chunks: [] });
    const group = validateTiledLayerData(baseLayer({ type: 'group', layers: [inconsistentChild] }), SOURCE, 'layers[0]');
    expect(() => checkTiledLayerInfiniteConsistency([group], false, SOURCE, 'layers')).toThrow(/has "chunks" on a finite map/);
  });

  it('skips a hole in the layers array (defensive; a genuine sparse hole, not producible by JSON.parse)', () => {
    const layers: import('../src/data').TiledLayerData[] = new Array(2) as import('../src/data').TiledLayerData[];
    layers[1] = tileLayer({ data: [1] });
    expect(() => checkTiledLayerInfiniteConsistency(layers, false, SOURCE, 'layers')).not.toThrow();
  });
});

describe('validateTiledTileData', () => {
  it('parses a minimal tile (only id)', () => {
    expect(validateTiledTileData({ id: 0 }, SOURCE, 'tiles[0]')).toEqual({
      id: 0,
      type: undefined,
      properties: undefined,
      animation: undefined,
      objectgroup: undefined,
      image: undefined,
      imagewidth: undefined,
      imageheight: undefined,
    });
  });

  it('parses a collection-of-images tile with dimensions', () => {
    const result = validateTiledTileData({ id: 2, image: 'tile2.png', imagewidth: 16, imageheight: 16 }, SOURCE, 'tiles[2]');
    expect(result).toMatchObject({ id: 2, image: 'tile2.png', imagewidth: 16, imageheight: 16 });
  });

  it('parses animation frames and properties', () => {
    const result = validateTiledTileData(
      { id: 1, animation: [{ tileid: 1, duration: 100 }, { tileid: 2, duration: 100 }], properties: [{ name: 'solid', type: 'bool', value: true }] },
      SOURCE,
      'tiles[1]',
    );
    expect(result.animation).toHaveLength(2);
    expect(result.properties).toEqual([{ name: 'solid', type: 'bool', propertytype: undefined, value: true }]);
  });

  it('parses a collision objectgroup', () => {
    const result = validateTiledTileData({ id: 0, objectgroup: baseLayer({ type: 'objectgroup', objects: [] }) }, SOURCE, 'tiles[0]');
    expect(result.objectgroup).toMatchObject({ type: 'objectgroup', objects: [] });
  });

  it('throws when the objectgroup is not an object layer', () => {
    expect(() => validateTiledTileData({ id: 0, objectgroup: baseLayer({ type: 'tilelayer', width: 0, height: 0, data: [] }) }, SOURCE, 'tiles[0]')).toThrow(
      /expected an "objectgroup" layer, got "tilelayer"/,
    );
  });
});

describe('validateTiledTilesetRefData', () => {
  it('parses an external tileset reference', () => {
    expect(validateTiledTilesetRefData({ firstgid: 1, source: 'tiles.tsj' }, SOURCE, 'tilesets[0]')).toEqual({ firstgid: 1, source: 'tiles.tsj' });
  });

  it('parses an embedded tileset reference', () => {
    const result = validateTiledTilesetRefData(
      { firstgid: 1, name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 },
      SOURCE,
      'tilesets[0]',
    );
    expect(result).toMatchObject({ firstgid: 1, name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2 });
  });

  it('throws when firstgid is missing', () => {
    expect(() => validateTiledTilesetRefData({ source: 'tiles.tsj' }, SOURCE, 'tilesets[0]')).toThrow(TiledFormatError);
  });

  it('throws when firstgid is not positive', () => {
    expect(() => validateTiledTilesetRefData({ firstgid: 0, source: 'tiles.tsj' }, SOURCE, 'tilesets[0]')).toThrow(/expected a positive integer/);
  });
});

describe('validateTiledTilesetFileData', () => {
  it('parses a standalone .tsj root object', () => {
    const result = validateTiledTilesetFileData({ name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2, image: 'tiles.png' }, 'tiles.tsj');
    expect(result).toMatchObject({ name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2, image: 'tiles.png' });
  });

  it('throws on a non-object root', () => {
    expect(() => validateTiledTilesetFileData([], 'tiles.tsj')).toThrow(/expected an object, got an array/);
  });

  it('parses wangsets with colors and wangtiles', () => {
    const result = validateTiledTilesetFileData({
      name: 'terrain', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2,
      wangsets: [{
        name: 'ground',
        type: 'corner',
        tile: -1,
        colors: [{ name: 'grass', color: '#00ff00', tile: 0, probability: 1 }],
        wangtiles: [{ tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] }],
      }],
    }, 'terrain.tsj');
    expect(result.wangsets).toHaveLength(1);
    expect(result.wangsets?.[0]).toMatchObject({ name: 'ground', type: 'corner', tile: -1 });
    expect(result.wangsets?.[0].colors[0]).toEqual({ name: 'grass', color: '#00ff00', tile: 0, probability: 1 });
    expect(result.wangsets?.[0].wangtiles[0]).toEqual({ tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] });
  });
});

describe('validateTiledMapData', () => {
  const validMap = {
    type: 'map',
    version: '1.10',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: 1,
    height: 1,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    layers: [baseLayer({ type: 'tilelayer', width: 1, height: 1, data: [1] })],
    tilesets: [{ firstgid: 1, name: 'tiles', tilewidth: 16, tileheight: 16, tilecount: 1, columns: 1 }],
  };

  it('parses a complete map document', () => {
    const result = validateTiledMapData(validMap, SOURCE);
    expect(result).toMatchObject({
      type: 'map',
      version: '1.10',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      width: 1,
      height: 1,
      tilewidth: 16,
      tileheight: 16,
      infinite: false,
    });
    expect(result.layers).toHaveLength(1);
    expect(result.tilesets).toHaveLength(1);
  });

  it('throws when "type" is not "map"', () => {
    expect(() => validateTiledMapData({ ...validMap, type: 'tileset' }, SOURCE)).toThrow(/expected "map", got "tileset"/);
  });

  it('throws on an unknown orientation', () => {
    expect(() => validateTiledMapData({ ...validMap, orientation: 'circular' }, SOURCE)).toThrow(/unknown orientation "circular"/);
  });

  it('throws on an unknown render order', () => {
    expect(() => validateTiledMapData({ ...validMap, renderorder: 'center-out' }, SOURCE)).toThrow(/unknown render order "center-out"/);
  });

  it('throws when a finite map has an infinite-style tile layer', () => {
    const inconsistent = {
      ...validMap,
      layers: [baseLayer({ type: 'tilelayer', width: 0, height: 0, chunks: [] })],
    };
    expect(() => validateTiledMapData(inconsistent, SOURCE)).toThrow(/has "chunks" on a finite map/);
  });

  it('throws on a non-object root', () => {
    expect(() => validateTiledMapData('not a map', SOURCE)).toThrow(/expected an object, got string/);
  });

  it('parses a numeric compressionlevel', () => {
    const result = validateTiledMapData({ ...validMap, compressionlevel: 6 }, SOURCE);
    expect(result.compressionlevel).toBe(6);
  });

  it('throws when version is neither a string nor a number', () => {
    expect(() => validateTiledMapData({ ...validMap, version: true }, SOURCE)).toThrow(/expected a string or number, got boolean/);
  });
});
