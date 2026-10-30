import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Loadable, Loader } from '#assets/Loader';
import { Color } from '#core/Color';
import {
  asNumberArray,
  asObject,
  asSerializedNode,
  FONT_WEIGHTS,
  readBoolean,
  readEnum,
  readNumber,
  readObject,
  readString,
  REPEAT_MODES,
} from '#core/serialization/read';
import { _resetDefaultSerializers, deserializeTree, migrate, migratePrefab, serializeTree } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedNode } from '#core/serialization/types';
import { Signal } from '#core/Signal';
import { Rectangle } from '#math/Rectangle';
import { type Container } from '#rendering/Container';
import type { Mesh } from '#rendering/mesh/Mesh';
import { type RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { SDF_RADIUS, type Text } from '#rendering/text/Text';
import type { GlyphInfo } from '#rendering/text/types';
import { Texture } from '#rendering/texture/Texture';

// Text construction needs a GlyphAtlasPool; inject a mock so the Text-based
// cases run without a real canvas 2D context (mirrors serialization.test.ts).
const fixedGlyphInfo: GlyphInfo = {
  x: 0,
  y: 0,
  width: 8,
  height: 16,
  advance: 10,
  ascent: 13,
  page: 0,
  uvLeft: 0,
  uvTop: 0,
  uvRight: 0.01,
  uvBottom: 0.02,
};
const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
  onCleared: new Signal(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool));
afterEach(() => resetDefaultGlyphAtlasPool());
afterEach(_resetDefaultSerializers);

/** Minimal Loader stand-in exposing only `_peekResource`/`keyFor` for asset resolution. */
const fakeLoader = (entries: ReadonlyArray<{ type: Loadable; source: string; resource: object }>): Loader =>
  ({
    _peekResource: (type: Loadable, source: string) => entries.find(e => e.type === type && e.source === source)?.resource ?? null,
    keyFor: (resource: object) => {
      const entry = entries.find(e => e.resource === resource);

      return entry ? { type: entry.type, source: entry.source } : null;
    },
  }) as unknown as Loader;

// A SerializedNode is an open bag; the helpers must tolerate arbitrary garbage
// in any field. Cast through `unknown` so the tests can feed wrong-typed values.
const node = (data: Record<string, unknown>): SerializedNode => data as SerializedNode;

