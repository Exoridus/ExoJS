import { describe, expect, it } from 'vitest';

import type { LdtkData } from '../src/LdtkData';
import { LdtkFormatError, validateLdtkData, validateLdtkLevelData } from '../src/validate';

const SOURCE = 'world.ldtk';

const RAW_MINIMAL = {
  jsonVersion: '1.5.3',
  defaultGridSize: 16,
  defs: {
    tilesets: [{ uid: 1, identifier: 'Atlas', relPath: 'tiles.png', tileGridSize: 16, pxWid: 64, pxHei: 64, spacing: 0, padding: 0 }],
    layers: [
      { uid: 101, identifier: 'Tiles', type: 'Tiles', gridSize: 16, tilesetDefUid: 1 },
      { uid: 102, identifier: 'Walls', type: 'IntGrid', gridSize: 16, intGridValues: [{ value: 1, identifier: 'solid', color: '#ff0000' }] },
    ],
  },
  levels: [
    {
      identifier: 'Level_0',
      uid: 1,
      iid: 'level-iid',
      worldX: 0,
      worldY: 0,
      pxWid: 64,
      pxHei: 64,
      fieldInstances: [{ __identifier: 'difficulty', __type: 'String', __value: 'hard' }],
      layerInstances: [
        {
          __identifier: 'Tiles',
          __type: 'Tiles',
          __cWid: 4,
          __cHei: 4,
          __gridSize: 16,
          layerDefUid: 101,
          levelId: 1,
          visible: true,
          iid: 'layer-iid',
          __tilesetDefUid: 1,
          opacity: 1,
          pxOffsetX: 0,
          pxOffsetY: 0,
          gridTiles: [{ px: [0, 0], src: [0, 0], f: 0, t: 0 }],
        },
      ],
    },
  ],
};

/** Deep-clone the fixture so a test can mutate one field in isolation. */
const withRoot = (mutate: (root: Record<string, any>) => void): unknown => {
  const clone = JSON.parse(JSON.stringify(RAW_MINIMAL)) as Record<string, any>;
  mutate(clone);
  return clone;
};

describe('validateLdtkData — accepts well-formed documents', () => {
  it('returns the same object graph it was given (no rebuild, no stripping)', () => {
    const raw = JSON.parse(JSON.stringify(RAW_MINIMAL)) as Record<string, unknown>;
    (raw as { customField?: string }).customField = 'kept';
    const data: LdtkData = validateLdtkData(raw, SOURCE);
    expect(data).toBe(raw);
    expect((data as unknown as { customField: string }).customField).toBe('kept');
  });

  it('accepts a tileset with a null relPath (embedded / image-less atlas)', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.tilesets[0].relPath = null;
        }),
        SOURCE,
      ),
    ).not.toThrow();
  });

  it('accepts a level with null layerInstances (externalized level)', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances = null;
          root.levels[0].externalRelPath = 'levels/Level_0.ldtkl';
        }),
        SOURCE,
      ),
    ).not.toThrow();
  });

  it('accepts a multi-world document', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.worlds = [
            {
              identifier: 'WorldA',
              iid: 'world-a',
              worldGridWidth: 256,
              worldGridHeight: 256,
              worldLayout: 'Free',
              levels: root.levels,
            },
          ];
          root.levels = [];
        }),
        SOURCE,
      ),
    ).not.toThrow();
  });

  it('accepts a null worldLayout', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.worlds = [{ identifier: 'W', iid: 'w', worldGridWidth: 1, worldGridHeight: 1, worldLayout: null, levels: [] }];
          root.levels = [];
        }),
        SOURCE,
      ),
    ).not.toThrow();
  });

  it('accepts a layer definition with parallax factors and parallaxScaling', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.layers[0].parallaxFactorX = 0.5;
          root.defs.layers[0].parallaxFactorY = -0.25;
          root.defs.layers[0].parallaxScaling = false;
          root.defs.layers[0].pxOffsetX = 3;
          root.defs.layers[0].pxOffsetY = -4;
        }),
        SOURCE,
      ),
    ).not.toThrow();
  });
});

