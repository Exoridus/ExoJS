import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Color } from '#core/Color';
import { Scene } from '#core/Scene';
import { SceneNode } from '#core/SceneNode';
import { Prefab } from '#core/serialization/Prefab';
import { defaultSerializationRegistry, registerSerializer, SerializationRegistry } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree, serializeTree } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedNode } from '#core/serialization/types';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import type { GlyphAtlas } from '#rendering/text/GlyphAtlas';
import type { GlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import type { GlyphInfo } from '#rendering/text/types';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { Video } from '#rendering/video/Video';
import type { Loadable, Loader } from '#resources/Loader';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { Panel } from '#ui/Panel';
import { ProgressBar } from '#ui/ProgressBar';
import { Stack } from '#ui/Stack';

/** Build a canvas-backed texture with known dimensions (matches the unit-test convention). */
function createTexture(width: number, height: number): Texture {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
}

// Text uses GlyphAtlasPool internally; inject a mock pool so Text construction
// works without a real canvas 2D context (mirrors test/rendering/text/text.test.ts).
const fixedGlyphInfo: GlyphInfo = { x: 0, y: 0, width: 8, height: 16, advance: 10, ascent: 13, page: 0, uvLeft: 0, uvTop: 0, uvRight: 0.01, uvBottom: 0.02 };
const mockPage = {
  texture: {
    width: 1024,
    height: 1024,
    version: 1,
    source: null,
    scaleMode: 0,
    wrapMode: 0,
    premultiplyAlpha: false,
    generateMipMap: false,
    flipY: false,
    addDestroyListener: () => mockPage.texture,
    removeDestroyListener: () => mockPage.texture,
    destroy: () => undefined,
  },
  index: 0,
  mode: 'sdf' as const,
};
const mockAtlas: Partial<GlyphAtlas> = {
  getGlyph: vi.fn(() => fixedGlyphInfo),
  pages: [mockPage] as unknown as GlyphAtlas['pages'],
  mode: 'sdf',
  clear: vi.fn(),
};
const mockPool = { getAtlas: vi.fn(() => mockAtlas) };

beforeEach(() => resetDefaultGlyphAtlasPool(mockPool as unknown as GlyphAtlasPool));
afterEach(() => resetDefaultGlyphAtlasPool());

// Tests here register serializers on the process-wide default registry and lazy-init
// the core serializers; reset both module states after each test so registrations do
// not leak into sibling suites (e.g. the `Marker` custom-serializer test).
afterEach(_resetDefaultSerializers);

/**
 * Minimal {@link Loader} stand-in implementing only the two methods the
 * serialization context calls — keeps the round-trip tests free of real asset
 * loading while exercising the exact asset-reference wiring.
 */
function fakeLoader(entries: ReadonlyArray<{ type: Loadable; source: string; resource: object }>): Loader {
  return {
    keyFor(resource: object) {
      const hit = entries.find(entry => entry.resource === resource);

      return hit ? { type: hit.type, source: hit.source } : null;
    },
    peek(type: Loadable, alias: string) {
      const hit = entries.find(entry => entry.type === type && entry.source === alias);

      return hit ? hit.resource : null;
    },
  } as unknown as Loader;
}

describe('serialization — registry', () => {
  it('resolves a registered type by name and by node (prototype walk)', () => {
    const registry = new SerializationRegistry();
    const serializer = { write: () => ({}), read: () => new Container() };

    registry.register('Container', Container, serializer);

    expect(registry.hasType('Container')).toBe(true);
    expect(registry.resolveByName('Container')?.serializer).toBe(serializer);
    // A subclass with no own registration inherits the nearest base serializer.
    class MyContainer extends Container {}
    expect(registry.resolveByNode(new MyContainer())?.typeName).toBe('Container');
  });

  it('throws when a type name is re-registered for a different constructor', () => {
    const registry = new SerializationRegistry();

    registry.register('Thing', Container, { write: () => ({}), read: () => new Container() });

    expect(() => registry.register('Thing', Sprite, { write: () => ({}), read: () => new Sprite(null) })).toThrow(/already registered/);
  });
});

describe('serialization — common fields round-trip', () => {
  it('omits defaults and restores transform/visual state', () => {
    const node = new Container();

    node.name = 'world';
    node.setPosition(100, 50);
    node.setRotation(45);
    node.setScale(2, 3);
    node.setSkew(10, 0);
    node.setOrigin(4, 5);
    node.visible = false;
    node.zIndex = 7;
    node.cullable = false;

    const data = serializeTree(node);

    expect(data).toMatchObject({
      type: 'Container',
      name: 'world',
      x: 100,
      y: 50,
      rotation: 45,
      scaleX: 2,
      scaleY: 3,
      skewX: 10,
      originX: 4,
      originY: 5,
      visible: false,
      zIndex: 7,
      cullable: false,
    });
    // skewY defaulted to 0 → omitted.
    expect(data.skewY).toBeUndefined();

    const restored = deserializeTree(data) as Container;

    expect(restored.name).toBe('world');
    expect(restored.x).toBe(100);
    expect(restored.y).toBe(50);
    expect(restored.rotation).toBe(45);
    expect(restored.scale.x).toBe(2);
    expect(restored.scale.y).toBe(3);
    expect(restored.skewX).toBe(10);
    expect(restored.origin.x).toBe(4);
    expect(restored.origin.y).toBe(5);
    expect(restored.visible).toBe(false);
    expect(restored.zIndex).toBe(7);
    expect(restored.cullable).toBe(false);
  });

  it('serializes a default node to just its type tag', () => {
    expect(serializeTree(new Container())).toEqual({ type: 'Container' });
  });
});

describe('serialization — Container children', () => {
  it('round-trips a nested tree preserving order and depth', () => {
    const root = new Container();
    const child = new Container();

    child.name = 'child';
    child.setPosition(10, 20);
    root.addChild(child);
    root.addChild(new Container());

    const data = serializeTree(root);
    const restored = deserializeTree(data) as Container;

    expect(restored.children).toHaveLength(2);
    const [first] = restored.children;
    expect(first.name).toBe('child');
    expect(first.x).toBe(10);
    expect(first.y).toBe(20);
  });
});

describe('serialization — Sprite', () => {
  it('round-trips tint, blend mode and texture reference via the loader', () => {
    const texture = createTexture(64, 48);
    const loader = fakeLoader([{ type: Texture, source: 'hero.png', resource: texture }]);

    const sprite = new Sprite(texture);
    sprite.tint = new Color(255, 0, 0, 0.5);
    sprite.blendMode = BlendModes.Additive;

    const data = serializeTree(sprite, loader);

    expect(data.type).toBe('Sprite');
    expect(data.texture).toBe('hero.png');
    expect(data.tint).toEqual([255, 0, 0, 0.5]);
    expect(data.blendMode).toBe(BlendModes.Additive);

    const restored = deserializeTree(data, loader) as Sprite;

    expect(restored.texture).toBe(texture);
    expect(restored.tint.r).toBe(255);
    expect(restored.tint.g).toBe(0);
    expect(restored.tint.a).toBe(0.5);
    expect(restored.blendMode).toBe(BlendModes.Additive);
  });

  it('emits a sub-frame only for spritesheet regions and restores it', () => {
    const texture = createTexture(128, 128);
    const loader = fakeLoader([{ type: Texture, source: 'sheet.png', resource: texture }]);

    const sprite = new Sprite(texture);
    sprite.setTextureFrame(new Rectangle(32, 0, 32, 32));

    const data = serializeTree(sprite, loader);
    expect(data.frame).toEqual([32, 0, 32, 32]);

    const restored = deserializeTree(data, loader) as Sprite;
    expect(restored.textureFrame.x).toBe(32);
    expect(restored.textureFrame.width).toBe(32);
  });

  it('omits an unkeyed texture reference', () => {
    const texture = createTexture(8, 8);
    const sprite = new Sprite(texture);

    // No loader → texture is unkeyed → reference omitted, no throw.
    const data = serializeTree(sprite);
    expect(data.texture).toBeUndefined();
  });
});

describe('serialization — Text', () => {
  it('round-trips the string and non-default style fields', () => {
    const text = new Text('Score: 0', { fontSize: 24, fontFamily: 'Roboto', fillColor: new Color(10, 20, 30, 1) });

    const data = serializeTree(text);

    expect(data.type).toBe('Text');
    expect(data.text).toBe('Score: 0');
    expect(data.style).toMatchObject({ fontSize: 24, fontFamily: 'Roboto', fillColor: [10, 20, 30, 1] });

    const restored = deserializeTree(data) as Text;

    expect(restored.text).toBe('Score: 0');
    expect(restored.style.fontSize).toBe(24);
    expect(restored.style.fontFamily).toBe('Roboto');
    expect(restored.style.fillColor.r).toBe(10);
  });
});

describe('serialization — custom serializer', () => {
  it('supports registering a subclass serializer on the default registry', () => {
    class Marker extends SceneNode {
      public kind = 'spawn';
    }

    registerSerializer('Marker', Marker, {
      write: node => ({ kind: node.kind }),
      read: data => {
        const marker = new Marker();
        marker.kind = String(data.kind);
        return marker;
      },
    });

    const marker = new Marker();
    marker.kind = 'checkpoint';
    marker.setPosition(5, 6);

    const data = serializeTree(marker);
    expect(data).toMatchObject({ type: 'Marker', kind: 'checkpoint', x: 5, y: 6 });

    const restored = deserializeTree(data) as Marker;
    expect(restored.kind).toBe('checkpoint');
    expect(restored.x).toBe(5);
  });

  it('registers app-scoped without leaking into the global registry', () => {
    class AppOnly extends SceneNode {
      public tag = 'app';
    }

    // `app.serializers` is a SerializationRegistry chained to the global one;
    // construct that directly to keep the test free of a full Application.
    const appSerializers = new SerializationRegistry(defaultSerializationRegistry);
    const serializer = {
      write: (node: AppOnly) => ({ tag: node.tag }),
      read: () => new AppOnly(),
    };

    registerSerializer('AppOnly', AppOnly, serializer, appSerializers);

    // The app-scoped registry resolves it, but the global registry does not.
    expect(appSerializers.hasType('AppOnly')).toBe(true);
    expect(appSerializers.resolveByName('AppOnly')?.serializer).toBe(serializer);
    expect(defaultSerializationRegistry.hasType('AppOnly')).toBe(false);
  });
});

describe('serialization — default-registry reset', () => {
  it('clears the lazily-registered core serializers until the next use', () => {
    // serializeTree lazy-registers the core serializers on the global registry.
    serializeTree(new Container());
    expect(defaultSerializationRegistry.hasType('Container')).toBe(true);

    _resetDefaultSerializers();
    expect(defaultSerializationRegistry.hasType('Container')).toBe(false);

    // The next serialize re-arms the latch and re-registers the core serializers.
    serializeTree(new Container());
    expect(defaultSerializationRegistry.hasType('Container')).toBe(true);
  });
});

describe('serialization — errors & version', () => {
  it('stamps the current version on a serialized scene shape', () => {
    expect(SERIALIZATION_VERSION).toBe(1);
  });

  it('throws on an unknown type during deserialize', () => {
    expect(() => deserializeTree({ type: 'NopeNode' } as SerializedNode)).toThrow(/No serializer registered for type/);
  });
});

describe('serialization — Scene entry point', () => {
  it('round-trips the scene root subtree via Scene.serialize/deserialize', () => {
    const scene = new Scene();
    const hud = new Container();

    hud.name = 'hud';
    hud.setPosition(3, 4);
    scene.addChild(hud);

    const data = scene.serialize();

    expect(data.version).toBe(SERIALIZATION_VERSION);
    expect(data.root.type).toBe('Container');

    const target = new Scene();

    target.deserialize(data);

    expect(target.root.children).toHaveLength(1);
    expect(target.root.children[0].name).toBe('hud');
    expect(target.root.children[0].x).toBe(3);

    scene.destroy();
    target.destroy();
  });

  it('clears existing root children before applying deserialized state', () => {
    const scene = new Scene();

    scene.addChild(new Container());
    scene.addChild(new Container());
    scene.deserialize({ version: SERIALIZATION_VERSION, root: { type: 'Container' } });

    expect(scene.root.children).toHaveLength(0);
    scene.destroy();
  });

  it('rejects a document newer than the supported version', () => {
    const scene = new Scene();

    expect(() => scene.deserialize({ version: 999, root: { type: 'Container' } })).toThrow(/newer than/);
    scene.destroy();
  });
});

describe('serialization — RenderNode interaction flags', () => {
  it('round-trips interaction flags and a Rectangle clipShape', () => {
    const node = new Container();

    node.interactive = true;
    node.draggable = true;
    node.focusable = true;
    node.tabIndex = 3;
    node.cursor = 'pointer';
    node.clip = true;
    node.clipShape = new Rectangle(0, 0, 50, 40);
    node.preserveDrawOrder = true;
    node.cacheAsBitmap = true;

    const data = serializeTree(node);

    expect(data).toMatchObject({
      interactive: true,
      draggable: true,
      focusable: true,
      tabIndex: 3,
      cursor: 'pointer',
      clip: true,
      preserveDrawOrder: true,
      cacheAsBitmap: true,
      clipShape: [0, 0, 50, 40],
    });

    const restored = deserializeTree(data) as Container;

    expect(restored.interactive).toBe(true);
    expect(restored.draggable).toBe(true);
    expect(restored.focusable).toBe(true);
    expect(restored.tabIndex).toBe(3);
    expect(restored.cursor).toBe('pointer');
    expect(restored.clip).toBe(true);
    expect(restored.preserveDrawOrder).toBe(true);
    expect(restored.cacheAsBitmap).toBe(true);
    expect(restored.clipShape).toBeInstanceOf(Rectangle);
    expect((restored.clipShape as Rectangle).width).toBe(50);
  });
});

describe('serialization — Mesh', () => {
  it('round-trips vertex/index/uv/colour arrays', () => {
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 10, 0, 10, 10]),
      indices: new Uint16Array([0, 1, 2]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1]),
      colors: new Uint32Array([0xffffffff, 0xff00ff00, 0xffff0000]),
    });

    const data = serializeTree(mesh);

    expect(data.type).toBe('Mesh');
    expect(data.vertices).toEqual([0, 0, 10, 0, 10, 10]);
    expect(data.indices).toEqual([0, 1, 2]);

    const restored = deserializeTree(data) as Mesh;

    expect(Array.from(restored.vertices)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(Array.from(restored.indices ?? [])).toEqual([0, 1, 2]);
    expect(Array.from(restored.colors ?? [])).toEqual([0xffffffff, 0xff00ff00, 0xffff0000]);
  });
});