describe('serialization validation — read helpers', () => {
  it('readString returns the value or the fallback', () => {
    expect(readString({ a: 'x' }, 'a', 'fb')).toBe('x');
    expect(readString({ a: 42 }, 'a', 'fb')).toBe('fb');
    expect(readString({}, 'a')).toBeUndefined();
  });

  it('readNumber rejects non-numbers, NaN and Infinity', () => {
    expect(readNumber({ a: 5 }, 'a', 0)).toBe(5);
    expect(readNumber({ a: '5' }, 'a', 0)).toBe(0);
    expect(readNumber({ a: NaN }, 'a', 0)).toBe(0);
    expect(readNumber({ a: Infinity }, 'a', 0)).toBe(0);
    expect(readNumber({ a: -Infinity }, 'a', 0)).toBe(0);
    expect(readNumber({}, 'a')).toBeUndefined();
  });

  it('readBoolean only accepts real booleans', () => {
    expect(readBoolean({ a: true }, 'a', false)).toBe(true);
    expect(readBoolean({ a: 'true' }, 'a', false)).toBe(false);
    expect(readBoolean({ a: 1 }, 'a', false)).toBe(false);
  });

  it('readEnum accepts only listed members', () => {
    expect(readEnum({ a: 'bold' }, 'a', FONT_WEIGHTS, 'normal')).toBe('bold');
    expect(readEnum({ a: 'ultraheavy' }, 'a', FONT_WEIGHTS, 'normal')).toBe('normal');
    expect(readEnum({ a: 42 }, 'a', FONT_WEIGHTS, 'normal')).toBe('normal');
    expect(readEnum({ a: 'repeat' }, 'a', REPEAT_MODES)).toBe('repeat');
    expect(readEnum({ a: 'bogus' }, 'a', REPEAT_MODES)).toBeUndefined();
  });

  it('readObject / asObject narrow only plain objects', () => {
    expect(readObject({ a: { k: 1 } }, 'a')).toEqual({ k: 1 });
    expect(readObject({ a: [1, 2] }, 'a')).toBeUndefined();
    expect(readObject({ a: 'x' }, 'a')).toBeUndefined();
    expect(asObject(null)).toBeNull();
    expect(asObject([1])).toBeNull();
    expect(asObject({ k: 1 })).toEqual({ k: 1 });
  });

  it('asSerializedNode requires an object with a string type tag', () => {
    expect(asSerializedNode({ type: 'Sprite' })).toEqual({ type: 'Sprite' });
    expect(asSerializedNode({ notType: 'Sprite' })).toBeNull();
    expect(asSerializedNode({ type: 42 })).toBeNull();
    expect(asSerializedNode(null)).toBeNull();
    expect(asSerializedNode('Sprite')).toBeNull();
    expect(asSerializedNode(42)).toBeNull();
  });

  it('asNumberArray coerces non-finite entries to 0 and rejects non-arrays', () => {
    expect(asNumberArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(asNumberArray([1, NaN, '3', Infinity])).toEqual([1, 0, 0, 0]);
    expect(asNumberArray('123')).toBeNull();
    expect(asNumberArray(null)).toBeNull();
  });
});

describe('serialization validation — node deserialization (untrusted input)', () => {
  it('does not throw when fields hold the wrong type', () => {
    expect(() => deserializeTree(node({ type: 'Sprite', x: 'foo', rotation: {}, visible: 'yes' }))).not.toThrow();
    expect(deserializeTree(node({ type: 'Sprite', x: 'foo' }))).toBeInstanceOf(Sprite);
  });

  it('keeps constructor defaults for mistyped common fields', () => {
    const result = deserializeTree(node({ type: 'Container', x: 'foo', y: null, rotation: [] }));

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.rotation).toBe(0);
  });

  it('falls back to defaults for unknown enum values (fontWeight / align)', () => {
    const text = deserializeTree(node({ type: 'Text', text: 'hi', style: { fontWeight: 'ultraheavy', align: 'sideways' } })) as Text;

    expect(text.style.fontWeight).toBe('normal');
    expect(text.style.align).toBe('left');
  });

  it('drops invalid enum values on a RepeatingSprite, using the renderer defaults', () => {
    const texture = new Texture(Object.assign(document.createElement('canvas'), { width: 16, height: 16 }));
    const loader = fakeLoader([{ type: Texture as unknown as Loadable, source: 'tex', resource: texture }]);
    const sprite = deserializeTree(
      node({ type: 'RepeatingSprite', texture: 'tex', modeX: 'bogus', offsetX: NaN, width: 64 }),
      loader,
    ) as RepeatingSprite;

    expect(sprite.modeX).not.toBe('bogus'); // the bogus value was rejected
    expect(REPEAT_MODES).toContain(sprite.modeX); // …and replaced by a valid renderer default
    expect(Number.isFinite(sprite.offsetX)).toBe(true); // NaN rejected → default
    expect(sprite.width).toBe(64); // valid value preserved
  });

  it('skips non-object children instead of crashing', () => {
    const result = deserializeTree(
      node({ type: 'Container', children: [null, 'x', 42, [], { type: 'Sprite' }, { notType: true }] }),
    ) as Container;

    expect(result.children.length).toBe(1); // only the one valid child node survives
    expect(result.children[0]).toBeInstanceOf(Sprite);
  });

  it('round-trips valid data unchanged (no regression for trusted input)', () => {
    const result = deserializeTree(node({ type: 'Container', x: 10, y: -5, rotation: 1.5, children: [{ type: 'Sprite' }] })) as Container;

    expect(result.x).toBe(10);
    expect(result.y).toBe(-5);
    expect(result.rotation).toBe(1.5);
    expect(result.children.length).toBe(1);
  });
});