describe('validateLdtkData — rejects malformed documents', () => {
  it('rejects a non-object root', () => {
    expect(() => validateLdtkData(null, SOURCE)).toThrow(LdtkFormatError);
    expect(() => validateLdtkData([], SOURCE)).toThrow(/expected an object/);
  });

  it('rejects an empty document with a typed error naming the missing field', () => {
    expect(() => validateLdtkData({}, SOURCE)).toThrow(LdtkFormatError);
    expect(() => validateLdtkData({}, SOURCE)).toThrow(/jsonVersion/);
  });

  it('reports the source URL and the property path in the message', () => {
    const raw = withRoot(root => {
      root.defs.tilesets[0].tileGridSize = 'big';
    });
    expect(() => validateLdtkData(raw, SOURCE)).toThrow(/world\.ldtk/);
    expect(() => validateLdtkData(raw, SOURCE)).toThrow(/defs\.tilesets\[0\]\.tileGridSize/);
  });

  it('exposes source and path as fields on the thrown error', () => {
    try {
      validateLdtkData(
        withRoot(root => {
          root.levels[0].pxWid = null;
        }),
        SOURCE,
      );
      expect.unreachable('validateLdtkData should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LdtkFormatError);
      expect((error as LdtkFormatError).source).toBe(SOURCE);
      expect((error as LdtkFormatError).path).toBe('levels[0].pxWid');
    }
  });

  it('rejects a missing defs block', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          delete root.defs;
        }),
        SOURCE,
      ),
    ).toThrow(/defs/);
  });

  it('rejects a non-array levels list', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels = {};
        }),
        SOURCE,
      ),
    ).toThrow(/expected an array/);
  });

  it('rejects a tileset with a non-positive tileGridSize (would divide by zero)', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.tilesets[0].tileGridSize = 0;
        }),
        SOURCE,
      ),
    ).toThrow(/expected a positive integer/);
  });

  it('rejects a tileset whose relPath is neither a string nor null', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.tilesets[0].relPath = 7;
        }),
        SOURCE,
      ),
    ).toThrow(/defs\.tilesets\[0\]\.relPath/);
  });

  it('rejects an unknown layer definition type', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.layers[0].type = 'Hexes';
        }),
        SOURCE,
      ),
    ).toThrow(/unknown layer type "Hexes"/);
  });

  it('rejects an unknown layer instance type', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances[0].__type = 'Hexes';
        }),
        SOURCE,
      ),
    ).toThrow(/unknown layer type "Hexes"/);
  });

  it('rejects a level whose layerInstances is neither an array nor null', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances = 3;
        }),
        SOURCE,
      ),
    ).toThrow(/levels\[0\]\.layerInstances/);
  });

  it('rejects a tile whose px is not a pair of numbers', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances[0].gridTiles[0].px = [0];
        }),
        SOURCE,
      ),
    ).toThrow(/gridTiles\[0\]\.px/);
  });

  it('rejects a non-numeric IntGrid CSV entry', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances[0].intGridCsv = [0, 'x'];
        }),
        SOURCE,
      ),
    ).toThrow(/intGridCsv\[1\]/);
  });

  it('rejects an entity instance with a malformed pivot', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].layerInstances[0].__type = 'Entities';
          delete root.levels[0].layerInstances[0].gridTiles;
          root.levels[0].layerInstances[0].entityInstances = [
            {
              __identifier: 'Player',
              __type: 'Player',
              px: [0, 0],
              width: 16,
              height: 16,
              __pivot: [0],
              fieldInstances: [],
              iid: 'e',
              defUid: 1,
            },
          ];
        }),
        SOURCE,
      ),
    ).toThrow(/__pivot/);
  });

  it('rejects a field instance without an identifier', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.levels[0].fieldInstances = [{ __type: 'String', __value: 'x' }];
        }),
        SOURCE,
      ),
    ).toThrow(/fieldInstances\[0\]\.__identifier/);
  });

  it('rejects a non-numeric parallaxFactorX on a layer definition', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.layers[0].parallaxFactorX = 'fast';
        }),
        SOURCE,
      ),
    ).toThrow(/defs\.layers\[0\]\.parallaxFactorX/);
  });

  it('rejects a non-boolean parallaxScaling on a layer definition', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.layers[0].parallaxScaling = 'yes';
        }),
        SOURCE,
      ),
    ).toThrow(/defs\.layers\[0\]\.parallaxScaling/);
  });

  it('rejects a non-numeric definition-level layer offset', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.defs.layers[0].pxOffsetX = 'right';
        }),
        SOURCE,
      ),
    ).toThrow(/defs\.layers\[0\]\.pxOffsetX/);
  });
});