describe('serialization — Graphics', () => {
  it('round-trips as a Graphics with its baked mesh children', () => {
    const graphics = new Graphics();

    graphics.fillColor = new Color(255, 0, 0, 1);
    graphics.drawRoundedRectangle(0, 0, 40, 20, 4);

    const data = serializeTree(graphics);

    expect(data.type).toBe('Graphics');

    const restored = deserializeTree(data) as Graphics;

    expect(restored).toBeInstanceOf(Graphics);
    expect(restored.children.length).toBe(graphics.children.length);
  });
});

describe('serialization — NineSliceSprite', () => {
  it('round-trips slices/border/modes/size + texture ref', () => {
    const texture = createTexture(48, 48);
    const loader = fakeLoader([{ type: Texture, source: 'panel.png', resource: texture }]);
    const ns = new NineSliceSprite(texture, { slices: { top: 16, bottom: 16, left: 16, right: 16 }, width: 100, height: 80 });

    const data = serializeTree(ns, loader);

    expect(data.type).toBe('NineSliceSprite');
    expect(data.texture).toBe('panel.png');
    expect(data.slices).toEqual({ top: 16, bottom: 16, left: 16, right: 16 });
    expect(data.width).toBe(100);

    const restored = deserializeTree(data, loader) as NineSliceSprite;

    expect(restored.width).toBe(100);
    expect(restored.height).toBe(80);
    expect(restored.slices.top).toBe(16);
  });
});