describe('serialization validation — top-level frame (migrate)', () => {
  it('throws on a non-object document', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('garbage')).toThrow();
    expect(() => migrate(42)).toThrow();
  });

  it('throws on a missing or invalid root', () => {
    expect(() => migrate({ version: SERIALIZATION_VERSION })).toThrow();
    expect(() => migrate({ version: SERIALIZATION_VERSION, root: 'garbage' })).toThrow();
    expect(() => migrate({ version: SERIALIZATION_VERSION, root: { noType: true } })).toThrow();
  });

  it('throws when the document version is newer than supported', () => {
    expect(() => migrate({ version: SERIALIZATION_VERSION + 1, root: { type: 'Container' } })).toThrow();
  });

  it('rejects a version that is not a non-negative integer, for scenes and prefabs', () => {
    for (const version of [Number.NaN, -1, 1.5, '2', null]) {
      expect(() => migrate({ version, root: { type: 'Container' } })).toThrow(/not a non-negative integer/);
      expect(() => migratePrefab({ version, root: { type: 'Container' } })).toThrow(/not a non-negative integer/);
    }

    expect(migrate({ root: { type: 'Container' } }).version).toBe(0);
  });

  it('accepts a well-formed document and drops an invalid ui layer', () => {
    const ok = migrate({ version: SERIALIZATION_VERSION, root: { type: 'Container' } });
    expect(ok.root.type).toBe('Container');
    expect(ok.ui).toBeUndefined();

    const droppedUi = migrate({ version: SERIALIZATION_VERSION, root: { type: 'Container' }, ui: 'garbage' });
    expect(droppedUi.ui).toBeUndefined(); // invalid ui dropped, not thrown

    const withUi = migrate({ version: SERIALIZATION_VERSION, root: { type: 'Container' }, ui: { type: 'UIRoot' } });
    expect(withUi.ui?.type).toBe('UIRoot');
  });
});

describe('serialization validation — numeric render state', () => {
  it('never stores a non-finite sprite frame', () => {
    const texture = new Texture(Object.assign(document.createElement('canvas'), { width: 16, height: 16 }));
    const loader = fakeLoader([{ type: Texture as unknown as Loadable, source: 'tex', resource: texture }]);
    const sprite = deserializeTree(node({ type: 'Sprite', texture: 'tex', frame: [0, 0, Number.NaN, 10] }), loader) as Sprite;

    expect(Number.isFinite(sprite.textureFrame.width)).toBe(true);
    expect(Number.isFinite(sprite.textureFrame.height)).toBe(true);
    expect(sprite.textureFrame.height).toBe(10); // the valid edges survive
  });

  it('never stores a non-finite text sdfRadius', () => {
    const text = deserializeTree(node({ type: 'Text', text: 'hi', sdfRadius: Number.POSITIVE_INFINITY })) as Text;

    expect(Number.isFinite(text.sdfRadius)).toBe(true);
    expect(text.sdfRadius).toBe(SDF_RADIUS);
  });
});