describe('validateLdtkData — field instance __value shapes', () => {
  const withField = (field: Record<string, unknown>): unknown =>
    withRoot(root => {
      root.levels[0].fieldInstances = [field];
    });

  it('accepts a null value for any type (LDtk\'s "not set")', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'spawn', __type: 'Point', __value: null }), SOURCE)).not.toThrow();
  });

  it('accepts a well-formed Point', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'spawn', __type: 'Point', __value: { cx: 3, cy: 4 } }), SOURCE)).not.toThrow();
  });

  it('rejects a Point whose value is not an object', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'spawn', __type: 'Point', __value: 5 }), SOURCE)).toThrow(/fieldInstances\[0\]\.__value/);
  });

  it('rejects a Point carrying x/y instead of cx/cy', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'spawn', __type: 'Point', __value: { x: 3, y: 4 } }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value\.cx/,
    );
  });

  it('rejects a numeric value on a String field', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'name', __type: 'String', __value: 7 }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value.*expected a string/,
    );
  });

  it('rejects a non-integer Int field', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'hp', __type: 'Int', __value: 1.5 }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value.*expected an integer/,
    );
  });

  it('rejects an EntityRef missing one of its iids', () => {
    expect(() =>
      validateLdtkData(withField({ __identifier: 'target', __type: 'EntityRef', __value: { entityIid: 'a', layerIid: 'b', levelIid: 'c' } }), SOURCE),
    ).toThrow(/fieldInstances\[0\]\.__value\.worldIid/);
  });

  it('rejects a Tile with a non-numeric rect', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'icon', __type: 'Tile', __value: { tilesetUid: 1, x: 0, y: 0, w: '16', h: 16 } }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value\.w/,
    );
  });

  it('validates every element of an Array<T> field and points at the bad index', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'waypoints', __type: 'Array<Point>', __value: [{ cx: 0, cy: 0 }, { cx: 1 }] }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value\[1\]\.cy/,
    );
  });

  it.each(['LocalEnum.HeroKind', 'ExternEnum.Faction'] as const)('accepts a string value on a %s field', __type => {
    expect(() => validateLdtkData(withField({ __identifier: 'kind', __type, __value: 'Ranger' }), SOURCE)).not.toThrow();
  });

  it('rejects a non-string value on an enum field', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'kind', __type: 'LocalEnum.HeroKind', __value: 3 }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value.*expected a string/,
    );
  });

  it('points at the bad index of an Array<LocalEnum.T> field', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'resistances', __type: 'Array<LocalEnum.Element>', __value: ['Fire', 7] }), SOURCE)).toThrow(
      /fieldInstances\[0\]\.__value\[1\].*expected a string/,
    );
  });

  it('leaves a field type this package does not model unchecked', () => {
    expect(() => validateLdtkData(withField({ __identifier: 'future', __type: 'SomeFutureType', __value: { anything: true } }), SOURCE)).not.toThrow();
  });

  it('rejects a world entry that is not an object', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.worlds = ['nope'];
          root.levels = [];
        }),
        SOURCE,
      ),
    ).toThrow(/worlds\[0\]/);
  });

  it('rejects an unknown worldLayout', () => {
    expect(() =>
      validateLdtkData(
        withRoot(root => {
          root.worlds = [{ identifier: 'W', iid: 'w', worldGridWidth: 1, worldGridHeight: 1, worldLayout: 'Spiral', levels: [] }];
          root.levels = [];
        }),
        SOURCE,
      ),
    ).toThrow(/unknown world layout "Spiral"/);
  });
});

describe('validateLdtkLevelData — external .ldtkl payloads', () => {
  const EXTERNAL = 'levels/Level_0.ldtkl';

  it('accepts a well-formed external level', () => {
    const level = RAW_MINIMAL.levels[0];
    expect(() => validateLdtkLevelData(level, EXTERNAL)).not.toThrow();
  });

  it('returns the same object it was given', () => {
    const level = JSON.parse(JSON.stringify(RAW_MINIMAL.levels[0])) as unknown;
    expect(validateLdtkLevelData(level, EXTERNAL)).toBe(level);
  });

  it('rejects a malformed external level with the file as source and a root-relative path', () => {
    const level = JSON.parse(JSON.stringify(RAW_MINIMAL.levels[0])) as Record<string, unknown>;
    level.pxHei = 'tall';
    expect(() => validateLdtkLevelData(level, EXTERNAL)).toThrow(LdtkFormatError);
    expect(() => validateLdtkLevelData(level, EXTERNAL)).toThrow(/levels\/Level_0\.ldtkl" at pxHei/);
  });
});