describe('serialization — RepeatingSprite', () => {
  it('round-trips modes/fits/offsets/size + texture ref', () => {
    const texture = createTexture(32, 32);
    const loader = fakeLoader([{ type: Texture, source: 'tile.png', resource: texture }]);
    const rs = new RepeatingSprite(texture, { width: 128, height: 64, offsetX: 8, modeX: 'mirror-repeat' });

    const data = serializeTree(rs, loader);

    expect(data.type).toBe('RepeatingSprite');
    expect(data.modeX).toBe('mirror-repeat');
    expect(data.offsetX).toBe(8);

    const restored = deserializeTree(data, loader) as RepeatingSprite;

    expect(restored.modeX).toBe('mirror-repeat');
    expect(restored.width).toBe(128);
    expect(restored.offsetX).toBe(8);
  });
});

describe('serialization — AnimatedSprite', () => {
  it('round-trips clips + active clip + playing state', () => {
    const texture = createTexture(64, 16);
    const loader = fakeLoader([{ type: Texture, source: 'hero.png', resource: texture }]);
    const sprite = new AnimatedSprite(texture, {
      run: { frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16)], fps: 10, loop: true },
    });

    sprite.play('run');

    const data = serializeTree(sprite, loader);

    expect(data.type).toBe('AnimatedSprite');
    expect(data.currentClip).toBe('run');
    expect(data.playing).toBe(true);

    const restored = deserializeTree(data, loader) as AnimatedSprite;

    expect(restored.currentClip).toBe('run');
    expect(restored.playing).toBe(true);
    expect(() => restored.play('run')).not.toThrow();
  });

  it('round-trips per-frame frameDurations', () => {
    const texture = createTexture(64, 16);
    const loader = fakeLoader([{ type: Texture, source: 'hero.png', resource: texture }]);
    const sprite = new AnimatedSprite(texture, {
      idle: {
        frames: [new Rectangle(0, 0, 16, 16), new Rectangle(16, 0, 16, 16)],
        loop: true,
        frameDurations: [100, 300],
      },
    });

    const data = serializeTree(sprite, loader);
    const restored = deserializeTree(data, loader) as AnimatedSprite;

    restored.play('idle');
    restored.update(100);
    expect(restored.currentFrame).toBe(1);

    // Frame 1 holds 300ms (frameDurations), not the 100ms it would hold at
    // the default 12fps if frameDurations had been lost in the round-trip.
    restored.update(100);
    expect(restored.currentFrame).toBe(1);
  });
});