describe('serialization validation — numeric common fields', () => {
  it('keeps the constructed defaults for non-finite transform fields', () => {
    const container = deserializeTree(
      node({
        type: 'Container',
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        rotation: Number.POSITIVE_INFINITY,
        scaleX: Number.NaN,
        scaleY: Number.NEGATIVE_INFINITY,
        skewX: Number.NaN,
        skewY: Number.POSITIVE_INFINITY,
        originX: Number.NaN,
        originY: Number.POSITIVE_INFINITY,
        zIndex: Number.NaN,
      }),
    );

    expect(container.x).toBe(0);
    expect(container.y).toBe(0);
    expect(container.rotation).toBe(0);
    expect(container.scale.x).toBe(1);
    expect(container.scale.y).toBe(1);
    expect(container.skewX).toBe(0);
    expect(container.skewY).toBe(0);
    expect(container.origin.x).toBe(0);
    expect(container.origin.y).toBe(0);
    expect(container.zIndex).toBe(0);
  });

  it('never stores a non-finite cullArea or clipShape edge', () => {
    const sprite = deserializeTree(
      node({ type: 'Sprite', cullArea: [0, 0, Number.NaN, 1], clipShape: [0, 0, 4, Number.POSITIVE_INFINITY] }),
    ) as Sprite;

    // A non-finite edge collapses to 0, so the rectangle stays finite.
    expect(sprite.cullArea).toMatchObject({ x: 0, y: 0, width: 0, height: 1 });
    expect(sprite.clipShape).toMatchObject({ x: 0, y: 0, width: 4, height: 0 });
  });

  it('falls back to the default tint when a channel is corrupt', () => {
    const sprite = deserializeTree(node({ type: 'Sprite', tint: [1, 2, 3, Number.NaN] })) as Sprite;

    expect(sprite.tint.r).toBe(255);
    expect(sprite.tint.g).toBe(255);
    expect(sprite.tint.b).toBe(255);
    expect(sprite.tint.a).toBe(1);
  });

  it('round-trips a valid full transform and render state unchanged', () => {
    const original = new Sprite();

    original.x = 10;
    original.y = -5;
    original.rotation = 30;
    original.scale.set(2, 0.5);
    original.skewX = 5;
    original.skewY = -5;
    original.origin.set(3, 4);
    original.zIndex = 2;
    original.tabIndex = 1;
    original.cullArea = new Rectangle(1, 2, 3, 4);
    original.clipShape = new Rectangle(5, 6, 7, 8);
    original.tint = new Color(10, 20, 30, 0.5);

    const restored = deserializeTree(serializeTree(original)) as Sprite;

    expect(restored.x).toBe(10);
    expect(restored.y).toBe(-5);
    expect(restored.rotation).toBe(30);
    expect(restored.scale.x).toBe(2);
    expect(restored.scale.y).toBe(0.5);
    expect(restored.skewX).toBe(5);
    expect(restored.skewY).toBe(-5);
    expect(restored.origin.x).toBe(3);
    expect(restored.origin.y).toBe(4);
    expect(restored.zIndex).toBe(2);
    expect(restored.tabIndex).toBe(1);
    expect(restored.cullArea).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect(restored.clipShape).toMatchObject({ x: 5, y: 6, width: 7, height: 8 });
    expect(restored.tint.r).toBe(10);
    expect(restored.tint.a).toBe(0.5);
  });
});

describe('serialization validation — Mesh geometry', () => {
  it('never stores a non-finite vertex or uv value', () => {
    const mesh = deserializeTree(node({ type: 'Mesh', vertices: [0, 0, 10, 0, 'x', Number.POSITIVE_INFINITY] })) as Mesh;

    expect([...mesh.vertices]).toEqual([0, 0, 10, 0, 0, 0]);
  });

  it('rejects an index that a Uint16Array would wrap or truncate', () => {
    const geometry = { type: 'Mesh', vertices: [0, 0, 10, 0, 0, 10] };

    expect(() => deserializeTree(node({ ...geometry, indices: [0, 1, 70_000] }))).toThrow(/indices must be integers/);
    expect(() => deserializeTree(node({ ...geometry, indices: [0, 1, 1.5] }))).toThrow(/indices must be integers/);
    expect(() => deserializeTree(node({ ...geometry, indices: [0, 1, 3] }))).toThrow(/indices must be integers/);
  });

  it('still accepts in-range integer indices', () => {
    const mesh = deserializeTree(node({ type: 'Mesh', vertices: [0, 0, 10, 0, 0, 10], indices: [0, 1, 2] })) as Mesh;

    expect(mesh.indices).toEqual(new Uint16Array([0, 1, 2]));
  });
});
