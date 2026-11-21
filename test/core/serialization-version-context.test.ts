import { afterEach, beforeEach, expect, vi } from 'vitest';

import { Scene } from '#core/scene/Scene';
import { Prefab } from '#core/serialization/Prefab';
import { registerSerializer } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION } from '#core/serialization/types';
import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => ({
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
  })),
  pages: [] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
  onCleared: new Signal(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool));
afterEach(() => resetDefaultGlyphAtlasPool());
afterEach(_resetDefaultSerializers);

// Frozen documents make accidental in-place migrations fail immediately.
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
};

class VersionProbe extends Container {
  public payload: unknown = null;
}

const observedReadVersions: number[] = [];

const registerProbe = (): void => {
  observedReadVersions.length = 0;
  registerSerializer('VersionProbe', VersionProbe, {
    write: node => ({ payload: node.payload }),
    read: (data, ctx) => {
      observedReadVersions.push(ctx.version);
      const node = new VersionProbe();
      node.payload = data.payload;

      return node;
    },
  });
};

test('passes format 4 to nested scene and prefab readers and preserves pixel values', () => {
  registerProbe();
  const root = {
    type: 'Container',
    children: [
      { type: 'VersionProbe', payload: { outlineWidth: 0.25 } },
      { type: 'Text', style: { outlineWidth: 12, shadowBlur: 0.75 } },
      { type: 'Label', style: { outlineWidth: 0.125 } },
    ],
  };
  const document = deepFreeze({ version: SERIALIZATION_VERSION, root });
  new Scene().deserialize(document);
  const prefab = Prefab.fromJSON(document);
  expect(prefab.toJSON()).toEqual(document);
  expect(observedReadVersions).toEqual([4]);

  for (const tree of [prefab.instantiate(), deserializeTree(root)]) {
    const [probe, text, label] = (tree as Container).children;
    expect(probe).toHaveProperty('payload', { outlineWidth: 0.25 });
    expect(text).toHaveProperty('style.outlineWidth', 12);
    expect(text).toHaveProperty('style.shadowBlur', 0.75);
    expect(label).toHaveProperty('textStyleOverrides.outlineWidth', 0.125);
  }

  expect(observedReadVersions).toEqual([4, 4, 4]);
});