describe('serialization — BitmapText', () => {
  it('round-trips text, font ref, msdf and scale', () => {
    const fontData: BmFontData = {
      pages: ['font_0.png'],
      chars: new Map([[65, { x: 0, y: 0, width: 8, height: 12, xOffset: 0, yOffset: 2, xAdvance: 10, page: 0 }]]),
      kernings: new Map(),
      lineHeight: 16,
      base: 12,
    };
    const font = new BmFont(fontData, [{ width: 64, height: 64 } as unknown as Texture]);
    const loader = fakeLoader([{ type: BmFont, source: 'ui.fnt', resource: font }]);
    const bitmapText = new BitmapText('A', font, { msdf: true, scale: 2 });

    const data = serializeTree(bitmapText, loader);

    expect(data.type).toBe('BitmapText');
    expect(data.font).toBe('ui.fnt');
    expect(data.msdf).toBe(true);
    expect(data.scale).toBe(2);

    const restored = deserializeTree(data, loader) as BitmapText;

    expect(restored.text).toBe('A');
    expect(restored.msdf).toBe(true);
    expect(restored.fontScale).toBe(2);
    expect(restored.font).toBe(font);
  });
});

describe('serialization — Video', () => {
  it('round-trips src and playback options', () => {
    const element = document.createElement('video');

    element.src = 'clip.mp4';

    const video = new Video(element, { loop: true });
    const data = serializeTree(video);

    expect(data.type).toBe('Video');
    expect(typeof data.src).toBe('string');
    expect(data.loop).toBe(true);

    const restored = deserializeTree(data) as Video;

    expect(restored).toBeInstanceOf(Video);
    expect(restored.loop).toBe(true);
  });
});

