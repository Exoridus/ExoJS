import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Scene } from '#core/scene/Scene';
import { Prefab } from '#core/serialization/Prefab';
import { registerSerializer } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree, migrate, migratePrefab } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION } from '#core/serialization/types';
import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { SDF_RADIUS, type Text } from '#rendering/text/Text';
import { Label } from '#ui/Label';
import type { Panel } from '#ui/Panel';

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

describe('serialization - source-version context before a style-unit migration', () => {
  it.each([0, 1, SERIALIZATION_VERSION])('passes scene version %i to nested world and UI serializers without changing styles', version => {
    registerProbe();

    const document = deepFreeze({
      version,
      root: {
        type: 'Container',
        children: [
          {
            type: 'Container',
            children: [
              { type: 'Text', text: 'legacy', sdfRadius: 16, style: { outlineWidth: 0.25, shadowBlur: 0.75 } },
              { type: 'Text', text: 'default SDF radius', style: { outlineWidth: 4 } },
              { type: 'VersionProbe', payload: { style: { outlineWidth: 4, shadowBlur: 0.8 }, arbitrary: true } },
            ],
          },
        ],
      },
      ui: {
        type: 'UIRoot',
        children: [
          {
            type: 'Panel',
            width: 120,
            height: 70,
            children: [
              { type: 'Label', text: 'HUD', style: { outlineWidth: 0.125, shadowBlur: 0.5 } },
              { type: 'VersionProbe', payload: { style: { outlineWidth: 9 }, custom: 'unchanged' } },
            ],
          },
        ],
      },
    });

    const scene = new Scene();
    scene.deserialize(document);

    const nested = scene.root.children[0] as Container;
    const text = nested.children[0] as Text;
    const fallbackRadius = nested.children[1] as Text;
    const worldProbe = nested.children[2] as VersionProbe;
    const panel = scene.ui.children[0] as Panel;
    const label = panel.children.find(child => child instanceof Label)!;
    const uiProbe = panel.children.find(child => child instanceof VersionProbe)!;

    expect(observedReadVersions).toEqual([version, version]);
    expect(text.style.outlineWidth).toBe(0.25);
    expect(text.style.shadowBlur).toBe(0.75);
    expect(text.sdfRadius).toBe(16);
    expect(fallbackRadius.style.outlineWidth).toBe(4);
    expect(fallbackRadius.sdfRadius).toBe(SDF_RADIUS);
    expect(label.textStyleOverrides?.outlineWidth).toBe(0.125);
    expect(label.textStyleOverrides?.shadowBlur).toBe(0.5);
    expect(worldProbe.payload).toEqual({ style: { outlineWidth: 4, shadowBlur: 0.8 }, arbitrary: true });
    expect(uiProbe.payload).toEqual({ style: { outlineWidth: 9 }, custom: 'unchanged' });

    // Only existing v0/v1 -> v2 identity compatibility allows a fresh
    // Scene.serialize() to stamp the current version without rewriting values.
    const saved = scene.serialize();
    expect(saved.version).toBe(SERIALIZATION_VERSION);
    expect(((saved.root.children as Array<{ children: unknown[] }>)[0]?.children[0] as { style: unknown }).style).toEqual({
      outlineWidth: 0.25,
      shadowBlur: 0.75,
    });
    expect(document.root.children[0]?.children[0]?.style).toEqual({ outlineWidth: 0.25, shadowBlur: 0.75 });
    scene.destroy();
  });

  it.each([0, 1, SERIALIZATION_VERSION])('retains prefab version %i across fromJSON/toJSON and repeated instantiation', version => {
    registerProbe();

    const source = deepFreeze({
      version,
      root: {
        type: 'Container',
        children: [
          { type: 'Text', text: 'badge', style: { outlineWidth: 0.25, shadowBlur: 0.6 } },
          { type: 'VersionProbe', payload: { style: { outlineWidth: 4 }, kind: 'custom' } },
        ],
      },
    });
    const prefab = Prefab.fromJSON(source);
    const firstSave = prefab.toJSON();
    const restored = Prefab.fromJSON(firstSave);

    expect(firstSave.version).toBe(version);
    expect(restored.toJSON().version).toBe(version);

    for (const instance of [prefab.instantiate(), prefab.instantiate(), restored.instantiate()]) {
      const children = (instance as Container).children;
      expect((children[0] as Text).style.outlineWidth).toBe(0.25);
      expect((children[0] as Text).style.shadowBlur).toBe(0.6);
      expect((children[1] as VersionProbe).payload).toEqual({ style: { outlineWidth: 4 }, kind: 'custom' });
    }

    expect(observedReadVersions).toEqual([version, version, version]);
    expect(prefab.toJSON().version).toBe(version);
    expect(source.root.children[0]?.style).toEqual({ outlineWidth: 0.25, shadowBlur: 0.6 });
  });

  it('uses the current version for a freshly captured prefab and bare-node reads by default', () => {
    registerProbe();

    expect(Prefab.from(new VersionProbe()).toJSON().version).toBe(SERIALIZATION_VERSION);
    deserializeTree({ type: 'VersionProbe' });
    expect(observedReadVersions).toEqual([SERIALIZATION_VERSION]);

    deserializeTree({ type: 'VersionProbe' }, null, undefined, 1);
    expect(observedReadVersions).toEqual([SERIALIZATION_VERSION, 1]);
  });

  it('validates versioned scene and prefab frames without mutating or relabeling legacy styles', () => {
    for (const version of [0, 1, SERIALIZATION_VERSION]) {
      const data = deepFreeze({
        version,
        root: { type: 'Text', style: { outlineWidth: 4, shadowBlur: 0.9 } },
        ui: { type: 'UIRoot', children: [{ type: 'Label', style: { outlineWidth: 0.2 } }] },
      });

      expect(migrate(data).version).toBe(version);
      expect(migratePrefab(data).version).toBe(version);
      expect(migrate(data).root.style).toEqual({ outlineWidth: 4, shadowBlur: 0.9 });
      expect(migratePrefab(data).root.style).toEqual({ outlineWidth: 4, shadowBlur: 0.9 });
    }
  });
});
