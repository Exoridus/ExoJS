import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { _resetDefaultSerializers, deserializeTree, migrate } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedNode } from '#core/serialization/types';
import { type Container } from '#rendering/Container';
import { type RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { type Text } from '#rendering/text/Text';
import type { GlyphInfo } from '#rendering/text/types';
import { Texture } from '#rendering/texture/Texture';
import type { Loadable, Loader } from '#resources/Loader';

// Text construction needs a GlyphAtlasPool; inject a mock so the Text-based
// cases run without a real canvas 2D context (mirrors serialization.test.ts).
const fixedGlyphInfo: GlyphInfo = { x: 0, y: 0, width: 8, height: 16, advance: 10, ascent: 13, page: 0, uvLeft: 0, uvTop: 0, uvRight: 0.01, uvBottom: 0.02 };
const mockAtlas: Partial<GlyphAtlas> = { getGlyph: vi.fn(() => fixedGlyphInfo), pages: [] as unknown as GlyphAtlas['pages'], mode: 'sdf', clear: vi.fn() };
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool));
afterEach(() => resetDefaultGlyphAtlasPool());
afterEach(_resetDefaultSerializers);

/** Minimal Loader stand-in exposing only `_peekResource`/`keyFor` for asset resolution. */
function fakeLoader(entries: ReadonlyArray<{ type: Loadable; source: string; resource: object }>): Loader {
  return {
    _peekResource: (type: Loadable, source: string) => entries.find(e => e.type === type && e.source === source)?.resource ?? null,
    keyFor: (resource: object) => {
      const entry = entries.find(e => e.resource === resource);

      return entry ? { type: entry.type, source: entry.source } : null;
    },
  } as unknown as Loader;
}

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
    const sprite = deserializeTree(node({ type: 'RepeatingSprite', texture: 'tex', modeX: 'bogus', offsetX: NaN, width: 64 }), loader) as RepeatingSprite;

    expect(sprite.modeX).not.toBe('bogus'); // the bogus value was rejected
    expect(REPEAT_MODES).toContain(sprite.modeX); // …and replaced by a valid renderer default
    expect(Number.isFinite(sprite.offsetX)).toBe(true); // NaN rejected → default
    expect(sprite.width).toBe(64); // valid value preserved
  });

  it('skips non-object children instead of crashing', () => {
    const result = deserializeTree(node({ type: 'Container', children: [null, 'x', 42, [], { type: 'Sprite' }, { notType: true }] })) as Container;

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