describe('serialization — Prefab', () => {
  it('instantiates independent copies of a captured subtree', () => {
    const prototype = new Container();

    prototype.name = 'coin';
    prototype.setPosition(0, 0);
    prototype.addChild(new Container());

    const prefab = Prefab.from(prototype);
    const first = prefab.instantiate() as Container;
    const second = prefab.instantiate() as Container;

    expect(first).not.toBe(second);
    expect(first.name).toBe('coin');
    expect(second.name).toBe('coin');
    expect(first.children).toHaveLength(1);
    // Instances are fully independent (no shared child nodes).
    expect(first.children[0]).not.toBe(second.children[0]);
  });

  it('round-trips through toJSON / fromJSON', () => {
    const prototype = new Container();
    prototype.name = 'enemy';

    const json = Prefab.from(prototype).toJSON();
    const rebuilt = Prefab.fromJSON(json);

    expect((rebuilt.instantiate() as Container).name).toBe('enemy');
  });
});

describe('serialization — UI widgets', () => {
  it('round-trips a Label (text + style)', () => {
    const label = new Label('Score', { fontSize: 18, fillColor: new Color(10, 20, 30, 1) });

    const data = serializeTree(label);
    expect(data.type).toBe('Label');
    expect(data.text).toBe('Score');

    const restored = deserializeTree(data) as Label;
    expect(restored.text).toBe('Score');
    expect(restored.textNode.style.fontSize).toBe(18);
    expect(restored.textNode.style.fillColor.r).toBe(10);
  });

  it('round-trips a Panel (options + user children, excluding the internal background)', () => {
    const panel = new Panel({ width: 120, height: 90, borderWidth: 2, cornerRadius: 12 });
    const content = new Container();
    content.name = 'content';
    panel.addChild(content);

    const data = serializeTree(panel);
    expect(data.type).toBe('Panel');
    expect(data.width).toBe(120);
    expect(data.cornerRadius).toBe(12);
    // Only the user child is serialized, not the background Graphics.
    expect(data.children).toHaveLength(1);

    const restored = deserializeTree(data) as Panel;
    expect(restored.uiWidth).toBe(120);
    expect(restored.borderWidth).toBe(2);
    const userChildren = restored.children.filter(child => child !== restored.background);
    expect(userChildren).toHaveLength(1);
    expect(userChildren[0].name).toBe('content');
  });

  it('round-trips a Button (label, colours, size, enabled)', () => {
    const button = new Button({ label: 'Play', width: 100, height: 36, color: new Color(10, 20, 30, 1) });
    button.enabled = false;

    const data = serializeTree(button);
    expect(data.type).toBe('Button');
    expect(data.label).toBe('Play');
    expect(data.color).toEqual([10, 20, 30, 1]);
    expect(data.enabled).toBe(false);

    const restored = deserializeTree(data) as Button;
    expect(restored.label).toBe('Play');
    expect(restored.uiWidth).toBe(100);
    expect(restored.colors.normal.r).toBe(10);
    expect(restored.enabled).toBe(false);
  });

  it('round-trips a ProgressBar (value + colours)', () => {
    const bar = new ProgressBar({ width: 200, height: 16, value: 0.42, fillColor: new Color(1, 2, 3, 1) });

    const data = serializeTree(bar);
    expect(data.type).toBe('ProgressBar');
    expect(data.value).toBeCloseTo(0.42);

    const restored = deserializeTree(data) as ProgressBar;
    expect(restored.value).toBeCloseTo(0.42);
    expect(restored.fillColor.g).toBe(2);
  });

  it('round-trips a Stack (options + items)', () => {
    const stack = new Stack({ direction: 'row', spacing: 12, padding: 4 });
    stack.addItem(new Label('A'));
    stack.addItem(new Label('B'));

    const data = serializeTree(stack);
    expect(data.type).toBe('Stack');
    expect(data.direction).toBe('row');
    expect(data.spacing).toBe(12);
    expect(data.children).toHaveLength(2);

    const restored = deserializeTree(data) as Stack;
    expect(restored.direction).toBe('row');
    expect(restored.padding).toBe(4);
    expect(restored.children).toHaveLength(2);
  });
});

describe('serialization — Scene UI layer', () => {
  it('round-trips scene.ui widgets through serialize/deserialize', () => {
    const scene = new Scene();
    const button = new Button({ label: 'Start', width: 100, height: 30 });
    scene.ui.addChild(button);

    const data = scene.serialize();
    expect(data.ui).toBeDefined();
    expect(data.ui?.children).toHaveLength(1);

    const target = new Scene();
    target.deserialize(data);

    expect(target.ui.children).toHaveLength(1);
    expect(target.ui.children[0]).toBeInstanceOf(Button);
    expect((target.ui.children[0] as Button).label).toBe('Start');

    scene.destroy();
    target.destroy();
  });

  it('omits ui when the scene has no UI layer', () => {
    const scene = new Scene();
    scene.addChild(new Container());

    expect(scene.serialize().ui).toBeUndefined();
    scene.destroy();
  });
});
